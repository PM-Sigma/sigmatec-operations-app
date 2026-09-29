// EMS task lifecycle — the pure model of db/ems_task_lifecycle.sql `ems_apply_snapshot_core`.
//
// The differ that WRITES lives in the database (one copy, not one per writer). This file is the
// executable specification of it: same rules, same event kinds, same idempotency, so the golden
// tests in emsLifecycleDiff.test.ts pin the behaviour and a change to one side is a visible diff
// on the other. Decisions (עידן 29.9): "assigned" = assignee AND due date; closed statuses are
// done / rejected / not_relevant / cancelled; events are kept forever.

export const CLOSED_STATUSES = ['done', 'rejected', 'not_relevant', 'cancelled'] as const;
/** The statuses whose on-time close % counts (עידן 29.9): done + cancelled. */
export const ON_TIME_STATUSES = ['done', 'cancelled'] as const;

export type AssignedSrc = 'pending' | 'derived' | 'unknown';
export type ClosedSrc = 'ems' | 'derived' | 'disappeared' | 'backfill' | null;
export type EventKind =
  | 'opened' | 'first_seen' | 'assigned' | 'reassigned' | 'unassigned'
  | 'due_set' | 'due_changed' | 'status_changed' | 'closed' | 'reopened' | 'disappeared';

export interface RawTask {
  id?: unknown; status?: unknown; type?: unknown; priority?: unknown;
  site?: { id?: unknown; name?: unknown } | null;
  assignee?: { id?: unknown; firstName?: unknown; lastName?: unknown } | null;
  expectedCompletionDate?: unknown; createdAt?: unknown; updatedAt?: unknown;
}

export interface TaskState {
  task_id: string; site_id: string | null; site_name: string | null; type: string | null; priority: string | null;
  status: string | null; assignee_id: string | null; assignee_name: string | null; due_date: string | null;
  opened_at: string | null; opened_src: 'ems' | 'unknown'; last_updated_at: string | null;
  closed_at: string | null; closed_src: ClosedSrc;
  first_seen_at: string; assigned_at: string | null; assigned_src: AssignedSrc;
  last_seen_at: string; gone_at: string | null;
}
export interface TaskEvent {
  task_id: string; kind: EventKind; at: string; prev: string | null; next: string | null; src: string; sync_key: string;
}
export interface LifecycleStore { state: Map<string, TaskState>; events: TaskEvent[] }

export const emptyStore = (): LifecycleStore => ({ state: new Map(), events: [] });

const isClosed = (s: string | null): boolean => !!s && (CLOSED_STATUSES as readonly string[]).includes(s);
const str = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v);
  return s === '' ? null : s.slice(0, max);
};
/** Mirrors _ems_ts: malformed -> null, valid -> ISO string (UTC). */
export function parseTs(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** Mirrors _ems_d: first 10 chars as a calendar date, malformed -> null. */
export function parseDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.slice(0, 10));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
}

export interface ShapeCheck { ok: boolean; reason?: string }
/** Mirrors the wrapper `ems_apply_snapshot` validation (the SQL raises; here we report). */
export function validateSnapshotShape(tasks: unknown, full: boolean): ShapeCheck {
  if (!Array.isArray(tasks)) return { ok: false, reason: 'p_tasks must be a json array' };
  if (tasks.length > 5000) return { ok: false, reason: 'snapshot too large' };
  if (full && tasks.length === 0) return { ok: false, reason: 'a full snapshot cannot be empty' };
  return { ok: true };
}

const HOUR = 3600_000;

/**
 * Apply one snapshot. `at` is the sync instant (ISO). `full` = the crawl reached its total.
 * Returns the number of change-events written (same as the SQL function's return value).
 */
export function applySnapshot(store: LifecycleStore, tasks: RawTask[], at: string, full: boolean, src: 'derived' | 'backfill' = 'derived'): number {
  let n = 0;
  const seen = new Set<string>();
  const addEvent = (e: TaskEvent): boolean => {
    if (store.events.some(x => x.task_id === e.task_id && x.kind === e.kind && x.sync_key === e.sync_key)) return false;
    store.events.push(e);
    return true;
  };
  for (const t of tasks) {
    if (!t || typeof t !== 'object') continue;
    const id = typeof t.id === 'string' ? t.id : '';
    if (!id || id.length > 64) continue;
    seen.add(id);
    const status = str(t.status, 40);
    const asg = str(t.assignee?.id, 64);
    const name = str([t.assignee?.firstName ?? '', t.assignee?.lastName ?? ''].join(' ').trim(), 120);
    const due = parseDate(t.expectedCompletionDate);
    const opened = parseTs(t.createdAt);
    const upd = parseTs(t.updatedAt);
    const both = asg !== null && due !== null;
    const fresh = opened !== null && Date.parse(opened) > Date.parse(at) - HOUR;
    const closedNow = isClosed(status);
    const closedSrcNew: ClosedSrc = src === 'backfill' ? 'backfill' : upd === null ? 'derived' : 'ems';
    const s = store.state.get(id);

    if (!s) {
      store.state.set(id, {
        task_id: id, site_id: str(t.site?.id, 64), site_name: str(t.site?.name, 120), type: str(t.type, 60), priority: str(t.priority, 40),
        status, assignee_id: asg, assignee_name: name, due_date: due,
        opened_at: opened, opened_src: opened === null ? 'unknown' : 'ems', last_updated_at: upd,
        closed_at: closedNow ? (upd ?? at) : null, closed_src: closedNow ? closedSrcNew : null,
        first_seen_at: at, assigned_at: both && fresh ? at : null,
        assigned_src: !both ? 'pending' : fresh ? 'derived' : 'unknown',
        last_seen_at: at, gone_at: null,
      });
      addEvent({ task_id: id, kind: 'first_seen', at, prev: null, next: status, src, sync_key: 'first_seen' });
      if (opened !== null) addEvent({ task_id: id, kind: 'opened', at: opened, prev: null, next: status, src: 'ems', sync_key: 'opened' });
      if (closedNow) addEvent({ task_id: id, kind: 'closed', at: upd ?? at, prev: null, next: status, src: src === 'backfill' ? 'backfill' : 'derived', sync_key: 'closed_first' });
      n++;
      continue;
    }

    if (s.status !== status) {
      const kind: EventKind = closedNow ? 'closed' : isClosed(s.status) ? 'reopened' : 'status_changed';
      if (addEvent({ task_id: id, kind, at, prev: s.status, next: status, src, sync_key: `st:${status}:${at}` })) n++;
    }
    if (s.assignee_id !== asg && (asg === null || s.assignee_id !== null)) {
      if (addEvent({ task_id: id, kind: asg === null ? 'unassigned' : 'reassigned', at, prev: s.assignee_id, next: asg, src, sync_key: `asg:${asg ?? ''}:${at}` })) n++;
    }
    if (s.due_date !== due) {
      if (addEvent({ task_id: id, kind: s.due_date === null ? 'due_set' : 'due_changed', at, prev: s.due_date, next: due, src, sync_key: `due:${due ?? ''}:${at}` })) n++;
    }
    const becomesAssigned = s.assigned_src === 'pending' && both;
    if (becomesAssigned) {
      if (addEvent({ task_id: id, kind: 'assigned', at, prev: null, next: asg, src, sync_key: 'assigned' })) n++;
    }
    const wasDisappeared = s.closed_src === 'disappeared';
    const next: TaskState = { ...s };
    next.status = status; next.assignee_id = asg; next.assignee_name = name; next.due_date = due;
    next.site_id = str(t.site?.id, 64); next.site_name = str(t.site?.name, 120); next.type = str(t.type, 60); next.priority = str(t.priority, 40);
    next.opened_at = s.opened_at ?? opened;
    next.opened_src = s.opened_at === null && opened !== null ? 'ems' : s.opened_src;
    next.last_updated_at = upd ?? s.last_updated_at;
    if (becomesAssigned) { next.assigned_at = at; next.assigned_src = 'derived'; }
    if (closedNow) {
      if (s.closed_at === null || wasDisappeared) { next.closed_at = upd ?? at; next.closed_src = closedSrcNew; }
    } else if (isClosed(s.status) || wasDisappeared) {
      next.closed_at = null; next.closed_src = null;
    }
    next.last_seen_at = at; next.gone_at = null;
    store.state.set(id, next);
  }

  if (full) {
    for (const s of store.state.values()) {
      if (s.gone_at === null && Date.parse(s.last_seen_at) < Date.parse(at) && !isClosed(s.status) && !seen.has(s.task_id)) {
        s.gone_at = at; s.closed_at = at; s.closed_src = 'disappeared';
        if (addEvent({ task_id: s.task_id, kind: 'disappeared', at, prev: s.status, next: null, src, sync_key: `gone:${at}` })) n++;
      }
    }
  }
  return n;
}
