// Self-check for Web Push recipient routing (mirrors computeRecipients in js/src/22-push.js,
// which itself ports canApproveThisOrder / orderNeedsAmichai from js/src/07-orders.js).
// Run: node test-push.mjs
// Invariant: the "needs approval" push goes to EXACTLY whoever the app lets approve that order;
// the "approved" push goes to the group minus the approver and minus the creator. Never self-notify.
import assert from 'node:assert';

// --- ported logic (must stay identical to js/src/22-push.js) ---
function orderTotalQty(o) { return (o.items || []).reduce(function (s, i) { return s + (parseInt(i.qty) || 0); }, 0); }
function orderType(o) { return o.orderType || (/בקשת לקוח/.test(o.notes || '') ? 'customer' : 'supplier'); }
function orderNeedsAmichai(o) { return orderType(o) === 'supplier' && orderTotalQty(o) > 10; }
const APPROVE_GROUP = ['אביאם', 'ניתאי', 'עמיחי'];
function pendingApprovers(o) {
  if (orderType(o) === 'customer') return ['אביאם', 'ניתאי'];
  return orderNeedsAmichai(o) ? ['עמיחי'] : ['אביאם'];
}
function computeRecipients(event, order, actor) {
  var rec;
  if (event === 'pending') rec = pendingApprovers(order);
  else if (event === 'approved') rec = APPROVE_GROUP.slice();
  else return [];
  var creator = order.createdBy || order.created_by || '';
  return rec.filter(function (n) { return n && n !== actor && n !== creator; });
}
// --- end ported logic ---

const supplierSmall = { orderType: 'supplier', items: [{ qty: 5 }], createdBy: 'עידן' };
const supplierBig   = { orderType: 'supplier', items: [{ qty: 7 }, { qty: 8 }], createdBy: 'עידן' };  // 15 > 10
const customerOrder = { orderType: 'customer', items: [{ qty: 3 }], createdBy: 'עידן' };
const customerByNotes = { notes: 'בקשת לקוח — מגידו', items: [{ qty: 2 }], createdBy: 'עידן' };

// PENDING routing by type/qty
assert.deepEqual(computeRecipients('pending', supplierSmall, 'עידן'), ['אביאם'], 'supplier ≤10 → אביאם');
assert.deepEqual(computeRecipients('pending', supplierBig, 'עידן'), ['עמיחי'], 'supplier >10 → עמיחי');
assert.deepEqual(computeRecipients('pending', customerOrder, 'עידן'), ['אביאם', 'ניתאי'], 'customer → אביאם+ניתאי');
assert.deepEqual(computeRecipients('pending', customerByNotes, 'עידן'), ['אביאם', 'ניתאי'], 'customer detected via notes');

// Never notify yourself to approve your own order
assert.deepEqual(computeRecipients('pending', { orderType: 'supplier', items: [{ qty: 4 }], createdBy: 'אביאם' }, 'אביאם'), [], 'אביאם created small supplier → no self pending-push');
assert.deepEqual(computeRecipients('pending', { orderType: 'customer', items: [{ qty: 4 }], createdBy: 'ניתאי' }, 'ניתאי'), ['אביאם'], 'ניתאי created customer → only אביאם notified');

// APPROVED routing: group minus approver (actor) minus creator
assert.deepEqual(computeRecipients('approved', supplierBig, 'עמיחי'), ['אביאם', 'ניתאי'], 'עמיחי approved → אביאם+ניתאי');
assert.deepEqual(computeRecipients('approved', { orderType: 'supplier', items: [{ qty: 4 }], createdBy: 'אביאם' }, 'אביאם'), ['ניתאי', 'עמיחי'], 'אביאם approved own → others only');
assert.deepEqual(computeRecipients('approved', { orderType: 'customer', items: [{ qty: 2 }], createdBy: 'ניתאי' }, 'אביאם'), ['עמיחי'], 'approved excludes both actor(אביאם) and creator(ניתאי)');

// Unknown event → nothing
assert.deepEqual(computeRecipients('whatever', supplierBig, 'עידן'), [], 'unknown event → no recipients');

console.log('✅ test-push: all assertions passed');
