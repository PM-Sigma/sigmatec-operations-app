// Read-parity check: assemble the dashboard snapshot from Supabase and diff it
// field-by-field against the live Apps Script snapshot. Proves the read path before
// we wire it into the live HTML. Excludes fields that legitimately differ:
//   - updatedAt (timestamp), tasks.row (sheet-row vs seq — identity only)
// Env: SUPABASE_URL, SERVICE_KEY (or anon), SHEET_API.

const U = process.env.SUPABASE_URL, K = process.env.SERVICE_KEY, SHEET = process.env.SHEET_API;
if (!U || !K || !SHEET) { console.error('missing env'); process.exit(1); }
const H = { apikey: K, Authorization: 'Bearer ' + K };
const numish = v => (v != null && /^-?\d+$/.test(String(v))) ? Number(v) : v;   // "957" → 957 (match Sheets types)
const jget = async (p) => { const r = await fetch(`${U}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p} ${r.status} ${await r.text()}`); return r.json(); };

// ── assemble snapshot from Supabase (the exact mapping that will go into the HTML) ──
async function readSnapshot() {
  const [tasks, visits, products, orders, movements, requirements, returns_, attendance, settings, potentials, regions] =
    await Promise.all(['tasks?select=*&order=seq', 'visits?select=*', 'products?select=*', 'orders?select=*',
      'movements?select=*', 'requirements?select=*', 'returns?select=*', 'attendance?select=*',
      'settings?select=*', 'potentials?select=*', 'regions?select=*'].map(jget));
  const settingsObj = {}; settings.forEach(s => { settingsObj[s.key] = s.value; });
  const regionsObj = {}; regions.forEach(r => { if (r.code) regionsObj[r.code] = r.name || ''; });
  return {
    settings: settingsObj,
    tasks: tasks.map(t => ({ row: t.seq, code: t.code == null ? null : numish(t.code), region: t.region || '', migrated: t.migrated || '',
      name: t.name || '', status: t.status || '', expectedTask: t.expected_task || '',
      owners: String(t.owners || '').split(/[,\n\/]/).map(s => s.trim()).filter(Boolean),
      task: t.task || '', lastCheckup: t.last_checkup || '', editor: t.editor || '',
      lastModified: t.last_modified ? String(t.last_modified) : '' })),
    potentials: potentials.map(p => ({ serial: (p.serial === '' || p.serial == null) ? '' : numish(p.serial), region: p.region || '', name: p.name || '' })),
    regions: regionsObj,
    visits: visits.map(v => ({ id: String(v.id), kibbutz: v.kibbutz || '', date: v.date || '', visitor: v.visitor || '',
      duration: parseFloat(v.duration) || 0, contact: v.contact || '', products: v.products || [],
      productsOther: v.products_other || '', summary: v.summary || '', createdAt: v.created_at || '', workday: !!v.workday })),
    products: products.map(p => ({ id: String(p.id), name: p.name || '', category: p.category || '',
      active: !!p.active, createdAt: p.created_at ? String(p.created_at) : '', createdBy: p.created_by || '' })),
    orders: orders.map(o => ({ id: String(o.id), createdAt: o.created_at || '', createdBy: o.created_by || '',
      supplier: o.supplier || '', status: o.status || 'pending', items: o.items || [], expectedDate: o.expected_date || '',
      notes: o.notes || '', deliveredAt: o.delivered_at || '', distribution: o.distribution || {}, lastUpdated: o.last_updated ? String(o.last_updated) : '' })),
    movements: movements.map(m => ({ id: String(m.id), date: m.date || '', product: m.product || '',
      fromLocation: m.from_location || '', toLocation: m.to_location || '', quantity: parseFloat(m.quantity) || 0,
      reason: m.reason || '', refId: m.ref_id || '', createdBy: m.created_by || '' })),
    requirements: requirements.map(r => ({ id: String(r.id), createdAt: r.created_at || '', createdBy: r.created_by || '',
      kibbutz: r.kibbutz || '', contactName: r.contact_name || '', items: r.items || [], notes: r.notes || '',
      status: r.status || 'open', linkedOrderId: r.linked_order_id || '', fulfilledAt: r.fulfilled_at || '', lastUpdated: r.last_updated ? String(r.last_updated) : '' })),
    returns: returns_.map(r => ({ id: String(r.id), visitId: r.visit_id || '', date: r.date || '', kibbutz: r.kibbutz || '',
      visitor: r.visitor || '', product: r.product || '', qty: parseInt(r.qty) || 0, reason: r.reason || '', status: r.status || 'open' })),
    attendance: attendance.map(a => ({ id: String(a.id), date: a.date || '', person: a.person || '', dayType: a.day_type || '', note: a.note || '' })),
  };
}

const norm = (o) => JSON.stringify(o, Object.keys(o).sort());
let fails = 0;
function cmpArr(name, ref, sb, key, exclude = []) {
  const strip = r => { const c = { ...r }; exclude.forEach(k => delete c[k]); return c; };
  const refM = new Map(ref.map(r => [String(r[key]), strip(r)]));
  const sbM = new Map(sb.map(r => [String(r[key]), strip(r)]));
  let diffs = [];
  for (const [k, rv] of refM) {
    if (!sbM.has(k)) { diffs.push(`missing in supabase: ${key}=${k}`); continue; }
    if (norm(rv) !== norm(sbM.get(k))) diffs.push(`differs ${key}=${k}\n    sheet: ${norm(rv)}\n    supa : ${norm(sbM.get(k))}`);
  }
  for (const k of sbM.keys()) if (!refM.has(k)) diffs.push(`extra in supabase: ${key}=${k}`);
  const ok = diffs.length === 0;
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${name}: sheet=${ref.length} supa=${sb.length}${ok ? '' : '  — ' + diffs.length + ' diff(s)'}`);
  diffs.slice(0, 5).forEach(d => console.log('    · ' + d));
}

const ref = await (await fetch(`${SHEET}?v=${Date.now()}`)).json();
// dedupe ref.tasks by name the same way the importer did (richest wins) so counts line up
const tScore = t => (String(t.status||'')+String(t.expectedTask||'')+String(t.task||'')+(t.owners||[]).join('')+String(t.lastCheckup||'')).length;
const tByName = new Map();
for (const t of ref.tasks) { const ex = tByName.get(t.name); if (!ex || tScore(t) > tScore(ex) || (tScore(t)===tScore(ex) && String(t.lastModified||'')>String(ex.lastModified||''))) tByName.set(t.name, t); }
const refTasks = [...tByName.values()];

const sb = await readSnapshot();
cmpArr('tasks', refTasks, sb.tasks, 'name', ['row']);   // row excluded (seq vs sheet-row)
cmpArr('visits', ref.visits, sb.visits, 'id');
cmpArr('products', ref.products, sb.products, 'id');
cmpArr('orders', ref.orders, sb.orders, 'id');
cmpArr('movements', ref.movements, sb.movements, 'id');
cmpArr('requirements', ref.requirements, sb.requirements, 'id');
cmpArr('returns', ref.returns, sb.returns, 'id');
cmpArr('attendance', ref.attendance, sb.attendance, 'id');
cmpArr('potentials', ref.potentials, sb.potentials, 'name');
console.log(`regions: sheet=${Object.keys(ref.regions||{}).length} supa=${Object.keys(sb.regions).length} ${norm(ref.regions||{})===norm(sb.regions)?'✓':'✗ DIFFERS'}`);
console.log(`settings: sheet=${Object.keys(ref.settings||{}).length} supa=${Object.keys(sb.settings).length}`);
console.log(fails ? `\n❌ ${fails} collection(s) differ` : '\n✅ full read parity');
process.exit(fails ? 1 : 0);
