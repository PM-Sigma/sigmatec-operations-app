// 📦 test-inventory-pool — the LEGACY half of the unified pool (inventory spec §1, §2, §4).
//
// app/src/lib/inventory.ts has the rules and its vitest goldens. The vanilla modules hold the
// same rules in their own code, and this runner holds THEM to the same numbers:
//
//   · js/src/06-inventory.js  — `computeStock` / `poolStockMap` / `lowStockReport`, evaluated
//     for real out of the source with a DOM double, against the vitest `poolStock` golden;
//   · js/src/09-visits.js     — `saveVisitFromData`, evaluated for real: the movement it posts
//     must leave `חברה` and carry the visitor as `created_by`;
//   · js/src/07-orders.js and js/src/05-meeting-returns.js's legacy returnToStock() were deleted
//     in U10 (React owns orders/returns now) — the order-path and return-credit guarantees they
//     used to assert here are asserted directly against SigmaInv (app/src/lib/inventory.ts:
//     `orderApprovalRows`/`orderDeliveryRows`/`restockPlan`), which is what the React islands run.
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

// ───────────────────────── 1. js/src/06-inventory.js — the pool ─────────────────────────

console.log('\n[1] 06-inventory.js: computeStock / poolStockMap / lowStockReport');
{
  const src = read('./js/src/06-inventory.js');
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
      src + '\nreturn { computeStock, poolStockMap, lowStockReport, openStockChangeSheet };',
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
  // "the visit form defaults to the pool as its source" (the legacy #visitSource picker's
  // onVisitorChange default) retired round 5 V-U3 with the legacy visit form, and onVisitorChange
  // itself (07-orders.js) was deleted with the rest of the legacy order/inventory UI (package I,
  // U10) — the source is hardcoded server-side here now.
  check('the visit save hardcodes the pool as its source (no client picker any more)', () => {
    assert.ok(src.includes('const source = POOL_LOCATION;'));
  });
}

// ───────────────────────── 3. SigmaInv — the order paths (07-orders.js deleted, U10) ────────
// React (InventoryOrders/InventoryOrderSheet) runs these same rules now; asserted directly
// against the rule module instead of lifting them out of a deleted vanilla file.

console.log('\n[3] SigmaInv: approval leaves the pool, delivery lands in it');
{
  check('customer approval posts חברה → kibbutz with reason customer_supply', () => {
    const rows = SigmaInv.orderApprovalRows({ orderType: 'customer', kibbutz: 'דפנה', items: [{ name: 'X', qty: 2 }] }, 'עמיחי');
    assert.ok(rows.length, 'the approval movement is gone');
    assert.ok(rows.every(r => r.fromLocation === POOL && r.reason === 'customer_supply'), 'the approval no longer leaves the pool');
    assert.ok(!rows.some(r => 'responsible' in r), 'it still deducts from a person');
  });

  check('supplier delivery posts ספק → חברה with reason order_delivery', () => {
    const rows = SigmaInv.orderDeliveryRows({ orderType: 'supplier', items: [{ name: 'X', qty: 5 }] }, 'עמיחי');
    assert.ok(rows.length, 'the delivery movement is gone');
    assert.ok(rows.every(r => r.fromLocation === SUPPLIER && r.toLocation === POOL && r.reason === 'order_delivery'));
  });

  check('drop-ship still moves nothing (no rows to write)', () => {
    assert.equal(SigmaInv.isDropShip({ orderType: 'customer', assignee: 'ספק ישיר' }), true);
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

  // step 2 — גבים returns one. The legacy returnToStock() (05-meeting-returns.js) is gone
  // (U10) — app/src/islands/InventoryReturns.tsx now runs SigmaInv.restockPlan directly, so
  // that is what this asserts against.
  const plan1 = SigmaInv.restockPlan(
    { id: 'r-1', kibbutz: 'גבים', product: 'E360CT', qty: 1 },
    { me: 'אביאם', movements: ledger },
  );

  check('#12 — the return names BOTH ends: גבים → חברה (it used to credit from nowhere)', () => {
    assert.ok(!plan1.error, plan1.error);
    assert.equal(plan1.movements.length, 1);
    assert.deepEqual(
      { from: plan1.movements[0].fromLocation, to: plan1.movements[0].toLocation, qty: plan1.movements[0].quantity, reason: plan1.movements[0].reason },
      { from: 'גבים', to: POOL, qty: 1, reason: 'return_restock' },
    );
    assert.notEqual(plan1.movements[0].fromLocation, '',
      'fromLocation:"" is the bug — the pool gained a unit and no kibbutz gave one up');
  });

  plan1.movements.forEach(m => ledger.push({ ...m, refId: 'r-1' }));
  check('the ledger balances: pool 37, גבים 3 — the kibbutz really gave the unit up', () => {
    assert.equal(bal(POOL, 'E360CT'), 37);
    assert.equal(bal('גבים', 'E360CT'), 3);
  });

  // step 3 — the SAME physical return, already restocked once (the visit save posts the very
  // same refId + reason). Pressing the button must not credit the pool a second time.
  const plan2 = SigmaInv.restockPlan({ id: 'r-1', kibbutz: 'גבים', product: 'E360CT', qty: 1 }, { me: 'אביאם', movements: ledger });
  check('#12 — a second attempt plans nothing: the refId guard sees the existing movement', () => {
    assert.equal(plan2.movements.length, 0, 'the same return was credited twice — this is the double-credit half of #12');
    assert.ok(plan2.error && plan2.error.indexOf('כבר הוחזר') !== -1, 'and it says why, instead of failing silently');
  });
  check('the balances did not move', () => {
    assert.equal(bal(POOL, 'E360CT'), 37);
    assert.equal(bal('גבים', 'E360CT'), 3);
  });

  // step 4 — a return row with no kibbutz cannot be restocked: a credit with no debit IS the
  // bug, so the path refuses rather than inventing stock.
  const plan3 = SigmaInv.restockPlan({ id: 'r-2', kibbutz: '', product: 'E360CT', qty: 1 }, { me: 'אביאם', movements: ledger });
  check('a return with no kibbutz is refused, not credited from nowhere', () => {
    assert.equal(plan3.movements.length, 0);
    assert.ok(plan3.error, 'and the person is told why');
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
