// Self-check for push action-buttons + scheduled attendance logic.
// Mirrors pure helpers in supabase/functions/push-send/index.ts. Run: node test-push-actions.mjs
import assert from 'node:assert';

// --- ported from push-send (keep identical) ---
const kindForHour = (hh) => (hh === 19 ? 'evening' : hh === 9 ? 'morning' : null);
function priorMissing(have, t) {
  const out = [];
  for (let day = 1; day < t.d; day++) {
    const dow = new Date(Date.UTC(t.y, t.m - 1, day)).getUTCDay();
    if (dow > 4) continue;                       // Fri(5)/Sat(6) out
    const key = `${t.y}-${String(t.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!have.has(key)) out.push(key);
  }
  return out;
}
const otype = (o) => o.order_type || o.orderType || (/בקשת לקוח/.test(o.notes || '') ? 'customer' : 'supplier');
function orderActions(event, order) {
  if (event !== 'pending') return ['view'];
  return otype(order) === 'customer' ? ['approveOpen', 'view'] : ['approve', 'view'];
}
// --- end ported ---

// hour gate
assert.equal(kindForHour(19), 'evening');
assert.equal(kindForHour(9), 'morning');
assert.equal(kindForHour(8), null);
assert.equal(kindForHour(20), null);
assert.equal(kindForHour(0), null);

// priorMissing — July 2026, "today" = 6th → prior days 1..5, Fri/Sat dropped.
// (assertion doubles as a calendar check: Jul 3=Fri, Jul 4=Sat are excluded.)
const t = { y: 2026, m: 7, d: 6 };
assert.deepEqual(priorMissing(new Set(), t), ['2026-07-01', '2026-07-02', '2026-07-05'], 'all prior weekdays missing');
assert.deepEqual(priorMissing(new Set(['2026-07-02']), t), ['2026-07-01', '2026-07-05'], 'recorded day excluded');
assert.deepEqual(priorMissing(new Set(['2026-07-01', '2026-07-02', '2026-07-05']), t), [], 'nothing missing');
// today itself is never "prior" (morning job is prior-days only)
assert.ok(!priorMissing(new Set(), t).includes('2026-07-06'), 'today excluded from morning list');

// order action buttons by type + event
assert.deepEqual(orderActions('pending', { orderType: 'supplier' }), ['approve', 'view'], 'supplier pending → one-tap approve');
assert.deepEqual(orderActions('pending', { orderType: 'customer' }), ['approveOpen', 'view'], 'customer pending → approveOpen (in-app)');
assert.deepEqual(orderActions('pending', { notes: 'בקשת לקוח — מגידו' }), ['approveOpen', 'view'], 'customer via notes → approveOpen');
assert.deepEqual(orderActions('approved', { orderType: 'supplier' }), ['view'], 'approved → view only');

console.log('✅ test-push-actions: all assertions passed');
