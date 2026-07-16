// Attendance-push suite — attMissingDays golden fixtures, reminder text, recipient gating.
// Run: node test-attendance-push.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/22-push.js'), 'utf8');

let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); passes++; console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// The module wraps its logic in IIFEs and exposes the pure helpers on `window`.
// Recipient gating + VAPID now live server-side (supabase/functions/push-send), not in the client.
function loadModule() {
  const win = {};
  const fn = new Function('window', 'document', 'localStorage', 'navigator', 'fetch', 'setTimeout',
    'getCurrentUser', 'isViewer', 'isIdan', 'attPerson', 'confirm', 'alert', src);
  fn(win, { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } },
    { getItem: () => null, setItem() {} }, { userAgent: 'test' }, async () => ({ ok: true }), () => {},
    () => '', () => false, () => false, () => '', () => false, () => {});
  return win;   // { attMissingDays, attReminderText, ... } as exposed on window
}
const M = loadModule();

// July 2026: 1=Wed, 3-4=Fri/Sat, 5=Sun ... today (fixture) = 16 Wed → check through the 15th
const TODAY = new Date(2026, 6, 16);

console.log('== attMissingDays ==');
check('empty month → all weekdays up to yesterday', () => {
  const out = M.attMissingDays([], [], 'אביאם', 2026, 6, TODAY);
  assert.deepStrictEqual(out, ['2026-07-01', '2026-07-02', '2026-07-05', '2026-07-06', '2026-07-07',
    '2026-07-08', '2026-07-09', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15']);
});
check('attendance + visits both count as presence', () => {
  const att = [
    { person: 'אביאם', date: '2026-07-01', dayType: 'office' },
    { person: 'אביאם', date: '2026-07-02T00:00:00', dayType: 'vacation' },   // timestamp-ish date
    { person: 'ניתאי', date: '2026-07-05', dayType: 'office' },              // other person — ignored
  ];
  const visits = [
    { visitor: 'אביאם', date: '2026-07-05' },
    { visitor: 'אביאם', date: '2026-07-06T14:30:00' },
    { visitor: 'ניתאי', date: '2026-07-07' },
  ];
  const out = M.attMissingDays(att, visits, 'אביאם', 2026, 6, TODAY);
  assert.deepStrictEqual(out, ['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15']);
});
check('weekend never missing (Fri 3.7 / Sat 4.7 absent from output)', () => {
  const out = M.attMissingDays([], [], 'אביאם', 2026, 6, TODAY);
  assert.ok(!out.includes('2026-07-03') && !out.includes('2026-07-04'));
});
check('boundary: today and future excluded', () => {
  const out = M.attMissingDays([], [], 'אביאם', 2026, 6, TODAY);
  assert.ok(!out.includes('2026-07-16') && !out.includes('2026-07-19'));
});
check('first-of-month today → nothing missing', () => {
  assert.deepStrictEqual(M.attMissingDays([], [], 'אביאם', 2026, 6, new Date(2026, 6, 1)), []);
});
check('viewing a PAST month: full month covered', () => {
  const out = M.attMissingDays([], [], 'אביאם', 2026, 5, TODAY);   // June 2026, 30=Tue
  assert.ok(out.includes('2026-06-30') && out[0] === '2026-06-01');
});
check('fully-logged month → empty', () => {
  const att = [];
  for (let d = 1; d <= 15; d++) att.push({ person: 'אביאם', date: '2026-07-' + String(d).padStart(2, '0'), dayType: 'office' });
  assert.deepStrictEqual(M.attMissingDays(att, [], 'אביאם', 2026, 6, TODAY), []);
});

console.log('== reminder text ==');
check('text formats dates d.M', () => {
  assert.strictEqual(M.attReminderText('אביאם', ['2026-07-03', '2026-07-08']), 'נא לעדכן נוכחות לימים: 3.7, 8.7');
});
// Recipient allowlist + VAPID decoding are now enforced server-side (push-send: APPROVE_GROUP 403 gate,
// webpush VAPID). Not reachable from this pure client test — covered by the edge function instead.

console.log('== accumulating bell (red rows) ==');
function loadWithStore(role) {
  const store = {};
  const win = {};
  const sent = [];
  const fn = new Function('window', 'document', 'localStorage', 'navigator', 'fetch', 'setTimeout',
    'getCurrentUser', 'isViewer', 'isIdan', 'attPerson', 'confirm', 'alert', 'SB_URL', 'SB_ANON',
    'renderAttendanceReport', src);
  fn(win, { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } },
    { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    { userAgent: 'test' },
    async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ delivered: 1 }) }; },
    () => {}, () => 'צפייה', () => role === 'viewer', () => role === 'idan', () => 'אביאם', () => true, () => {},
    'http://x', 'anon', () => {});
  return { win, store, sent };
}
check('clicks accumulate into ONE payload (all days so far)', async () => {
  const { win, sent } = loadWithStore('viewer');
  await win.attNagDay('2026-07-05');
  await win.attNagDay('2026-07-08');
  await win.attNagDay('2026-07-08');   // repeat click → resend, no duplicate
  assert.strictEqual(sent.length, 3);
  assert.deepStrictEqual(sent[0].dates, ['2026-07-05']);
  assert.deepStrictEqual(sent[1].dates, ['2026-07-05', '2026-07-08']);
  assert.deepStrictEqual(sent[2].dates, ['2026-07-05', '2026-07-08']);
  assert.strictEqual(sent[2].person, 'אביאם');
  assert.strictEqual(sent[2].mode, 'attendanceReminder');
  assert.deepStrictEqual(win.attNagSelected('אביאם', '2026-07'), ['2026-07-05', '2026-07-08']);
});
check('red row: bell for viewer, none for team; ✅ after send', async () => {
  const v = loadWithStore('viewer');
  let html = v.win.attMissingRowHtml('2026-07-05');
  assert.ok(html.includes('🔔') && html.includes('attNagDay'), 'viewer sees bell');
  await v.win.attNagDay('2026-07-05');
  html = v.win.attMissingRowHtml('2026-07-05');
  assert.ok(html.includes('✅'), 'sent day shows check');
  const t = loadWithStore('team');
  assert.ok(!t.win.attMissingRowHtml('2026-07-05').includes('<button'), 'team sees no bell');
  assert.ok(t.win.attMissingRowHtml('2026-07-05').includes('חסרה נוכחות'), 'red row still informative');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
