// readings-fetch/logic.js — PURE, dependency-free. Node (tests) and Deno (edge function) import this same file.
// Port of check()/run()/sheet()-data from Kibbutzim/חולדה/שאיבה יומית/miltel_daily.py, with עידן's 29.9 decisions:
// v1.3 (עידן, 29.9.26): rules = section 7 of the spec. Blocks: no T / not set up in EMS / negative / drop vs last saved /
// >max_daily_kwh / spike (only after spike_min_history_days). Warnings: משב"ים sum / stale / frozen.
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
const HEB = { ft: 'סה"כ', f1: 'פסגה', f2: 'גבע', f3: 'שפל' };
const DEFAULT_RULES = { max_daily_kwh: 500, spike_factor: 5, spike_min_history_days: 30, spike_min_kwh: 50, frozen_days: 3 };
const HISTORY_DAYS = 40;
const DAY_MS = 86400000;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nz = (v) => (isNum(v) ? v : null);

/** Python '%.<d>f' (round-half-even on exact ties; toFixed rounds them up). */
function fmt(v, d) {
  const s = v.toFixed(d), k = 10 ** d, x = v * k;
  if (Math.abs(x % 1) === 0.5 && Math.round(x) % 2 !== 0) return ((Math.round(x) - 1) / k).toFixed(d);
  return s;
}

function dayMs(iso) { return Date.parse(iso + 'T00:00:00Z'); }

/** 'dd-mm-yy HH:MM' (or yyyy) -> UTC-ms of that wall-clock (naive, no TZ), or null. */
export function parseWhen(s) {
  const m = /^\s*(\d{2})-(\d{2})-(\d{2}|\d{4}) (\d{1,2}):(\d{2})\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return Date.UTC(y, +m[2] - 1, +m[1], +m[4], +m[5]);
}

const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

/** Python `re.split(r'[:—(]', reason)[0].strip()`. Unmapped EMS reasons ('EMS: <key>') keep their whole text. */
export function reasonKey(reason) {
  if (reason.startsWith('EMS: ')) return reason;
  return reason.split(/[:—(]/)[0].trim();
}

/** (blocks[], warns[]) for one reading. Port of check() in miltel_daily.py (v1.3). */
function check(rec, day, hist, rules, serial) {
  const block = [], warn = [];
  const vals = {}; for (const k of REG) vals[k] = nz(rec[k]);
  const gap = rec.day_split_gap;
  if (isNum(gap) && Math.abs(gap) > Math.max(Math.abs(rec.day_ct || 0) * 0.01, 0.05))
    warn.push('סכום המשב"ים ≠ סה"כ (בצריכה היומית, פער ' + gap + ')');
  if (vals.ft === null) {
    const got = ['f1', 'f2', 'f3'].filter((k) => vals[k] !== null).map((k) => HEB[k] + ' ' + vals[k]).join(', ');
    block.push('אין קריאת סה"כ (T)' + (got ? ' — הגיעו רק: ' + got : ''));
    return { block, warn };
  }
  if (REG.some((k) => vals[k] !== null && vals[k] < 0)) block.push('ערך שלילי');
  const t = parseWhen(rec.when);
  const start = dayMs(day);
  if (t !== null && !(start <= t && t < start + 27 * 3600000)) // until 03:00 next day still counts as "end of day"
    warn.push('משדר לא שידר — הקריאה מ-' + rec.when + ' ולא מ-' + dmy(day));
  if (vals.f1 !== null && vals.f2 !== null && vals.f3 !== null &&
      Math.abs(vals.f1 + vals.f2 + vals.f3 - vals.ft) > Math.max(Math.abs(vals.ft) * 0.001, 1))
    warn.push('סכום המשב"ים ≠ סה"כ');
  const lo = start - HISTORY_DAYS * DAY_MS;
  const past = [];
  for (const h of hist) {
    const dm = dayMs(h.date);
    if (dm >= lo && dm < start && h.values && h.values[serial]) past.push([h.date, h.values[serial]]);
  }
  past.sort((a, b) => cmp(a[0], b[0]));
  if (past.length) {
    const [lastD, last] = past[past.length - 1];
    for (const k of REG)
      if (vals[k] !== null && nz(last[k]) !== null && vals[k] < last[k])
        block.push('ירידה ב' + HEB[k] + ': ' + last[k] + ' (' + dmy(lastD) + ') → ' + vals[k]);
    const perDay = (vals.ft - last.ft) / Math.max(Math.round((start - dayMs(lastD)) / DAY_MS), 1);
    const deltas = [];
    for (let i = 1; i < past.length; i++) {
      const [da, a] = past[i - 1], [db, b] = past[i];
      deltas.push((b.ft - a.ft) / Math.max(Math.round((dayMs(db) - dayMs(da)) / DAY_MS), 1));
    }
    const wk = deltas.slice(-7);
    if (perDay > rules.max_daily_kwh) block.push('צריכה חריגה: ' + fmt(perDay, 1) + ' קוט"ש ביום (מעל ' + rules.max_daily_kwh + ')');
    const [firstD, first] = past[0];
    const span = Math.round((dayMs(lastD) - dayMs(firstD)) / DAY_MS);
    if (span >= rules.spike_min_history_days) {
      const avg = (last.ft - first.ft) / span;
      if (perDay > rules.spike_min_kwh && perDay > rules.spike_factor * Math.max(avg, 0.1))
        block.push('קפיצה חריגה: ' + fmt(perDay, 1) + ' קוט"ש ביום, פי ' + fmt(perDay / Math.max(avg, 0.1), 0) + ' מהממוצע (' + fmt(avg, 1) + ')');
    }
    const fd = rules.frozen_days;
    if (wk.length && perDay === 0 && wk.length >= fd - 1 && wk.some((x) => x > 0) && wk.slice(-(fd - 1)).every((x) => x === 0))
      warn.push('מונה תקוע — אותה קריאה ' + fd + ' ימים ברצף');
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

export function buildRun({ day, sources, history = [], rules = {} }) {
  const R = { ...DEFAULT_RULES, ...rules };
  const upload = [], uploadMeta = [], all = [], exc = [];
  // A source that failed is a RUN error (status failed/partial, shown on screen) - never a per-meter exception.
  for (const s of sources) {
    if (!s.ok) continue;
    for (const rec0 of s.rows || []) {
      const sname = s.name, serial = rec0.meter;
      let rec = rec0;
      // עידן: a meter missing any expected משב"ים is valid -> upload the total only (no total at all is blocked below,
      // with what did arrive listed in the reason)
      if (nz(rec.ft) !== null && (rec.expect || ['f1', 'f2', 'f3']).some((k) => nz(rec[k]) === null))
        rec = { ...rec, f1: null, f2: null, f3: null };
      const { block, warn } = check(rec, day, history, R, serial);
      all.push([rec.query || sname, rec.meter, rec.amr || '', serial, rec.when || '',
        ...REG.map((k) => nz(rec[k])), block.length ? 'לא הועלה' : warn.length ? 'הועלה עם אזהרה' : 'תקין']);
      for (const b of block) exc.push([sname, rec.meter, serial, rec.when || '', nz(rec.ft), 'חוסם', b]);
      for (const w of warn) exc.push([sname, rec.meter, serial, rec.when || '', nz(rec.ft), 'אזהרה', w]);
      if (block.length) continue;
      upload.push([serial, 1, 'reading', day, ...REG.map((k) => nz(rec[k])), null, null, null, null]);
      uploadMeta.push([sname, rec.meter, rec.when || '', nz(rec.ft)]);
    }
  }
  return finish(upload, uploadMeta, all, exc);
}

const EMS_TEXT = {
  FT_DECREASED: 'ירידה מול הקריאה האחרונה ב-EMS', RT_DECREASED: 'ירידה מול הקריאה האחרונה ב-EMS',
  NEGATIVE_VALUE: 'ערך שלילי', ENERGY_TYPE_MISMATCH: 'סוג אנרגיה לא תואם', ALL_FIELDS_EMPTY: 'אין ערכים',
  CONSUMPTION_NEEDS_BASELINE: 'אין קריאת בסיס', DUPLICATE_IN_BATCH: 'כפילות בקובץ',
  TARIFF_SUM_MISMATCH: 'סכום המשב"ים ≠ סה"כ (EMS)', PARTIAL_TARIFF_UPDATE: 'עדכון משב"ים חלקי',
};
const NOT_SET_UP = (kibbutz) => 'המונה לא מוקם ב-EMS' + (kibbutz ? ' תחת ' + kibbutz : '');
const emsText = (key, kibbutz) => {
  const k = String(key).replace(/^UPLOAD_READINGS\.(ERRORS|WARNINGS)\./, '');
  if (k === 'METER_NOT_FOUND' || k === 'METER_NOT_IN_SITE') return NOT_SET_UP(kibbutz);
  return EMS_TEXT[k] || 'EMS: ' + k;
};

/**
 * run = buildRun result; results = EMS validate response; opts.emsMeters = serials of the site in EMS (GET meters),
 * opts.kibbutz = the site's name for the 'not set up' text. A meter absent from emsMeters is BLOCKED ('not set up in EMS').
 * Meters that exist only in EMS are NOT listed (they belong to other systems).
 */
export function applyEmsValidation(run, results, opts = {}) {
  if (results && !Array.isArray(results)) { opts = { ...results, ...opts }; results = results.results; }
  const meta = run.uploadMeta || [];
  const byIdx = new Map((results || []).map((r) => [r.rowIndex, r]));
  // ponytail: the GET-meters list blocked every meter on 1.10 (it matched none of the serials), and it only duplicated
  // validate's METER_NOT_FOUND / METER_NOT_IN_SITE, which already blocks a meter that isn't set up. Validate is the one source.
  const known = null;
  const upload = [], uploadMeta = [];
  const exc = run.exceptions.map((r) => r.slice());
  const dropped = new Set();
  run.upload.forEach((row, i) => {
    const res = byIdx.get(i);
    const m = meta[i] || ['', row[0], '', row[4]];
    const seenTxt = new Set();
    const add = (type, txt) => {
      if (seenTxt.has(type + txt)) return;
      seenTxt.add(type + txt);
      exc.push([m[0], m[1], row[0], m[2], m[3], type, txt]);
    };
    const notSetUp = known && !known.has(String(row[0]));
    if (notSetUp) add('חוסם', NOT_SET_UP(opts.kibbutz));
    if (res && res.valid === false) {
      const errs = [...new Set(res.errors || [])];
      for (const e of errs.length ? errs : ['invalid']) add('חוסם', emsText(e, opts.kibbutz));
      dropped.add(row[0]);
    } else if (notSetUp) dropped.add(row[0]);
    else { upload.push(row); uploadMeta.push(m); }
    if (res) for (const w of new Set(res.warnings || [])) add('אזהרה', emsText(w, opts.kibbutz));
  });
  const all = run.all.map((r) => {
    const c = r.slice();
    if (dropped.has(c[3])) c[9] = 'לא הועלה';
    else if (c[9] === 'תקין' && exc.some((e) => e[2] === c[3] && e[5] === 'אזהרה')) c[9] = 'הועלה עם אזהרה';
    return c;
  });
  return finish(upload, uploadMeta, all, exc);
}
