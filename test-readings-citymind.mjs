// test-readings-citymind.mjs — readings-fetch/citymind.mjs (עין המפרץ, CityMind water). FAKE data only (public repo):
// fake serials (T100000x), fake ids (900x), fake readings. The CSV fixture is real windows-1255 bytes.
// Run: node test-readings-citymind.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildWater, checkWater, continuity, idMap, INGEST_MAX_BYTES, INGEST_MAX_ROWS, keyMatches, missingInfo, parseCityMind,
  parseCsv, resolveReplacements, validateIngest, CityMindError, normHeader, detectFileType, safeErrorLine,
} from './supabase/functions/readings-fetch/citymind.mjs';
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
  assert.ok(text.startsWith("מס\"ד,מס' זיהוי,"),'Hebrew header survives the decode (the real shape: unquoted, a literal " mid-field)');
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

t('the REAL CityMind shape: unquoted header with מס"ד (literal mid-field quote) + trailing comma; quoted rows + trailing comma', () => {
  const real = "מס\"ד,מס' זיהוי,מס' משדר,תאריך וזמן,קריאה,\r\n" + '"1","001","T9999001","10/10/2026 23:18","699.932",\r\n';
  assert.deepStrictEqual(parseCsv(real), [['מס"ד', "מס' זיהוי", "מס' משדר", 'תאריך וזמן', 'קריאה', ''], ['1', '001', 'T9999001', '10/10/2026 23:18', '699.932', '']]);
  assert.deepStrictEqual(parseCityMind(real, '2026-10-10'), [{ id: '001', serial: 'T9999001', when: '10/10/2026 23:18', ft: 699.932 }]);
  const bytes = Uint8Array.from([...real].map((c) => { const k = c.charCodeAt(0); return k >= 0x5D0 && k <= 0x5EA ? k - 0x5D0 + 0xE0 : k; }));
  assert.deepStrictEqual(parseCityMind(new TextDecoder('windows-1255').decode(bytes), '2026-10-10').length, 1, 'same in windows-1255 bytes');
});

t('csv: quotes, "" escapes, CRLF', () => {
  assert.deepStrictEqual(parseCsv('a,"b,c","d""e"\r\nx,y,z\n'), [['a', 'b,c', 'd"e'], ['x', 'y', 'z']]);
});

// ── header variants (fake fixtures; the 12.10 dry-run said CHANGED) ─────────────
const body = '9001,T1000001,09/10/2026 23:00,1234.5';
const variant = (head, sep = ',', rows = body) => head.join(sep) + '\r\n' + rows.split(',').join(sep) + '\r\n';
const H = ["מס' זיהוי", "מס' משדר", 'תאריך וזמן', 'קריאה'];
const want = [{ id: '9001', serial: 'T1000001', when: '09/10/2026 23:00', ft: 1234.5 }];
for (const [name, head, sep] of [
  ['geresh ׳ (U+05F3) instead of an apostrophe', ['מס\u05F3 זיהוי', 'מס\u05F3 משדר', 'תאריך וזמן', 'קריאה']],
  ['right single quote ’ (U+2019)', ['מס\u2019 זיהוי', 'מס\u2019 משדר', 'תאריך וזמן', 'קריאה']],
  ['NBSP between the words', ["מס'\u00A0זיהוי", "מס'\u00A0משדר", 'תאריך\u00A0וזמן', 'קריאה']],
  ['RTL/LTR marks around the text', ['\u200F' + H[0] + '\u200F', '\u202B' + H[1] + '\u202C', '\u200E' + H[2], H[3] + '\u200F']],
  ['double spaces and padding', ["  מס'  זיהוי ", " מס'   משדר", 'תאריך  וזמן  ', ' קריאה ']],
  ['a BOM before the first header', ['\uFEFF' + H[0], H[1], H[2], H[3]]],
  ['semicolon-delimited', H, ';'],
  ['TAB-delimited', H, '\t'],
]) {
  t('header variant: ' + name, () => assert.deepStrictEqual(parseCityMind(variant(head, sep), DAY), want));
}
t('header variant fixture in real windows-1255 bytes (geresh + NBSP)', () => {
  const s = variant(['מס\u05F3 זיהוי', "מס'\u00A0משדר", 'תאריך וזמן', 'קריאה']);
  const bytes = Uint8Array.from([...s].map((c) => { const k = c.charCodeAt(0); return k >= 0x5D0 && k <= 0x5EA ? k - 0x5D0 + 0xE0 : k === 0x5F3 ? 0xD7 : k === 0xA0 ? 0xA0 : k; }));
  assert.deepStrictEqual(parseCityMind(new TextDecoder('windows-1255').decode(bytes), DAY), want);
});
t('normHeader: marks, quotes, spaces', () => {
  assert.strictEqual(normHeader('\u200F מס\u05F3\u00A0 משדר \u200E'), "מס' משדר");
  assert.strictEqual(normHeader('מס\u05F4ד'), 'מס"ד');
});
t('CHANGED says WHICH expected headers are missing, counts and the type — never data', () => {
  let err;
  try { parseCityMind(variant(["מס' זיהוי", 'מספר', 'תאריך וזמן', 'ערך']), DAY); } catch (e) { err = e; }
  assert.strictEqual(err.code, 'CHANGED');
  assert.deepStrictEqual(err.detail.missing, ["מס' משדר", 'קריאה']);
  const line = safeErrorLine(err);
  assert.strictEqual(line, "CHANGED: headers missing [מס' משדר, קריאה] (found 4 columns, 1 data lines, file type csv)");
  assert.ok(!line.includes('T1000001') && !line.includes('1234.5') && !line.includes('9001'), 'no data values in the log line');
});
t('not a CSV (an HTML page / xlsx / empty) → CHANGED with the detected type', () => {
  for (const [txt, type] of [['<!DOCTYPE html><html><body>x</body></html>', 'html'], ['<table><tr><td>a</td></tr></table>', 'html'], ['PK\u0003\u0004…', 'xlsx'], ['', 'empty']]) {
    assert.strictEqual(detectFileType(txt), type);
    let err; try { parseCityMind(txt, DAY); } catch (e) { err = e; }
    assert.strictEqual(err.code, 'CHANGED');
    assert.strictEqual(safeErrorLine(err), 'CHANGED: file (found 0 columns, file type ' + type + ')');
  }
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
  assert.strictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], serial: 'T1 x' }] }, 100).status, 400);
  assert.strictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], serial: 'T'.repeat(65) }] }, 100).status, 400);
  assert.strictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], ft: 'NaN' }] }, 100).status, 400);
  assert.deepStrictEqual(validateIngest(ok, 100), { ok: true, req: { kibbutz: 'עין המפרץ', date: DAY, rows: ok.rows, dry_run: false } });
});
t('row error shape: index + field + reason, never the value', () => {
  const rows = [ok.rows[0], ok.rows[0], { ...ok.rows[0], ft: '1,234' }];
  const v = validateIngest({ ...ok, rows }, 100);
  assert.deepStrictEqual(v, { ok: false, status: 400, error: 'bad row', index: 2, field: 'reading', reason: 'not a number' });
  assert.deepStrictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], when: 5 }] }, 100),
    { ok: false, status: 400, error: 'bad row', index: 0, field: 'when', reason: 'not a string' });
  assert.deepStrictEqual(validateIngest({ ...ok, rows: [{ ...ok.rows[0], secret: 'x' }] }, 100),
    { ok: false, status: 400, error: 'bad row', index: 0, field: 'secret', reason: 'unexpected field' });
});
t('real row shapes pass the gate: leading-zero id, dd/mm/yyyy HH:MM, empty transmitter, empty reading', () => {
  const rows = [
    { id: '001', serial: '00149001', when: '10/10/2026 23:18', ft: 699.932 },
    { id: '002', serial: '', when: '10/10/2026 23:18', ft: 12 },
    { id: '003', serial: 'T1000003', when: '10/10/2026 23:18', ft: null },
    { id: 'מבנה 4', serial: '70B3D5-AB', when: '10/10/2026 23:18', ft: 1050.25 },
  ];
  const v = validateIngest({ ...ok, rows }, 100);
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.req.rows[0], { id: '001', serial: '00149001', when: '10/10/2026 23:18', ft: 699.932 });
});
t('parser keeps an empty transmitter and parses a thousands separator; checks turn them into per-meter blocks', () => {
  const csv = "מס\"ד,מס' זיהוי,מס' משדר,תאריך וזמן,קריאה,\r\n" +
    '"1","001","","09/10/2026 23:18","5",\r\n"2","002","T1000002","09/10/2026 23:18","",\r\n"3","003","T1000003","09/10/2026 23:18","1,234.5",\r\n';
  const rows = parseCityMind(csv, DAY);
  assert.deepStrictEqual(rows, [
    { id: '001', serial: '', when: '09/10/2026 23:18', ft: 5 },
    { id: '002', serial: 'T1000002', when: '09/10/2026 23:18', ft: null },
    { id: '003', serial: 'T1000003', when: '09/10/2026 23:18', ft: 1234.5 },
  ]);
  const r = buildWater({ day: DAY, rows });
  assert.deepStrictEqual(r.exceptions.map((e) => e[1] + '|' + e[5] + '|' + e[6]).sort(), [
    "001|חוסם|אין מס' משדר בדוח — אי אפשר לשייך למונה במערכת",
    '002|חוסם|אין קריאה',
  ]);
  assert.deepStrictEqual(r.upload.map((u) => u[0]), ['T1000003']);
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

// ── 12.10 regression: the EMS check of a CityMind run is scope-aware (mocked EMS) ──
import { waterEmsCheck, aradWaterMissing, scopeOf, SCOPE_NOTE } from './supabase/functions/readings-fetch/citymind.mjs';
const SITE_EIN = { kibbutz: 'עין המפרץ', ems_site_id: 'site-ein' };
const emsRowOf = (r) => ({ serialNumber: String(r[0]), energyTypeCode: r[1], readingDate: r[3], ft: r[4] });
const mkBase = () => buildWater({ day: DAY, rows: [rec('T1000001', 10), rec('T1000002', 20), rec('T2000003', 3, { id: '9003' })], prevIds: { 9003: 'T1000003' } });
const mockEms = (o = {}) => ({
  me: async () => ({ currentSite: o.currentSite ?? null }),
  validate: async (rows) => rows.map((r, i) => (o.validate ? o.validate(r, i) : { rowIndex: i, valid: true, errors: [], warnings: [] })),
  siteMeters: async () => { if (o.listCalled) o.listCalled.n++; return o.meters || []; },
  meterClients: async () => { throw new Error('must not be called when scoped wrong'); },
  hasReadings: async () => true,
});
const runCheck = (ems) => waterEmsCheck({ base: mkBase(), site: SITE_EIN, day: DAY, emsRow: emsRowOf }, ems);
const asyncT = [];
const at = (name, fn) => asyncT.push([name, fn]);

at('(a) caller scoped to another site, empty list, validate all-valid → all ok, no "not set up", replacement not blocked', async () => {
  const listCalled = { n: 0 };
  const r = await runCheck(mockEms({ currentSite: 'site-other', meters: [], listCalled }));
  assert.deepStrictEqual(r.upload.map((u) => u[0]).sort(), ['T1000001', 'T1000002', 'T2000003']);
  assert.strictEqual(r.counts.blocked, 0);
  assert.ok(!r.exceptions.some((e) => /לא מוקם/.test(e[6])));
  assert.strictEqual(listCalled.n, 0, 'an untrustworthy list is not even fetched');
});
at('(a2) METER_NOT_IN_SITE with a wrong scope is dropped (says nothing about the meter)', async () => {
  const r = await runCheck(mockEms({ currentSite: 'site-other', validate: (row, i) => ({ rowIndex: i, valid: false, errors: ['UPLOAD_READINGS.ERRORS.METER_NOT_IN_SITE'], warnings: [] }) }));
  assert.strictEqual(r.counts.blocked, 0);
  assert.strictEqual(r.counts.ok, 3);
});
at('(b) validate METER_NOT_FOUND → blocked "not set up", whatever the scope', async () => {
  for (const cs of ['site-other', 'site-ein', null]) {
    const r = await runCheck(mockEms({ currentSite: cs, validate: (row, i) => row.serialNumber === 'T1000002'
      ? { rowIndex: i, valid: false, errors: ['UPLOAD_READINGS.ERRORS.METER_NOT_FOUND'], warnings: [] }
      : { rowIndex: i, valid: true, errors: [], warnings: [] }, meters: [] }));
    assert.deepStrictEqual(r.exceptions.filter((e) => e[5] === 'חוסם').map((e) => e[2] + '|' + e[6]), ['T1000002|המונה לא מוקם ב-EMS תחת עין המפרץ'], String(cs));
  }
});
at('(b2) METER_NOT_IN_SITE with the RIGHT scope still blocks', async () => {
  const r = await runCheck(mockEms({ currentSite: 'site-ein', validate: (row, i) => row.serialNumber === 'T1000001'
    ? { rowIndex: i, valid: false, errors: ['UPLOAD_READINGS.ERRORS.METER_NOT_IN_SITE'], warnings: [] } : { rowIndex: i, valid: true, errors: [], warnings: [] },
  meters: [] }));
  // T2000003 = replacement: right scope → continuity evaluated; the mock's meterClients throws → "not checked", not blocked
  assert.deepStrictEqual(r.exceptions.filter((e) => e[5] === 'חוסם').map((e) => e[2]), ['T1000001']);
});
at('(c) the info line lists only WATER + ARAD (comm 1) + not archived, missing from the report', async () => {
  const m = (serial, energy, comm, role = 220) => ({ serialNumber: serial, energyType: { code: energy }, communicationType: { code: comm }, role: { code: role } });
  const meters = [m('T1000001', 2, 1), m('W-ARAD-MISSING', 2, 1), m('W-OTHER-COMM', 2, 7), m('E-ARAD', 1, 1), m('W-ARCHIVED', 2, 1, 999)];
  assert.deepStrictEqual(aradWaterMissing(meters, ['T1000001']).map((r) => r[2]), ['W-ARAD-MISSING']);
  const r = await runCheck(mockEms({ currentSite: null, meters }));
  assert.deepStrictEqual(r.exceptions.filter((e) => e[5] === 'מידע' && e[2]).map((e) => e[2] + '|' + e[6]), ['W-ARAD-MISSING|קיים במערכת ולא הופיע בדוח CityMind']);
});
at('(d) wrong scope → ONE note instead of the missing-meters lines', async () => {
  const r = await runCheck(mockEms({ currentSite: 'site-other', meters: [{ serialNumber: 'X', energyType: { code: 2 }, communicationType: { code: 1 } }] }));
  assert.deepStrictEqual(r.exceptions.filter((e) => e[5] === 'מידע' && !/^רצף שיוך/.test(e[6])).map((e) => e[6]), [SCOPE_NOTE]);
  assert.deepStrictEqual(scopeOf({ currentSite: { id: 'site-ein' } }, 'site-ein'), { currentSite: 'site-ein', trusted: true });
  assert.deepStrictEqual(scopeOf({ currentSite: null }, 'site-ein'), { currentSite: null, trusted: true });
});
at('(e) continuity not checkable (wrong scope) → the replacement uploads with a "not checked" warning, never blocked', async () => {
  const r = await runCheck(mockEms({ currentSite: 'site-other' }));
  assert.ok(r.upload.some((u) => u[0] === 'T2000003'));
  assert.deepStrictEqual(r.exceptions.filter((e) => e[2] === 'T2000003').map((e) => e[5] + '|' + e[6]),
    ['אזהרה|החלפת מונה בזיהוי 9003: T1000003 → T2000003 — רצף השיוך לא נבדק (אתר ה-EMS שלך אינו האתר של הריצה)']);
});
for (const [name, fn] of asyncT) { await fn(); n++; console.log('  ok', name); }
console.log(`test-readings-citymind (with EMS-check regressions): ${n} passed`);

// ── run-level scope summary (security review of 317b6372) ──
const asyncT2 = [];
const at2 = (name, fn) => asyncT2.push([name, fn]);
const NIS = (row, i) => ({ rowIndex: i, valid: false, errors: ['UPLOAD_READINGS.ERRORS.METER_NOT_IN_SITE'], warnings: [] });
const plainBase = () => buildWater({ day: DAY, rows: [rec('T1000001', 10), rec('T1000002', 20), rec('T1000004', 30)] });
const check2 = (base, ems) => waterEmsCheck({ base, site: SITE_EIN, day: DAY, emsRow: emsRowOf }, ems);
at2('wrong site + all NOT_IN_SITE → exactly ONE run-level line with N, no per-row warns, nothing blocked', async () => {
  const r = await check2(plainBase(), mockEms({ currentSite: 'site-other', validate: NIS }));
  assert.strictEqual(r.counts.blocked, 0);
  assert.strictEqual(r.counts.ok, 3);
  assert.strictEqual(r.exceptions.filter((e) => e[5] === 'אזהרה').length, 0, 'no per-row warns');
  const lines = r.exceptions.filter((e) => /שיוך לאתר לא אומת/.test(e[6]));
  assert.deepStrictEqual(lines.map((e) => [e[2], e[5], e[6]]),
    [['', 'מידע', 'שיוך לאתר לא אומת עבור 3 מונים — אתר ה-EMS שלך אינו עין המפרץ (EMS יאמת שוב בהעלאה)']]);
  assert.ok(r.summary.some((s) => s[0] === 'מידע' && /^שיוך לאתר לא אומת עבור 3 מונים/.test(s[1]) && s[2] === 1), 'shows in the summary the page renders');
});
at2('right site + NOT_IN_SITE → blocked as before, no summary line', async () => {
  const r = await check2(plainBase(), mockEms({ currentSite: 'site-ein', validate: NIS }));
  assert.strictEqual(r.counts.blocked, 3);
  assert.ok(!r.exceptions.some((e) => /שיוך לאתר לא אומת/.test(e[6])));
});
at2('continuity unchecked with 1 suspected replacement → 1 per-row warn + 1 summary line', async () => {
  const r = await check2(mkBase(), mockEms({ currentSite: 'site-other' }));
  assert.strictEqual(r.exceptions.filter((e) => e[5] === 'אזהרה').length, 1, 'one per-row warn, on the replaced meter only');
  assert.strictEqual(r.exceptions.find((e) => e[5] === 'אזהרה')[2], 'T2000003');
  assert.deepStrictEqual(r.exceptions.filter((e) => /^רצף שיוך לא נבדק/.test(e[6])).map((e) => e[6]),
    ['רצף שיוך לא נבדק עבור 1 מונים — אתר ה-EMS שלך אינו עין המפרץ']);
});
for (const [name, fn] of asyncT2) { await fn(); n++; console.log('  ok', name); }
console.log(`test-readings-citymind (with scope summary): ${n} passed`);
