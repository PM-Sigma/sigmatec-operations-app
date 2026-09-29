// readings-fetch/logic.js — PURE, dependency-free. Node (tests) and Deno (edge function) import this same file.
// Port of check()/run()/sheet()-data from Kibbutzim/חולדה/שאיבה יומית/miltel_daily.py, with עידן's 29.9 decisions:
// EMS itself validates drops / negatives / unknown meters / duplicates / tariff sums, so there is NO "drop" rule here.
//
// ── EMS upload-readings API (read from sigmatec-ems apps/backend/src/resources/upload-readings, never modified) ──
// Auth: Bearer <user's EMS token>; roles ADMIN | SITE_MANAGER | ACCOUNT_MANAGER | OPERATIONS_MANAGER.
// Sites: the caller's sites (user.currentSite, or user.sites; an ADMIN with no currentSite = all sites).
//
// POST /v1/upload-readings/validate   (read-only, writes nothing)
//   request : { "rows": [ { serialNumber:string (req), energyTypeCode:int (req; 1=electricity), readingDate:'YYYY-MM-DD' (req),
//                           entryMode?:'reading'|'consumption' (default 'reading'), isReverse?:bool, isEstimate?:bool,
//                           ft?:number, rt?, f1?, f2?, f3?, r1?, r2?, r3?:number } ] }
//             => our run.upload rows map 1:1 to this: [serialNumber, energyTypeCode, entryMode, readingDate, ft, f1, f2, f3, rt, r1, r2, r3]
//                (drop null fields; send numbers as numbers).
//   response: RowValidationResult[] = [ { rowIndex:number (index into request rows), valid:boolean,
//                                         errors:string[], warnings:string[] } ]   (one entry per row, in order)
//     error keys  : 'UPLOAD_READINGS.ERRORS.<METER_NOT_FOUND|METER_NOT_IN_SITE|ENERGY_TYPE_MISMATCH|ALL_FIELDS_EMPTY|NEGATIVE_VALUE|
//                    CONSUMPTION_NEEDS_BASELINE|RT_DECREASED|FT_DECREASED|DUPLICATE_IN_BATCH>'
//     warning keys: 'UPLOAD_READINGS.WARNINGS.<TARIFF_SUM_MISMATCH|PARTIAL_TARIFF_UPDATE>'
//   (Nest may wrap the body in a global envelope — unwrap `.data` if present.) POST /submit rejects the WHOLE file if any row invalid.
//
// GET /v1/upload-readings/meters?siteId=<uuid>&energyTypeCode=1&search=<text>   (all query params optional)
//   response: MeterForUpload[] = [ { id, serialNumber, address, energyTypeCode, hasInternalRates:boolean, siteId,
//                                    powerMultiplier:number, lastReadingDate: ISO date|null,
//                                    lastFt, lastRt, lastF1, lastF2, lastF3, lastR1, lastR2, lastR3 : number|null } ]
//   => YES it returns the last reading + its date per meter (already multiplied by powerMultiplier = as on the meter display).
//   Use `.map(m => m.serialNumber)` as `emsMeters` for applyEmsValidation. Empty array when the caller has no meters.
//
// NOTE: buildRun also returns `uploadMeta` (parallel to `upload`: [source, meterOnSite, readingTime, ft]) — persist it with the run,
// applyEmsValidation needs it to write exception rows.

const REG = ['ft', 'f1', 'f2', 'f3'];
const DEFAULT_RULES = { spike_factor: 5, spike_min_kwh: 50, frozen_days: 3 };
const DAY_MS = 86400000;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nz = (v) => (isNum(v) ? v : null);

function dayMs(iso) { return Date.parse(iso + 'T00:00:00Z'); }

/** 'dd-mm-yy HH:MM' (or yyyy) -> UTC-ms of that wall-clock (naive, no TZ), or null. */
export function parseWhen(s) {
  const m = /^\s*(\d{2})-(\d{2})-(\d{2}|\d{4}) (\d{1,2}):(\d{2})\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return Date.UTC(y, +m[2] - 1, +m[1], +m[4], +m[5]);
}

const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

/** Python `re.split(r'[:—(]', reason)[0].strip()`; EMS reasons keep their whole text (they all start 'EMS: '). */
export function reasonKey(reason) {
  if (reason.startsWith('EMS: ')) return reason;
  return reason.split(/[:—(]/)[0].trim();
}

/** (blocks[], warns[]) for one reading. Port of check() minus the drop rule and the "not in mapping" rule. */
function check(rec, serial, day, hist, dup, rules) {
  const block = [], warn = [];
  const vals = {}; for (const k of REG) vals[k] = nz(rec[k]);
  const gap = rec.day_split_gap;
  if (isNum(gap) && Math.abs(gap) > Math.max(Math.abs(rec.day_ct || 0) * 0.01, 0.05))
    block.push('פילוח יומי לא תואם: צריכת שפל+פסגה שונה מצריכת הסה"כ ב-' + gap);
  if (vals.ft === null) { block.push('אין קריאה'); return { block, warn }; }
  if (REG.some((k) => vals[k] !== null && vals[k] < 0)) block.push('ערך שלילי');
  if (dup.has(serial)) block.push('כפילות: כמה מונים באתר ממופים ל-' + serial);
  const t = parseWhen(rec.when);
  const start = dayMs(day);
  if (t !== null && !(start <= t && t < start + 27 * 3600000))
    block.push('קריאה מיושנת — נקלטה ' + rec.when + ' ולא ביום ' + dmy(day) + ' (המשדר לא שידר)');
  if (vals.f1 !== null && vals.f2 !== null && vals.f3 !== null &&
      Math.abs(vals.f1 + vals.f2 + vals.f3 - vals.ft) > Math.max(Math.abs(vals.ft) * 0.001, 1))
    warn.push('סכום התעריפים ≠ סה"כ');
  const past = [];
  for (const h of hist) if (h.values && h.values[serial]) past.push([h.date, h.values[serial]]);
  if (past.length) {
    const [lastD, last] = past[past.length - 1];
    const perDay = (vals.ft - last.ft) / Math.max(Math.round((start - dayMs(lastD)) / DAY_MS), 1);
    let deltas = [];
    for (let i = 1; i < past.length; i++) {
      const [da, a] = past[i - 1], [db, b] = past[i];
      deltas.push((b.ft - a.ft) / Math.max(Math.round((dayMs(db) - dayMs(da)) / DAY_MS), 1));
    }
    deltas = deltas.slice(-7);
    if (deltas.length) {
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      if (perDay > rules.spike_min_kwh && perDay > rules.spike_factor * Math.max(avg, 0.1))
        warn.push('קפיצה חריגה: ' + perDay.toFixed(1) + ' קוט"ש ביום מול ממוצע ' + avg.toFixed(1));
      const fd = rules.frozen_days;
      if (perDay === 0 && deltas.length >= fd - 1 && deltas.some((x) => x > 0) &&
          deltas.slice(-(fd - 1)).every((x) => x === 0))
        warn.push('מונה תקוע — אותה קריאה ' + fd + ' ימים ברצף');
    }
  }
  return { block, warn };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function finish(upload, uploadMeta, all, exceptions) {
  exceptions.sort((a, b) => (a[5] !== 'חוסם') - (b[5] !== 'חוסם') || cmp(a[6], b[6]) || cmp(String(a[1]), String(b[1])));
  const counter = new Map();
  for (const r of exceptions) {
    const k = r[5] + '\u0000' + reasonKey(r[6]);
    counter.set(k, (counter.get(k) || 0) + 1);
  }
  const summary = [...counter].map(([k, n], i) => { const [a, b] = k.split('\u0000'); return [[a, b, n], i]; })
    .sort((x, y) => y[0][2] - x[0][2] || x[1] - y[1]).map((x) => x[0]);
  const snapshot = {};
  for (const r of upload) snapshot[r[0]] = { ft: r[4], f1: r[5], f2: r[6], f3: r[7] };
  const counts = {
    ok: upload.length,
    blocked: new Set(exceptions.filter((r) => r[5] === 'חוסם').map((r) => r[1])).size,
    warn: exceptions.filter((r) => r[5] === 'אזהרה').length,
  };
  return { upload, uploadMeta, all, exceptions, summary, snapshot, counts };
}

export function buildRun({ day, sources, history = [], expected = {}, rules = {} }) {
  const R = { ...DEFAULT_RULES, ...rules };
  const upload = [], uploadMeta = [], all = [], exc = [];
  const got = [];
  for (const s of sources) {
    if (!s.ok) {
      const msg = (s.error && s.error.message) || 'שגיאה';
      for (const m of expected[s.name] || []) exc.push([s.name, m, m, '', null, 'חוסם', 'האתר לא זמין — ' + msg]);
      continue;
    }
    const rows = s.rows || [];
    for (const r of rows) got.push([s.name, r]);
    const seen = new Set(rows.map((r) => r.meter));
    for (const m of expected[s.name] || [])
      if (!seen.has(m)) exc.push([s.name, m, m, '', null, 'חוסם', 'המונה לא הופיע באתר היום']);
  }
  const cnt = new Map();
  for (const [, r] of got) cnt.set(r.meter, (cnt.get(r.meter) || 0) + 1);
  const dup = new Set([...cnt].filter(([k, v]) => k && v > 1).map(([k]) => k));

  for (const [sname, rec0] of got) {
    const serial = rec0.meter;
    let rec = rec0;
    // עידן: a meter missing any expected tariff is valid -> upload the total only
    if ((rec.expect || ['f1', 'f2', 'f3']).some((k) => nz(rec[k]) === null)) rec = { ...rec, f1: null, f2: null, f3: null };
    const { block, warn } = check(rec, serial, day, history, dup, R);
    all.push([rec.query || sname, rec.meter, rec.amr || '', serial, rec.when || '',
      ...REG.map((k) => nz(rec[k])), block.length ? 'לא הועלה' : warn.length ? 'הועלה עם אזהרה' : 'תקין']);
    for (const b of block) exc.push([sname, rec.meter, serial, rec.when || '', nz(rec.ft), 'חוסם', b]);
    for (const w of warn) exc.push([sname, rec.meter, serial, rec.when || '', nz(rec.ft), 'אזהרה', w]);
    if (block.length) continue;
    upload.push([serial, 1, 'reading', day, ...REG.map((k) => nz(rec[k])), null, null, null, null]);
    uploadMeta.push([sname, rec.meter, rec.when || '', nz(rec.ft)]);
  }
  return finish(upload, uploadMeta, all, exc);
}

const EMS_TEXT = {
  METER_NOT_FOUND: 'המונה לא קיים ב-EMS', METER_NOT_IN_SITE: 'המונה לא קיים ב-EMS',
  FT_DECREASED: 'ירידה מול הקריאה האחרונה ב-EMS', RT_DECREASED: 'ירידה מול הקריאה האחרונה ב-EMS',
  NEGATIVE_VALUE: 'ערך שלילי', ENERGY_TYPE_MISMATCH: 'סוג אנרגיה לא תואם', ALL_FIELDS_EMPTY: 'אין ערכים',
  CONSUMPTION_NEEDS_BASELINE: 'אין קריאת בסיס', DUPLICATE_IN_BATCH: 'כפילות בקובץ',
  TARIFF_SUM_MISMATCH: 'סכום התעריפים ≠ סה"כ (EMS)', PARTIAL_TARIFF_UPDATE: 'עדכון תעריפים חלקי',
};
const emsText = (key) => {
  const k = String(key).replace(/^UPLOAD_READINGS\.(ERRORS|WARNINGS)\./, '');
  return 'EMS: ' + (EMS_TEXT[k] || k);
};

/** run = buildRun result; results = EMS validate response; opts.emsMeters = serials of the site in EMS. */
export function applyEmsValidation(run, results, opts = {}) {
  if (results && !Array.isArray(results)) { opts = { ...results, ...opts }; results = results.results; }
  const meta = run.uploadMeta || [];
  const byIdx = new Map((results || []).map((r) => [r.rowIndex, r]));
  const upload = [], uploadMeta = [];
  const exc = run.exceptions.map((r) => r.slice());
  const dropped = new Set();
  run.upload.forEach((row, i) => {
    const res = byIdx.get(i);
    const m = meta[i] || ['', row[0], '', row[4]];
    const add = (type, key) => exc.push([m[0], m[1], row[0], m[2], m[3], type, emsText(key)]);
    if (res && res.valid === false) {
      const errs = [...new Set(res.errors || [])];
      for (const e of errs.length ? errs : ['invalid']) add('חוסם', e);
      dropped.add(row[0]);
    } else {
      upload.push(row); uploadMeta.push(m);
    }
    if (res) for (const w of new Set(res.warnings || [])) add('אזהרה', w);
  });
  const all = run.all.map((r) => {
    const c = r.slice();
    if (dropped.has(c[3])) c[9] = 'לא הועלה';
    else if (c[9] === 'תקין' && exc.some((e) => e[2] === c[3] && e[5] === 'אזהרה')) c[9] = 'הועלה עם אזהרה';
    return c;
  });
  if (opts.emsMeters) {
    const known = new Set([...all.map((r) => r[3]), ...exc.map((r) => r[2])]);
    for (const s of opts.emsMeters)
      if (!known.has(s)) exc.push(['EMS', s, s, '', null, 'מידע', 'המונה קיים ב-EMS ולא הגיע מהאתר']);
  }
  return finish(upload, uploadMeta, all, exc);
}

/** Union of meters per source over recent runs: [{source: [meters]}] -> {source: [meters]}. */
export function expectedFrom(recentRuns) {
  const out = {};
  for (const run of recentRuns || [])
    for (const [s, ms] of Object.entries(run || {})) {
      const set = (out[s] = out[s] || new Set());
      for (const m of ms) set.add(m);
    }
  return Object.fromEntries(Object.entries(out).map(([s, set]) => [s, [...set]]));
}
