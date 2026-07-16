// Self-check for drop-ship (ספק ישיר) orders + supplier datalist (mirrors js/src/07-orders.js).
// Run: node test-dropship.mjs
// Invariants: drop-ship = customer order with assignee 'ספק ישיר'; its approval must produce
// NO stock movements and NO EMS task; supplier list = distinct trimmed names, Hebrew-sorted.
import assert from 'node:assert';

function orderType(o) { return o.orderType || (/בקשת לקוח/.test(o.notes || '') ? 'customer' : 'supplier'); }
function isDirectSupply(o) { return orderType(o) === 'customer' && (o.assignee || '') === 'ספק ישיר'; }
// approval side-effects decision (mirrors approveCustomerOrder branching)
function customerApprovalEffects(o) {
  return isDirectSupply(o) ? { movements: false, emsTask: false } : { movements: true, emsTask: true };
}
function distinctSuppliers(orders) {
  var seen = {};
  (orders || []).forEach(function (o) { var s = (o.supplier || '').trim(); if (s) seen[s] = 1; });
  return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'he'); });
}

// classification
assert.equal(isDirectSupply({ orderType: 'customer', assignee: 'ספק ישיר' }), true);
assert.equal(isDirectSupply({ orderType: 'customer', assignee: 'אביאם' }), false);
assert.equal(isDirectSupply({ orderType: 'customer' }), false, 'no assignee = regular customer order');
assert.equal(isDirectSupply({ orderType: 'supplier', assignee: 'ספק ישיר' }), false, 'supplier orders are never drop-ship');
assert.equal(isDirectSupply({ notes: 'בקשת לקוח — דגניה', assignee: 'ספק ישיר' }), true, 'legacy notes-typed customer order');

// approval side-effects
assert.deepEqual(customerApprovalEffects({ orderType: 'customer', assignee: 'ספק ישיר' }), { movements: false, emsTask: false });
assert.deepEqual(customerApprovalEffects({ orderType: 'customer', assignee: 'ניתאי' }), { movements: true, emsTask: true });
assert.deepEqual(customerApprovalEffects({ orderType: 'customer' }), { movements: true, emsTask: true });

// supplier datalist: distinct, trimmed, no blanks, Hebrew-sorted
const list = distinctSuppliers([
  { supplier: 'שניידר' }, { supplier: ' שניידר ' }, { supplier: '' }, {}, { supplier: 'ABB' }, { supplier: 'אלקטרה' },
]);
assert.deepEqual(list, ['ABB', 'אלקטרה', 'שניידר'].sort((a, b) => a.localeCompare(b, 'he')));
assert.equal(new Set(list).size, list.length, 'no duplicates');

console.log('✅ test-dropship: all assertions passed');
