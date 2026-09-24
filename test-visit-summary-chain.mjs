// סיכום ביקור — the full backend chain of ONE save (spec 2026-09-23-visit-summary-chain-design.md).
//
// עידן 23.9: "every action has its full backend chain". The chapters sheet (Field.tsx) files a
// visit through `saveVisitFromData`, so that function has to do everything the legacy form's
// `saveVisit` does. This runner evaluates js/src/09-visits.js for real and pins each effect:
//   1. the visit row lands (attendance is DERIVED from it, so the snapshot row must carry it);
//   2. equipment leaves the pool for the kibbutz, and an edit / retry moves only the delta;
//   3. the summary is a comment on EVERY selected EMS task, once; an edit sends the change note;
//   4. a new contact joins site_contacts, a known one does not;
//   5. open items and the reason ride on the row, returns are not re-inserted on an edit;
//   6. the day log (no `emsComment`) still gets no second comment from here.
//   Run: node test-visit-summary-chain.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

const visitsSrc = read('js/src/09-visits.js');
const mkEl = (o) => Object.assign({ value: '', innerHTML: '', checked: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false } }, o || {});
const document_ = { getElementById: () => mkEl(), querySelectorAll: () => [], querySelector: () => null, createElement: () => mkEl(), addEventListener() {} };
const storage = {};
const localStorage_ = { getItem: k => storage[k] ?? null, setItem(k, v) { storage[k] = v; }, removeItem(k) { delete storage[k]; } };

let posts = [], sbPosts = [], emsFull = [], emsEdit = [], emitted = [], contactsKnown = [], tracked = [];
const window_ = {
  SHEET_DATA: { visits: [] }, currentKibbutzVisits: [],
  _sbToken: 'tok', _sbTokenExp: Date.now() + 3600e3,
  _sbCertGet: async () => contactsKnown.map(name => ({ name })),
};
const fetch_ = (u, o) => {
  if (String(u).indexOf('https://sb.test/') === 0) { sbPosts.push({ url: u, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, json: async () => ({}) }); }
  if (o && o.body) { try { posts.push(JSON.parse(o.body)); } catch (e) {} }
  const b = o && o.body ? JSON.parse(o.body) : {};
  return Promise.resolve({ json: async () => ({ ok: true, id: b.id || 'SRV_ID' }) });
};

// Round 5 V20 (grill round 5, binding): the general edit lock. Real implementation, mirroring
// js/src/00-consts.js exactly (not a stub), so this harness exercises the same rule production
// runs, not a pass-through. The equipment-edit stock delta no longer branches on the breakpoint at
// all (Opus audit — see visitEdit.ts): it always diffs against priorSnap.products.
const ROUND5_LOCK_FLOOR = '2026-09-01';
const INVENTORY_BREAKPOINT_AT = '2026-09-23T14:05:47.625Z';
function israelYmd(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function visitEditableUntil(dateStr) {
  const ymd = String(dateStr || '').slice(0, 10);
  const y = parseInt(ymd.slice(0, 4), 10), m = parseInt(ymd.slice(5, 7), 10);
  const ny = m >= 12 ? y + 1 : y, nm = m >= 12 ? 1 : m + 1;
  return ny + '-' + String(nm).padStart(2, '0') + '-10';
}
function toIsraelDay(input) {
  if (input instanceof Date) return israelYmd(input);
  const s = String(input || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? s.slice(0, 10) : israelYmd(d);
}
function visitEditLocked(dateStr, todayInput) {
  const d = String(dateStr || '').slice(0, 10);
  const today = todayInput ? toIsraelDay(todayInput) : israelYmd(new Date());
  if (d < ROUND5_LOCK_FLOOR) return true;
  return today > visitEditableUntil(d);
}

const fn = new Function(
  'window', 'document', 'localStorage', 'fetch', 'alert', 'WRITE_ROUTER_URL', 'SB_URL', 'SB_ANON', 'setBtnLoading',
  'certIssuedForVisit', 'readVisitEmsIntent', 'pushVisitToEms', 'pushVisitEditToEms', 'refreshData', 'closeModal',
  'currentKibbutz', 'DEFECTIVE_LOCATION', 'POOL_LOCATION', 'computeStock', 'switchTab', 'onVisitorChange',
  'visitReturnedItems', 'renderReturnedItems', 'sigmaEmit', 'sigmaTrack', 'setTimeout',
  'visitEditLocked', 'INVENTORY_BREAKPOINT_AT',
  visitsSrc + '\nreturn { saveVisitFromData };',
);
const mod = fn(
  window_, document_, localStorage_, fetch_, () => {}, 'http://sheet.test', 'https://sb.test', 'anon', () => {},
  async () => 0, () => '', (k, v, intent) => emsFull.push({ k, taskId: intent.taskId, summary: v.summary }),
  (taskId, prev, next) => emsEdit.push({ taskId, from: prev.date, to: next.date }), () => {}, () => {},
  'חוקוק', 'תקול', 'חברה', () => ({}), () => {}, () => {},
  [], () => {}, (name, detail) => emitted.push({ name, detail }),
  (name, kibbutz, via) => tracked.push({ name, kibbutz, via }), () => 0,
  visitEditLocked, INVENTORY_BREAKPOINT_AT,
);
const tick = () => new Promise(r => setImmediate(r));
const reset = () => { posts = []; sbPosts = []; emsFull = []; emsEdit = []; emitted = []; tracked = []; };
const visitPosts = () => posts.filter(p => p.type === 'visit');
const moves = () => posts.filter(p => p.type === 'movement');

// What the chapters sheet sends (Field.tsx `send`).
const chapters = {
  id: 'vd_1', kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-21', duration: '2', workday: false,
  summary: 'הוחלף מונה', openItems: 'לחזור לבדוק תקשורת', contact: 'יוסי מהמחלבה',
  products: [{ name: 'E360', qty: 2 }], returned: [{ name: 'מונה ישן', qty: 1 }],
  reason: '', emsTaskIds: ['T1', 'T2'], emsComment: true, certAfter: true,
};

console.log('\n[1] a new summary from the chapters sheet');
reset();
const r1 = await mod.saveVisitFromData(chapters);
await tick();
check('it is filed once, as new', () => {
  assert.equal(r1.ok, true);
  assert.equal(visitPosts().length, 1);
  assert.equal(visitPosts()[0].isNew, true);
});
check('attendance: the snapshot carries the visitor + date the field day is derived from', () => {
  const v = window_.SHEET_DATA.visits.find(x => x.id === 'vd_1');
  assert.ok(v);
  assert.equal(v.visitor, 'אביאם');
  assert.equal(v.date.slice(0, 10), '2026-09-21');
});
check('open items ride on the row and on the snapshot (→ the next briefing)', () => {
  assert.equal(visitPosts()[0].openItems, 'לחזור לבדוק תקשורת');
  assert.equal(window_.SHEET_DATA.visits.find(x => x.id === 'vd_1').openItems, 'לחזור לבדוק תקשורת');
});
check('stock: the supply leaves the pool for the kibbutz', () => {
  assert.deepEqual(moves().map(m => [m.product, m.fromLocation, m.toLocation, m.quantity, m.reason]),
    [['E360', 'חברה', 'חוקוק', 2, 'visit_supply']]);
  assert.ok(emitted.some(e => e.name === 'stock-changed'));
});
check('returns go with the row (the returns tab decides תקין / תקול)', () => {
  assert.equal(visitPosts()[0].returnedItems.length, 1);
});
check('EMS: the summary is a comment on EVERY selected task, the first is the link', () => {
  assert.deepEqual(emsFull.map(e => e.taskId), ['T1', 'T2']);
  assert.equal(visitPosts()[0].emsTaskId, 'T1');
});
check('a contact new to the kibbutz joins site_contacts', () => {
  assert.equal(sbPosts.length, 1);
  assert.deepEqual(sbPosts[0].body, { kibbutz: 'חוקוק', name: 'יוסי מהמחלבה', active: true });
});
check('the rest of the app hears visit-saved (attendance, drafts, calendar refresh)', () => {
  assert.ok(emitted.some(e => e.name === 'visit-saved'));
});

console.log('\n[2] the same visit saved again (edit: new date, 3 meters)');
reset(); contactsKnown = ['יוסי מהמחלבה'];
const r2 = await mod.saveVisitFromData({ ...chapters, date: '2026-09-22', products: [{ name: 'E360', qty: 3 }], emsTaskIds: ['T1'] });
await tick();
check('it is an update, not a second visit', () => {
  assert.equal(r2.ok, true); assert.equal(r2.edited, true);
  assert.equal(visitPosts()[0].isNew, false);
  assert.equal(window_.SHEET_DATA.visits.filter(x => x.id === 'vd_1').length, 1);
});
check('attendance: the day moves with the date (same row patched)', () => {
  assert.equal(window_.SHEET_DATA.visits.find(x => x.id === 'vd_1').date.slice(0, 10), '2026-09-22');
});
check('stock: only the delta (+1) moves', () => {
  assert.deepEqual(moves().map(m => [m.product, m.fromLocation, m.toLocation, m.quantity, m.reason]),
    [['E360', 'חברה', 'חוקוק', 1, 'visit_supply_edit']]);
});
check('returns are not inserted twice', () => assert.equal(visitPosts()[0].returnedItems.length, 0));
check('EMS: the linked task gets the change note, not a second summary', () => {
  assert.equal(emsFull.length, 0);
  assert.deepEqual(emsEdit.map(e => e.taskId), ['T1']);
});
check('a known contact is not added again', () => assert.equal(sbPosts.length, 0));

console.log('\n[3] a plain retry of the identical save');
reset();
await mod.saveVisitFromData({ ...chapters, date: '2026-09-22', products: [{ name: 'E360', qty: 3 }], emsTaskIds: ['T1'] });
await tick();
check('no stock moves at all', () => assert.equal(moves().length, 0));

console.log('\n[4] edit that gives back a meter');
reset();
await mod.saveVisitFromData({ ...chapters, date: '2026-09-22', products: [{ name: 'E360', qty: 1 }], emsTaskIds: ['T1'] });
check('the over-supply goes back to the pool', () => {
  assert.deepEqual(moves().map(m => [m.fromLocation, m.toLocation, m.quantity]), [['חוקוק', 'חברה', 2]]);
});

console.log('\n[5] the day log (no emsComment) and the reason');
reset();
await mod.saveVisitFromData({ kibbutz: 'דפנה', visitor: 'ניתאי', date: '2026-09-20', duration: 1, summary: 'בדיקה', emsTaskId: 'T9', reason: 'תקלה' });
check('the day log posts its own sentence: nothing from here', () => assert.equal(emsFull.length, 0));
check('the link is still stored', () => assert.equal(visitPosts()[0].emsTaskId, 'T9'));
check('the reason rides on the row', () => assert.equal(visitPosts()[0].reason, 'תקלה'));

console.log('\n[6] the writer and the bridge');
const dataSrc = read('js/src/01-data.js');
check('writeVisit writes the reason and retries without it on a missing column', () => {
  assert.ok(/if \(b\.reason\) row\.reason/.test(dataSrc));
  assert.ok(/42703\|PGRST204/.test(dataSrc));
});
check('the loader keeps open_items on the snapshot row', () => assert.ok(/openItems: v\.open_items/.test(dataSrc)));
const bridgeSrc = read('js/src/00-bridge.js');
check('getLastVisit hands the briefing `open_items`', () => assert.ok(/open_items: v\.open_items \|\| v\.openItems/.test(bridgeSrc)));
const fieldSrc = read('app/src/islands/Field.tsx');
check('the chapters sheet sends every task to the ONE pipeline and posts no comment itself', () => {
  assert.ok(/emsTaskIds: emsIds,/.test(fieldSrc));
  assert.ok(/emsComment: true/.test(fieldSrc));
  assert.ok(!/kind: 'comment'/.test(fieldSrc));
});

console.log('\n[7] round 5 V20: edit lock + equipment-edit stock diff + via tracking (replaces the original ' +
  '"equipment locked before the breakpoint" rule — grill round 5, binding)');
reset();
window_.SHEET_DATA.visits.push({
  id: 'v_aug', kibbutz: 'חוקוק', date: '2026-08-15T12:00:00.000Z', visitor: 'אביאם',
  products: [{ name: 'E360', qty: 2 }], summary: 'ישן', createdAt: '2026-08-15T12:05:00.000Z',
});
const rLocked = await mod.saveVisitFromData({ ...chapters, id: 'v_aug', date: '2026-08-16', products: [{ name: 'E360', qty: 9 }] });
check('L9 an edit of a locked visit (August 2026) is refused before any write', () => {
  assert.equal(rLocked.ok, false);
  assert.equal(rLocked.locked, true);
  assert.equal(posts.length, 0, 'no visit/movement POST at all');
  assert.equal(sbPosts.length, 0);
});

reset();
window_.SHEET_DATA.visits.push({
  id: 'v_pre', kibbutz: 'חוקוק', date: '2026-09-20T12:00:00.000Z', visitor: 'אביאם',
  products: [{ name: 'E360', qty: 2 }], summary: 'ישן', createdAt: '2026-09-20T08:00:00.000Z',
});
const r10 = await mod.saveVisitFromData({ ...chapters, id: 'v_pre', date: '2026-09-20', products: [{ name: 'E360', qty: 5 }] });
await tick();
check('L10 a pre-breakpoint September visit stays editable, equipment included', () => {
  assert.equal(r10.ok, true);
  assert.equal(r10.edited, true);
});
check('L10b the delta is the REAL difference against the visit\'s own filed row (2 → 5 = +3)', () => {
  assert.deepEqual(moves().map(m => [m.product, m.fromLocation, m.toLocation, m.quantity, m.reason]),
    [['E360', 'חברה', 'חוקוק', 3, 'visit_supply_edit']]);
});

// Opus audit golden: editing the SAME pre-breakpoint visit a SECOND time must move only the new
// difference, never re-post the first edit's delta or the visit's whole current quantity. (The
// archive-diff design this replaces always nets to 0 against real archived data — every
// visit_supply there runs a personal bag → kibbutz, never from חברה — so every edit re-posted the
// full quantity: a real production bug, real visit ids v_1788936358654_5i9hmx and
// v_1788935530124_mnv4lx. priorSnap.products, unconditional now, cannot repeat that.)
reset();
const r10c = await mod.saveVisitFromData({ ...chapters, id: 'v_pre', date: '2026-09-20', products: [{ name: 'E360', qty: 8 }] });
await tick();
check('L10c editing the same pre-breakpoint visit TWICE moves only the real differences each time (5 → 8 = +3, not +6, not +8)', () => {
  assert.equal(r10c.ok, true);
  assert.deepEqual(moves().map(m => [m.product, m.fromLocation, m.toLocation, m.quantity, m.reason]),
    [['E360', 'חברה', 'חוקוק', 3, 'visit_supply_edit']]);
});

reset();
const r11 = await mod.saveVisitFromData({ ...chapters, id: 'vd_2', via: 'chapters' });
check('L11 the sheet\'s via label reaches sigmaTrack; other callers keep the daylog default', () => {
  assert.equal(r11.ok, true);
  assert.deepEqual(tracked.map(t => t.via), ['chapters']);
});
reset();
await mod.saveVisitFromData({ ...chapters, id: 'vd_3' });   // no `via` — the day log / any other caller
check('L11b no via → the daylog default, unchanged', () => assert.deepEqual(tracked.map(t => t.via), ['daylog']));

check('L12 INVENTORY_BREAKPOINT_AT is the same literal in 00-consts.js and visitEdit.ts', () => {
  const consts = read('js/src/00-consts.js');
  const visitEdit = read('app/src/lib/visitEdit.ts');
  assert.match(consts, /INVENTORY_BREAKPOINT_AT = '2026-09-23T14:05:47\.625Z'/);
  assert.match(visitEdit, /INVENTORY_BREAKPOINT_AT = '2026-09-23T14:05:47\.625Z'/);
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
