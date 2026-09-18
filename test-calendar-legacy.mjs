// Self-check for the 🗓️ calendar's LEGACY half after Task 13 handed the screen to the React
// island (spec §7f). Run: node test-calendar-legacy.mjs
//
// The island replaced the month RENDER. It did not replace the three things only the legacy
// bundle can do, and this runner is what keeps them honest:
//
//   1. `renderCompanyCalendar()` steps aside once the island mounts (and still paints when it
//      did not) — the same contract #attendanceLegacy has with the attendance island.
//   2. `calFetchEvents(range)` asks the `calendar` Edge Function for a DAY RANGE, passes the
//      live EMS bearer, caches per range, and answers [] (never throws) when anything fails.
//   3. `emsPatchTask` / `emsPatchTasks` are the app's ONE EMS write path for a schedule and
//      its undo: N patches → N PATCHes → exactly ONE cache resync.
//
// The module is evaluated with a DOM/window stub, the way test-devboard.mjs mirrors its
// source: this file asserts on BEHAVIOUR of the real js/src/14-calendar.js text, not on a
// copy of it, so a change there that breaks the contract fails here.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./js/src/14-calendar.js', import.meta.url), 'utf8');

// ─────────────────── 1. the legacy render steps aside ───────────────────

assert.ok(
  /function renderCompanyCalendar\(\)\s*\{[\s\S]{0,600}?if \(window\.__sigmaCalendarIsland\) return;/.test(SRC),
  'renderCompanyCalendar must bail out once the island owns #calendar-view',
);
assert.ok(
  SRC.includes('window.calFetchEvents') && SRC.includes('window.calAddEvent')
  && SRC.includes('window.emsPatchTask') && SRC.includes('window.emsPatchTasks'),
  'the four bridge functions must be exposed on window',
);
// The functions the island does NOT replace are still here.
for (const fn of ['collectCalendarEvents', 'renderCalendarAgenda', 'calAddLink', 'saveEmsTask', 'emsAfterWrite']) {
  assert.ok(SRC.includes('function ' + fn), fn + ' must survive the island');
}

// ─────────────────── the harness ───────────────────

/**
 * Evaluate the module body with a stub `window`. The file is an IIFE body (build.mjs
 * concatenates it inside one), so it is wrapped the same way here.
 */
function load({ token = 'ems-token', fetchImpl } = {}) {
  const calls = { fetch: [], ems: [], afterWrite: 0, track: [] };
  const win = {
    calViewYear: 2026,
    calViewMonth: 8,
    SHEET_DATA: { calendar: {} },
    __sigmaCalendarIsland: false,
  };
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {},
  };
  const ctx = {
    window: win,
    document: doc,
    console: { warn() {}, log() {} },
    setTimeout,
    Date,
    JSON,
    Promise,
    URLSearchParams,
    Math,
    getEmsToken: () => token,
    emsApi: async (path, opts) => { calls.ems.push({ path, opts }); return { id: 'ok' }; },
    // `emsAfterWrite` is declared INSIDE this module, so it cannot be stubbed from outside.
    // What it always does is emit 'ems-cache-synced' — count that instead; it is also the
    // signal every other surface (cards, briefing, EMS layer) actually listens to.
    emsSyncCache: async () => {},
    sigmaEmit: name => { if (name === 'ems-cache-synced') calls.afterWrite++; },
    reorderCards: () => {},
    sigmaTrack: (a, t) => calls.track.push([a, t]),
    emsCacheData: () => ({ tasks: [] }),
    loadAllVisitsCombined: () => [],
    fetch: fetchImpl || (async (url, init) => {
      calls.fetch.push({ url, init });
      return { json: async () => ({ calendar: [{ id: 'e1', title: 'ישיבת חברה', start: '2026-09-06T08:00:00+03:00', hangoutLink: 'https://meet.google.com/x' }] }) };
    }),
  };
  const names = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, '"use strict";\n' + SRC + '\nreturn window;');
  const w = fn(...names.map(n => ctx[n]));
  return { w, calls, ctx };
}

// ─────────────────── 2. calFetchEvents ───────────────────

const { w, calls } = load();

const events = await w.calFetchEvents({ from: '2026-08-30', to: '2026-10-03' });
assert.equal(events.length, 1, 'the events come back from the calendar function');
assert.equal(events[0].hangoutLink, 'https://meet.google.com/x', 'the Meet link is passed through untouched');

const sent = JSON.parse(calls.fetch[0].init.body);
assert.equal(sent.action, 'list', 'action=list');
assert.equal(sent.from, '2026-08-30', 'the range is sent as plain days, not as `days`');
assert.equal(sent.to, '2026-10-03');
assert.equal(sent.token, 'ems-token', 'the live EMS bearer is what the function authorises on');
assert.ok(String(calls.fetch[0].url).endsWith('/functions/v1/calendar'), 'the calendar Edge Function');

// …and the SAME range does not go out twice inside the TTL.
await w.calFetchEvents({ from: '2026-08-30', to: '2026-10-03' });
assert.equal(calls.fetch.length, 1, 'a second read of the same range is served from the cache');
await w.calFetchEvents({ from: '2026-10-04', to: '2026-10-31' });
assert.equal(calls.fetch.length, 2, 'a different range is a different read');

// A half-range asks nothing at all.
assert.deepEqual(await w.calFetchEvents({ from: '2026-08-30' }), [], 'no `to` → no request');
assert.equal(calls.fetch.length, 2);

// No EMS login → the function would 401, so we never bother it. The calendar still renders
// its visits and tasks; it just has no office layer.
const noToken = load({ token: '' });
assert.deepEqual(await noToken.w.calFetchEvents({ from: '2026-09-01', to: '2026-09-30' }), []);
assert.equal(noToken.calls.fetch.length, 0, 'no token → no request');

// Google (or the network) down → [] and a warning, NEVER a throw: a calendar that cannot
// reach the office events still has to show the visits and the EMS tasks.
const broken = load({ fetchImpl: async () => { throw new Error('offline'); } });
assert.deepEqual(await broken.w.calFetchEvents({ from: '2026-09-01', to: '2026-09-30' }), []);

// ─────────────────── calAddEvent ───────────────────

const adder = load({
  fetchImpl: async (url, init) => { adder.calls.fetch.push({ url, init }); return { json: async () => ({ ok: true, id: 'new1' }) }; },
});
const added = await adder.w.calAddEvent({ title: 'סיור', start: '2026-09-20T09:00:00.000Z', allDay: false });
assert.deepEqual(added, { ok: true, id: 'new1' });
const addBody = JSON.parse(adder.calls.fetch[0].init.body);
assert.equal(addBody.action, 'add');
assert.equal(addBody.title, 'סיור');
assert.equal(addBody.token, 'ems-token');

const addNoToken = load({ token: '' });
assert.ok((await addNoToken.w.calAddEvent({ title: 'x', start: '2026-09-20' })).error, 'no EMS login → a clear error, not a silent drop');

// ─────────────────── 3. the EMS write path ───────────────────

const patcher = load();
const res = await patcher.w.emsPatchTasks([
  { id: 't1', body: { expectedCompletionDate: '2026-09-15T12:00:00.000Z' } },
  { id: 't2', body: { expectedCompletionDate: '2026-09-15T12:00:00.000Z' } },
]);
assert.deepEqual(res, { ok: 2, failed: [] });
assert.deepEqual(patcher.calls.ems.map(c => c.path), ['/employee-tasks/t1', '/employee-tasks/t2']);
assert.deepEqual(patcher.calls.ems.map(c => c.opts.method), ['PATCH', 'PATCH']);
assert.equal(
  JSON.parse(patcher.calls.ems[0].opts.body).expectedCompletionDate,
  '2026-09-15T12:00:00.000Z',
  'the date goes out exactly as the plan built it',
);
assert.equal(patcher.calls.afterWrite, 1, 'ONE cache resync for the whole batch, not one per task');
assert.deepEqual(patcher.calls.track.map(t => t[0]), ['ems-task-scheduled', 'ems-task-scheduled']);

// An undo is the same path with the previous dates — including "back to no date at all".
const undoer = load();
await undoer.w.emsPatchTasks([{ id: 't1', body: { expectedCompletionDate: null } }]);
assert.equal(JSON.parse(undoer.calls.ems[0].opts.body).expectedCompletionDate, null);

// One task failing must not take the batch down, and must be REPORTED (the island turns
// that into "N משימות לא עודכנו" rather than a false success toast).
const flaky = load();
flaky.ctx.emsApi = async path => { if (path.endsWith('bad')) throw new Error('422'); return { id: 'ok' }; };
const flaky2 = load();
{
  // rebuild with the throwing emsApi in place from the start
  const ctxCalls = { ems: [], afterWrite: 0 };
  const names = ['window', 'document', 'console', 'setTimeout', 'Date', 'JSON', 'Promise', 'URLSearchParams', 'Math',
    'getEmsToken', 'emsApi', 'emsSyncCache', 'sigmaEmit', 'sigmaTrack', 'reorderCards',
    'emsCacheData', 'loadAllVisitsCombined', 'fetch'];
  const vals = [
    { __sigmaCalendarIsland: false }, { getElementById: () => null, addEventListener: () => {} },
    { warn() {}, log() {} }, setTimeout, Date, JSON, Promise, URLSearchParams, Math,
    () => 'tok',
    async p => { ctxCalls.ems.push(p); if (p.endsWith('bad')) throw new Error('422'); return { id: 'ok' }; },
    async () => {}, name => { if (name === 'ems-cache-synced') ctxCalls.afterWrite++; }, () => {},
    () => {}, () => ({ tasks: [] }), () => [], async () => ({ json: async () => ({}) }),
  ];
  // eslint-disable-next-line no-new-func
  const W = new Function(...names, '"use strict";\n' + SRC + '\nreturn window;')(...vals);
  const out = await W.emsPatchTasks([{ id: 'good', body: {} }, { id: 'bad', body: {} }]);
  assert.equal(out.ok, 1, 'the one that worked counts');
  assert.equal(out.failed.length, 1, 'the one that did not is reported, never swallowed');
  assert.equal(out.failed[0].id, 'bad');
  assert.equal(ctxCalls.afterWrite, 1, 'a partial batch still resyncs once');
}
void flaky; void flaky2;

// emsPatchTask refuses an empty id rather than PATCHing /employee-tasks/undefined.
await assert.rejects(() => load().w.emsPatchTask('', {}), /חסר מזהה/);

console.log('✅ test-calendar-legacy: bridge (calFetchEvents · calAddEvent · emsPatchTask[s]) + the legacy render stepping aside — all green');
