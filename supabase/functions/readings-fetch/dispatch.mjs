// readings-fetch/dispatch.mjs — PURE (Node tests + Deno import the same file).
// Manual CityMind pull: a user taps "משוך" → mode `dispatch` → a 'running' row + a GitHub workflow_dispatch of
// .github/workflows/citymind-arad.yml → the runner calls `ingest`, which FILLS that same row (no second run).
// Spec: docs/superpowers/specs/2026-10-26-citymind-manual-run-design.md
import { badRunDate, retentionCutoff, STUCK_MS } from './helpers.js';

export const WORKFLOW_FILE = 'citymind-arad.yml';
/** A manual CityMind run waits for a GitHub runner (queue + Firefox + login + report): allow far longer than STUCK_MS. */
export const DISPATCH_STALE_MS = 25 * 60 * 1000;
export const DISPATCH_STALE_TEXT = 'המשיכה לא הסתיימה — נסה שוב';
/** The repo that owns the workflow. NOT GH_REPO (that is the issues repo the `github` function reads). */
export const DEFAULT_ACTIONS_REPO = 'PM-Sigma/sigmatec-operations-app';
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Marker of a dispatched (runner-filled) row: its progress has the CityMind source. */
export const isDispatchRow = (run, source = 'CityMind') => !!run && run.status === 'running' && !!run.progress && Object.hasOwn(run.progress, source);

/** age (ms) of a running row → null if still fine, else the Hebrew failure text. */
export function staleText(run, nowMs = Date.now(), source = 'CityMind') {
  if (!run || run.status !== 'running') return null;
  const age = nowMs - Date.parse(run.started_at);
  if (isDispatchRow(run, source)) return age > DISPATCH_STALE_MS ? DISPATCH_STALE_TEXT : null;
  return age > STUCK_MS ? 'הריצה נתקעה' : null;
}

/**
 * Decide a `dispatch` request. `runs` = this site+date's runs (any status). Returns
 *   {action:'reject', status, error, message} | {action:'existing', run_id} | {action:'start'}
 */
export function planDispatch({ site, date, runs, now = new Date() }) {
  if (!site || (site.rules || {}).source !== 'citymind') return { action: 'reject', status: 400, error: 'NOT_CITYMIND', message: 'האתר הזה לא נמשך מ-CityMind' };
  if (site.active === false) return { action: 'reject', status: 400, error: 'INACTIVE', message: 'האתר לא פעיל' };
  const bad = badRunDate(date, now);
  if (bad) return { action: 'reject', status: 400, error: 'BAD_DATE', message: bad };
  const days = site.retention_days || 35;
  if (date < retentionCutoff(now, days)) return { action: 'reject', status: 400, error: 'TOO_OLD', message: `אפשר למשוך עד ${days} ימים אחורה` };
  const nowMs = now.getTime();
  const live = (runs || []).filter((r) => r.status === 'ok' || (r.status === 'running' && !staleText(r, nowMs)));
  live.sort((a, b) => (a.status === 'ok' ? 0 : 1) - (b.status === 'ok' ? 0 : 1));
  if (live.length) return { action: 'existing', run_id: live[0].id, status: live[0].status };
  return { action: 'start' };
}

/** The GitHub API call (no token in it — the caller adds the Authorization header). */
export function dispatchRequest(repo, kibbutz, date) {
  if (!REPO.test(String(repo || ''))) throw new Error('bad repo');
  return {
    url: `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    body: { ref: 'main', inputs: { kibbutz: String(kibbutz), date: String(date), dry_run: 'false' } },
  };
}

/** GitHub status → a Hebrew error for the user (never includes the token or the response body). */
export function mapDispatchError(status) {
  if (status === 401 || status === 403) return { status: 502, error: 'GH_FORBIDDEN', message: 'אין הרשאה להפעיל את המשיכה (לטוקן של GitHub חסרה הרשאת Actions: write) — לפנות לעידן' };
  if (status === 404) return { status: 502, error: 'GH_NOT_FOUND', message: 'תהליך המשיכה לא נמצא ב-GitHub — לפנות לעידן' };
  if (status === 422) return { status: 502, error: 'GH_REJECTED', message: 'GitHub דחה את הבקשה — לפנות לעידן' };
  return { status: 502, error: 'GH_DOWN', message: 'GitHub לא זמין כרגע — נסה שוב' };
}

/**
 * Ingest vs the day's ok/running rows (status in ('ok','running')):
 *   existing → keep the once-per-day guard (a day with an ok run, or a running cron/other run, is not redone)
 *   fill     → a 'running' row made by `dispatch` (trigger manual, CityMind progress): the runner fills THIS row
 *   new      → nothing there: insert
 */
export function ingestPlan(have, source = 'CityMind') {
  const rows = have || [];
  if (rows.some((r) => r.status === 'ok')) return { action: 'existing', run_id: rows.find((r) => r.status === 'ok').id };
  const fill = rows.find((r) => r.status === 'running' && r.trigger === 'manual' && isDispatchRow(r, source));
  if (fill) return { action: 'fill', run_id: fill.id };
  if (rows.length) return { action: 'existing', run_id: rows[0].id };
  return { action: 'new' };
}
