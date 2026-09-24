// "המשימות שלי" — one list of everything a person still owes, EMS and 🔒 internal together
// (round 4, Package X). עידן, 22.9: "המשימות הפנימיות שלי" was a floating strip that sat on
// top of every page and showed only half the work. This is the whole of it, in one sheet,
// sorted by the place the work belongs to.
//
// PURE — no DOM, no network, no React. The island (app/src/islands/MyTasks.tsx) renders what
// these functions decide and decides nothing of its own. Goldens: myTasks.test.ts.
import { COMPANY_GROUP, isMine, isOpen, NO_SITE, sortTasks, type ListTask } from './taskList';
import { myOpen, type InternalTaskRow } from './internalTasks';

export const MY_TASKS_TITLE = 'המשימות שלי';

/** One kibbutz block of the sheet: its EMS work and its 🔒 work, already ordered. */
export interface MyTaskGroup {
  /** The kibbutz name, `COMPANY_GROUP` for company-wide work, `NO_SITE` for an EMS task with no site. */
  kibbutz: string;
  /** true for the חברה block — it opens no card and heads the list. */
  company: boolean;
  /** false for the `NO_SITE` bucket: there is no card to open and nowhere to drive to. */
  real: boolean;
  ems: ListTask[];
  internal: InternalTaskRow[];
  /** How many rows the block holds, both kinds together. */
  count: number;
}

/** The person's own open EMS tasks, newest debt first. */
export function myEms(tasks: ListTask[] | null | undefined, me: string, now: Date = new Date()): ListTask[] {
  if (!me) return [];
  return sortTasks(
    (tasks || []).filter(t => t && t.id && isOpen(t) && isMine(t, me)),
    now,
  );
}

/** The person's own open 🔒 rows, company-wide and at every kibbutz. */
export function myInternal(rows: InternalTaskRow[] | null | undefined, me: string): InternalTaskRow[] {
  return myOpen(rows, me);
}

/**
 * The sheet's blocks. חברה first (work that belongs to nowhere in particular is still the
 * company's), then the kibbutzim in Hebrew order, and "ללא אתר" last — an EMS task with no
 * site is not a place you drive to, so it closes the list rather than interrupting it.
 */
export function myTaskGroups(
  ems: ListTask[] | null | undefined,
  internal: InternalTaskRow[] | null | undefined,
  ctx: { me?: string; now?: Date } = {},
): MyTaskGroup[] {
  const me = ctx.me || '';
  const now = ctx.now || new Date();
  const map = new Map<string, MyTaskGroup>();
  const at = (name: string): MyTaskGroup => {
    let g = map.get(name);
    if (!g) {
      g = {
        kibbutz: name,
        company: name === COMPANY_GROUP,
        real: name !== COMPANY_GROUP && name !== NO_SITE,
        ems: [], internal: [], count: 0,
      };
      map.set(name, g);
    }
    return g;
  };

  for (const t of myEms(ems, me, now)) at(t.site?.name || NO_SITE).ems.push(t);
  for (const r of myInternal(internal, me)) at(String(r.kibbutz || '').trim() || COMPANY_GROUP).internal.push(r);

  const groups = Array.from(map.values());
  for (const g of groups) g.count = g.ems.length + g.internal.length;

  const rank = (g: MyTaskGroup) => (g.company ? 0 : g.real ? 1 : 2);
  groups.sort((a, b) => rank(a) - rank(b) || a.kibbutz.localeCompare(b.kibbutz, 'he'));
  return groups;
}

/** The header badge — how many things are waiting, both kinds together. 0 = no badge. */
export function myTasksCount(
  ems: ListTask[] | null | undefined,
  internal: InternalTaskRow[] | null | undefined,
  me: string,
  now: Date = new Date(),
): number {
  return myEms(ems, me, now).length + myInternal(internal, me).length;
}

/**
 * The calendar's רשימה shows the SAME two kinds side by side (Package X). Its groups come
 * from `groupTasks` (EMS only), so this says which 🔒 rows belong inside each of them and
 * which kibbutzim would otherwise be missing from the screen entirely.
 */
export function internalForGroups(
  groups: Array<{ kibbutz: string }>,
  internal: InternalTaskRow[] | null | undefined,
): { byKibbutz: Record<string, InternalTaskRow[]>; extra: string[] } {
  const byKibbutz: Record<string, InternalTaskRow[]> = {};
  for (const r of internal || []) {
    if (!r || r.done) continue;
    const k = String(r.kibbutz || '').trim() || COMPANY_GROUP;
    (byKibbutz[k] = byKibbutz[k] || []).push(r);
  }
  const known = new Set(groups.map(g => g.kibbutz));
  // חברה has a block of its own at the top of the list already — never a second one here.
  const extra = Object.keys(byKibbutz)
    .filter(k => k !== COMPANY_GROUP && !known.has(k))
    .sort((a, b) => a.localeCompare(b, 'he'));
  return { byKibbutz, extra };
}

/** What the ⋯ row and the header button say out loud to a screen reader. */
export function myTasksLabel(count: number): string {
  return count > 0 ? MY_TASKS_TITLE + ', ' + count + ' פתוחות' : MY_TASKS_TITLE;
}

export { COMPANY_GROUP, NO_SITE };

// ───────────────────────────── row tags + the undo close (round 5, L3) ─────────────────────────────
// The sheet's own ListRows: up to 3 status tags (a 4th and later collapse into "+N"), and a
// closed row commits its write only after a 5 s undo window — closing must feel instant, but
// a mis-tap must still be free to take back.

export interface TaskTag { text: string; role: 'danger' | 'info' | 'warn' | 'neutral'; icon?: 'Clock' | 'CalendarDays' | 'Lock' }

/** The tag row a task's ListRow carries. At most 3; a 4th+ collapses into one "+N" tag. */
export function taskTags(t: {
  status?: string; due?: string | null; late: boolean; priority?: string | null;
  internal?: boolean; assignee?: string | null;
}): TaskTag[] {
  const all: TaskTag[] = [];
  if (t.due) {
    all.push(t.late
      ? { text: `באיחור · ${t.due}`, role: 'danger', icon: 'Clock' }
      : { text: t.due, role: 'neutral', icon: 'CalendarDays' });
  }
  if (t.priority === 'דחופה') all.push({ text: 'דחופה', role: 'danger' });
  if (t.assignee === null || t.assignee === '') all.push({ text: 'ללא אחראי', role: 'warn' });
  if (t.internal) all.push({ text: 'פנימית', role: 'neutral', icon: 'Lock' });
  return all.length <= 3 ? all : [...all.slice(0, 2), { text: `+${all.length - 2}`, role: 'neutral' }];
}

/** How long a closed row stays undoable before its write actually commits. */
export const UNDO_MS = 5000;

/**
 * Commit `commit` only once the undo window closes, unless `cancel()` was called first. The
 * write never reaches the database while the row is still showing "ביטול" — that is the whole
 * point of the undo window (spec §Review Focus 2).
 */
export function undoable<T>(commit: () => Promise<T>, ms: number = UNDO_MS): { cancel: () => boolean; done: Promise<T | null> } {
  let settled = false;   // fired (committing) or cancelled — either way, no second move
  let resolve!: (v: T | null) => void;
  let reject!: (e: unknown) => void;
  const done = new Promise<T | null>((res, rej) => { resolve = res; reject = rej; });
  const timer = setTimeout(() => {
    settled = true;
    commit().then(resolve, reject);
  }, ms);
  return {
    cancel: () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      resolve(null);
      return true;
    },
    done,
  };
}
