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
      'getActiveProducts', 'alert', 'setTimeout',
      src + '\nreturn { computeStock, poolStockMap, lowStockReport, invRenderStock, openStockChangeSheet };',
    );
    return fn(
      win, doc, POOL, [POOL], [POOL, 'ספירה', SUPPLIER, 'תקול', 'אביאם', 'ניתאי', 'משרד', 'עמיחי'],
      () => 'עמיחי', () => false, () => true, () => '',
      () => win.SHEET_DATA.products, () => {}, () => 0,
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
    const { meters, sims } = M.lowStockReport();
    assert.equal(meters.length, 1, 'the meter type is below its line in the pool');
    assert.equal(meters[0].total, 3, 'a bag nobody swept yet does not count as stock');
    assert.deepEqual(sims.map(s => [s.type, s.qty, s.person]), [['סים 1NCE', 4, POOL]]);
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
    'window', 'document', 'localStorage', 'fetch', 'alert', 'SHEET_API', 'setBtnLoading',
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

console.log('\n' + '─'.repeat(60));
if (failed) { console.log(`FAILED  ${failed} check(s)`); process.exit(1); }
console.log('PASSED  unified inventory pool — legacy half');
