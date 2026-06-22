// One-time migration: pull the full snapshot from Apps Script (doGet) and load it
// into Supabase via PostgREST. Idempotent for keyed tables (merge-duplicates);
// run ONCE — potentials/ems_queue have no unique key and would duplicate on re-run.
//
// Usage (keys come from env, never hard-coded):
//   SUPABASE_URL=… SERVICE_KEY=… SHEET_API=… node db/import_from_appsscript.mjs
// (source the scratchpad supabase.env file to populate these.)

const URL = process.env.SUPABASE_URL, KEY = process.env.SERVICE_KEY, SHEET = process.env.SHEET_API;
if (!URL || !KEY || !SHEET) { console.error('missing env: SUPABASE_URL / SERVICE_KEY / SHEET_API'); process.exit(1); }

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function load(table, rows, onConflict) {
  rows = (rows || []).filter(Boolean);
  // safety: an upsert can't touch the same conflict-key twice in one batch — keep last per key
  if (onConflict && !onConflict.includes(',')) {
    const m = new Map(); for (const r of rows) m.set(r[onConflict], r); rows = [...m.values()];
  }
  if (!rows.length) { console.log(`- ${table}: 0 rows (skip)`); return; }
  let url = `${URL}/rest/v1/${table}`;
  if (onConflict) url += `?on_conflict=${onConflict}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...H, Prefer: (onConflict ? 'resolution=merge-duplicates,' : '') + 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) { console.error(`! ${table}: HTTP ${r.status} — ${await r.text()}`); throw new Error('load ' + table); }
  console.log(`✓ ${table}: ${rows.length} rows`);
}

const j = await (await fetch(`${SHEET}?v=${Date.now()}`)).json();
console.log('snapshot keys:', Object.keys(j).join(', '));

// dedupe tasks by name: the Sheet can hold duplicate-name rows; keep the richest
// (most content), tiebreak by latest lastModified. Logs what was dropped.
const tScore = t => (String(t.status||'')+String(t.expectedTask||'')+String(t.task||'')+
  (Array.isArray(t.owners)?t.owners.join(''):String(t.owners||''))+String(t.lastCheckup||'')).length;
const tByName = new Map();
for (const t of (j.tasks || [])) {
  const ex = tByName.get(t.name);
  if (!ex || tScore(t) > tScore(ex) ||
      (tScore(t) === tScore(ex) && String(t.lastModified||'') > String(ex.lastModified||''))) tByName.set(t.name, t);
}
const tDropped = (j.tasks || []).length - tByName.size;
if (tDropped) console.log(`  (tasks: dropped ${tDropped} thinner duplicate-name row(s) — Sheet rows: ${
  (j.tasks||[]).filter(t => tByName.get(t.name) !== t).map(t => t.row).join(', ')})`);
await load('tasks', [...tByName.values()].map(t => ({
  code: t.code == null ? null : String(t.code), region: t.region, migrated: t.migrated, name: t.name, status: t.status,
  expected_task: t.expectedTask, owners: Array.isArray(t.owners) ? t.owners.join(', ') : (t.owners || ''),
  task: t.task, last_checkup: t.lastCheckup, editor: t.editor, last_modified: t.lastModified,
})), 'name');

await load('visits', (j.visits || []).map(v => ({
  id: v.id, kibbutz: v.kibbutz, date: v.date, visitor: v.visitor, duration: v.duration,
  contact: v.contact, products: v.products || [], products_other: v.productsOther,
  summary: v.summary, created_at: v.createdAt, workday: !!v.workday,
})), 'id');

await load('products', (j.products || []).map(p => ({
  id: p.id, name: p.name, category: p.category, active: !!p.active,
  created_at: p.createdAt, created_by: p.createdBy,
})), 'id');

await load('orders', (j.orders || []).map(o => ({
  id: o.id, created_at: o.createdAt, created_by: o.createdBy, supplier: o.supplier,
  status: o.status, items: o.items || [], expected_date: o.expectedDate, notes: o.notes,
  delivered_at: o.deliveredAt, distribution: o.distribution || {}, last_updated: o.lastUpdated,
})), 'id');

await load('movements', (j.movements || []).map(m => ({
  id: m.id, date: m.date, product: m.product, from_location: m.fromLocation,
  to_location: m.toLocation, quantity: m.quantity, reason: m.reason, ref_id: m.refId, created_by: m.createdBy,
})), 'id');

await load('requirements', (j.requirements || []).map(r => ({
  id: r.id, created_at: r.createdAt, created_by: r.createdBy, kibbutz: r.kibbutz,
  contact_name: r.contactName, items: r.items || [], notes: r.notes, status: r.status,
  linked_order_id: r.linkedOrderId, fulfilled_at: r.fulfilledAt, last_updated: r.lastUpdated,
})), 'id');

await load('returns', (j.returns || []).map(r => ({
  id: r.id, visit_id: r.visitId, date: r.date, kibbutz: r.kibbutz, visitor: r.visitor,
  product: r.product, qty: r.qty, reason: r.reason, status: r.status,
})), 'id');

await load('attendance', (j.attendance || []).map(a => ({
  id: a.id, date: a.date, person: a.person, day_type: a.dayType, note: a.note,
})), 'id');

await load('settings', Object.entries(j.settings || {}).map(([k, v]) => ({ key: k, value: v, updated_at: null })), 'key');

await load('potentials', (j.potentials || []).map(p => ({ serial: p.serial == null ? null : String(p.serial), region: p.region, name: p.name })));

await load('regions', Object.entries(j.regions || {}).map(([code, name]) => ({ code, name })), 'code');

if (j.emsCache) {
  await load('ems_cache', [{ id: 1, tasks: j.emsCache.tasks || [], synced_at: j.emsCache.syncedAt || '', synced_by: j.emsCache.syncedBy || '' }], 'id');
}

const q = j.emsQueue;
const qItems = Array.isArray(q) ? q : (q && Array.isArray(q.tasks) ? q.tasks : []);
if (qItems.length) await load('ems_queue', qItems.map(it => ({ payload: it })));

console.log('done.');
