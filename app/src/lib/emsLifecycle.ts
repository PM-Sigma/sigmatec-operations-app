// EMS task lifecycle statistics — pure builders over `ems_task_state` rows (H5).
// Formulas: docs/superpowers/specs/2026-09-29-ems-task-lifecycle-design.md section 6, with
// עידן's decisions of 29.9 (section 11). Asia/Jerusalem calendar; every stat reports its own
// denominator `n` so a thin sample is visible instead of silently averaged.
import { CLOSED_STATUSES, ON_TIME_STATUSES } from '@/lib/emsLifecycleDiff';

export interface StateRow {
  task_id: string; site_name: string | null; status: string | null; due_date: string | null;
  opened_at: string | null; closed_at: string | null; closed_src: string | null;
  assigned_at: string | null; assigned_src: string | null; gone_at: string | null;
}

const TZ = 'Asia/Jerusalem';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD of an instant in Israel time. */
export function jerusalemDay(iso: string): string { return dayFmt.format(new Date(iso)); }
/** YYYY-MM of an instant in Israel time. */
export function jerusalemMonth(iso: string): string { return jerusalemDay(iso).slice(0, 7); }

const isClosedStatus = (s: string | null) => !!s && (CLOSED_STATUSES as readonly string[]).includes(s);
/** Open now = never closed, not gone, status not a closed one. */
export const isOpenRow = (r: StateRow): boolean => !r.closed_at && !r.gone_at && !isClosedStatus(r.status);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface TimeToAssign { n: number; medianHours: number | null; avgHours: number | null }
/** assigned_at - opened_at over rows whose assignment we actually observed (assigned_src derived). Clamped at 0. */
export function timeToAssign(rows: StateRow[]): TimeToAssign {
  const hrs: number[] = [];
  for (const r of rows) {
    if (r.assigned_src !== 'derived' || !r.assigned_at || !r.opened_at) continue;
    const d = Date.parse(r.assigned_at) - Date.parse(r.opened_at);
    if (Number.isNaN(d)) continue;
    hrs.push(Math.max(0, d) / 3600_000);
  }
  return { n: hrs.length, medianHours: median(hrs), avgHours: avg(hrs) };
}

export interface OnTime { n: number; onTime: number; pct: number | null }
/** Closed (done or cancelled) tasks with a due date: closed on/before it (Israel calendar day). */
export function onTimeClose(rows: StateRow[]): OnTime {
  let n = 0, ok = 0;
  for (const r of rows) {
    if (!r.closed_at || !r.due_date || !(ON_TIME_STATUSES as readonly string[]).includes(r.status || '')) continue;
    n++;
    if (jerusalemDay(r.closed_at) <= r.due_date) ok++;
  }
  return { n, onTime: ok, pct: n ? Math.round((ok / n) * 1000) / 10 : null };
}

export interface MonthCell { site: string; month: string; count: number }
const NO_SITE = 'ללא אתר';
/** Tasks OPENED per kibbutz per month (opened_at only — never first_seen). */
export function openedPerKibbutzMonth(rows: StateRow[]): MonthCell[] {
  const m = new Map<string, MonthCell>();
  for (const r of rows) {
    if (!r.opened_at) continue;
    const month = jerusalemMonth(r.opened_at);
    const site = r.site_name || NO_SITE;
    const k = site + '|' + month;
    const c = m.get(k) || { site, month, count: 0 };
    c.count++; m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.month.localeCompare(a.month) || b.count - a.count || a.site.localeCompare(b.site, 'he'));
}

export interface ClosedMonth { month: string; count: number }
/** Tasks closed per month, by closed_at (includes tasks that disappeared from EMS: closed_src 'disappeared'). */
export function closedPerMonth(rows: StateRow[]): ClosedMonth[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.closed_at) continue;
    const k = jerusalemMonth(r.closed_at);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month));
}

export const AGE_BUCKETS = [
  { key: 'd0_7', label: '0–7 ימים', max: 7 },
  { key: 'd8_30', label: '8–30 ימים', max: 30 },
  { key: 'd31_90', label: '31–90 ימים', max: 90 },
  { key: 'd90p', label: 'מעל 90 ימים', max: Infinity },
] as const;
export interface BacklogAge { open: number; unknownAge: number; buckets: Array<{ key: string; label: string; count: number }>; medianDays: number | null }
/** Age of the open backlog (now - opened_at, whole days). Tasks with no opened_at are counted, not aged. */
export function backlogAge(rows: StateRow[], nowMs: number): BacklogAge {
  const open = rows.filter(isOpenRow);
  const counts = AGE_BUCKETS.map(b => ({ key: b.key as string, label: b.label as string, count: 0 }));
  const ages: number[] = [];
  let unknownAge = 0;
  for (const r of open) {
    if (!r.opened_at) { unknownAge++; continue; }
    const days = Math.max(0, Math.floor((nowMs - Date.parse(r.opened_at)) / 86400_000));
    ages.push(days);
    const i = AGE_BUCKETS.findIndex(b => days <= b.max);
    counts[i].count++;
  }
  return { open: open.length, unknownAge, buckets: counts, medianDays: median(ages) };
}

export interface LifecycleStats {
  total: number;
  timeToAssign: TimeToAssign;
  onTime: OnTime;
  backlog: BacklogAge;
  opened: MonthCell[];
  closed: ClosedMonth[];
}
export function buildLifecycleStats(rows: StateRow[], nowMs: number): LifecycleStats {
  return {
    total: rows.length,
    timeToAssign: timeToAssign(rows),
    onTime: onTimeClose(rows),
    backlog: backlogAge(rows, nowMs),
    opened: openedPerKibbutzMonth(rows),
    closed: closedPerMonth(rows),
  };
}

/** "3.5 שעות" / "2.1 ימים" — the unit follows the size so a phone tile stays short. */
export function formatDuration(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} דק׳`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} שע׳`;
  return `${Math.round((hours / 24) * 10) / 10} ימים`;
}
/** 2026-09 -> 09/2026 */
export function monthLabel(ym: string): string { const [y, m] = ym.split('-'); return `${m}/${y}`; }

/** The audience: עידן and עמיחי, never the viewer (mirrors js/src/00-bridge.js canShowPage('emsstats') and the RLS policy). */
export function canSeeEmsStats(name: string, isViewer: boolean): boolean {
  return !isViewer && (name === 'עידן' || name === 'עמיחי');
}
