// 🔒 internal_tasks — pure decisions (Task 26, company-process spec §2; the §8b "no due dates"
// ruling was reversed by עידן on 22.9 — an internal task now carries a due date (may stay
// empty), a priority and a kind, the same parts an EMS task has).
//
// A list with an owner and a done flag, visible to every employee, never to the kibbutz. `kibbutz = null` means the whole company (that half is
// already read by app/src/lib/taskList.ts's `companyItems`; this module is the per-kibbutz
// card section + "היום שלי", and the one write path both of them share).
//
// PURE — no DOM, no network, no React — same shape as taskList.ts / meetingNotes.ts, so every
// decision here is covered by vitest goldens instead of by clicking through the app.
import { taskFromBullet } from './meetingNotes';

/** `db/internal_tasks.sql` + `db/internal_tasks_fields.sql` (22.9). A due date is a fact on
 *  the row; nothing here ever pushes a notification about it. */
export interface InternalTaskRow {
  id: string;
  title: string;
  owner?: string | null;
  /** null = the whole company. */
  kibbutz?: string | null;
  done: boolean;
  created_by?: string | null;
  created_at?: string | null;
  /** ISO date, or null — "may stay empty" (עידן 22.9). */
  due_date?: string | null;
  priority?: string | null;
  kind?: string | null;
}

/** The three optional parts the ➕ form adds (22.9). */
export interface InternalTaskExtra { due_date?: string | null; priority?: string | null; kind?: string | null }

export const INTERNAL_PRIORITIES = [
  { value: 'low', label: '🔵 נמוכה' }, { value: 'normal', label: '🟡 רגילה' },
  { value: 'high', label: '🟠 גבוהה' }, { value: 'urgent', label: '🔴 דחופה' },
] as const;
export const INTERNAL_KINDS = ['מעקב', 'תיאום', 'טכני', 'מסמכים', 'אחר'] as const;

export function priorityLabelOf(p: string | null | undefined): string {
  return INTERNAL_PRIORITIES.find(x => x.value === p)?.label || String(p || '');
}

/** "d.m" for the chip; '' when there is no date. */
export function dueLabel(row: Pick<InternalTaskRow, 'due_date'>): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(row.due_date || ''));
  return m ? `${Number(m[3])}.${Number(m[2])}` : '';
}

/** Day granularity, local: due today is not late. */
export function isOverdueInternal(row: Pick<InternalTaskRow, 'due_date' | 'done'>, now: Date = new Date()): boolean {
  if (row.done) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(row.due_date || ''));
  if (!m) return false;
  const due = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due < today;
}

/** The card section's rows: this kibbutz's own, open, oldest first. */
export function openFor(rows: InternalTaskRow[] | null | undefined, kibbutz: string): InternalTaskRow[] {
  return (rows || [])
    .filter(r => r && !r.done && r.kibbutz === kibbutz)
    .slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

/**
 * "היום שלי" — everything this person owns and has not finished, company-wide AND at every
 * kibbutz (the `kibbutz = null` rows are included, same rule §2 gives `openFor`'s sibling).
 */
export function myOpen(rows: InternalTaskRow[] | null | undefined, person: string): InternalTaskRow[] {
  const me = String(person || '').trim();
  if (!me) return [];
  return (rows || [])
    .filter(r => r && !r.done && String(r.owner || '').trim() === me)
    .slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

/** The chip badge next to "🔒" — 0 hides the badge entirely (the card renders nothing at 0). */
export function countBadge(rows: InternalTaskRow[] | null | undefined, kibbutz: string): number {
  return openFor(rows, kibbutz).length;
}

/** ✓ toggle — pure, the caller PATCHes `{ done }` and emits `internal-tasks-changed`. */
export function toggleDone(row: InternalTaskRow): InternalTaskRow {
  return { ...row, done: !row.done };
}

/**
 * ⬆ הפוך למשימת EMS — the same `taskFromBullet`-shaped payload the meeting-notes 📋 line
 * builds, so `sigma.createTask` sees one shape from every caller. The internal row's own
 * `done = true` is set by the caller AFTER the EMS task is actually created — this function
 * never touches the row, it only describes the task to open.
 */
export function promoteToEms(
  row: InternalTaskRow,
  kibbutz: string,
): { kibbutz: string; title: string; description: string; assigneeName?: string; priority: string } {
  return taskFromBullet({
    text: row.title,
    owners: row.owner ? [row.owner] : [],
    meeting_date: String(row.created_at || '').slice(0, 10),
    meeting_kind: 'company',
    kibbutz,
  });
}

/** Every employee can write; a viewer (the read-only PIN role) never can. */
export function canWriteInternal(isViewer: boolean): boolean {
  return !isViewer;
}
