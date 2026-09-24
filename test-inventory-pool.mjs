// 📦 test-inventory-pool — the LEGACY half of the unified pool (inventory spec §1, §2, §4).
//
// app/src/lib/inventory.ts has the rules and its vitest goldens. The vanilla modules hold the
// same rules in their own code, and this runner holds THEM to the same numbers:
//
//   · js/src/08-inventory.js  — `computeStock` / `poolStockMap` / `lowStockReport`, evaluated
//     for real out of the source with a DOM double, against the vitest `poolStock` golden;
//   · js/src/09-visits.js     — `saveVisitFromData`, evaluated for real: the movement it posts
//     must leave `חברה` and carry the visitor as `created_by`;
//   · js/src/07-orders.js     — a source contract. `approveCustomerOrder` / `invSaveOrder` sit
//     inside a module with ~80 free identifiers (modals, EMS, requirements, the parser), so
//     lifting them would test the stubs rather than the rules. What IS asserted is exactly the
//     part this task changed: which locations the two movement bodies name, which reasons they
//     carry, that the idempotency guard is still there, and that the per-person distribution
//     write is gone while the column stays.
//
// Run: node test-inventory-pool.mjs   (also in `npm test`)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { loadSigmaInv } from './scripts/sigma-inv.mjs';

const SigmaInv = loadSigmaInv();

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failed++; console.log('  FAIL - ' + name + ': ' + (e && e.message)); }
}

const POOL = 'חברה';
const SUPPLIER = 'ספק';

// ───────────────────────── 1. js/src/08-inventory.js — the pool ─────────────────────────

console.log('\n[1] 08-inventory.js: computeStock / poolStockMap / lowStockReport');
{
  const src = read('./js/src/08-inventory.js');
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
  };
  const win = { innerWidth: 1440, SHEET_DATA: { movements: [], products: [] }, sigmaBus: { addEventListener() {} } };
  const load = movements => {
    win.SHEET_DATA = {
      movements,
      products: [
        { name: 'מונה Landis+Gyr E360PP', category: 'מונה' },
        { name: 'סים 1NCE', category: 'סים' },
        { name: 'בקר 504', category: 'בקר' },
      ],
    };
    const fn = new Function(
      'window', 'document', 'POOL_LOCATION', 'INV_LOCATIONS', 'NON_KIBBUTZ_LOCATIONS',
      'getCurrentUser', 'isViewer', 'checkEditPermission', 'invLoadingPlaceholder',
      'getActiveProducts', 'alert', 'setTimeout', 'SigmaInv',
      src + '\nreturn { computeStock, poolStockMap, lowStockReport, invRenderStock, openStockChangeSheet };',
    );
    return fn(
      win, doc, POOL, [POOL], [POOL, 'ספירה', SUPPLIER, 'תקול', 'אביאם', 'ניתאי', 'משרד', 'עמיחי'],
      () => 'עמיחי', () => false, () => true, () => '',
      () => win.SHEET_DATA.products, () => {}, () => 0, SigmaInv,
    );
  };

  const mv = o => ({ product: '', fromLocation: '', toLocation: '', quantity: 0, reason: 'manual', ...o });

  check('poolStockMap nets only the rows that touch חברה — the vitest golden', () => {
    const M = load([
      mv({ product: 'E360CT', fromLocation: SUPPLIER, toLocation: POOL, quantity: 20, reason: 'order_delivery' }),
      mv({ product: 'E360CT', fromLocation: POOL, toLocation: 'גבים', quantity: 3, reason: 'visit_supply' }),
      mv({ product: 'E360CT', fromLocation: 'גבים', toLocation: 'יגור', quantity: 1 }),
      mv({ product: 'בקר 504', fromLocation: SUPPLIER, toLocation: POOL, quantity: 5 }),
    ]);
    assert.deepEqual(M.poolStockMap(), { 'E360CT': 17, 'בקר 504': 5 });
  });

  check('a product that nets to zero is dropped, like poolStock', () => {
    const M = load([
      mv({ product: 'X', toLocation: POOL, quantity: 2 }),
      mv({ product: 'X', fromLocation: POOL, toLocation: 'גבים', quantity: 2 }),
    ]);
    assert.deepEqual(M.poolStockMap(), {});
  });

  check('the migration rows make the pool the sum of the old bags', () => {
    const before = [
      mv({ product: 'E360CT', toLocation: 'אביאם', quantity: 8 }),
      mv({ product: 'E360CT', toLocation: 'ניתאי', quantity: 4 }),
      mv({ product: 'E360CT', toLocation: 'משרד', quantity: 26 }),
    ];
    const migration = ['אביאם', 'ניתאי', 'משרד'].map((loc, i) =>
      mv({ product: 'E360CT', fromLocation: loc, toLocation: POOL, quantity: [8, 4, 26][i], reason: 'pool_migration' }));
    const M = load([...before, ...migration]);
    assert.deepEqual(M.poolStockMap(), { 'E360CT': 38 });
    const stock = M.computeStock();
    assert.equal(stock['אביאם']['E360CT'], 0, 'the person really lands on 0');
  });

  check('the red line is read off the POOL, not off a person', () => {
    const M = load([
      mv({ product: 'מונה Landis+Gyr E360PP', toLocation: POOL, quantity: 3 }),
      mv({ product: 'מונה Landis+Gyr E360PP', toLocation: 'אביאם', quantity: 400 }),
      mv({ product: 'סים 1NCE', toLocation: POOL, quantity: 4 }),
    ]);
    const report = M.lowStockReport();
    assert.equal(report.meters.length, 1, 'the meter type is below its line in the pool');
    assert.equal(report.meters[0].total, 3, 'a bag nobody swept yet does not count as stock');
    assert.ok(!('sims' in report), 'round 5 Phase 1: SIM is retired — no low-stock report for it any more');
  });

  check('the transfer form and the free adjust are gone, and דווח שינוי replaced them', () => {
    for (const dead of ['doStockTransfer', 'doStockAdjust', 'populateTransferDropdowns', 'populateAdjustDropdowns']) {
      assert.ok(!src.includes('function ' + dead), dead + ' is still defined');
    }
    assert.ok(src.includes('openStockChangeSheet'), 'the sheet opener is missing');
    assert.ok(src.includes("sigmaBus.addEventListener('stock-changed'"), 'nothing listens for stock-changed');
  });
}

// ───────────────────────── 2. js/src/09-visits.js — the visit path ─────────────────────────

console.log('\n[2] 09-visits.js: saveVisitFromData supplies from חברה');
{
  const src = read('./js/src/09-visits.js');
  const posts = [];
  const win = { SHEET_DATA: { visits: [], movements: [] }, currentKibbutzVisits: [] };
  const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const fetch_ = (u, o) => {
    if (o && o.body) { try { posts.push(JSON.parse(o.body)); } catch (e) { /* not json */ } }
    return Promise.resolve({ json: async () => ({ ok: true, id: 'V1' }) });
  };
  const mod = new Function(
    'window', 'document', 'localStorage', 'fetch', 'alert', 'WRITE_ROUTER_URL', 'setBtnLoading',
    'certIssuedForVisit', 'readVisitEmsIntent', 'pushVisitToEms', 'refreshData', 'closeModal',
    'currentKibbutz', 'STOCK_HOLDERS', 'DEFECTIVE_LOCATION', 'POOL_LOCATION', 'computeStock',
    'switchTab', 'onVisitorChange', 'visitReturnedItems', 'renderReturnedItems', 'sigmaEmit',
    'sigmaTrack', 'setTimeout',
    src + '\nreturn { saveVisitFromData };',
  )(
    win, doc, { getItem: () => null, setItem() {} }, fetch_, () => {}, 'http://sheet.test', () => {},
    async () => 7001, () => '', () => {}, () => {}, () => {},
    'דפנה', [], 'תקול', POOL, () => ({}), () => {}, () => {}, [], () => {},
    () => {}, () => {}, () => 0,
  );

  const res = await mod.saveVisitFromData({
    kibbutz: 'דפנה', visitor: 'אביאם', date: '2026-09-20', duration: 3,
    summary: 'ביקור', products: [{ name: 'E360CT', qty: 2 }],
  });
  const moves = posts.filter(p => p.type === 'movement');

  check('the visit saved', () => assert.equal(res.ok, true));
  check('one movement, חברה → the kibbutz, reason visit_supply', () => {
    assert.equal(moves.length, 1);
    assert.deepEqual(
      { from: moves[0].fromLocation, to: moves[0].toLocation, qty: moves[0].quantity, reason: moves[0].reason },
      { from: POOL, to: 'דפנה', qty: 2, reason: 'visit_supply' },
    );
  });
  check('the visitor stays on the row as created_by — that is where "who" belongs', () => {
    assert.equal(moves[0].createdBy, 'אביאם');
  });
  check('no personal bag is named anywhere in the visit save path', () => {
    assert.ok(!/STOCK_HOLDERS\.indexOf\(visitor\)/.test(src), 'the personal-bag default is still there');
  });
}

// ───────────────────────── 3. js/src/07-orders.js — the order paths ─────────────────────────

console.log('\n[3] 07-orders.js: approval leaves the pool, delivery lands in it');
{
  const src = read('./js/src/07-orders.js');

  check('customer approval posts חברה → kibbutz with reason customer_supply', () => {
    const line = src.split('\n').find(l => l.includes("reason: 'customer_supply'"));
    assert.ok(line, 'the approval movement is gone');
    assert.ok(line.includes('fromLocation: POOL_LOCATION'), 'the approval no longer leaves the pool');
    assert.ok(line.includes('toLocation: kibbutz'));
    assert.ok(!line.includes('responsible'), 'it still deducts from a person');
  });

  check('the re-approve guard (refId + reason) is untouched', () => {
    assert.ok(src.includes("m.refId === o.id && m.reason === 'customer_supply'"));
  });

  check('supplier delivery posts ספק → חברה with reason order_delivery, once', () => {
    assert.ok(src.includes("reason: 'order_delivery'"), 'the delivery movement is gone');
    assert.ok(src.includes('fromLocation: SUPPLIER_LOCATION, toLocation: POOL_LOCATION'));
    assert.ok(src.includes("m.refId === _refId && m.reason === 'order_delivery'"), 'no idempotency guard');
  });

  check('the per-person distribution write is gone, the column is kept', () => {
    assert.ok(!src.includes('body.distribution ='), 'a distribution is still written');
    assert.ok(!src.includes('function ensureDistributionDefaults'), 'the defaults builder survived');
    assert.ok(!src.includes('function invDistChange'), 'the per-location editor survived');
    assert.ok(!src.includes("reason: 'order_correction'"), 'the per-location correction delta survived');
    assert.ok(src.includes('`orders.distribution` is kept as a COLUMN'), 'the reason is not written down');
  });

  check('drop-ship still moves nothing', () => {
    assert.ok(src.includes('isDirectSupply'), 'the drop-ship check is gone');
    const i = src.indexOf('if (isDirectSupply(o)) {');
    const block = src.slice(i, i + 1200);
    assert.ok(!block.includes("type: 'movement'"), 'a drop-ship now writes a movement');
  });

  check('the visit form defaults to the pool as its source', () => {
    assert.ok(src.includes('src.value = POOL_LOCATION;'));
  });

  check('the stock hint on an order item reads the pool', () => {
    assert.ok(src.includes('poolStockMap()'), 'the hint still reads a personal bag');
  });
}

// ───────────────────────── 4. the constants + the migration script ─────────────────────────

console.log('\n[4] the constants and db/pool_migration.mjs agree with the spec');
{
  const init = read('./js/src/02-init-attendance.js');
  check("INV_LOCATIONS is ['חברה'] and nobody holds a bag", () => {
    assert.ok(init.includes("const POOL_LOCATION = 'חברה';"));
    assert.ok(init.includes('const INV_LOCATIONS = [POOL_LOCATION];'));
    assert.ok(init.includes('const STOCK_HOLDERS = [];'));
  });
  check('the legacy person locations stay excluded from the kibbutz matrix', () => {
    assert.ok(init.includes('.concat(LEGACY_PERSON_LOCATIONS)'),
      'rows written before the migration would show up as kibbutzim');
  });

  const mig = read('./db/pool_migration.mjs');
  check('the migration is dry-run by default and needs two flags to write', () => {
    assert.ok(mig.includes("if (!has('--apply'))"));
    assert.ok(mig.includes("if (!has('--yes'))"));
    assert.ok(mig.includes("reason: 'pool_migration'"));
  });

  const sql = read('./db/inventory_pool.sql');
  check('inventory_pool.sql adds the product columns and the alert trigger', () => {
    for (const needle of ['add column if not exists display_name', 'add column if not exists min_qty',
      'create table if not exists inventory_alerts', 'create trigger movements_inventory_alert',
      'enable row level security']) {
      assert.ok(sql.includes(needle), 'missing: ' + needle);
    }
  });
  const rec = read('./db/stock_recounts.sql');
  check('stock_recounts is auditable: note NOT NULL, RLS on', () => {
    assert.ok(rec.includes('note       text not null'));
    assert.ok(rec.includes('alter table stock_recounts enable row level security'));
  });
}


// ─────────── 5. the golden ledger: a return debits the kibbutz, and only once ───────────
// Audit C #12 + #13. One append-only ledger, the REAL builders run over it, balances asserted
// after each step. Both findings are the same failure: a movement that names only one of its
// two ends, or names an end the CLIENT was told about. Either way the pool stops adding up,
// and nothing in the app ever says so.

console.log('\n[5] the golden ledger: returns and the day-log source');
{
  /** The one ledger. `bal(loc, product)` = everything that arrived minus everything that left. */
  const ledger = [];
  const bal = (loc, product) => ledger.reduce((n, m) =>
    n + (m.product === product && m.toLocation === loc ? (m.quantity | 0) : 0)
      - (m.product === product && m.fromLocation === loc ? (m.quantity | 0) : 0), 0);

  // step 1 — the pool is stocked from a supplier, then a visit supplies 4 to גבים
  ledger.push({ product: 'E360CT', fromLocation: SUPPLIER, toLocation: POOL, quantity: 40, reason: 'order_delivery', refId: 'ord-7' });
  ledger.push({ product: 'E360CT', fromLocation: POOL, toLocation: 'גבים', quantity: 4, reason: 'visit_supply', refId: 'V9' });
  check('after the visit: pool 36, גבים 4', () => {
    assert.equal(bal(POOL, 'E360CT'), 36);
    assert.equal(bal('גבים', 'E360CT'), 4);
  });

  // step 2 — גבים returns one, and the returns table's ✅ החזר למלאי is what posts it.
  // returnToStock() is lifted out of the source and RUN, so this is the real body, not a copy.
  const src5 = read('./js/src/05-meeting-returns.js');
  const posts5 = [];
  const alerts = [];
  const win5 = { SHEET_DATA: { returns: [], movements: ledger } };
  const doc5 = {
    getElementById: () => ({ textContent: '', classList: { add() {}, remove() {} } }),
    querySelector: () => null, querySelectorAll: () => [], body: { classList: { toggle() {} } },
  };
  const fetch5 = (u, o) => {
    if (o && o.body) { try { posts5.push(JSON.parse(o.body)); } catch (e) { /* not json */ } }
    return Promise.resolve({ json: async () => ({ ok: true }) });
  };
  const mod5 = new Function(
    'window', 'document', 'localStorage', 'fetch', 'alert', 'confirm', 'setTimeout',
    'WRITE_ROUTER_URL', 'POOL_LOCATION', 'checkEditPermission', 'getCurrentUser', 'refreshData',
    'updateMeetingBadge', 'renderKibbutzCards', 'applyFilters',
    src5 + '\nreturn { returnToStock };',
  )(
    win5, doc5, { getItem: () => null, setItem() {} }, fetch5,
    m => alerts.push(String(m)), () => true, () => 0,
    'http://sheet.test', POOL, () => true, () => 'עידן', () => {},
    () => {}, () => {}, () => {},
  );

  win5.SHEET_DATA.returns = [{ id: 'r-1', kibbutz: 'גבים', product: 'E360CT', qty: 1, status: 'open', visitor: 'אביאם' }];
  await mod5.returnToStock('r-1');
  const mv5 = posts5.filter(x => x.type === 'movement');

  check('#12 — the return names BOTH ends: גבים → חברה (it used to credit from nowhere)', () => {
    assert.equal(mv5.length, 1, 'expected exactly one movement, got ' + mv5.length);
    assert.deepEqual(
      { from: mv5[0].fromLocation, to: mv5[0].toLocation, qty: mv5[0].quantity, reason: mv5[0].reason },
      { from: 'גבים', to: POOL, qty: 1, reason: 'return_restock' },
    );
    assert.notEqual(mv5[0].fromLocation, '',
      'fromLocation:"" is the bug — the pool gained a unit and no kibbutz gave one up');
  });

  mv5.forEach(m => ledger.push(m));
  check('the ledger balances: pool 37, גבים 3 — the kibbutz really gave the unit up', () => {
    assert.equal(bal(POOL, 'E360CT'), 37);
    assert.equal(bal('גבים', 'E360CT'), 3);
  });

  // step 3 — the SAME physical return, already restocked once (the visit save posts the very
  // same refId + reason). Pressing the button must not credit the pool a second time.
  posts5.length = 0;
  await mod5.returnToStock('r-1');
  check('#12 — a second press posts nothing: the refId guard sees the existing movement', () => {
    assert.equal(posts5.filter(x => x.type === 'movement').length, 0,
      'the same return was credited twice — this is the double-credit half of #12');
    assert.ok(alerts.some(a => a.indexOf('כבר הוחזר') !== -1), 'and it says why, instead of failing silently');
  });
  check('the balances did not move', () => {
    assert.equal(bal(POOL, 'E360CT'), 37);
    assert.equal(bal('גבים', 'E360CT'), 3);
  });

  // step 4 — a return row with no kibbutz cannot be restocked: a credit with no debit IS the
  // bug, so the path refuses rather than inventing stock.
  posts5.length = 0; alerts.length = 0;
  win5.SHEET_DATA.returns.push({ id: 'r-2', kibbutz: '', product: 'E360CT', qty: 1, status: 'open' });
  await mod5.returnToStock('r-2');
  check('a return with no kibbutz is refused, not credited from nowhere', () => {
    assert.equal(posts5.filter(x => x.type === 'movement').length, 0);
    assert.ok(alerts.length > 0, 'and the person is told why');
  });

  // step 5 — #13: the day-log's `source` is model output about what someone dictated. The
  // ledger's source is the pool, full stop (spec §1).
  const src9 = read('./js/src/09-visits.js');
  check('#13 — the day-log save never reads d.source for the ledger', () => {
    const line = src9.split('\n').find(l => /^\s*const source = /.test(l));
    assert.ok(line, 'the `source` assignment in saveVisitFromData is gone entirely');
    assert.ok(!/d\.source/.test(line),
      'saveVisitFromData still trusts the parser\'s `source`: a person name there moves stock '
      + 'out of a personal bag that no longer exists, and the quantity vanishes from poolStock()');
    assert.ok(/POOL_LOCATION/.test(line), 'the source must be pinned to the pool (spec §1)');
  });
}

console.log('\n' + '─'.repeat(60));
if (failed) { console.log(`FAILED  ${failed} check(s)`); process.exit(1); }
console.log('PASSED  unified inventory pool — legacy half');
