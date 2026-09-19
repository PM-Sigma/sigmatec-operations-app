// 📦 pool_migration — the one-shot consolidation of the per-person bags into `חברה`
// (inventory spec §2.1). Task 8.
//
// It reads the append-only `movements` ledger over PostgREST, nets each PERSON-location per
// product, and prints one `<person> → חברה` row per non-zero balance. It writes NOTHING unless
// it is asked to twice: `--apply` AND `--yes`. Open decision I1 says עידן runs the apply
// himself, after the release smoke.
//
// The rows come from app/src/lib/inventory.ts `poolMigrationRows` — the same function the
// vitest goldens pin — reimplemented here in plain JS so this script has no build step. The
// two copies are kept honest by `--selftest`, which runs the spec's fixture through this file's
// own copy and compares it to the golden list.
//
//   node db/pool_migration.mjs                  # dry run (default): print the rows
//   node db/pool_migration.mjs --json           # the same rows as JSON, for a diff
//   node db/pool_migration.mjs --selftest       # no network; checks this copy of the rules
//   node db/pool_migration.mjs --apply --yes    # INSERT the rows (עידן only)
//
// Env: SUPABASE_URL (default: the project's own), SUPABASE_KEY / SERVICE_KEY / ANON_KEY.
// A read needs only the anon key; the apply needs whatever key your RLS lets write.

const POOL = 'חברה';
const PERSON_LOCATIONS = ['עמיחי', 'אביאם', 'ניתאי', 'משרד'];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const arg = (f, d) => { const i = args.indexOf(f); return i === -1 ? d : args[i + 1]; };

const URL_BASE = process.env.SUPABASE_URL || 'https://wwqfcajnxinaxmobrgol.supabase.co';
const KEY = process.env.SUPABASE_KEY || process.env.SERVICE_KEY || process.env.ANON_KEY || '';
const DATE = arg('--date', new Date().toISOString().slice(0, 10));
const ACTOR = arg('--actor', 'עידן');

// ───────────────────────────── the rules (mirror of app/src/lib/inventory.ts) ──────────────

const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };

export function stockByLocation(movements) {
  const out = {};
  const add = (loc, product, q) => { if (!loc) return; (out[loc] ||= {})[product] = (out[loc][product] || 0) + q; };
  for (const m of movements || []) {
    const product = String(m?.product ?? '').trim();
    if (!product) continue;
    const q = num(m?.quantity);
    add(String(m?.from_location ?? m?.fromLocation ?? ''), product, -q);
    add(String(m?.to_location ?? m?.toLocation ?? ''), product, q);
  }
  return out;
}

export function poolMigrationRows(stock, personLocations, date, actor = 'עידן') {
  const rows = [];
  for (const loc of personLocations || []) {
    if (loc === POOL) continue;
    const held = (stock || {})[loc] || {};
    for (const product of Object.keys(held).sort((a, b) => a.localeCompare(b, 'he'))) {
      const net = num(held[product]);
      if (net === 0) continue;
      rows.push({
        product,
        from_location: net > 0 ? loc : POOL,
        to_location: net > 0 ? POOL : loc,
        quantity: Math.abs(net),
        reason: 'pool_migration',
        ref_id: date,
        created_by: actor,
      });
    }
  }
  return rows;
}

// ───────────────────────────── selftest (no network) ───────────────────────────────────────

function selftest() {
  const stock = stockByLocation([
    { product: 'E360CT', to_location: 'אביאם', quantity: 8 },
    { product: 'בקר 504', to_location: 'אביאם', quantity: 2 },
    { product: 'E360CT', to_location: 'ניתאי', quantity: 4 },
    { product: 'E360CT', to_location: 'משרד', quantity: 26 },
    { product: 'E360CT', to_location: 'גבים', quantity: 12 },     // a kibbutz — never swept
    { product: 'סים 1NCE', to_location: 'אביאם', quantity: 3 },
    { product: 'סים 1NCE', from_location: 'אביאם', to_location: 'יגור', quantity: 3 },  // nets to 0
  ]);
  const rows = poolMigrationRows(stock, PERSON_LOCATIONS, '2026-09-20');
  const got = rows.map(r => `${r.from_location}→${r.to_location} ${r.product} ×${r.quantity}`).join(' | ');
  const want = 'אביאם→חברה בקר 504 ×2 | אביאם→חברה E360CT ×8 | ניתאי→חברה E360CT ×4 | משרד→חברה E360CT ×26';
  if (got !== want) { console.error('SELFTEST FAILED\n  got  ' + got + '\n  want ' + want); process.exit(1); }
  console.log('SELFTEST OK — ' + rows.length + ' rows, same rules as app/src/lib/inventory.ts');
}

// ───────────────────────────── the run ─────────────────────────────────────────────────────

async function fetchMovements() {
  if (!KEY) { console.error('missing SUPABASE_KEY / SERVICE_KEY / ANON_KEY in env'); process.exit(1); }
  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  const out = [];
  // PostgREST caps a response; page until a short page comes back.
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/movements?select=product,from_location,to_location,quantity&order=id`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) { console.error('movements read failed: ' + r.status + ' ' + (await r.text())); process.exit(1); }
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

async function main() {
  if (has('--selftest')) return selftest();

  const movements = await fetchMovements();
  const stock = stockByLocation(movements);
  const rows = poolMigrationRows(stock, PERSON_LOCATIONS, DATE, ACTOR);

  if (has('--json')) { console.log(JSON.stringify(rows, null, 2)); }
  else {
    console.log(`\n📦 pool migration — ${movements.length} ledger rows read from ${URL_BASE}`);
    console.log(`   date/ref_id: ${DATE} · actor: ${ACTOR}\n`);
    if (!rows.length) console.log('   nothing to migrate — every person-location is already at 0.');
    const byLoc = {};
    for (const r of rows) (byLoc[r.from_location === POOL ? r.to_location : r.from_location] ||= []).push(r);
    for (const loc of Object.keys(byLoc)) {
      console.log(`   ${loc}`);
      for (const r of byLoc[loc]) {
        console.log(`     ${r.from_location} → ${r.to_location}   ${r.product}  ×${r.quantity}`);
      }
    }
    const total = rows.reduce((s, r) => s + r.quantity, 0);
    console.log(`\n   ${rows.length} movement rows, ${total} units total.`);
  }

  if (!has('--apply')) {
    console.log('\n   DRY RUN — nothing was written. Re-run with --apply --yes to insert.\n');
    return;
  }
  if (!has('--yes')) { console.error('\n   --apply needs --yes as well. Nothing written.\n'); process.exit(1); }

  const r = await fetch(`${URL_BASE}/rest/v1/movements`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows.map((row, i) => ({ id: `mig-${DATE}-${i + 1}`, date: new Date().toISOString(), ...row }))),
  });
  if (!r.ok) { console.error('insert failed: ' + r.status + ' ' + (await r.text())); process.exit(1); }
  console.log(`\n   ✅ ${rows.length} rows inserted. The pool is now the sum of the old bags.\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
