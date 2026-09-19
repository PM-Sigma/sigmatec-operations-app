// Pure logic behind the on-card EMS-tasks widget (spec §4 Part C — EmsTasks.tsx). The
// date/sort/meta functions stay import-free of the bridge so they're testable in plain vitest
// (task-3-brief); label lookup takes the LIVE legacy maps via `sigma.emsLabels()` when
// available and falls back to the mirror below otherwise (fix round 1 — a hand-mirror alone
// could silently drift from js/src/14-calendar.js's real EMS_STATUS/EMS_PRIORITY).
import { sigma } from '@/bridge';
import type { EmsTask } from '@/bridge';

// Mirrors js/src/14-calendar.js's EMS_STATUS / EMS_PRIORITY verbatim (exact backend enum
// values) — used only when the live bridge maps aren't reachable (no `sigma` global, e.g. this
// file under plain vitest with nothing mocked). `test-ems-labels.mjs` asserts this stays
// byte-identical to the real maps, so a drift is caught immediately, not silently rendered.
export const EMS_STATUS_LABEL: Record<string, string> = {
  new: '🆕 חדשה', in_progress: '🔄 בטיפול', waiting_for_client: '⏳ ממתין ללקוח', on_hold: '⏸️ מוקפא',
  done: '✅ בוצע', rejected: '🚫 נדחה', not_relevant: '➖ לא רלוונטי', cancelled: '❌ בוטל',
};
export const EMS_PRIORITY_LABEL: Record<string, string> = {
  low: '🔵 נמוכה', normal: '🟡 רגילה', high: '🟠 גבוהה', urgent: '🔴 דחופה',
};
export const EMS_CLOSED = ['done', 'rejected', 'not_relevant', 'cancelled'];

function liveLabels(): { status: Record<string, string>; priority: Record<string, string> } | null {
  try {
    const l = sigma?.emsLabels?.();
    return l && l.status && l.priority ? l : null;
  } catch { return null; }
}

/** Status badge text — live `sigma.emsLabels().status` first, the mirror as fallback. */
export function statusLabel(status: string): string {
  const live = liveLabels();
  return (live && live.status[status]) || EMS_STATUS_LABEL[status] || status;
}

/** Priority chip text — live `sigma.emsLabels().priority` first, the mirror as fallback. */
export function priorityLabel(priority: string): string {
  const live = liveLabels();
  return (live && live.priority[priority]) || EMS_PRIORITY_LABEL[priority] || priority;
}

/**
 * The shape the card widget reads. It was a byte-for-byte second copy of `EmsTask` in
 * app/src/bridge.ts (F14 ⑨) — two declarations of one wire format, free to drift the next
 * time EMS adds a field. The NAME stays, because a dozen call sites read well with it.
 */
export type CardEmsTask = EmsTask;

/**
 * The viewer's local CALENDAR DAY a due-date value names (fix round 1 — date timezone slide).
 * A bare `YYYY-MM-DD` (all EMS due-dates so far) is read LITERALLY: it names a day, not an
 * instant, so `new Date('2026-09-18')` (parsed as UTC midnight) must never be compared against
 * a local `now` — in Israel (UTC+2/3) that instant is already 02:00–03:00 local, so a task due
 * "today" would flip to overdue hours before the local day is over. Anything WITH a time/zone
 * component (a real EMS timestamp, e.g. `2026-09-17T21:00:00.000Z`) is a genuine instant and is
 * converted to the viewer's local day the normal way (`Date` getters are local by default).
 */
function localDayOf(dateStr: string): { y: number; m: number; d: number } | null {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (bare) return { y: +bare[1], m: +bare[2] - 1, d: +bare[3] };
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

/** Only the shared cache's OPEN tasks ever reach a card, but a closed one is never overdue.
 *  Day granularity, not time — due TODAY is never overdue, whatever the hour. */
export function isOverdue(task: CardEmsTask, now: Date = new Date()): boolean {
  if (!task.expectedCompletionDate) return false;
  if (EMS_CLOSED.includes(task.status)) return false;
  const day = localDayOf(task.expectedCompletionDate);
  if (!day) return false;
  const due = new Date(day.y, day.m, day.d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due < today;
}

/** "📅 d.m" — no year, spec §4's compact due-date chip. */
export function dueText(task: CardEmsTask): string {
  const day = localDayOf(task.expectedCompletionDate || '');
  if (!day) return '';
  return `${day.d}.${day.m + 1}`;
}

export interface TaskMeta {
  assigneeFirstName: string | null;
  due: string;
  overdue: boolean;
  priorityLabel: string;
}

/** The meta-chip row: 👤 assignee first name (omitted entirely when null) · 📅/⏰ due · priority. */
export function taskMeta(task: CardEmsTask, now: Date = new Date()): TaskMeta {
  return {
    assigneeFirstName: task.assignee?.firstName || null,
    due: dueText(task),
    overdue: isOverdue(task, now),
    priorityLabel: priorityLabel(task.priority || ''),
  };
}

/**
 * Mine-first ordering (spec §4 / §5.1): tasks assigned to `me` bubble to the top; everything
 * else keeps its original (cache) order. A stable sort, not a re-sort by any other field —
 * the cache's own order (as EMS returned it) is preserved within each group.
 */
export function sortTasksForCard(tasks: CardEmsTask[], me: string): CardEmsTask[] {
  const mine = (t: CardEmsTask) => !!me && t.assignee?.firstName === me;
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const rank = (x: typeof a) => (mine(x.t) ? 0 : 1);
      const ra = rank(a), rb = rank(b);
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map(x => x.t);
}

/**
 * "עוד"/"פחות" per-card clamp state (mobile description toggle, fix round 1: extracted so the
 * flip itself is a pure, jsdom-free unit — EmsTasks.tsx only owns the actual React state, kept
 * in memory, never persisted).
 */
export function toggleClamp(state: Record<string, boolean>, taskId: string): Record<string, boolean> {
  return { ...state, [taskId]: !state[taskId] };
}

/**
 * Tasks with nobody on them (§7k #6 — "EMS tasks without an assignee are tracked"). The card
 * shows a "⚠️ ללא אחראי" badge on the row and admins get the count in the section's chip row;
 * the gaps view, the Sunday agenda and עמיחי's one-pager read the same rule later.
 * An assignee with no name at all counts as unassigned — an empty chip is not an owner.
 */
export function isUnassigned(task: CardEmsTask): boolean {
  const a = task.assignee;
  return !a || !String(a.firstName ?? '').trim();
}

/** How many of these tasks have no owner. */
export function unassignedCount(tasks: CardEmsTask[] | null | undefined): number {
  return (tasks || []).filter(isUnassigned).length;
}
