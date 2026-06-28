// Self-check for partial-safe order/requirement updates (mirrors orderUpdateRow/reqUpdateRow in js/src/01-data.js).
// Run: node test-order-patch.mjs
// Invariant: an UPDATE writes ONLY the fields actually sent. A status-only {id,status} must NOT carry an
// `items`/`supplier`/`notes` key — otherwise the PATCH would wipe the order's details (the reported bug).
import assert from 'node:assert';

function orderUpdateRow(b) {
  const row = {};
  if (b.status       !== undefined) row.status        = b.status;
  if (b.items        !== undefined) row.items         = b.items;
  if (b.supplier     !== undefined) row.supplier      = b.supplier;
  if (b.expectedDate !== undefined) row.expected_date = b.expectedDate;
  if (b.notes        !== undefined) row.notes         = b.notes;
  if (b.distribution !== undefined) row.distribution  = b.distribution;
  if (b.createdBy    !== undefined) row.created_by    = b.createdBy;
  if (b.deliveredAt  !== undefined) row.delivered_at  = b.deliveredAt;
  return row;
}
function reqUpdateRow(b) {
  const row = {};
  if (b.status        !== undefined) row.status          = b.status;
  if (b.items         !== undefined) row.items           = b.items;
  if (b.kibbutz       !== undefined) row.kibbutz         = b.kibbutz;
  if (b.contactName   !== undefined) row.contact_name    = b.contactName;
  if (b.notes         !== undefined) row.notes           = b.notes;
  if (b.linkedOrderId !== undefined) row.linked_order_id = b.linkedOrderId;
  if (b.createdBy     !== undefined) row.created_by      = b.createdBy;
  if (b.fulfilledAt   !== undefined) row.fulfilled_at    = b.fulfilledAt;
  return row;
}

// The reported bug: approve a supplier order → {id,status:'pending'}. Must touch status ONLY.
let r = orderUpdateRow({ id: 'ord_1', status: 'pending' });
assert.deepEqual(Object.keys(r).sort(), ['status'], 'status-only order update must carry status only');
assert.ok(!('items' in r), 'status-only update must NOT include items (would wipe them)');

// Quick status push through the pipeline — same: status only, items preserved.
r = orderUpdateRow({ id: 'ord_1', status: 'in_transit' });
assert.deepEqual(Object.keys(r), ['status']);

// A real edit DOES send items/supplier/notes → they are written.
r = orderUpdateRow({ id: 'ord_1', status: 'pending', items: [{ name: 'Landis+Gyr E360PP', qty: 700 }], supplier: 'X', notes: 'n' });
assert.deepEqual(r.items, [{ name: 'Landis+Gyr E360PP', qty: 700 }]);
assert.equal(r.supplier, 'X');

// Requirement: customer flow links it with {id,status:'in_progress',linkedOrderId} — must not wipe items/kibbutz.
r = reqUpdateRow({ id: 'req_1', status: 'in_progress', linkedOrderId: 'ord_1' });
assert.deepEqual(Object.keys(r).sort(), ['linked_order_id', 'status']);
assert.ok(!('items' in r) && !('kibbutz' in r), 'requirement link update must not include items/kibbutz');

// Requirement fulfilled-by-id — status only.
r = reqUpdateRow({ id: 'req_1', status: 'fulfilled' });
assert.deepEqual(Object.keys(r), ['status']);

console.log('✅ test-order-patch: all assertions passed');
