// Pure logic behind the on-card EMS-tasks widget (spec §4 Part C — EmsTasks.tsx). Kept
// import-free of the bridge/legacy bundle so it is testable in plain vitest (task-3-brief).
//
// EMS_STATUS_LABEL / EMS_PRIORITY_LABEL / EMS_CLOSED mirror js/src/14-calendar.js's
// EMS_STATUS / EMS_PRIORITY / EMS_CLOSED verbatim (exact backend enum values) — that file
// stays the source of truth for the legacy surfaces (task modal, calendar); this is the
// TS-side copy for the React card. Keep both in sync if EMS adds a status or priority.
export const EMS_STATUS_LABEL: Record<string, string> = {
  new: '🆕 חדשה', in_progress: '🔄 בטיפול', waiting_for_client: '⏳ ממתין ללקוח', on_hold: '⏸️ מוקפא',
  done: '✅ בוצע', rejected: '🚫 נדחה', not_relevant: '➖ לא רלוונטי', cancelled: '❌ בוטל',
};
export const EMS_PRIORITY_LABEL: Record<string, string> = {
  low: '🔵 נמוכה', normal: '🟡 רגילה', high: '🟠 גבוהה', urgent: '🔴 דחופה',
};
export const EMS_CLOSED = ['done', 'rejected', 'not_relevant', 'cancelled'];

export interface CardEmsTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  type?: string;
  site?: { id: string; name: string } | null;
  expectedCompletionDate?: string;
  description?: string;
  assignee?: { id: string; firstName: string; lastName?: string } | null;
  linkCount?: number;
}

/** Only the shared cache's OPEN tasks ever reach a card, but a closed one is never overdue. */
export function isOverdue(task: CardEmsTask, now: Date = new Date()): boolean {
  if (!task.expectedCompletionDate) return false;
  if (EMS_CLOSED.includes(task.status)) return false;
  const due = new Date(task.expectedCompletionDate);
  return !Number.isNaN(due.getTime()) && due < now;
}

/** "📅 d.m" — no year, spec §4's compact due-date chip. */
export function dueText(task: CardEmsTask): string {
  if (!task.expectedCompletionDate) return '';
  const d = new Date(task.expectedCompletionDate);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}.${d.getMonth() + 1}`;
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
    priorityLabel: EMS_PRIORITY_LABEL[task.priority || ''] || task.priority || '',
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
