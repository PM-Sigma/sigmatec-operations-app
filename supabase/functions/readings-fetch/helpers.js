// readings-fetch/helpers.js - PURE, dependency-free decisions for index.ts (Node tests + Deno import the same file).
// Everything time-related is Asia/Jerusalem: Deno runs in UTC.

export const STUCK_MS = 10 * 60 * 1000;
export const CRON_FROM_MIN = 7 * 60;          // 07:00 Israel
export const CRON_TO_MIN = 8 * 60 + 45;       // 08:45 Israel (exclusive)
export const CRON_MAX_ATTEMPT = 4;
export const CRON_RETRY_GAP_MS = 30 * 60 * 1000;
export const VALUES_RETENTION_DAYS = 400;
export const EMS_SYNC_RATIO = 0.9;

/** {date:'YYYY-MM-DD', hh, mm, minutes} of `now` in Asia/Jerusalem. */
export function israelNow(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});
  const hh = +p.hour, mm = +p.minute;
  return { date: `${p.year}-${p.month}-${p.day}`, hh, mm, minutes: hh * 60 + mm };
}

export function addDaysIso(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
export const israelYesterday = (now = new Date()) => addDaysIso(israelNow(now).date, -1);

/** A run date must be a real YYYY-MM-DD strictly before today (Israel). Returns null if fine, else a Hebrew error. */
export function badRunDate(date, now = new Date()) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || addDaysIso(date, 0) !== date) return 'תאריך לא תקין';
  if (date >= israelNow(now).date) return 'אפשר למשוך רק תאריך שעבר (עד אתמול)';
  return null;
}

/** The cron acts only 07:00 <= Israel time < 08:45. */
export function cronWindowOpen(now = new Date()) {
  const m = israelNow(now).minutes;
  return m >= CRON_FROM_MIN && m < CRON_TO_MIN;
}

/** Runs older than these dates (by reading_date) are deleted. */
export const retentionCutoff = (now = new Date(), days = 35) => addDaysIso(israelNow(now).date, -days);
export const valuesCutoff = (now = new Date()) => retentionCutoff(now, VALUES_RETENTION_DAYS);

/** `running` rows of one (site,date): {existing: youngest non-stuck run | null, stale: [ids of stuck ones]}. */
export function dedupeDecision(runningRuns, nowMs = Date.now()) {
  let existing = null; const stale = [];
  for (const r of runningRuns || []) {
    const age = nowMs - Date.parse(r.started_at);
    if (age > STUCK_MS) stale.push(r.id);
    else if (!existing || Date.parse(r.started_at) > Date.parse(existing.started_at)) existing = r;
  }
  return { existing, stale };
}

/** Hebrew file names for download + ASCII storage keys (Hebrew keys are avoided on purpose). */
export function fileNames(date, kibbutz) {
  return {
    readings: `${date} — ${kibbutz} קריאות להעלאה.xlsx`,
    exceptions: `${date} — ${kibbutz} חריגות.xlsx`,
  };
}
export function storagePaths(siteId, date, runId) {
  const base = `${siteId}/${date}/${runId}`;
  return { readings: `${base}/readings.xlsx`, exceptions: `${base}/exceptions.xlsx` };
}

/** >= 90% of the run's uploaded serials have an EMS last-reading date >= the run's date. */
export function emsSyncDecision(serials, lastDates, runDate, ratio = EMS_SYNC_RATIO) {
  if (!serials || !serials.length) return false;
  let n = 0;
  for (const s of serials) { const d = lastDates[s]; if (d && String(d).slice(0, 10) >= runDate) n++; }
  return n / serials.length >= ratio;
}

export const ERR_TEXT = {
  AUTH: 'שם משתמש או סיסמה שגויים באתר',
  DOWN: 'האתר לא זמין',
  CHANGED: 'מבנה האתר השתנה',
  QUOTA: 'נגמרה מכסת שירות הדפדפן (Browserless)',
  STALE: 'האתר לא החזיר נתונים עדכניים',
};
export const errText = (code) => ERR_TEXT[code] || ERR_TEXT.DOWN;

/** All sources finished (mirrors the SQL RPC readings_source_done). */
export const allSourcesDone = (progress, names) =>
  names.length > 0 && names.every((n) => progress && progress[n] && (progress[n].state === 'ok' || progress[n].state === 'failed'));

/** ok | partial | failed from the per-source progress. */
export function runStatus(progress, names) {
  const ok = names.filter((n) => progress[n] && progress[n].state === 'ok').length;
  return ok === names.length ? 'ok' : ok === 0 ? 'failed' : 'partial';
}

/**
 * What the cron does for ONE site. runsForDate = all runs of yesterday (any trigger).
 * -> {action:'run'} | {action:'retry', run} | {action:'none'}
 */
export function cronDecision(runsForDate, nowMs = Date.now()) {
  if (!runsForDate || !runsForDate.length) return { action: 'run' };
  const cronRuns = runsForDate.filter((r) => r.trigger === 'cron')
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const last = cronRuns[0];
  if (last && (last.status === 'partial' || last.status === 'failed') && (last.attempt || 1) < CRON_MAX_ATTEMPT &&
      nowMs - Date.parse(last.started_at) >= CRON_RETRY_GAP_MS &&
      !runsForDate.some((r) => r.status === 'ok' || r.status === 'running')) return { action: 'retry', run: last };
  return { action: 'none' };
}

const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

/**
 * The push for a finished run. run = {trigger,status,kibbutz,reading_date,started_by,progress,n_ok}.
 * -> null (send nothing) | {to:'starter'|'all', title, body}
 */
export function readingsPush(run) {
  const ok = run.status === 'ok';
  if (run.trigger === 'cron' && ok) return null;
  const d = dm(run.reading_date);
  const failed = Object.entries(run.progress || {}).filter(([, v]) => v && v.state !== 'ok')
    .map(([k, v]) => k + (v.error && v.error.message ? ': ' + v.error.message : ''));
  let title, body;
  if (ok) { title = `הקבצים של ${run.kibbutz} ל-${d} מוכנים`; body = `${run.n_ok ?? 0} קריאות מוכנות להעלאה`; }
  else if (run.status === 'partial') { title = `משיכת הקריאות של ${run.kibbutz} ל-${d} הושלמה חלקית`; body = failed.join(' · ') || 'חלק מהמקורות נכשלו'; }
  else { title = `משיכת הקריאות של ${run.kibbutz} ל-${d} נכשלה`; body = failed.join(' · ') || 'כל המקורות נכשלו'; }
  return { to: run.trigger === 'cron' ? 'all' : 'starter', title, body };
}
