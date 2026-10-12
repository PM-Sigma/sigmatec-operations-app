// readings-fetch/citymind.mjs — PURE, dependency-free (Node tests + Deno import the same file).
// עין המפרץ: daily water readings from CityMind (Arad). The fetch itself runs on a GitHub Actions runner
// (scripts/citymind/citymind-daily.mjs — CityMind sits behind Cloudflare, which refuses Supabase and headless
// Chromium); the runner parses the export with parseCityMind() and POSTs the rows to readings-fetch `ingest`.
// Spec: Kibbutzim/עין המפרץ/תוצרים/2026-10-12 — אפיון שאיבה יומית ל-Sigmatec Ops (reference: citymind_daily.py +
// סגירת חודש/build_month.py). Design: docs/superpowers/specs/2026-10-12-citymind-ein-hamifratz-design.md.
//
// Row shapes match logic.js so publishFiles / applyEmsValidation / the page work unchanged:
//   upload       [serial, 2, 'reading', day, ft, null × 7]                 (EMS upload file, energy type 2 = water)
//   uploadMeta   ['CityMind', id, when, ft]
//   all          ['CityMind', id, '', serial, when, ft, null, null, null, status]
//   exceptions   ['CityMind', id, serial, when, ft, 'חוסם'|'אזהרה'|'מידע', reason]

export const SOURCE = 'CityMind';
export const WATER = 2;
/** Sites the ingest mode accepts. Anything else is refused even with a valid key. */
export const INGEST_SITES = ['עין המפרץ'];
export const INGEST_MAX_BYTES = 1_000_000;
export const INGEST_MAX_ROWS = 5000;
export const INGEST_ERRORS = ['AUTH', 'BLOCKED', 'DOWN', 'CHANGED', 'STALE'];

export const WATER_RULES = {
  max_daily_m3: 100,          // warn: consumption per day above this
  spike_factor: 5,            // warn: per-day consumption above 5× the daily average…
  spike_min_m3: 20,           // …and at least 20 m³ above it (build_month.py SPIKE_MIN)
  zero_min_avg_daily: 1 / 30, // warn: zero consumption while the average is above 1 m³ a MONTH (build_month.py "ממוצע > 1")
  avg_min_history_days: 7,    // the average needs at least a week of saved history
  near_zero_m3: 5,            // a drop to below this = "jumped to ~0" = probably a meter replacement
  skip: {},                   // serial -> reason (blocked: not uploaded)
};

const HISTORY_DAYS = 40;
const DAY_MS = 86400000;
const HEAD = { id: "מס' זיהוי", serial: "מס' משדר", when: ['תאריך וזמן', 'זמן קריאה'], value: 'קריאה' };

/** Minimal RFC-4180 CSV: quoted fields, "" escapes, CRLF/LF. */
export function parseCsv(text, delim = ',') {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;   // a quote opens a field only at its start; mid-field " is literal (מס"ד) — Python csv
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ''));
}

export class CityMindError extends Error {
  /** detail: PUBLIC-SAFE diagnostics only (stage, expected header names that are missing, counts, file type). */
  constructor(code, message, detail = {}) { super(message); this.code = code; this.detail = detail; }
}

/**
 * Header text → a comparable key: bidi/invisible marks and BOM removed, NBSP → space, every apostrophe-like mark
 * (׳ geresh U+05F3, ’ ‘ ` ´ ʼ) → ', every quote-like mark (״ gershayim U+05F4, “ ”) → ", whitespace collapsed.
 */
export function normHeader(h) {
  return String(h ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\u05F3\u2019\u2018`\u00B4\u02BC]/g, "'")
    .replace(/[\u05F4\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What the export actually is, from its first bytes/characters. Only a TYPE word — never content. */
export function detectFileType(text) {
  const t = String(text || '').replace(/^[\uFEFF\s]+/, '');
  if (!t) return 'empty';
  if (/^<(!doctype|html|table|\?xml)/i.test(t) || /^</.test(t)) return 'html';
  if (t.startsWith('PK')) return 'xlsx';
  if (t.charCodeAt(0) === 0xD0 && t.charCodeAt(1) === 0xCF) return 'xls';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  return 'csv';
}

/** The CSV delimiter of the header line: , ; or TAB, whichever splits it most (quotes respected). */
export function detectDelimiter(text) {
  const first = String(text || '').split(/\r?\n/, 1)[0] || '';
  let best = ',', bestN = -1;
  for (const d of [',', ';', '\t']) {
    let n = 0, q = false;
    let cell = '';
    for (const c of first) {
      if (q) { if (c === '"') q = false; else cell += c; }
      else if (c === '"' && cell === '') q = true;
      else if (c === d) { n++; cell = ''; }
      else cell += c;
    }
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

const ddmmyyyy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

/**
 * The export (already decoded from windows-1255) → [{id, serial, when, ft}] for `day` only.
 * Columns are found by HEADER NAME (the report's column order changes — עידן 12.10), compared through normHeader().
 * Throws CityMindError CHANGED (not a CSV, or an expected header is missing — detail says which, safely) /
 * STALE (no rows for the day).
 */
export function parseCityMind(text, day) {
  const raw = String(text || '');
  const type = detectFileType(raw);
  if (type !== 'csv') throw new CityMindError('CHANGED', 'not a csv export', { stage: 'file', type, columns: 0, missing: [] });
  const lines = parseCsv(raw.replace(/^\uFEFF/, ''), detectDelimiter(raw.replace(/^\uFEFF/, '')));
  const head = (lines[0] || []).map(normHeader);
  const col = (names) => { for (const n of [].concat(names)) { const i = head.indexOf(normHeader(n)); if (i >= 0) return i; } return -1; };
  const iId = col(HEAD.id), iTx = col(HEAD.serial), iWhen = col(HEAD.when), iVal = col(HEAD.value);
  const missing = [];
  if (iTx < 0) missing.push(HEAD.serial);
  if (iWhen < 0) missing.push(HEAD.when[0]);
  if (iVal < 0) missing.push(HEAD.value);
  if (missing.length) throw new CityMindError('CHANGED', 'missing columns', { stage: 'headers', type, columns: head.length, rows: Math.max(lines.length - 1, 0), missing });
  const want = ddmmyyyy(day);
  const rows = [];
  for (const r of lines.slice(1)) {
    const when = normHeader(r[iWhen]);
    if (!when.startsWith(want)) continue;
    const serial = normHeader(r[iTx]);
    if (!serial) continue;
    const cell = normHeader(r[iVal]);
    const v = Number(cell.replace(/,/g, ''));
    rows.push({ id: iId >= 0 ? normHeader(r[iId]) : '', serial, when, ft: cell !== '' && Number.isFinite(v) ? v : null });
  }
  if (!rows.length) throw new CityMindError('STALE', 'no rows for the day', { stage: 'rows', type, columns: head.length, rows: Math.max(lines.length - 1, 0) });
  return rows;
}

/** One public-safe log line for a CityMindError: the code, the stage, EXPECTED header names that are missing, counts, the type. */
export function safeErrorLine(e) {
  const code = e && e.code ? e.code : 'DOWN';
  const d = (e && e.detail) || {};
  const miss = d.missing && d.missing.length ? 'headers missing [' + d.missing.join(', ') + ']' : '';
  const parts = [code + (miss ? ': ' + miss : d.stage ? ': ' + d.stage : '')];
  const nums = [];
  if (typeof d.columns === 'number') nums.push('found ' + d.columns + ' columns');
  if (typeof d.rows === 'number') nums.push(d.rows + ' data lines');
  if (d.type) nums.push('file type ' + d.type);
  if (nums.length) parts.push('(' + nums.join(', ') + ')');
  return parts.join(' ');
}

const dayMs = (iso) => Date.parse(iso + 'T00:00:00Z');
const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Saved history (reading_values, dates < day, ≤ 40 days) for one serial, oldest first: [[date, ft]]. */
function pastOf(history, serial, day) {
  const start = dayMs(day), lo = start - HISTORY_DAYS * DAY_MS, past = [];
  for (const h of history || []) {
    const d = dayMs(h.date);
    const v = h.values && h.values[serial];
    if (d >= lo && d < start && v && typeof v.ft === 'number') past.push([h.date, v.ft]);
  }
  return past.sort((a, b) => cmp(a[0], b[0]));
}

/** (blocks, warns) for one water reading. */
export function checkWater(rec, day, history, rules, prevSerial) {
  const R = { ...WATER_RULES, ...(rules || {}) };
  const block = [], warn = [];
  const ft = rec.ft;
  if (ft === null || ft === undefined) { block.push('אין קריאה'); return { block, warn }; }
  if (ft < 0) block.push('ערך שלילי');
  if (R.skip && Object.prototype.hasOwnProperty.call(R.skip, rec.serial)) block.push(String(R.skip[rec.serial]));
  if (prevSerial && prevSerial !== rec.serial)
    block.push(`החלפת משדר/מונה בזיהוי ${rec.id}: ${prevSerial} → ${rec.serial} — ממתין לבדיקת רצף שיוך במערכת`);
  const past = pastOf(history, rec.serial, day);
  if (!past.length) return { block, warn };
  const [lastD, last] = past[past.length - 1];
  const days = Math.max(Math.round((dayMs(day) - dayMs(lastD)) / DAY_MS), 1);
  if (ft < last) {
    block.push(ft < R.near_zero_m3
      ? `ירידה לסביבת 0 — כנראה החלפת מונה: ${last} (${dm(lastD)}) → ${ft}`
      : `ירידה: ${last} (${dm(lastD)}) → ${ft}`);
    return { block, warn };
  }
  const perDay = (ft - last) / days;
  if (perDay > R.max_daily_m3) warn.push(`צריכה גבוהה: ${f1(perDay)} מ"ק ביום (מעל ${R.max_daily_m3})`);
  const [firstD, first] = past[0];
  const span = Math.round((dayMs(lastD) - dayMs(firstD)) / DAY_MS);
  if (span >= R.avg_min_history_days) {
    const avg = (last - first) / span;
    if (perDay === 0 && avg > R.zero_min_avg_daily)
      warn.push(`צריכה אפסית (ממוצע ${f1(avg)} מ"ק ביום) — לבדוק נקודה עשרונית או מונה תקוע`);
    else if (avg > 0 && perDay > R.spike_factor * avg && perDay - avg > R.spike_min_m3)
      warn.push(`צריכה חריגה: ${f1(perDay)} מ"ק ביום, פי ${Math.round(perDay / avg)} מהממוצע (${f1(avg)})`);
  }
  return { block, warn };
}

/** Same summary / counts as logic.js finish(). */
export function finishWater(upload, uploadMeta, all, exceptions) {
  const order = { 'חוסם': 0, 'אזהרה': 1, 'מידע': 2 };
  exceptions.sort((a, b) => (order[a[5]] ?? 3) - (order[b[5]] ?? 3) || cmp(a[6], b[6]) || cmp(String(a[2]), String(b[2])));
  const counter = new Map();
  for (const r of exceptions) {
    const k = r[5] + '\u0000' + String(r[6]).split(/[:—(]/)[0].trim();
    counter.set(k, (counter.get(k) || 0) + 1);
  }
  const summary = [...counter].map(([k, n]) => { const [a, b] = k.split('\u0000'); return [a, b, n]; })
    .sort((x, y) => y[2] - x[2]);
  const snapshot = {};
  for (const r of upload) snapshot[r[0]] = { ft: r[4], f1: null, f2: null, f3: null };
  return {
    upload, uploadMeta, all, exceptions, summary, snapshot,
    counts: {
      ok: upload.length,
      blocked: new Set(exceptions.filter((r) => r[5] === 'חוסם').map((r) => r[2])).size,
      warn: exceptions.filter((r) => r[5] === 'אזהרה').length,
    },
  };
}

/**
 * rows = parseCityMind() output; prevIds = {id: serial} from the previous saved run (meter replacement);
 * history = [{date, values:{serial:{ft}}}] (reading_values, dates < day).
 * → the finishWater shape + `replacements` [{id, old, row}] (blocked until the EMS continuity check).
 * Stage 2 hook: `rows` may one day hold several readings per meter per day (CF4 = all); today the LAST of the
 * day per serial is kept, exactly like the daily report (CF4 = 1) returns it.
 */
export function buildWater({ day, rows, history = [], rules = {}, prevIds = {} }) {
  const last = new Map();
  for (const r of rows || []) {
    const p = last.get(r.serial);
    if (!p || String(r.when) >= String(p.when)) last.set(r.serial, r);
  }
  const upload = [], uploadMeta = [], all = [], exc = [], replacements = [];
  for (const rec of last.values()) {
    const prev = rec.id ? prevIds[rec.id] : undefined;
    const { block, warn } = checkWater(rec, day, history, rules, prev);
    all.push([SOURCE, rec.id, '', rec.serial, rec.when, rec.ft, null, null, null,
      block.length ? 'לא הועלה' : warn.length ? 'הועלה עם אזהרה' : 'תקין']);
    for (const b of block) exc.push([SOURCE, rec.id, rec.serial, rec.when, rec.ft, 'חוסם', b]);
    for (const w of warn) exc.push([SOURCE, rec.id, rec.serial, rec.when, rec.ft, 'אזהרה', w]);
    if (prev && prev !== rec.serial) replacements.push({ id: rec.id, old: prev, serial: rec.serial, when: rec.when, ft: rec.ft, onlyBlock: block.length === 1 });
    if (block.length) continue;
    upload.push([rec.serial, WATER, 'reading', day, rec.ft, null, null, null, null, null, null, null]);
    uploadMeta.push([SOURCE, rec.id, rec.when, rec.ft]);
  }
  return { ...finishWater(upload, uploadMeta, all, exc), replacements };
}

/** {id: serial} of a saved run's CityMind rows — the "previous day" for the replacement rule. */
export const idMap = (rows) => Object.fromEntries((rows || []).filter((r) => r && r.id).map((r) => [r.id, r.serial]));

const sameDay = (a, b) => !!a && !!b && String(a).slice(0, 10) === String(b).slice(0, 10);

/**
 * Meter-replacement continuity (spec: "בודקים את הלקוח של המונה הישן"). old/next = the EMS client associations
 * [{clientId, start, end}] of the old and the new meter; nextHasReadings = the new meter has readings in the system.
 * OK = the old meter's client has the new meter starting exactly when the old one ended (no gap, no overlap).
 * → {ok:true} | {ok:false, why}
 */
export function continuity(old, next, nextHasReadings) {
  const ended = (old || []).filter((a) => a && a.clientId && a.end);
  if (!(old || []).length) return { ok: false, why: 'למונה הישן אין לקוח במערכת' };
  if (!ended.length) return { ok: false, why: 'השיוך של המונה הישן לא נסגר במערכת' };
  for (const o of ended) {
    const n = (next || []).filter((a) => a && a.clientId === o.clientId);
    if (!n.length) continue;
    if (n.some((a) => sameDay(a.start, o.end))) {
      if (!nextHasReadings) return { ok: false, why: 'למונה החדש אין קריאות במערכת' };
      return { ok: true };
    }
    return { ok: false, why: n.some((a) => String(a.start).slice(0, 10) < String(o.end).slice(0, 10)) ? 'חפיפה בשיוך בין המונה הישן לחדש' : 'חור בשיוך בין המונה הישן לחדש' };
  }
  return { ok: false, why: 'אין ללקוח של המונה הישן מונה הבא' };
}

/**
 * Apply the continuity results to a built run BEFORE the EMS validate call. evidence = {serial: {ok, why}}.
 * OK + the replacement was its only block → the row moves into the upload with a warning; otherwise the block text
 * says why. Returns the pre-validate shape {upload, uploadMeta, all, exceptions}.
 */
export function resolveReplacements(run, evidence, day) {
  const upload = run.upload.map((r) => r.slice()), uploadMeta = (run.uploadMeta || []).map((r) => r.slice());
  let exceptions = run.exceptions.map((r) => r.slice());
  const all = run.all.map((r) => r.slice());
  for (const rep of run.replacements || []) {
    const ev = evidence[rep.serial];
    if (!ev) continue;
    const isRep = (e) => e[2] === rep.serial && e[5] === 'חוסם' && String(e[6]).startsWith('החלפת משדר/מונה');
    if (ev.ok && rep.onlyBlock) {
      exceptions = exceptions.filter((e) => !isRep(e));
      exceptions.push([SOURCE, rep.id, rep.serial, rep.when, rep.ft, 'אזהרה', `החלפת מונה בזיהוי ${rep.id}: ${rep.old} → ${rep.serial} — רצף שיוך תקין`]);
      upload.push([rep.serial, WATER, 'reading', day, rep.ft, null, null, null, null, null, null, null]);
      uploadMeta.push([SOURCE, rep.id, rep.when, rep.ft]);
      for (const a of all) if (a[3] === rep.serial) a[9] = 'הועלה עם אזהרה';
    } else {
      for (const e of exceptions) if (isRep(e)) e[6] = `החלפת משדר/מונה בזיהוי ${rep.id}: ${rep.old} → ${rep.serial} — ${ev.ok ? 'רצף שיוך תקין, אבל יש חסימה נוספת' : ev.why}`;
    }
  }
  return { upload, uploadMeta, all, exceptions };
}

/** Info rows: water meters of the site in the system that the CityMind report did not include (spec "מידע"). */
export function missingInfo(emsSerials, reportSerials) {
  const got = new Set(reportSerials);
  return [...new Set(emsSerials)].filter((s) => s && !got.has(s)).sort()
    .map((s) => [SOURCE, '', s, '', null, 'מידע', 'קיים במערכת ולא הופיע בדוח CityMind']);
}

// ───────────────────────── ingest (the runner → the function) ─────────────────────────

/** Constant-time string compare (same algorithm as _shared/http.ts timingSafeEqual; this file must stay pure JS). */
export function keyMatches(given, secret) {
  if (typeof given !== 'string' || typeof secret !== 'string' || !secret) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(secret);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const ID = /^[0-9A-Za-z._\- ]{0,32}$/;
const SERIAL = /^[0-9A-Za-z._\-]{1,32}$/;

/**
 * Shape + size gate for `ingest`. bytes = the raw body length. date validity is checked by the caller (badRunDate).
 * → {ok:true, req} | {ok:false, status, error}
 */
export function validateIngest(body, bytes) {
  if (!(bytes > 0) || bytes > INGEST_MAX_BYTES) return { ok: false, status: 413, error: 'payload too large' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, status: 400, error: 'bad body' };
  const allowed = new Set(['mode', 'kibbutz', 'date', 'rows', 'dry_run', 'failed', 'error_code']);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return { ok: false, status: 400, error: 'unexpected field' };
  if (!INGEST_SITES.includes(body.kibbutz)) return { ok: false, status: 403, error: 'site not allowed' };
  if (body.dry_run !== undefined && typeof body.dry_run !== 'boolean') return { ok: false, status: 400, error: 'bad dry_run' };
  if (body.failed === true) {
    if (!INGEST_ERRORS.includes(body.error_code)) return { ok: false, status: 400, error: 'bad error_code' };
    return { ok: true, req: { kibbutz: body.kibbutz, date: body.date, failed: true, error_code: body.error_code, dry_run: !!body.dry_run } };
  }
  const rows = body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > INGEST_MAX_ROWS) return { ok: false, status: 400, error: 'bad rows' };
  const clean = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, status: 400, error: 'bad row' };
    const id = r.id ?? '', serial = r.serial, when = r.when, ft = r.ft;
    if (typeof id !== 'string' || !ID.test(id) || typeof serial !== 'string' || !SERIAL.test(serial) ||
        typeof when !== 'string' || when.length > 32 ||
        !(ft === null || (typeof ft === 'number' && Number.isFinite(ft) && Math.abs(ft) < 1e9))) return { ok: false, status: 400, error: 'bad row' };
    clean.push({ id: id.trim(), serial, when, ft });
  }
  return { ok: true, req: { kibbutz: body.kibbutz, date: body.date, rows: clean, dry_run: !!body.dry_run } };
}

export const INGEST_ERROR_TEXT = {
  AUTH: 'CityMind: ההתחברות נכשלה (משתמש/סיסמה)',
  BLOCKED: 'CityMind חסם את הדפדפן (Cloudflare) — לעצור ולדווח לעידן',
  DOWN: 'CityMind לא זמין',
  CHANGED: 'מבנה הדוח ב-CityMind השתנה',
  STALE: 'אין קריאות לתאריך בדוח CityMind',
};
