// Parity runner (package I, task L3): evaluates the OLD js/src/07-orders.js order helpers for
// real and compares them against app/src/lib/inventory.ts (window.SigmaInv) over generated
// cases. Differences are errors EXCEPT the named DELTAS (fixed bugs / ruled copy changes) —
// this is what proves the new lib is a faithful port everywhere it isn't a deliberate fix.
//
// Runs until U10 deletes js/src/07-orders.js, at which point this file is retired (task L6/U10
// note left here for whoever does that).
//
// Run: node test-inventory-parity.mjs   (also folded into npm test via scripts/test-all.mjs)
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { loadSigmaInv } from './scripts/sigma-inv.mjs';

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failed++; console.log('  FAIL - ' + name + ': ' + (e && e.message)); }
}

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

if (!existsSync(new URL('./js/src/07-orders.js', import.meta.url))) {
  console.log('js/src/07-orders.js is gone (post-U10) — this runner has nothing left to compare. Skipping.');
  process.exit(0);
}

const SigmaInv = loadSigmaInv();
const src = read('./js/src/07-orders.js');

// Lift the OLD, still-unmodified order helpers out of the source (same technique
// test-autoadd.mjs already uses for this exact file).
const legacy = new Function(
  'window', 'document', 'getActiveProducts', 'getCurrentUser', 'localStorage',
  src + '\nreturn { getOrderQuickAction, orderType, orderKibbutz, isDirectSupply, orderNeedsAmichai, ' +
    'canApproveThisOrder, orderTotalQty, distinctSuppliers, accessoryPlan, parseLocalToItems };',
)(
  { SHEET_DATA: { requirements: [] } }, { querySelectorAll: () => [] },
  () => [{ name: 'בקר 504' }, { name: 'מונה Landis+Gyr E360PP' }], () => 'עמיחי',
  { getItem: () => null, setItem() {} },
);

const USERS = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן'];
const STATUSES = ['pending_approval', 'pending', 'in_transit', 'stuck', 'at_port', 'arrived', 'delivered', 'supplied'];
const TYPES = ['supplier', 'customer'];
const SIZES = [1, 11];

function* generatedOrders() {
  let i = 0;
  for (const status of STATUSES) for (const orderType of TYPES) for (const qty of SIZES) for (const assignee of ['', 'ספק ישיר']) {
    yield { id: 'go-' + (i++), status, orderType, items: [{ name: 'בקר 504', qty }], kibbutz: orderType === 'customer' ? 'חוקוק' : '', assignee, notes: '' };
  }
}
const orders = [...generatedOrders()];
const reqs = [];

console.log('\n[1] orderType / orderKibbutz / isDirectSupply / orderNeedsAmichai / orderTotalQty — every generated order');
{
  let n = 0;
  for (const o of orders) {
    n++;
    check('#' + n + ' orderType', () => assert.equal(SigmaInv.orderType(o), legacy.orderType(o)));
    check('#' + n + ' isDirectSupply', () => assert.equal(SigmaInv.isDirectSupply(o), legacy.isDirectSupply(o)));
    check('#' + n + ' orderNeedsAmichai', () => assert.equal(SigmaInv.orderNeedsAmichai(o), legacy.orderNeedsAmichai(o)));
    check('#' + n + ' orderTotalQty', () => assert.equal(SigmaInv.orderTotalQty(o), legacy.orderTotalQty(o)));
    check('#' + n + ' orderKibbutz', () => assert.equal(SigmaInv.orderKibbutz(o, reqs), legacy.orderKibbutz(o)));
  }
}

console.log('\n[2] canApproveThisOrder — 5 users × every generated order');
{
  // legacy.canApproveThisOrder reads getCurrentUser() (a closure over the stub passed at lift
  // time) rather than taking a parameter — re-lift once per user so the comparison is against
  // the SAME user SigmaInv is asked about, not always whatever [1] happened to stub.
  let n = 0;
  for (const me of USERS) {
    const legacyAsUser = new Function(
      'window', 'document', 'getActiveProducts', 'getCurrentUser', 'localStorage',
      src + '\nreturn { canApproveThisOrder };',
    )({ SHEET_DATA: { requirements: [] } }, { querySelectorAll: () => [] }, () => [], () => me, { getItem: () => null, setItem() {} });
    for (const o of orders) {
      n++;
      check('#' + n + ' ' + me + ' (real getCurrentUser)', () => assert.equal(SigmaInv.canApproveThisOrder(o, me), legacyAsUser.canApproveThisOrder(o)));
    }
  }
}

console.log('\n[3] getOrderQuickAction(status).next === quickAction(o).next for supplier orders (O4: same TRANSITION, the STOCK-POSTING side effect is the named fix, tracked separately)');
{
  for (const status of STATUSES) {
    check('supplier ' + status, () => {
      const o = { id: 'q1', status, orderType: 'supplier', items: [{ name: 'בקר 504', qty: 1 }] };
      const l = legacy.getOrderQuickAction(status);
      const s = SigmaInv.quickAction(o);
      assert.equal(s?.next ?? null, l?.next ?? null);
    });
  }
}

console.log('\n[4] distinctSuppliers — order-preserving-free, he-sorted, unique');
check('distinctSuppliers', () => {
  const testOrders = [{ supplier: 'לנדיס' }, { supplier: 'סאטק' }, { supplier: 'לנדיס' }, { supplier: '' }, { supplier: 'אקרשטיין' }];
  assert.deepEqual(SigmaInv.distinctSuppliers(testOrders), legacy.distinctSuppliers(testOrders));
});

console.log('\n[5] the parser corpus (task L4) — SigmaInv.parseLocalToItems vs the SAME legacy parseLocalToItems');
{
  const corpus = JSON.parse(read('./app/src/lib/__fixtures__/inventory/parse-corpus.json'));
  const legacyCat = new Function(
    'window', 'document', 'getActiveProducts', 'getCurrentUser', 'localStorage',
    src + '\nreturn { parseLocalToItems };',
  )({ SHEET_DATA: { requirements: [] } }, { querySelectorAll: () => [] }, () => corpus.catalog.map(name => ({ name })), () => 'עמיחי', { getItem: () => null, setItem() {} });
  for (const text of corpus.texts) {
    check(JSON.stringify(text), () => assert.deepEqual(SigmaInv.parseLocalToItems(text, corpus.catalog), legacyCat.parseLocalToItems(text)));
  }
}

console.log('\n' + '─'.repeat(60));
if (failed) { console.log(`FAILED  ${failed} check(s)`); process.exit(1); }
console.log('PASSED  inventory order-machine parity (legacy 07-orders.js ↔ app/src/lib/inventory.ts)');
