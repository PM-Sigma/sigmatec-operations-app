// Round 2 security + holiday-store contract. Run: node test-push-auth.mjs
//  - push-send order pushes: approver rule + event/state match (pure orderAuth.js)
//  - push-send modes are gated (approveOrder, order events, attendanceCron) and inventory pushes
//    honour `stock_enforced` (source contract on index.ts)
//  - the service worker no longer calls the API from a notification action
//  - holidays live on window._holidays so the 15s SHEET_DATA replacement cannot drop them
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { canApproveOrder, eventMatchesStatus } from './supabase/functions/push-send/orderAuth.js';

const sup = (n) => ({ order_type: 'supplier', items: [{ qty: n }] });
const cus = { order_type: 'customer', items: [{ qty: 50 }] };
assert.equal(canApproveOrder(sup(5), 'אביאם'), true, 'small supplier order: אביאם');
assert.equal(canApproveOrder(sup(11), 'אביאם'), false, '>10 needs עמיחי');
assert.equal(canApproveOrder(sup(11), 'עמיחי'), true);
assert.equal(canApproveOrder(sup(5), 'ניתאי'), false, 'ניתאי does not approve supplier orders');
assert.equal(canApproveOrder(sup(5), 'עידן'), false, 'nobody else');
assert.equal(canApproveOrder(sup(5), ''), false, 'no identity');
assert.equal(canApproveOrder(cus, 'ניתאי'), true, 'customer order: אביאם/ניתאי');
assert.equal(canApproveOrder(cus, 'מתניה'), false);
assert.equal(eventMatchesStatus('pending', { status: 'pending_approval' }), true);
assert.equal(eventMatchesStatus('pending', { status: 'pending' }), false, 'replayed pending after approval');
assert.equal(eventMatchesStatus('approved', { status: 'pending_approval' }), false, 'forged approved');
assert.equal(eventMatchesStatus('approved', { status: 'pending' }), true);
assert.equal(eventMatchesStatus('nonsense', { status: 'pending' }), false);

const idx = readFileSync('supabase/functions/push-send/index.ts', 'utf8');
const block = (start, end) => { const a = idx.indexOf(start); assert.ok(a > 0, start); return idx.slice(a, end ? idx.indexOf(end, a) : undefined); };
assert.match(block('body.mode === "attendanceCron"', 'const t = israelNow'), /requireCronOrEms/, 'attendanceCron is gated');
const approve = block('body.mode === "approveOrder"', 'body.mode === "feedbackNew"');
assert.match(approve, /passName\(req\)/); assert.match(approve, /canApproveOrder\(order, me\)/);
assert.ok(!/body\.actor/.test(approve), 'approver is the verified name, never body.actor');
const events = block('// AUTH: a signed-in person');
assert.match(events, /passName\(req\)/); assert.match(events, /eventMatchesStatus/); assert.match(events, /from\("push_log"\)[^;]*eq\("order_id"/s);
for (const m of ['inventoryAlert', 'inventoryDigest']) { const a = idx.indexOf('body.mode === "' + m + '"'); assert.match(idx.slice(a, a + 700), /stockEnforced\(\)/, m + ' honours stock_enforced'); }
assert.match(idx, /async function stockEnforced[\s\S]*?catch \{ return false; \}/, 'missing row / error = not enforced');

const sw = readFileSync('sw.js', 'utf8');
assert.ok(!/approveFromPush|approveOrder/.test(sw), 'sw never approves from a notification');

// holidays: stored off SHEET_DATA
const att = readFileSync('js/src/04-attendance-daily.js', 'utf8');
const fn = att.match(/function attHolidays\(\)[^\n]*/)[0];
const window = { SHEET_DATA: { attendance: [] }, _holidays: [{ date: '2026-09-21', required: false }] };
new Function('window', fn + '; window.out = attHolidays();')(window);
window.SHEET_DATA = { attendance: [] };           // what the 15s poll does
new Function('window', fn + '; window.out2 = attHolidays();')(window);
assert.equal(window.out2.length, 1, 'holidays survive the SHEET_DATA replacement');
assert.ok(!/SHEET_DATA\.holidays/.test(att), '04-attendance-daily no longer keeps holidays on SHEET_DATA');
assert.ok(/attHolidayOn\(attYmd\(r\.date\)\)/.test(att), 'PDF export marks holidays through attHolidayOn');
assert.ok(/attHolidayOn/.test(readFileSync('js/src/21-excel-export.js', 'utf8')), 'Excel export marks holidays through attHolidayOn');

console.log('PASSED  push auth + holiday store');
