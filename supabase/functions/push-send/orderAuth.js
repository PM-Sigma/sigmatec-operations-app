// push-send/orderAuth.js - PURE, dependency-free (Node tests + Deno import the same file).
// WHO may trigger an order push / approve an order, decided on the server from the VERIFIED
// identity (the signed 180-min pass), never from a field in the request body.
export const qty = (o) => (o.items || []).reduce((s, i) => s + (parseInt(i.qty) || 0), 0);
export const otype = (o) => o.order_type || o.orderType || (/בקשת לקוח/.test(o.notes || '') ? 'customer' : 'supplier');

/** Mirror of app/src/lib/inventory.ts canApproveThisOrder (test-push-auth.mjs pins the cases). */
export function canApproveOrder(order, me) {
  if (me === 'עמיחי') return true;
  if (otype(order) === 'customer') return me === 'אביאם' || me === 'ניתאי';
  return qty(order) <= 10 && me === 'אביאם';
}

/** An order event must match the order's real state, or it is a replay / a forgery. */
export function eventMatchesStatus(event, order) {
  if (event === 'pending') return order.status === 'pending_approval';
  if (event === 'approved') return order.status !== 'pending_approval';
  return false;
}
