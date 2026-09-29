// test-readings-logic.mjs — readings-fetch/logic.js, one test per rule. SYNTHETIC data only (public repo).
// Run: node test-readings-logic.mjs
import assert from 'node:assert';
import { buildRun, applyEmsValidation, expectedFrom } from './supabase/functions/readings-fetch/logic.js';

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

t('7.1 expected meter missing today -> blocker', () => {
  const r = run([rd('M1')], { expected: { S: ['M1', 'M2'] } });
  assert.deepStrictEqual(reasons(r), ['M2|המונה לא הופיע באתר היום']);
  assert.strictEqual(r.counts.blocked, 1);
  assert.ok(!inUpload(r, 'M2'));
});

t('source down -> every expected meter of it blocked, other source unaffected', () => {
  const r = buildRun({
    day: DAY,
    sources: [{ name: 'A', ok: false, error: { code: 'DOWN', message: 'HTTP 503' }, rows: [] }, src([rd('M9')], 'B')],
    expected: { A: ['M1', 'M2'], B: ['M9'] },
  });
  assert.deepStrictEqual(reasons(r), ['M1|האתר לא זמין — HTTP 503', 'M2|האתר לא זמין — HTTP 503']);
  assert.deepStrictEqual(r.upload.map((u) => u[0]), ['M9']);
  assert.deepStrictEqual(r.summary, [['חוסם', 'האתר לא זמין', 2]]);
});

t('7.2 no ft -> blocker "אין קריאה"', () => {
  const r = run([rd('M1', { ft: null, f1: null, f2: null, f3: null })]);
  assert.deepStrictEqual(reasons(r), ['M1|אין קריאה']);
  assert.strictEqual(r.upload.length, 0);
  assert.strictEqual(r.all[0][9], 'לא הועלה');
});

t('7.3 a null expected tariff drops ALL tariffs, ft only, no exception', () => {
  const r = run([rd('M1', { expect: ['f1', 'f3'], f1: 100, f2: null, f3: null, ft: 500 })]);
  assert.deepStrictEqual(r.upload[0].slice(4, 8), [500, null, null, null]);
  assert.strictEqual(r.exceptions.length, 0);
  assert.deepStrictEqual(r.snapshot.M1, { ft: 500, f1: null, f2: null, f3: null });
  // a simple meter (expect []) is untouched
  const s = run([rd('M2', { expect: [], f1: undefined, f2: undefined, f3: undefined })]);
  assert.strictEqual(s.upload.length, 1);
  assert.strictEqual(s.exceptions.length, 0);
  // f2 legitimately absent when only f1+f3 are expected
  const d = run([rd('M3', { expect: ['f1', 'f3'], f1: 400, f2: null, f3: 600 })]);
  assert.deepStrictEqual(d.upload[0].slice(4, 8), [1000, 400, null, 600]);
});

t('7.4 negative -> blocker', () => {
  const r = run([rd('M1', { f3: -1 })]);
  assert.ok(reasons(r, 'חוסם').includes('M1|ערך שלילי'));
  assert.ok(!inUpload(r, 'M1'));
});

t('no 7.5: a decrease vs history is NOT blocked (EMS does that)', () => {
  const history = [{ date: '2026-09-27', values: { M1: { ft: 5000, f1: 1, f2: 1, f3: 1 } } }];
  const r = run([rd('M1')], { history });
  assert.ok(inUpload(r, 'M1'));
  assert.strictEqual(r.exceptions.length, 0);
});

t('7.6 duplicate serial across sources -> both blocked', () => {
  const r = buildRun({ day: DAY, sources: [src([rd('M1')], 'A'), src([rd('M1')], 'B')] });
  assert.strictEqual(r.upload.length, 0);
  assert.deepStrictEqual(reasons(r), ['M1|כפילות: כמה מונים באתר ממופים ל-M1', 'M1|כפילות: כמה מונים באתר ממופים ל-M1']);
  assert.strictEqual(r.counts.blocked, 1);
});

t('7.7 tariff sum mismatch -> UPLOADED + warning (tolerance max(0.1%, 1))', () => {
  const r = run([rd('M1', { f3: 450 }), rd('M2', { ft: 100000, f1: 33333, f2: 33333, f3: 33400 }), rd('M3', { f3: 400.9 })]);
  assert.ok(inUpload(r, 'M1'));
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['M1|סכום התעריפים ≠ סה"כ']);
  assert.strictEqual(r.all.find((a) => a[1] === 'M1')[9], 'הועלה עם אזהרה');
  assert.deepStrictEqual(r.counts, { ok: 3, blocked: 0, warn: 1 });
});

t('7.8 DataSense day-split gap (1% of day_ct, min 0.05) -> blocker', () => {
  const bad = run([rd('M1', { expect: ['f1', 'f3'], f2: null, f1: 400, f3: 600, day_split_gap: 0.5, day_ct: 12 })]);
  assert.strictEqual(bad.upload.length, 0);
  assert.ok(reasons(bad)[0].startsWith('M1|פילוח יומי לא תואם: צריכת שפל+פסגה שונה מצריכת הסה"כ ב-0.5'));
  const okGap = run([rd('M2', { expect: ['f1', 'f3'], f2: null, f1: 400, f3: 600, day_split_gap: 0.04, day_ct: 1 }),
    rd('M3', { expect: ['f1', 'f3'], f2: null, f1: 400, f3: 600, day_split_gap: 1, day_ct: 100 })]);
  assert.strictEqual(okGap.upload.length, 2);
});

t('7.9 stale timestamp outside [D 00:00, D+1 03:00) -> blocker; edges', () => {
  const r = run([rd('S1', { when: '27-09-26 23:59' }), rd('S2', { when: '29-09-26 02:59' }), rd('S3', { when: '29-09-26 03:00' }),
    rd('S4', { when: '28-09-26 00:00' }), rd('S5', { when: 'garbage' })]);
  assert.deepStrictEqual(r.upload.map((u) => u[0]).sort(), ['S2', 'S4', 'S5']);
  assert.ok(reasons(r).includes('S1|קריאה מיושנת — נקלטה 27-09-26 23:59 ולא ביום 28/09 (המשדר לא שידר)'));
  assert.ok(reasons(r).some((x) => x.startsWith('S3|קריאה מיושנת')));
});

// 28-day synthetic history: 10 kWh/day
const hist = (fn) => Array.from({ length: 28 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 28) - (28 - i) * 86400000).toISOString().slice(0, 10);
  return { date: d, values: { M1: { ft: fn(i), f1: 0, f2: 0, f3: 0 } } };
});

t('7.10 spike vs 28-day history -> uploaded + warning; small jumps ignored', () => {
  const h = hist((i) => 1000 + 10 * i); // last = 1270 on 27.9
  const spike = run([rd('M1', { ft: 1270 + 500, f1: null, f2: null, f3: null, expect: [] })], { history: h });
  assert.ok(inUpload(spike, 'M1'));
  assert.deepStrictEqual(reasons(spike, 'אזהרה'), ['M1|קפיצה חריגה: 500.0 קוט"ש ביום מול ממוצע 10.0']);
  const small = run([rd('M1', { ft: 1270 + 40, expect: [], f1: null, f2: null, f3: null })], { history: h });
  assert.strictEqual(small.exceptions.length, 0, 'under spike_min_kwh');
  const normal = run([rd('M1', { ft: 1280, expect: [], f1: null, f2: null, f3: null })], { history: h });
  assert.strictEqual(normal.exceptions.length, 0);
});

t('7.10 spike: gap of several days divides by days; rules override', () => {
  const h = hist((i) => 1000 + 10 * i).slice(0, 27); // last history day 26.9
  const r = run([rd('M1', { ft: 1260 + 1000, expect: [], f1: null, f2: null, f3: null })], { history: h });
  assert.ok(reasons(r, 'אזהרה')[0].includes('קפיצה חריגה: 500.0'));
  const loose = run([rd('M1', { ft: 1270 + 500, expect: [], f1: null, f2: null, f3: null })], { history: hist((i) => 1000 + 10 * i), rules: { spike_min_kwh: 1000 } });
  assert.strictEqual(loose.exceptions.length, 0);
});

t('7.11 frozen meter -> uploaded + warning; never-moving meter is not flagged', () => {
  const moved = hist((i) => (i < 25 ? 1000 + 10 * i : 1240)); // flat for the last 3 history days
  const r = run([rd('M1', { ft: 1240, expect: [], f1: null, f2: null, f3: null })], { history: moved });
  assert.ok(inUpload(r, 'M1'));
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['M1|מונה תקוע — אותה קריאה 3 ימים ברצף']);
  const dead = run([rd('M1', { ft: 1000, expect: [], f1: null, f2: null, f3: null })], { history: hist(() => 1000) });
  assert.strictEqual(dead.exceptions.length, 0);
  const ticking = run([rd('M1', { ft: 1280, expect: [], f1: null, f2: null, f3: null })], { history: moved });
  assert.strictEqual(ticking.exceptions.length, 0);
});

t('sorting: blockers first, then reason, then meter; summary counts by reason prefix', () => {
  const h = hist((i) => 1000 + 10 * i);
  const r = run([
    rd('M1', { ft: 1270 + 500, expect: [], f1: null, f2: null, f3: null }), // warn spike
    rd('Z', { ft: null, f1: null, f2: null, f3: null }),                    // block no reading
    rd('A', { ft: null, f1: null, f2: null, f3: null }),
    rd('C', { f3: 999 }),                                                   // warn sum
  ], { history: h, expected: { S: ['Q'] } });
  assert.deepStrictEqual(r.exceptions.map((e) => e[5] + ':' + e[1]), ['חוסם:A', 'חוסם:Z', 'חוסם:Q', 'אזהרה:C', 'אזהרה:M1'].map((x) => x));
});

t('summary: reason = text before first : — (', () => {
  const r = run([rd('A', { ft: null }), rd('B', { ft: null }), rd('C', { when: '01-01-26 00:00' })], { expected: { S: ['Q'] } });
  assert.deepStrictEqual(r.summary, [
    ['חוסם', 'אין קריאה', 2],
    ['חוסם', 'המונה לא הופיע באתר היום', 1],
    ['חוסם', 'קריאה מיושנת', 1],
  ]);
});

t('expectedFrom: union per source', () => {
  assert.deepStrictEqual(expectedFrom([{ A: ['1', '2'], B: ['9'] }, { A: ['2', '3'] }, {}]), { A: ['1', '2', '3'], B: ['9'] });
  assert.deepStrictEqual(expectedFrom([]), {});
});

t('applyEmsValidation: invalid moved to exceptions as חוסם, warnings kept, keys stripped/mapped', () => {
  const base = run([rd('M1'), rd('M2'), rd('M3'), rd('M4')]);
  const out = applyEmsValidation(base, [
    { rowIndex: 0, valid: true, errors: [], warnings: [] },
    { rowIndex: 1, valid: false, errors: ['UPLOAD_READINGS.ERRORS.FT_DECREASED', 'UPLOAD_READINGS.ERRORS.RT_DECREASED'], warnings: [] },
    { rowIndex: 2, valid: true, errors: [], warnings: ['UPLOAD_READINGS.WARNINGS.TARIFF_SUM_MISMATCH', 'PARTIAL_TARIFF_UPDATE'] },
    { rowIndex: 3, valid: false, errors: ['METER_NOT_IN_SITE', 'SOMETHING_NEW'], warnings: [] },
  ]);
  assert.deepStrictEqual(out.upload.map((u) => u[0]), ['M1', 'M3']);
  assert.deepStrictEqual(out.counts, { ok: 2, blocked: 2, warn: 2 });
  assert.deepStrictEqual(Object.keys(out.snapshot), ['M1', 'M3']);
  const ex = out.exceptions.map((e) => e[5] + '|' + e[1] + '|' + e[6]);
  assert.ok(ex.includes('חוסם|M2|EMS: ירידה מול הקריאה האחרונה ב-EMS'));
  assert.strictEqual(ex.filter((x) => x.startsWith('חוסם|M2')).length, 1, 'FT/RT decreased share one Hebrew text -> one row');
  assert.ok(ex.includes('חוסם|M4|EMS: המונה לא קיים ב-EMS'));
  assert.ok(ex.includes('חוסם|M4|EMS: SOMETHING_NEW'));
  assert.ok(ex.includes('אזהרה|M3|EMS: סכום התעריפים ≠ סה"כ (EMS)'));
  assert.ok(ex.includes('אזהרה|M3|EMS: עדכון תעריפים חלקי'));
  assert.strictEqual(out.all.find((a) => a[1] === 'M2')[9], 'לא הועלה');
  assert.strictEqual(out.all.find((a) => a[1] === 'M3')[9], 'הועלה עם אזהרה');
  // input untouched
  assert.strictEqual(base.upload.length, 4);
  // summary keeps EMS reasons whole
  assert.ok(out.summary.some((s) => s[1] === 'EMS: ירידה מול הקריאה האחרונה ב-EMS' && s[2] === 1));
});

t('applyEmsValidation: emsMeters not in upload/all/exceptions -> מידע', () => {
  const base = run([rd('M1')], { expected: { S: ['M1', 'M2'] } });
  const out = applyEmsValidation(base, [{ rowIndex: 0, valid: true, errors: [], warnings: [] }], { emsMeters: ['M1', 'M2', 'E9'] });
  const info = out.exceptions.filter((e) => e[5] === 'מידע');
  assert.deepStrictEqual(info.map((e) => e.slice(0, 3).concat(e[6])), [['EMS', 'E9', 'E9', 'המונה קיים ב-EMS ולא הגיע מהאתר']]);
  assert.strictEqual(out.counts.blocked, 1, 'M2 still the only blocker; info is not counted');
});

console.log('readings logic OK (' + n + ' tests)');
