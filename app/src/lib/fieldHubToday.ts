// "היום שלי" on the field hub (spec 2026-09-29-field-ops-hub-design.md §1) — the pure selectors.
// Read-only: today's route/visits for one person, and their open tasks due today or overdue.
import { isMine, isOpen, dueKey, type ListTask } from './taskList';
import { isOverdue } from './emsTasks';
import { myOpen, type InternalTaskRow } from './internalTasks';
import { visitorsOf } from './field';
import { toKey, ymd, type VisitRow } from './calendar';

export interface TodayStop { kibbutz: string; /** a visit summary is already filed today */ done: boolean }

/**
 * Today's stops for `me`: the planned route (day_plans stops, in order), then any visit this
 * person already filed today that the plan did not list. A planned stop with a filed summary is `done`.
 */
export function todayStops(plan: string[] | null | undefined, visits: VisitRow[] | null | undefined, me: string, today: string): TodayStop[] {
  const mine = (visits || []).filter(v => v && v.kibbutz && toKey(v.date) === today
    && (visitorsOf(v).includes(me) || (v.visitors || []).includes(me)));
  const doneSet = new Set(mine.map(v => String(v.kibbutz).trim()));
  const out: TodayStop[] = [];
  const seen = new Set<string>();
  for (const k of plan || []) {
    const name = String(k || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ kibbutz: name, done: doneSet.has(name) });
  }
  for (const name of doneSet) if (!seen.has(name)) { seen.add(name); out.push({ kibbutz: name, done: true }); }
  return out;
}

/** The kibbutz to pre-set in the visit form: the first planned stop not yet summarised, else none. */
export function nextStop(stops: TodayStop[]): string | undefined {
  return stops.find(s => !s.done)?.kibbutz;
}

export interface TodayTask {
  kind: 'ems' | 'internal';
  id: string;
  title: string;
  /** '' = company-wide / no site */
  kibbutz: string;
  late: boolean;
}

/** A due value's plain day (`YYYY-MM-DD`), '' when none — same reading the internal list uses. */
const internalDue = (r: InternalTaskRow): string => /^(\d{4}-\d{2}-\d{2})/.exec(String(r.due_date || ''))?.[1] || '';

/**
 * My open tasks (EMS + 🔒 internal) whose due day is today or already past, overdue first then by
 * due day. `more` = how many did not fit in `max`.
 */
export function myDueTasks(
  ems: ListTask[] | null | undefined,
  internal: InternalTaskRow[] | null | undefined,
  me: string,
  now: Date = new Date(),
  max = 5,
): { rows: TodayTask[]; more: number; total: number } {
  const today = ymd(now);
  const all: Array<TodayTask & { due: string }> = [];
  if (me) {
    for (const t of ems || []) {
      if (!t || !t.id || !isOpen(t) || !isMine(t, me)) continue;
      const due = dueKey(t);
      if (!due || due > today) continue;
      all.push({ kind: 'ems', id: t.id, title: t.title, kibbutz: t.site?.name || '', late: isOverdue(t, now), due });
    }
    for (const r of myOpen(internal, me)) {
      const due = internalDue(r);
      if (!due || due > today) continue;
      all.push({ kind: 'internal', id: r.id, title: r.title, kibbutz: String(r.kibbutz || '').trim(), late: due < today, due });
    }
  }
  all.sort((a, b) => a.due.localeCompare(b.due));
  const rows = all.slice(0, max).map(({ due: _d, ...r }) => r);
  return { rows, more: Math.max(0, all.length - rows.length), total: all.length };
}
