// test-readings-logic.mjs — readings-fetch/logic.js, one test per rule. SYNTHETIC data only (public repo).
// Run: node test-readings-logic.mjs
import assert from 'node:assert';
import { buildRun, applyEmsValidation } from './supabase/functions/readings-fetch/logic.js';

const DAY = '2026-09-28';
const W = '28-09-26 23:59';
const rd = (meter, o = {}) => ({ meter, when: W, expect: ['f1', 'f2', 'f3'], ft: 1000, f1: 300, f2: 300, f3: 400, ...o });
const src = (rows, name = 'S', extra = {}) => ({ name, ok: true, rows, ...extra });
const run = (rows, o = {}) => buildRun({ day: DAY, sources: [src(rows)], ...o });
const reasons = (r, type) => r.exceptions.filter((e) => !type || e[5] === type).map((e) => e[1] + '|' + e[6]);
const inUpload = (r, s) => r.upload.some((u) => u[0] === s);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok', name); };

t('clean meter uploads with the exact column layout', () => {
  const r = run([rd('M1')]);
  assert.deepStrictEqual(r.upload, [['M1', 1, 'reading', DAY, 1000, 300, 300, 400, null, null, null, null]]);
  assert.deepStrictEqual(r.counts, { ok: 1, blocked: 0, warn: 0 });
  assert.deepStrictEqual(r.snapshot, { M1: { ft: 1000, f1: 300, f2: 300, f3: 400 } });
  assert.deepStrictEqual(r.all[0], ['S', 'M1', '', 'M1', W, 1000, 300, 300, 400, 'תקין']);
});

t('a failed source is a RUN error only: no per-meter exception, other source unaffected', () => {
  const r = buildRun({
    day: DAY,
    sources: [{ name: 'A', ok: false, error: { code: 'DOWN', message: 'HTTP 503' }, rows: [] }, src([rd('M9')], 'B')],
    expected: { A: ['M1', 'M2'], B: ['M9', 'M8'] }, // ignored: nothing is reported for meters that did not show up
  });
  assert.deepStrictEqual(r.exceptions, []);
  assert.deepStrictEqual(r.upload.map((u) => u[0]), ['M9']);
});

t('no T -> blocker; lists what did arrive (HEB names), none -> plain text', () => {
  const none = run([rd('M1', { ft: null, f1: null, f2: null, f3: null })]);
  assert.deepStrictEqual(reasons(none), ['M1|אין קריאת סה"כ (T)']);
  assert.strictEqual(none.upload.length, 0);
  assert.strictEqual(none.all[0][9], 'לא הועלה');
  const some = run([rd('M2', { ft: null, f1: 3870.376, f2: 0, f3: null }), rd('M3', { ft: null, f1: null, f2: null, f3: 18204.582 })]);
  assert.deepStrictEqual(reasons(some), ['M2|אין קריאת סה"כ (T) — הגיעו רק: פסגה 3870.376, גבע 0', 'M3|אין קריאת סה"כ (T) — הגיעו רק: שפל 18204.582']);
  assert.strictEqual(some.upload.length, 0);
  assert.deepStrictEqual(some.summary, [['חוסם', 'אין קריאת סה"כ', 2]]);
});

t('a null expected משב"ים drops ALL of them, ft only, no exception', () => {
  const r = run([rd('M1', { expect: ['f1', 'f3'], f1: 100, f2: null, f3: null, ft: 500 })]);
  assert.deepStrictEqual(r.upload[0].slice(4, 8), [500, null, null, null]);
  assert.strictEqual(r.exceptions.length, 0);
  assert.deepStrictEqual(r.snapshot.M1, { ft: 500, f1: null, f2: null, f3: null });
  const s = run([rd('M2', { expect: [], f1: undefined, f2: undefined, f3: undefined })]);
  assert.strictEqual(s.upload.length, 1);
  assert.strictEqual(s.exceptions.length, 0);
  const d = run([rd('M3', { expect: ['f1', 'f3'], f1: 400, f2: null, f3: 600 })]);
  assert.deepStrictEqual(d.upload[0].slice(4, 8), [1000, 400, null, 600]);
});

t('negative -> blocker', () => {
  const r = run([rd('M1', { f3: -1 })]);
  assert.ok(reasons(r, 'חוסם').includes('M1|ערך שלילי'));
  assert.ok(!inUpload(r, 'M1'));
});

t('no duplicate-serial rule and no missing-meter rule', () => {
  const r = buildRun({ day: DAY, sources: [src([rd('M1')], 'A'), src([rd('M1')], 'B')], expected: { A: ['M1', 'M2'] } });
  assert.strictEqual(r.upload.length, 2);
  assert.strictEqual(r.exceptions.length, 0);
});

t('sum mismatch -> UPLOADED + warning (tolerance max(0.1%, 1))', () => {
  const r = run([rd('M1', { f3: 450 }), rd('M2', { ft: 100000, f1: 33333, f2: 33333, f3: 33400 }), rd('M3', { f3: 400.9 })]);
  assert.ok(inUpload(r, 'M1'));
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['M1|סכום המשב"ים ≠ סה"כ']);
  assert.strictEqual(r.all.find((a) => a[1] === 'M1')[9], 'הועלה עם אזהרה');
  assert.deepStrictEqual(r.counts, { ok: 3, blocked: 0, warn: 1 });
});

t('DataSense day-split gap (1% of day_ct, min 0.05) -> UPLOADED + warning; collapses with the sum warning in the summary', () => {
  const bad = run([rd('M1', { expect: ['f1', 'f3'], f2: null, f1: 400, f3: 600, day_split_gap: 0.5, day_ct: 12 }), rd('M9', { f3: 450 })]);
  assert.ok(inUpload(bad, 'M1'));
  assert.deepStrictEqual(reasons(bad, 'אזהרה').sort(), ['M1|סכום המשב"ים ≠ סה"כ (בצריכה היומית, פער 0.5)', 'M9|סכום המשב"ים ≠ סה"כ'].sort());
  assert.deepStrictEqual(bad.summary, [['אזהרה', 'סכום המשב"ים ≠ סה"כ', 2]]);
  const okGap = run([rd('M2', { expect: ['f1', 'f3'], f2: null, f1: 400, f3: 600, day_split_gap: 0.04, day_ct: 1 }),
    rd('M3', { expect: ['f1', 'f3'], f2: null, f1: 400, f3: 600, day_split_gap: 1, day_ct: 100 })]);
  assert.strictEqual(okGap.exceptions.length, 0);
});

t('stale timestamp outside [D 00:00, D+1 03:00) -> UPLOADED + warning; edges', () => {
  const r = run([rd('S1', { when: '27-09-26 23:59' }), rd('S2', { when: '29-09-26 02:59' }), rd('S3', { when: '29-09-26 03:00' }),
    rd('S4', { when: '28-09-26 00:00' }), rd('S5', { when: 'garbage' })]);
  assert.strictEqual(r.upload.length, 5);
  assert.deepStrictEqual(reasons(r, 'חוסם'), []);
  assert.deepStrictEqual(reasons(r, 'אזהרה'), [
    'S1|משדר לא שידר — הקריאה מ-27-09-26 23:59 ולא מ-28/09', 'S3|משדר לא שידר — הקריאה מ-29-09-26 03:00 ולא מ-28/09']);
  assert.deepStrictEqual(r.summary, [['אזהרה', 'משדר לא שידר', 2]]);
});

// synthetic history: 10 kWh/day, n days back from 27.9 (last entry = 27.9)
const hist = (fn, n = 28) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 28) - (n - i) * 86400000).toISOString().slice(0, 10);
  return { date: d, values: { M1: { ft: fn(i), f1: 0, f2: 0, f3: 0 } } };
});
const ftOnly = (ft) => rd('M1', { ft, expect: [], f1: null, f2: null, f3: null });
const H1 = (d, o) => ({ date: d, values: { M1: { ft: 1000, f1: 0, f2: 0, f3: 0, ...o } } });

t('drop vs the last saved reading (ft / f1 / f2 / f3) -> blocker; equal is fine; dates >= D and > 40 days ignored', () => {
  const r = run([rd('M1')], { history: [{ date: '2026-09-27', values: { M1: { ft: 5000, f1: 1, f2: 1, f3: 1 } } }] });
  assert.deepStrictEqual(reasons(r), ['M1|ירידה בסה"כ: 5000 (27/09) → 1000']);
  assert.ok(!inUpload(r, 'M1'));
  const h2 = [{ date: '2026-09-27', values: { M1: { ft: 900, f1: 301, f2: 300.5, f3: 300 } } }];
  assert.deepStrictEqual(reasons(run([rd('M1', { f3: 400 })], { history: h2 })), ['M1|ירידה בגבע: 300.5 (27/09) → 300', 'M1|ירידה בפסגה: 301 (27/09) → 300']);
  const same = run([rd('M1')], { history: [{ date: '2026-09-27', values: { M1: { ft: 1000, f1: 300, f2: 300, f3: 400 } } }] });
  assert.strictEqual(same.exceptions.length, 0);
  const ignored = run([rd('M1')], { history: [
    { date: '2026-09-28', values: { M1: { ft: 9e9, f1: 0, f2: 0, f3: 0 } } },
    { date: '2026-08-10', values: { M1: { ft: 9e9, f1: 0, f2: 0, f3: 0 } } }] });
  assert.strictEqual(ignored.exceptions.length, 0);
  // the LAST saved reading counts however old (<= 40 days); a meter with no משב" then is not compared on it
  const old = run([rd('M1')], { history: [{ date: '2026-08-25', values: { M1: { ft: 1500, f1: null, f2: null, f3: null } } }] });
  assert.deepStrictEqual(reasons(old), ['M1|ירידה בסה"כ: 1500 (25/08) → 1000']);
});

t('daily consumption over max_daily_kwh (500) -> blocker; divided by the days since the last reading', () => {
  const over = run([ftOnly(1500.5)], { history: [H1('2026-09-27')] });
  assert.deepStrictEqual(reasons(over), ['M1|צריכה חריגה: 500.5 קוט"ש ביום (מעל 500)']);
  assert.ok(!inUpload(over, 'M1'));
  assert.strictEqual(run([ftOnly(1500)], { history: [H1('2026-09-27')] }).exceptions.length, 0, '500 exactly is fine');
  assert.strictEqual(run([ftOnly(2500)], { history: [H1('2026-09-25')] }).exceptions.length, 0, '1500 over 3 days = 500/day');
  assert.strictEqual(run([ftOnly(2600)], { history: [H1('2026-09-25')] }).exceptions.length, 1, '1600 over 3 days = 533/day');
  assert.strictEqual(run([ftOnly(1600)], { history: [H1('2026-09-27')], rules: { max_daily_kwh: 1000 } }).exceptions.length, 0);
});

t('spike: only with >= spike_min_history_days (30) of history, > 50 kWh and > 5x average -> blocker', () => {
  const h31 = hist((i) => 1000 + 10 * i, 31), last31 = 1000 + 300; // span 26.8 -> 27.9 = 30 days: gate open
  const spike = run([ftOnly(last31 + 100)], { history: h31 });
  assert.deepStrictEqual(reasons(spike), ['M1|קפיצה חריגה: 100.0 קוט"ש ביום, פי 10 מהממוצע (10.0)']);
  assert.ok(!inUpload(spike, 'M1'));
  const h30 = hist((i) => 1000 + 10 * i, 30); // span 29 days: gate closed, the same jump uploads clean
  assert.strictEqual(run([ftOnly(1000 + 290 + 100)], { history: h30 }).exceptions.length, 0);
  assert.strictEqual(run([ftOnly(last31 + 40)], { history: h31 }).exceptions.length, 0, 'under 50');
  assert.strictEqual(run([ftOnly(last31 + 49)], { history: h31 }).exceptions.length, 0, 'not over 5x the average (10)');
  assert.strictEqual(run([ftOnly(last31 + 10)], { history: h31 }).exceptions.length, 0);
  assert.strictEqual(run([ftOnly(last31 + 100)], { history: h31, rules: { spike_min_kwh: 1000 } }).exceptions.length, 0);
  assert.strictEqual(run([ftOnly(1000 + 290 + 100)], { history: h30, rules: { spike_min_history_days: 20 } }).exceptions.length, 1);
  // a 2-day gap divides the jump: 30 history days then a reading 2 days later
  const gap = run([ftOnly(1300 + 220)], { history: hist((i) => 1000 + 10 * i, 32).slice(0, 31) }); // last hist = 26.9 (1300); +220 over 2 days = 110/day
  assert.strictEqual(gap.exceptions.length, 1);
  assert.ok(gap.exceptions[0][6].startsWith('קפיצה חריגה: 110.0'));
});

t('frozen meter -> uploaded + warning; never-moving meter is not flagged', () => {
  const moved = hist((i) => (i < 25 ? 1000 + 10 * i : 1240));
  const r = run([ftOnly(1240)], { history: moved });
  assert.ok(inUpload(r, 'M1'));
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['M1|מונה תקוע — אותה קריאה 3 ימים ברצף']);
  const dead = run([ftOnly(1000)], { history: hist(() => 1000) });
  assert.strictEqual(dead.exceptions.length, 0);
  const ticking = run([ftOnly(1280)], { history: moved });
  assert.strictEqual(ticking.exceptions.length, 0);
});

t('sorting: blockers first, then reason, then meter; summary counts by reason prefix', () => {
  const r = run([
    rd('Z', { ft: null, f1: null, f2: null, f3: null }),
    rd('A', { ft: null, f1: null, f2: null, f3: null }),
    rd('C', { f3: 999 }),
    rd('B', { when: '01-01-26 00:00' }),
  ]);
  assert.deepStrictEqual(r.exceptions.map((e) => e[5] + ':' + e[1]), ['חוסם:A', 'חוסם:Z', 'אזהרה:B', 'אזהרה:C']);
  assert.deepStrictEqual(r.summary.map((s) => s[1]).sort(), ['אין קריאת סה"כ', 'משדר לא שידר', 'סכום המשב"ים ≠ סה"כ'].sort());
});

t('applyEmsValidation: invalid moved to exceptions as חוסם, warnings kept, keys mapped (משב"ים wording)', () => {
  const base = run([rd('M1'), rd('M2'), rd('M3'), rd('M4')]);
  const out = applyEmsValidation(base, [
    { rowIndex: 0, valid: true, errors: [], warnings: [] },
    { rowIndex: 1, valid: false, errors: ['UPLOAD_READINGS.ERRORS.FT_DECREASED', 'UPLOAD_READINGS.ERRORS.RT_DECREASED'], warnings: [] },
    { rowIndex: 2, valid: true, errors: [], warnings: ['UPLOAD_READINGS.WARNINGS.TARIFF_SUM_MISMATCH', 'PARTIAL_TARIFF_UPDATE'] },
    { rowIndex: 3, valid: false, errors: ['METER_NOT_IN_SITE', 'METER_NOT_FOUND', 'SOMETHING_NEW'], warnings: [] },
  ], { kibbutz: 'חולדה' });
  assert.deepStrictEqual(out.upload.map((u) => u[0]), ['M1', 'M3']);
  assert.deepStrictEqual(out.counts, { ok: 2, blocked: 2, warn: 2 });
  assert.deepStrictEqual(Object.keys(out.snapshot), ['M1', 'M3']);
  const ex = out.exceptions.map((e) => e[5] + '|' + e[1] + '|' + e[6]);
  assert.ok(ex.includes('חוסם|M2|ירידה מול הקריאה האחרונה ב-EMS'));
  assert.strictEqual(ex.filter((x) => x.startsWith('חוסם|M2')).length, 1, 'FT/RT decreased share one text -> one row');
  assert.strictEqual(ex.filter((x) => x === 'חוסם|M4|המונה לא מוקם ב-EMS תחת חולדה').length, 1, 'NOT_FOUND / NOT_IN_SITE -> one row');
  assert.ok(ex.includes('חוסם|M4|EMS: SOMETHING_NEW'));
  assert.ok(ex.includes('אזהרה|M3|סכום המשב"ים ≠ סה"כ (EMS)'));
  assert.ok(ex.includes('אזהרה|M3|עדכון משב"ים חלקי'));
  assert.strictEqual(out.all.find((a) => a[1] === 'M2')[9], 'לא הועלה');
  assert.strictEqual(out.all.find((a) => a[1] === 'M3')[9], 'הועלה עם אזהרה');
  assert.strictEqual(base.upload.length, 4);
  assert.ok(out.summary.some((s) => s[1] === 'ירידה מול הקריאה האחרונה ב-EMS' && s[2] === 1));
  assert.ok(out.summary.some((s) => s[0] === 'אזהרה' && s[1] === 'סכום המשב"ים ≠ סה"כ' && s[2] === 1));
  assert.ok(!JSON.stringify(out.exceptions).includes('תעריפ'));
});

t('applyEmsValidation: the EMS meters list never blocks (1.10 regression: it blocked all 250); only validate METER_NOT_FOUND does', () => {
  const base = run([rd('M1'), rd('M2')]);
  const okRes = [{ rowIndex: 0, valid: true, errors: [], warnings: [] }, { rowIndex: 1, valid: true, errors: [], warnings: [] }];
  // a list that matches nothing (what EMS returned on 1.10) must not drop valid meters
  const out = applyEmsValidation(base, okRes, { emsMeters: ['X1', 'X2'], kibbutz: 'חולדה' });
  assert.deepStrictEqual(out.upload.map((u) => u[0]), ['M1', 'M2']);
  assert.deepStrictEqual(out.counts, { ok: 2, blocked: 0, warn: 0 });
  const nf = applyEmsValidation(base, [okRes[0], { rowIndex: 1, valid: false, errors: ['METER_NOT_FOUND'], warnings: [] }], { kibbutz: 'חולדה' });
  assert.deepStrictEqual(nf.upload.map((u) => u[0]), ['M1']);
  assert.deepStrictEqual(nf.exceptions.map((e) => [e[1], e[5], e[6]]), [['M2', 'חוסם', 'המונה לא מוקם ב-EMS תחת חולדה']]);
});

console.log('readings logic OK (' + n + ' tests)');
