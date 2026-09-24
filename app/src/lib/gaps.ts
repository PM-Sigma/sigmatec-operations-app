// 📋 הפערים שלי — the derived "what is still open on me" list (spec §7h).
//
// NO NEW TABLE. Every gap is an absence: a place he was at with no summary, a work day with
// no record, a task whose date passed. That is deliberate — the moment a gap had its own row
// it would need closing, re-opening and reconciling, and a person would end up with two
// truths about the same day. Here the only truth is the data itself, so a gap disappears the
// instant the thing that caused it is filled in, with nothing to keep in step.
//
// Everything in this file is PURE. The island reads, this decides, vitest pins it
// (gaps.test.ts, the §7h fixture week).
import { isRequiredDay, missingDays, toYmd, type AttRow, type Holiday } from '@/lib/attendance';
import { visitorsOf } from '@/lib/field';

export type GapKind = 'visit' | 'attendance' | 'task';

/** What the one button on the row does. The island maps this onto the actual call. */
export type GapAction = 'visit' | 'attendance' | 'task';

export interface Gap {
  /** Stable across renders and re-computations: kind + date + subject. */
  id: string;
  kind: GapKind;
  person: string;
  /** yyyy-mm-dd — the day the gap is ABOUT, which is what the list is sorted by. */
  date: string;
  kibbutz?: string;
  taskId?: string;
  /** The Hebrew line shown to the person. Never explains mechanics (§7h copy rule). */
  text: string;
  action: GapAction;
  actionLabel: string;
  /** The lucide icon the row's action bubble carries (round 5: noun-form labels, no emoji). */
  actionIcon: 'MapPin' | 'CalendarDays' | 'ExternalLink';
}

/** A stop on a planned route (`day_plans`), as the island hands it over. */
export interface DayPlanStop { person?: string; date?: string; kibbutz?: string }

/**
 * One `day_plans` row exactly as the table stores it (`db/day_plans.sql`): a `(person, date)`
 * pair with a `stops` jsonb array, `[{ kibbutz, task_ids }, …]` — there is NO `kibbutz` column
 * on the row itself. A query that asks the table for `person,date,kibbutz` (the bug this
 * replaces) gets `kibbutz: undefined` back on every row, silently.
 */
export interface DayPlanRow { person?: string; date?: string; stops?: Array<{ kibbutz?: string }> | null }

/** One `DayPlanStop` per stop in every row's `stops` array — what `visitGaps` actually wants. */
export function flattenDayPlans(rows: DayPlanRow[] | null | undefined): DayPlanStop[] {
  const out: DayPlanStop[] = [];
  for (const r of rows || []) {
    for (const stop of r?.stops || []) {
      out.push({ person: r.person, date: r.date, kibbutz: stop?.kibbutz });
    }
  }
  return out;
}

/** The bits of an EMS task a gap cares about. */
export interface GapTask {
  id: string;
  title?: string;
  status?: string;
  expectedCompletionDate?: string | null;
  site?: { name?: string } | null;
  assignee?: { firstName?: string; lastName?: string } | null;
}

export interface GapSources {
  /** `visits` rows — what CLOSES a visit gap. */
  visits?: Array<{ visitor?: string; kibbutz?: string; date?: string }> | null;
  /** `field_checkins` — he physically arrived. */
  checkins?: Array<{ person?: string; kibbutz?: string; checked_in_at?: string; dismissed?: boolean | null }> | null;
  /** `day_plans` stops — he planned to be there. */
  dayPlans?: DayPlanStop[] | null;
  /** The person's month of attendance, merged (the same rows the נוכחות screen reads). */
  attendance?: AttRow[] | null;
  holidays?: Holiday[] | null;
  /** The EMS cache's open tasks. */
  tasks?: GapTask[] | null;
}

export interface GapRange {
  /** yyyy-mm-dd, inclusive. Days before it are history and are not nagged about. */
  from: string;
  /** yyyy-mm-dd — "today". Today itself is never a gap: the day is not over. */
  today: string;
}

/** EMS statuses that mean the task is finished, so its date passing is not a gap. */
const CLOSED = new Set(['done', 'completed', 'closed', 'cancelled', 'canceled', 'rejected']);

/** `firstName lastName` as the EMS returns it, trimmed — how a task names its owner. */
function assigneeName(t: GapTask): string {
  const a = t.assignee;
  if (!a) return '';
  return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
}

/**
 * Does an EMS assignee refer to this person? EMS carries full names ("אביאם כהן") while the
 * app's identity is the first name alone, so a prefix match in either direction is the honest
 * comparison — and an empty assignee never matches anyone.
 */
export function isAssignedTo(task: GapTask, person: string): boolean {
  const who = assigneeName(task);
  if (!who || !person) return false;
  return who === person || who.startsWith(person + ' ') || person.startsWith(who + ' ');
}

const DM = (date: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${+m[3]}.${+m[2]}` : date;
};

/**
 * The visit gaps: every (kibbutz, day) this person was — or was due — at, with no `visits`
 * row for it. Three sources feed it and they are DEDUPED, because a check-in, a planned stop
 * and a task due the same day at the same kibbutz are one missing summary, not three.
 *
 * Today is excluded on purpose: the 2 h reminder (§5.2) owns today, and a person still in the
 * field should not be told he is behind on a visit he is standing in the middle of.
 */
function visitGaps(person: string, src: GapSources, range: GapRange): Gap[] {
  const want = new Map<string, { kibbutz: string; date: string }>();
  const add = (kibbutz: unknown, date: unknown) => {
    const k = String(kibbutz || '').trim();
    const d = toYmd(date);
    if (!k || !d) return;
    if (d < range.from || d >= range.today) return;
    want.set(d + '|' + k, { kibbutz: k, date: d });
  };

  for (const c of src.checkins || []) {
    if (String(c.person || '') !== person) continue;
    if (c.dismissed) continue;   // he said "לא היום" — the app takes him at his word
    add(c.kibbutz, String(c.checked_in_at || '').slice(0, 10));
  }
  for (const p of src.dayPlans || []) {
    if (String(p.person || '') !== person) continue;
    add(p.kibbutz, p.date);
  }
  for (const t of src.tasks || []) {
    if (!isAssignedTo(t, person)) continue;
    // ONLY a task he already finished. An open task whose date passed is reported once, as a
    // task gap — listing it a second time as "you were there and wrote nothing" would put the
    // same piece of work on the list twice and is the fastest way to make a list unreadable.
    // A task marked done, on the other hand, says he WAS there: the summary is what is
    // missing, and there is nothing else on the list to say so.
    // Ruling 19.9 (controller, task-15 review Minor #1): keep this as-is — open/overdue → task
    // gap only, closed → visit gap. Not literal spec text, but the intended reading, and the
    // 29 goldens are built on it.
    if (!CLOSED.has(String(t.status || '').toLowerCase())) continue;
    add(t.site?.name, t.expectedCompletionDate);
  }

  const done = new Set<string>();
  for (const v of src.visits || []) {
    if (!visitorsOf(v).includes(person)) continue;
    const d = toYmd(v.date);
    if (d) done.add(d + '|' + String(v.kibbutz || '').trim());
  }

  const out: Gap[] = [];
  for (const [key, w] of want) {
    if (done.has(key)) continue;
    out.push({
      id: 'visit|' + key,
      kind: 'visit',
      person,
      date: w.date,
      kibbutz: w.kibbutz,
      text: `היית ב${w.kibbutz} ב-${DM(w.date)} ואין סיכום ביקור`,
      action: 'visit',
      actionLabel: 'סיכום ביקור',
      actionIcon: 'MapPin',
    });
  }
  return out;
}

/**
 * The attendance gaps — §7e's `missingDays` exactly, so the נוכחות screen, the legacy report
 * and this list can never disagree about what is missing.
 *
 * `missingDays` answers for ONE calendar month, and a three-week window routinely straddles
 * two, so it is asked once per month the range touches and the answers are merged. `today` is
 * read at noon UTC: the date is what matters and midday is the one hour no timezone can move
 * to the day before or after.
 */
function attendanceGaps(person: string, src: GapSources, range: GapRange): Gap[] {
  const rows = src.attendance || [];
  const asDate = new Date(range.today + 'T12:00:00Z');
  const months = new Set<string>([range.from.slice(0, 7), range.today.slice(0, 7)]);
  const missing = new Set<string>();
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    for (const d of missingDays(rows, src.holidays || [], asDate, y, m)) missing.add(d);
  }
  return [...missing]
    .filter(d => d >= range.from && d < range.today)
    .sort()
    .map(date => ({
      id: 'attendance|' + date,
      kind: 'attendance' as const,
      person,
      date,
      text: `אין נוכחות ל-${DM(date)}`,
      action: 'attendance' as const,
      actionLabel: 'מילוי נוכחות',
      actionIcon: 'CalendarDays' as const,
    }));
}

/** The overdue EMS tasks assigned to him and still open. */
function taskGaps(person: string, src: GapSources, range: GapRange): Gap[] {
  const out: Gap[] = [];
  for (const t of src.tasks || []) {
    if (!isAssignedTo(t, person)) continue;
    if (CLOSED.has(String(t.status || '').toLowerCase())) continue;
    const date = toYmd(t.expectedCompletionDate);
    if (!date || date >= range.today) continue;
    // A date older than the window is real, but nagging about a task from three months ago
    // every single day is how a list stops being read.
    if (date < range.from) continue;
    const where = String(t.site?.name || '').trim();
    out.push({
      id: 'task|' + t.id,
      kind: 'task',
      person,
      date,
      kibbutz: where || undefined,
      taskId: t.id,
      text: `${String(t.title || 'משימה').trim()}${where ? ': ' + where : ''} · תאריך היעד עבר (${DM(date)})`,
      action: 'task',
      actionLabel: 'פתיחת המשימה',
      actionIcon: 'ExternalLink',
    });
  }
  return out;
}

/** Oldest first; a day with several gaps reads ביקור → נוכחות → משימה. */
const KIND_ORDER: Record<GapKind, number> = { visit: 0, attendance: 1, task: 2 };

/**
 * Everything still open on one person, in the order he should close it.
 *
 * The range is the caller's: the island asks for the last three weeks (the window a field
 * worker can still remember), the admin list asks for the same so the two agree.
 */
export function gapsFor(person: string, src: GapSources, range: GapRange): Gap[] {
  if (!person) return [];
  const out = [
    ...visitGaps(person, src, range),
    ...attendanceGaps(person, src, range),
    ...taskGaps(person, src, range),
  ];
  out.sort((a, b) => (a.date === b.date
    ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id)
    : a.date < b.date ? -1 : 1));
  return out;
}

/** The counts the summary line and the admin table show. */
export function gapCounts(gaps: Gap[]): { total: number; visit: number; attendance: number; task: number } {
  return {
    total: gaps.length,
    visit: gaps.filter(g => g.kind === 'visit').length,
    attendance: gaps.filter(g => g.kind === 'attendance').length,
    task: gaps.filter(g => g.kind === 'task').length,
  };
}

/**
 * The one sentence above the list. Addressed to the person, about his situation and his next
 * step — never about the app (§7h copy rule), and never about who else can see it (§7h).
 */
export function gapsSummary(gaps: Gap[]): string {
  const n = gaps.length;
  if (!n) return 'הכול סגור. אין פערים פתוחים.';
  if (n === 1) return 'נשאר פריט אחד לסגור';
  if (n <= 3) return `סוגרים את ה-${n} האלה, והחודש נקי`;
  return `${n} פריטים מחכים לסגירה`;
}

/**
 * The nudge guard the admin list uses (adoption §3.5): a gap is only worth a nudge once it
 * has been sitting for two days. A person who forgot yesterday afternoon is not behind.
 */
export const NUDGE_MIN_AGE_DAYS = 2;

export function nudgeable(gaps: Gap[], today: string): Gap[] {
  const cutoff = shiftDays(today, -NUDGE_MIN_AGE_DAYS);
  return gaps.filter(g => g.date <= cutoff);
}

/** yyyy-mm-dd ± n days, computed in UTC so no timezone can move a date by one. */
export function shiftDays(date: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (!m) return String(date);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The window the screens use: the last three weeks, up to and including yesterday. */
export function defaultRange(today: string, days = 21): GapRange {
  return { from: shiftDays(today, -days), today };
}

/** Re-exported so a caller does not have to reach into attendance.ts for the same rule. */
export { isRequiredDay };
