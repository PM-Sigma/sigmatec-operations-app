// test-readings-fetch-modes.mjs - the pure decisions behind readings-fetch modes (helpers.js) + logic.js glue.
//   node test-readings-fetch-modes.mjs
import assert from 'node:assert';
import {
  israelNow, israelYesterday, addDaysIso, badRunDate, cronWindowOpen, retentionCutoff, valuesCutoff, dedupeDecision,
  fileNames, storagePaths, emsSyncDecision, errText, ERR_TEXT, allSourcesDone, runStatus, cronDecision, readingsPush,
} from './supabase/functions/readings-fetch/helpers.js';
import { buildRun, applyEmsValidation } from './supabase/functions/readings-fetch/logic.js';
import { canUseReadings } from './supabase/functions/_shared/readingsRoster.js';

let n = 0;
const t = (name, f) => { f(); n++; };
const at = (iso) => new Date(iso);

t('israelNow: IDT (UTC+3) and IST (UTC+2)', () => {
  assert.deepStrictEqual(israelNow(at('2026-09-29T04:00:00Z')), { date: '2026-09-29', hh: 7, mm: 0, minutes: 420 });
  assert.deepStrictEqual(israelNow(at('2026-12-15T05:30:00Z')), { date: '2026-12-15', hh: 7, mm: 30, minutes: 450 });
  assert.strictEqual(israelNow(at('2026-09-29T21:30:00Z')).date, '2026-09-30');
  assert.strictEqual(israelNow(at('2026-09-29T21:00:00Z')).hh, 0);
});
t('israelYesterday / addDaysIso across month and year', () => {
  assert.strictEqual(israelYesterday(at('2026-10-01T05:00:00Z')), '2026-09-30');
  assert.strictEqual(israelYesterday(at('2027-01-01T05:00:00Z')), '2026-12-31');
  assert.strictEqual(addDaysIso('2026-03-01', -1), '2026-02-28');
});
t('badRunDate: format, real date, strictly before today (Israel)', () => {
  const now = at('2026-09-29T10:00:00Z');
  assert.strictEqual(badRunDate('2026-09-28', now), null);
  assert.strictEqual(badRunDate('2020-01-01', now), null);
  assert.ok(badRunDate('2026-09-29', now));
  assert.ok(badRunDate('2026-09-30', now));
  assert.ok(badRunDate('2026-02-30', now));
  assert.ok(badRunDate('28/09/2026', now));
  assert.ok(badRunDate(undefined, now));
  // 22:00Z on the 28th is already 01:00 on the 29th in Israel
  assert.ok(badRunDate('2026-09-29', at('2026-09-28T22:00:00Z')));
  assert.strictEqual(badRunDate('2026-09-28', at('2026-09-28T22:00:00Z')), null);
});
t('cronWindowOpen: 07:00 <= t < 08:45 Israel, both offsets', () => {
  assert.strictEqual(cronWindowOpen(at('2026-09-29T03:59:00Z')), false);
  assert.strictEqual(cronWindowOpen(at('2026-09-29T04:00:00Z')), true);
  assert.strictEqual(cronWindowOpen(at('2026-09-29T05:44:00Z')), true);
  assert.strictEqual(cronWindowOpen(at('2026-09-29T05:45:00Z')), false);
  assert.strictEqual(cronWindowOpen(at('2026-12-15T04:59:00Z')), false);
  assert.strictEqual(cronWindowOpen(at('2026-12-15T05:00:00Z')), true);
  assert.strictEqual(cronWindowOpen(at('2026-12-15T06:44:00Z')), true);
  assert.strictEqual(cronWindowOpen(at('2026-12-15T06:45:00Z')), false);
});
t('retention cut-offs by reading_date', () => {
  const now = at('2026-09-29T05:00:00Z');
  assert.strictEqual(retentionCutoff(now, 35), '2026-08-25');
  assert.strictEqual(retentionCutoff(now), '2026-08-25');
  assert.strictEqual(valuesCutoff(now), addDaysIso('2026-09-29', -400));
});
t('dedupeDecision: young running run is returned, older than 10 min is stale', () => {
  const now = Date.parse('2026-09-29T05:00:00Z');
  const young = { id: 'a', started_at: '2026-09-29T04:55:00Z' };
  const old = { id: 'b', started_at: '2026-09-29T04:40:00Z' };
  assert.deepStrictEqual(dedupeDecision([young], now), { existing: young, stale: [] });
  assert.deepStrictEqual(dedupeDecision([old], now), { existing: null, stale: ['b'] });
  assert.deepStrictEqual(dedupeDecision([old, young], now), { existing: young, stale: ['b'] });
  assert.deepStrictEqual(dedupeDecision([], now), { existing: null, stale: [] });
  assert.deepStrictEqual(dedupeDecision([{ id: 'c', started_at: '2026-09-29T04:50:00Z' }], now).stale, []);
});
t('file names: Hebrew for download, ASCII storage keys', () => {
  assert.deepStrictEqual(fileNames('2026-09-28', 'חולדה'), {
    readings: '2026-09-28 — חולדה קריאות להעלאה.xlsx', exceptions: '2026-09-28 — חולדה חריגות.xlsx',
  });
  const p = storagePaths('site-1', '2026-09-28', 'run-9');
  assert.deepStrictEqual(p, { readings: 'site-1/2026-09-28/run-9/readings.xlsx', exceptions: 'site-1/2026-09-28/run-9/exceptions.xlsx' });
  assert.ok(/^[\x20-\x7e]+$/.test(p.readings + p.exceptions));
});
t('emsSyncDecision: >= 90% of serials have lastReadingDate >= run date', () => {
  const serials = Array.from({ length: 10 }, (_, i) => 'S' + i);
  const last = (k) => Object.fromEntries(serials.map((s, i) => [s, i < k ? '2026-09-28T00:00:00.000Z' : '2026-09-20']));
  assert.strictEqual(emsSyncDecision(serials, last(9), '2026-09-28'), true);
  assert.strictEqual(emsSyncDecision(serials, last(8), '2026-09-28'), false);
  assert.strictEqual(emsSyncDecision(serials, last(10), '2026-09-28'), true);
  assert.strictEqual(emsSyncDecision(serials, { ...last(10), S0: null }, '2026-09-28'), true);
  assert.strictEqual(emsSyncDecision(serials, {}, '2026-09-28'), false);
  assert.strictEqual(emsSyncDecision([], last(10), '2026-09-28'), false);
  assert.strictEqual(emsSyncDecision(serials, last(10), '2026-09-27'), true);
});
t('error codes map to the Hebrew UI messages', () => {
  assert.strictEqual(errText('AUTH'), 'שם משתמש או סיסמה שגויים באתר');
  assert.strictEqual(errText('DOWN'), 'האתר לא זמין');
  assert.strictEqual(errText('CHANGED'), 'מבנה האתר השתנה');
  assert.strictEqual(errText('QUOTA'), 'נגמרה מכסת שירות הדפדפן (Browserless)');
  assert.strictEqual(errText('STALE'), 'האתר לא החזיר נתונים עדכניים');
  assert.strictEqual(errText('???'), ERR_TEXT.DOWN);
});
t('allSourcesDone / runStatus', () => {
  const names = ['A', 'B'];
  assert.strictEqual(allSourcesDone({ A: { state: 'ok' }, B: { state: 'running' } }, names), false);
  assert.strictEqual(allSourcesDone({ A: { state: 'ok' } }, names), false);
  assert.strictEqual(allSourcesDone({ A: { state: 'ok' }, B: { state: 'failed' } }, names), true);
  assert.strictEqual(allSourcesDone({}, []), false);
  assert.strictEqual(runStatus({ A: { state: 'ok' }, B: { state: 'ok' } }, names), 'ok');
  assert.strictEqual(runStatus({ A: { state: 'ok' }, B: { state: 'failed' } }, names), 'partial');
  assert.strictEqual(runStatus({ A: { state: 'failed' }, B: { state: 'failed' } }, names), 'failed');
});
t('cronDecision: run / retry (attempt < 4, >= 30 min) / none', () => {
  const now = Date.parse('2026-09-29T05:00:00Z');
  const run = (o) => ({ trigger: 'cron', status: 'partial', attempt: 1, started_at: '2026-09-29T04:00:00Z', ...o });
  assert.deepStrictEqual(cronDecision([], now), { action: 'run' });
  assert.strictEqual(cronDecision([run({})], now).action, 'retry');
  assert.strictEqual(cronDecision([run({ status: 'failed', attempt: 3 })], now).action, 'retry');
  assert.strictEqual(cronDecision([run({ attempt: 4 })], now).action, 'none');
  assert.strictEqual(cronDecision([run({ started_at: '2026-09-29T04:31:00Z' })], now).action, 'none');
  assert.strictEqual(cronDecision([run({ started_at: '2026-09-29T04:30:00Z' })], now).action, 'retry');
  assert.strictEqual(cronDecision([run({ status: 'ok' })], now).action, 'none');
  assert.strictEqual(cronDecision([run({ status: 'running' })], now).action, 'none');
  const manual = (status) => ({ trigger: 'manual', status, attempt: 1, started_at: '2026-09-29T03:00:00Z' });
  assert.strictEqual(cronDecision([manual('ok')], now).action, 'none');
  assert.strictEqual(cronDecision([manual('partial')], now).action, 'none');
  assert.strictEqual(cronDecision([run({ status: 'failed' }), { ...manual('ok'), started_at: '2026-09-29T04:10:00Z' }], now).action, 'none');
  assert.strictEqual(cronDecision([run({ started_at: '2026-09-29T03:00:00Z' }), run({ started_at: '2026-09-29T04:40:00Z', attempt: 2 })], now).action, 'none');
});
t('readingsPush: manual to starter, cron to all only on partial/failed', () => {
  const base = { kibbutz: 'חולדה', reading_date: '2026-09-28', started_by: 'עידן', progress: { SpeedNet: { state: 'ok' }, DataSense: { state: 'ok' } }, n_ok: 250 };
  const okManual = readingsPush({ ...base, trigger: 'manual', status: 'ok' });
  assert.strictEqual(okManual.to, 'starter');
  assert.strictEqual(okManual.title, 'הקבצים של חולדה ל-28/09 מוכנים');
  assert.strictEqual(readingsPush({ ...base, trigger: 'cron', status: 'ok' }), null);
  const failProg = { SpeedNet: { state: 'failed', error: { code: 'AUTH', message: 'שם משתמש או סיסמה שגויים באתר' } }, DataSense: { state: 'ok' } };
  const partCron = readingsPush({ ...base, trigger: 'cron', status: 'partial', progress: failProg });
  assert.strictEqual(partCron.to, 'all');
  assert.ok(partCron.title.includes('חלקית') && partCron.body.includes('SpeedNet') && partCron.body.includes('שם משתמש או סיסמה שגויים'));
  const failManual = readingsPush({ ...base, trigger: 'manual', status: 'failed', progress: failProg });
  assert.strictEqual(failManual.to, 'starter');
  assert.ok(failManual.title.includes('נכשלה'));
  assert.strictEqual(canUseReadings({ name: 'עידן' }), true);
});
t('logic glue: a failed source adds no per-meter rows; EMS validation drops a rejected row', () => {
  const mk = (m, ft) => ({ meter: m, when: '28-09-26 00:30', expect: ['f1', 'f2', 'f3'], ft, f1: 1, f2: 1, f3: ft - 2 });
  const run = buildRun({
    day: '2026-09-28',
    sources: [{ name: 'SpeedNet', ok: true, rows: [mk('1', 10), mk('2', 20)] }, { name: 'DataSense', ok: false, error: { message: 'האתר לא זמין' }, rows: [] }],
  });
  assert.strictEqual(run.upload.length, 2);
  assert.strictEqual(run.exceptions.length, 0);
  const res = applyEmsValidation(run, [
    { rowIndex: 0, valid: true, errors: [], warnings: [] },
    { rowIndex: 1, valid: false, errors: ['UPLOAD_READINGS.ERRORS.FT_DECREASED'], warnings: [] },
  ]);
  assert.strictEqual(res.upload.length, 1);
  assert.ok(res.exceptions.some((r) => r[2] === '2' && /ירידה מול הקריאה האחרונה ב-EMS/.test(r[6])));
});
console.log(`OK test-readings-fetch-modes.mjs - ${n} groups`);
