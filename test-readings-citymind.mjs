// test-readings-citymind.mjs — readings-fetch/citymind.js (עין המפרץ, CityMind water). FAKE data only (public repo):
// fake serials (T100000x), fake ids (900x), fake readings. The CSV fixture is real windows-1255 bytes.
// Run: node test-readings-citymind.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildWater, checkWater, continuity, idMap, INGEST_MAX_BYTES, INGEST_MAX_ROWS, keyMatches, missingInfo, parseCityMind,
  parseCsv, resolveReplacements, validateIngest, CityMindError,
} from './supabase/functions/readings-fetch/citymind.js';
import { cronFirstRunDue, cronStartOffset, CRON_SPREAD_MIN } from './supabase/functions/readings-fetch/helpers.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok', name); };
const DAY = '2026-10-09';
const hist = (date, values) => ({ date, values: Object.fromEntries(Object.entries(values).map(([s, ft]) => [s, { ft }])) });
const reasons = (r, type) => r.exceptions.filter((e) => !type || e[5] === type).map((e) => e[2] + '|' + e[6]);
const inUpload = (r, s) => r.upload.some((u) => u[0] === s);
const rec = (serial, ft, o = {}) => ({ id: '9' + serial.slice(-3), serial, when: '09/10/2026 23:00', ft, ...o });

// ── the parser ────────────────────────────────────────────────────────────────
const bytes = readFileSync(new URL('./qa/fixtures/citymind-ein-hamifratz-fake.csv', import.meta.url));
const text = new TextDecoder('windows-1255').decode(bytes);

t('windows-1255 fixture decodes to Hebrew headers', () => {
  assert.ok(text.startsWith('"מס""ד",'), 'Hebrew header survives the decode');
  assert.ok(text.includes("מס' משדר"));
});

t('columns are found by HEADER NAME (fixture column order differs from the reference)', () => {
  const rows = parseCityMind(text, DAY);
  assert.deepStrictEqual(rows, [
    { id: '9001', serial: 'T1000001', when: '09/10/2026 23:00', ft: 1234.5 },
    { id: '9002', serial: 'T1000002', when: '09/10/2026 22:15', ft: 0 },
    { id: '9003', serial: 'T1000003', when: '09/10/2026 21:00', ft: 1050.25 },  // "1,050.25" thousands separator
    { id: '9005', serial: 'T1000005', when: '09/10/2026 23:00', ft: null },     // empty reading → null (blocked later)
  ]);  // 9004 is dated 08/10 → filtered out; its quoted "שכונה, ג" did not shift any column
});

t('a missing header = CHANGED; no row for the day = STALE', () => {
  assert.throws(() => parseCityMind('a,b,c\r\n1,2,3', DAY), (e) => e instanceof CityMindError && e.code === 'CHANGED');
  assert.throws(() => parseCityMind(text, '2026-10-01'), (e) => e instanceof CityMindError && e.code === 'STALE');
});

t('csv: quotes, "" escapes, CRLF', () => {
  assert.deepStrictEqual(parseCsv('a,"b,c","d""e"\r\nx,y,z\n'), [['a', 'b,c', 'd"e'], ['x', 'y', 'z']]);
});

// ── the checks (golden per rule) ──────────────────────────────────────────────
t('clean reading uploads as water (energy type 2), exact layout', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000001', 100)], history: [hist('2026-10-08', { T1000001: 99 })] });
  assert.deepStrictEqual(r.upload, [['T1000001', 2, 'reading', DAY, 100, null, null, null, null, null, null, null]]);
  assert.deepStrictEqual(r.counts, { ok: 1, blocked: 0, warn: 0 });
  assert.deepStrictEqual(r.all[0], ['CityMind', '9001', '', 'T1000001', '09/10/2026 23:00', 100, null, null, null, 'תקין']);
});

t('BLOCK negative', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000001', -1)] });
  assert.deepStrictEqual(reasons(r, 'חוסם'), ['T1000001|ערך שלילי']);
  assert.ok(!inUpload(r, 'T1000001'));
});

t('BLOCK empty reading', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000005', null)] });
  assert.deepStrictEqual(reasons(r, 'חוסם'), ['T1000005|אין קריאה']);
});

t('BLOCK skip-list (another source feeds this meter)', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000009', 5)], rules: { skip: { T1000009: 'מקבל קריאות ממקור אחר' } } });
  assert.deepStrictEqual(reasons(r, 'חוסם'), ['T1000009|מקבל קריאות ממקור אחר']);
});

t('BLOCK drop vs the last SAVED reading (dates < D only)', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000001', 90)], history: [hist('2026-10-07', { T1000001: 95 }), hist('2026-10-09', { T1000001: 10 })] });
  assert.deepStrictEqual(reasons(r, 'חוסם'), ['T1000001|ירידה: 95 (07/10) → 90']);
});

t('BLOCK drop to ~0 is labelled a probable meter replacement', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000001', 0.4)], history: [hist('2026-10-08', { T1000001: 812 })] });
  assert.deepStrictEqual(reasons(r, 'חוסם'), ['T1000001|ירידה לסביבת 0 — כנראה החלפת מונה: 812 (08/10) → 0.4']);
});

t('WARN > 100 m³ a day (still uploaded)', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000001', 400)], history: [hist('2026-10-07', { T1000001: 100 })] });
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['T1000001|צריכה גבוהה: 150.0 מ"ק ביום (מעל 100)']);
  assert.ok(inUpload(r, 'T1000001'));
});

// a clean 10-day history: 2026-09-29 .. 2026-10-08, +perDay each day
const series = (serial, start, perDay) => {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10);
    out.push(hist(d, { [serial]: start + perDay * i }));
  }
  return out;
};

t('WARN zero consumption while the average is above 1 m³ a month', () => {
  const h = series('T1000002', 500, 0.5);               // 0.5 m³/day average
  const last = 500 + 0.5 * 9;
  const r = buildWater({ day: DAY, rows: [rec('T1000002', last)], history: h });
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['T1000002|צריכה אפסית (ממוצע 0.5 מ"ק ביום) — לבדוק נקודה עשרונית או מונה תקוע']);
  assert.ok(inUpload(r, 'T1000002'));
});

t('no zero-warning when the average is tiny (under 1 m³ a month)', () => {
  const h = series('T1000002', 500, 0.01);
  const r = buildWater({ day: DAY, rows: [rec('T1000002', 500 + 0.01 * 9)], history: h });
  assert.deepStrictEqual(reasons(r), []);
});

t('WARN > 5× the average and 20 m³ above it', () => {
  const h = series('T1000003', 1000, 2);                // 2 m³/day average
  const r = buildWater({ day: DAY, rows: [rec('T1000003', 1000 + 18 + 30)], history: h });   // +30 in a day
  assert.deepStrictEqual(reasons(r, 'אזהרה'), ['T1000003|צריכה חריגה: 30.0 מ"ק ביום, פי 15 מהממוצע (2.0)']);
});

t('no spike warning under 20 m³ above the average, nor without a week of history', () => {
  const h = series('T1000003', 1000, 2);
  assert.deepStrictEqual(reasons(buildWater({ day: DAY, rows: [rec('T1000003', 1018 + 15)], history: h })), []);
  const short = h.slice(-3);
  assert.deepStrictEqual(reasons(buildWater({ day: DAY, rows: [rec('T1000003', 1018 + 60)], history: short })), []);
});

t('replacement: same id, different transmitter than the previous run → blocked pending the continuity check', () => {
  const r = buildWater({ day: DAY, rows: [rec('T2000001', 3, { id: '9001' })], prevIds: idMap([{ id: '9001', serial: 'T1000001' }]) });
  assert.deepStrictEqual(reasons(r, 'חוסם'), ['T2000001|החלפת משדר/מונה בזיהוי 9001: T1000001 → T2000001 — ממתין לבדיקת רצף שיוך במערכת']);
  assert.deepStrictEqual(r.replacements.map((x) => [x.id, x.old, x.serial, x.onlyBlock]), [['9001', 'T1000001', 'T2000001', true]]);
});

const cm = (clientId, start, end = null) => ({ clientId, start, end });
t('continuity: same client, the next meter starts the day the old one ended, with readings → OK', () => {
  assert.deepStrictEqual(continuity([cm('c1', '2024-01-01', '2026-10-05')], [cm('c1', '2026-10-05')], true), { ok: true });
});
t('continuity failures: gap, overlap, no next meter, no client, open old association, no readings', () => {
  assert.deepStrictEqual(continuity([cm('c1', '2024-01-01', '2026-10-05')], [cm('c1', '2026-10-07')], true), { ok: false, why: 'חור בשיוך בין המונה הישן לחדש' });
  assert.deepStrictEqual(continuity([cm('c1', '2024-01-01', '2026-10-05')], [cm('c1', '2026-10-01')], true), { ok: false, why: 'חפיפה בשיוך בין המונה הישן לחדש' });
  assert.deepStrictEqual(continuity([cm('c1', '2024-01-01', '2026-10-05')], [cm('c2', '2026-10-05')], true), { ok: false, why: 'אין ללקוח של המונה הישן מונה הבא' });
  assert.deepStrictEqual(continuity([], [cm('c1', '2026-10-05')], true), { ok: false, why: 'למונה הישן אין לקוח במערכת' });
  assert.deepStrictEqual(continuity([cm('c1', '2024-01-01')], [cm('c1', '2026-10-05')], true), { ok: false, why: 'השיוך של המונה הישן לא נסגר במערכת' });
  assert.deepStrictEqual(continuity([cm('c1', '2024-01-01', '2026-10-05')], [cm('c1', '2026-10-05')], false), { ok: false, why: 'למונה החדש אין קריאות במערכת' });
});

t('resolveReplacements: OK → uploaded with a warning; not OK → stays blocked with the reason', () => {
  const r = buildWater({ day: DAY, rows: [rec('T2000001', 3, { id: '9001' }), rec('T2000002', 4, { id: '9002' })],
    prevIds: { 9001: 'T1000001', 9002: 'T1000002' } });
  const out = resolveReplacements(r, { T2000001: { ok: true }, T2000002: { ok: false, why: 'חור בשיוך בין המונה הישן לחדש' } }, DAY);
  assert.deepStrictEqual(out.upload.map((u) => u[0]), ['T2000001']);
  assert.deepStrictEqual(out.exceptions.map((e) => e[2] + '|' + e[5] + '|' + e[6]).sort(), [
    'T2000001|אזהרה|החלפת מונה בזיהוי 9001: T1000001 → T2000001 — רצף שיוך תקין',
    'T2000002|חוסם|החלפת משדר/מונה בזיהוי 9002: T1000002 → T2000002 — חור בשיוך בין המונה הישן לחדש',
  ]);
});

t('info: meters in the system that the report did not include', () => {
  assert.deepStrictEqual(missingInfo(['T1', 'T2', 'T3'], ['T2']).map((r) => r[2] + '|' + r[5]), ['T1|מידע', 'T3|מידע']);
});

t('stage 1: one reading per meter per day — the latest of the day wins (stage-2 hook)', () => {
  const r = buildWater({ day: DAY, rows: [rec('T1000001', 10, { when: '09/10/2026 08:00' }), rec('T1000001', 12, { when: '09/10/2026 23:00' })] });
  assert.deepStrictEqual(r.upload.map((u) => u[4]), [12]);
});

// ── ingest auth + payload gate ────────────────────────────────────────────────
const ok = { mode: 'ingest', kibbutz: 'עין המפרץ', date: DAY, rows: [{ id: '9001', serial: 'T1000001', when: '09/10/2026 23:00', ft: 1 }] };
t('key: wrong / empty / missing secret → refused; exact → accepted', () => {
  assert.strictEqual(keyMatches('k'.repeat(64), 'k'.repeat(64)), true);
  assert.strictEqual(keyMatches('k'.repeat(63) + 'x', 'k'.repeat(64)), false);
  assert.strictEqual(keyMatches('', 'k'.repeat(64)), false);
  assert.strictEqual(keyMatches('anything', ''), false, 'an unset secret never matches');
  assert.strictEqual(keyMatches(undefined, 'k'), false);
});
t('payload: oversized → 413; too many rows → 400; other site → 403; extra field → 400', () => {
  assert.strictEqual(validateIngest(ok, INGEST_MAX_BYTES + 1).status, 413);
  assert.strictEqual(validateIngest({ ...ok, rows: Array.from({ length: INGEST_MAX_ROWS + 1 }, () => ok.rows[0]) }, 1000).status, 400);
  assert.strictEqual(validateIngest({ ...ok, kibbutz: 'חולדה' }, 100).status, 403);
  assert.strictEqual(validateIngest({ ...ok, site_id: 'x' }, 100).status, 400);
  assert.strictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], serial: 'a b;drop' }] }, 100).status, 400);
  assert.strictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], ft: 'NaN' }] }, 100).status, 400);
  assert.deepStrictEqual(validateIngest(ok, 100), { ok: true, req: { kibbutz: 'עין המפרץ', date: DAY, rows: ok.rows, dry_run: false } });
});
t('payload: a failure report carries only a known error code', () => {
  assert.strictEqual(validateIngest({ mode: 'ingest', kibbutz: 'עין המפרץ', date: DAY, failed: true, error_code: 'BLOCKED' }, 100).ok, true);
  assert.strictEqual(validateIngest({ mode: 'ingest', kibbutz: 'עין המפרץ', date: DAY, failed: true, error_code: '<script>' }, 100).status, 400);
});

// ── חולדה cron spread ─────────────────────────────────────────────────────────
t('cron spread: 0–25 min, fixed per (site, date), not the same every day', () => {
  const offs = Array.from({ length: 30 }, (_, i) => cronStartOffset(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), 'site-hulda'));
  assert.ok(offs.every((o) => o >= 0 && o <= CRON_SPREAD_MIN));
  assert.ok(new Set(offs).size > 5, 'varies day to day');
  assert.strictEqual(cronStartOffset('2026-10-11', 'site-hulda'), cronStartOffset('2026-10-11', 'site-hulda'));
  const off = cronStartOffset('2026-10-11', 'site-hulda');
  // 12.10 Israel is UTC+3: 07:00 IL = 04:00Z
  const at = (min) => new Date(Date.UTC(2026, 9, 12, 4, min));
  assert.strictEqual(cronFirstRunDue(at(off), '2026-10-11', 'site-hulda'), true);
  if (off > 0) assert.strictEqual(cronFirstRunDue(at(off - 1), '2026-10-11', 'site-hulda'), false);
});

console.log(`test-readings-citymind: ${n} passed`);
