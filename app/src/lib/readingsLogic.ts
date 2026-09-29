// 📥 משיכת קריאות משירותי מנייה חיצוניים — the pure half (no DOM, no network). Everything the page,
// the global watcher and the badge decide lives here so it can be unit-tested without a browser.
// All dates are calendar days in Asia/Jerusalem: the browser's own zone is never trusted.

export type RunStatus = 'running' | 'ok' | 'partial' | 'failed';
export type SourceState = 'pending' | 'running' | 'ok' | 'failed';
export type Progress = Record<string, { state: SourceState; count?: number; error?: { code?: string; message?: string } }>;

export interface ReadingRun {
  id: string;
  site_id: string;
  reading_date: string;
  trigger: 'cron' | 'manual' | null;
  started_by: string | null;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  progress: Progress | null;
  n_ok: number | null;
  n_blocked: number | null;
  n_warn: number | null;
  /** [סוג, סיבה, כמות] */
  summary: Array<[string, string, number]> | null;
  /** [מקור, מונה באתר, מספר מונה בקובץ, זמן קריאה, סהכ, סוג, סיבה] */
  exceptions: unknown[][] | null;
  error: string | null;
  readings_file: string | null;
  exceptions_file: string | null;
  ems_checked: boolean | null;
  ems_checked_by: string | null;
  ems_checked_at: string | null;
  uploaded: boolean | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  uploaded_source: 'manual' | 'auto' | null;
  seen_by: string[] | null;
}

export const HISTORY_DAYS = 35;
const TZ = 'Asia/Jerusalem';

// ── dates ────────────────────────────────────────────────────────────────────
/** The calendar day (YYYY-MM-DD) in Israel for an instant. */
export function israelYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Yesterday in Israel — the default AND the max of the manual-run date picker (no min). */
export const yesterdayIL = (now: Date = new Date()): string => addDays(israelYmd(now), -1);

/** 0 = Sunday … 6 = Saturday, in Israel. */
export function israelWeekday(now: Date = new Date()): number {
  const [y, m, d] = israelYmd(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** ISO-8601 week key of the Israeli calendar day, e.g. "2026-W40". */
export function isoWeekKey(now: Date = new Date()): string {
  const [y, m, d] = israelYmd(now).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);              // the Thursday of this ISO week
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const wk = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

/** "29.09" for a YYYY-MM-DD. */
export const dmIL = (ymd: string): string => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;

/** "29.09 07:02" for an instant, in Israel. */
export function dmHmIL(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

// ── Sunday auto-check (once per ISO week) ────────────────────────────────────
export const SUNDAY_KEY = 'sigma_readings_sunday_v1';

export function shouldSundayCheck(o: {
  now: Date; isRoster: boolean; hasEmsToken: boolean; lastWeekKey: string | null;
}): boolean {
  return o.isRoster && o.hasEmsToken && israelWeekday(o.now) === 0 && o.lastWeekKey !== isoWeekKey(o.now);
}

// ── progress line ────────────────────────────────────────────────────────────
export function progressText(progress: Progress | null | undefined): string {
  const names = Object.keys(progress || {});
  if (!names.length) return 'מתחיל…';
  const parts = names.map(n => {
    const s = progress![n];
    if (s.state === 'ok') return `✓ ${n}${s.count != null ? ' ' + s.count : ''}`;
    if (s.state === 'failed') return `✗ ${n}`;
    return `⏳ ${n}…`;
  });
  const pending = names.some(n => progress![n].state === 'pending' || progress![n].state === 'running');
  if (!pending) parts.push('בונה קבצים');
  return parts.join(' · ');
}

// ── runs ─────────────────────────────────────────────────────────────────────
const newer = (a: ReadingRun, b: ReadingRun) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0);
export const isDone = (r: ReadingRun) => r.status === 'ok' || r.status === 'partial';

/** The run "הריצה האחרונה" shows: newest ok/partial by day, then by start time. */
export function latestRun(runs: ReadingRun[]): ReadingRun | null {
  const done = runs.filter(isDone).sort((a, b) =>
    a.reading_date < b.reading_date ? 1 : a.reading_date > b.reading_date ? -1 : newer(a, b));
  return done[0] ?? null;
}

export type HistoryRow =
  | { kind: 'gap'; date: string }
  | { kind: 'run'; date: string; run: ReadingRun; needsUpload: boolean };

/**
 * One row per day for the last 35 days ending YESTERDAY, newest first. A day's row is its best
 * run: the newest ok/partial, else the newest failed/running (so the Hebrew error shows), else a
 * gap ("לא נמשך" + a [משוך] button). `needsUpload` = pulled but not marked uploaded to EMS.
 */
export function historyRows(runs: ReadingRun[], now: Date = new Date(), days = HISTORY_DAYS): HistoryRow[] {
  const byDate = new Map<string, ReadingRun[]>();
  for (const r of runs) {
    const l = byDate.get(r.reading_date) ?? [];
    l.push(r);
    byDate.set(r.reading_date, l);
  }
  const last = yesterdayIL(now);
  const rows: HistoryRow[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(last, -i);
    const list = (byDate.get(date) ?? []).slice().sort(newer);
    const run = list.find(isDone) ?? list[0];
    rows.push(run ? { kind: 'run', date, run, needsUpload: isDone(run) && !run.uploaded } : { kind: 'gap', date });
  }
  return rows;
}

// ── reasons summary ──────────────────────────────────────────────────────────
export interface ReasonGroup { kind: string; reason: string; count: number }

export function reasonGroups(run: Pick<ReadingRun, 'summary'>): ReasonGroup[] {
  return (run.summary || []).map(([kind, reason, count]) => ({ kind, reason, count: Number(count) || 0 }));
}

/** The meters behind one reason — exceptions rows are [מקור, מונה באתר, מספר מונה בקובץ, זמן קריאה, סהכ, סוג, סיבה]. */
export function metersForReason(exceptions: unknown[][] | null | undefined, g: { kind: string; reason: string }): unknown[][] {
  return (exceptions || []).filter(r => r[5] === g.kind && r[6] === g.reason);
}

/** A run that finished partial names the source(s) that failed. */
export function failedSources(run: Pick<ReadingRun, 'progress'>): Array<{ name: string; message: string }> {
  return Object.entries(run.progress || {})
    .filter(([, s]) => s.state === 'failed')
    .map(([name, s]) => ({ name, message: s.error?.message || 'המקור לא זמין' }));
}

// ── badge on ⋯ עוד ───────────────────────────────────────────────────────────
/** How many active sites have a latest cron run that is partial/failed and not yet seen by `user`. */
export function badgeCount(latestCronRuns: ReadingRun[], user: string): number {
  return latestCronRuns.filter(r =>
    r.trigger === 'cron' && (r.status === 'partial' || r.status === 'failed') && !(r.seen_by || []).includes(user)).length;
}

/** The newest cron run per site, from a flat list. */
export function latestCronPerSite(runs: ReadingRun[]): ReadingRun[] {
  const best = new Map<string, ReadingRun>();
  for (const r of runs) {
    if (r.trigger !== 'cron') continue;
    const cur = best.get(r.site_id);
    if (!cur || r.reading_date > cur.reading_date || (r.reading_date === cur.reading_date && r.started_at > cur.started_at)) best.set(r.site_id, r);
  }
  return [...best.values()];
}

// ── active runs (watcher) ────────────────────────────────────────────────────
export const ACTIVE_KEY = 'sigma_readings_active_v1';
export interface ActiveRun { id: string; kibbutz: string; manual: boolean; startedAt: number }
/** A run the server would already have marked stuck (10 min) — never watched forever. */
export const ACTIVE_MAX_AGE_MS = 15 * 60_000;

export function parseActive(raw: string | null, now = Date.now()): ActiveRun[] {
  try {
    const a = JSON.parse(raw || '[]');
    return (Array.isArray(a) ? a : []).filter((x: any) =>
      x && typeof x.id === 'string' && typeof x.startedAt === 'number' && now - x.startedAt < ACTIVE_MAX_AGE_MS);
  } catch { return []; }
}

export const addActive = (list: ActiveRun[], r: ActiveRun): ActiveRun[] => [...list.filter(x => x.id !== r.id), r];
export const removeActive = (list: ActiveRun[], id: string): ActiveRun[] => list.filter(x => x.id !== id);

export type WatchVerdict = 'wait' | 'ok' | 'partial' | 'failed';
export const watchVerdict = (r: Pick<ReadingRun, 'status'> | null): WatchVerdict =>
  !r || r.status === 'running' ? 'wait' : r.status;

/** Toast copy for a finished run. `kibbutz` is the site name. */
export function finishToast(v: Exclude<WatchVerdict, 'wait'>, kibbutz: string, run: Pick<ReadingRun, 'error' | 'progress'>): { text: string; error: boolean } {
  if (v === 'ok') return { text: `הקבצים של ${kibbutz} מוכנים`, error: false };
  if (v === 'partial') {
    const f = failedSources(run)[0];
    return { text: `משיכת ${kibbutz} הושלמה חלקית${f ? ': ' + f.name + ' — ' + f.message : ''}`, error: true };
  }
  return { text: `משיכת ${kibbutz} נכשלה${run.error ? ': ' + run.error : ''}`, error: true };
}
