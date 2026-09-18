// רשימה — the calendar's third view (spec §7g, §7m R1–R4). Every decision it makes is here,
// as a pure function; the island (app/src/islands/Calendar.tsx) renders these and decides
// nothing of its own. Goldens: taskList.test.ts.
//
// WHAT THIS REPLACES. Three legacy surfaces collapse into one list:
//   · the standalone משימות page (`renderMyTasks`) — my open work, grouped by kibbutz,
//   · the legacy 📋 EMS page's filter bar — status · priority · site · search · שלי · באיחור,
//   · the "משימות באחריותי" report — one שתף action that copies the same text.
//
// SOURCE. The SHARED EMS CACHE (`sigma.emsCacheData()`), not a live paginated fetch. That
// cache is what the cards, the calendar layers and Ctrl+K already read, it holds every OPEN
// task, and it works with no signal — which is the state a phone in a kibbutz is usually in.
// Filtering it here (instead of asking EMS per keystroke) is what lets the filters answer
// instantly and offline.
import {
  dueText, EMS_CLOSED, isOverdue, statusLabel,
  type CardEmsTask,
} from './emsTasks';

// ───────────────────────────── types ─────────────────────────────

/** A row of the shared cache — exactly `emsSlimTask`'s shape (js/src/13-ems.js). */
export type ListTask = CardEmsTask;

/** The six filters R2 names, in one object so the island holds one piece of state. */
export interface TaskFilters {
  /** An EMS status value, '' = all. */
  status: string;
  /** An EMS priority value, '' = all. */
  priority: string;
  /** An EMS **site id**, '' = all. Ids, not names: two sites can share a name. */
  site: string;
  /** Free text over the title, the description and the site name. */
  q: string;
  /** "שלי" — only the viewer's own. Admins turn it off ("כולל של אחרים"). */
  mine: boolean;
  /** "באיחור" — only what is already late. */
  overdue: boolean;
}

export const DEFAULT_FILTERS: TaskFilters = {
  status: '', priority: '', site: '', q: '', mine: true, overdue: false,
};

/** The group a task with no EMS site lands in — always last, it is not a place you drive to. */
export const NO_SITE = 'ללא אתר';

export interface TaskGroup {
  kibbutz: string;
  /** false for the `NO_SITE` bucket — it has no card and no briefing. */
  real: boolean;
  items: ListTask[];
  /** How many of them are already late. */
  overdue: number;
  /** The group's earliest due day, '' when nothing in it is dated. */
  due: string;
}

/** One 🔒 internal task, as the `internal_tasks` table stores it (spec §2). */
export interface CompanyRow {
  id: string;
  title: string;
  /** null = the whole company — that is what makes it a "חברה" row. */
  kibbutz: string | null;
  done: boolean;
  owner?: string | null;
}

/** The legacy home block's three lists, until the rows exist. */
export interface LegacyCompanyTasks {
  orders?: string[];
  info?: string[];
  guidelines?: string[];
}

export interface CompanyItem {
  id: string;
  title: string;
  /** The legacy list's heading; '' for a real internal task, which has no sub-list. */
  heading: string;
  owner: string | null;
}

// ───────────────────────────── copy ─────────────────────────────

export const LIST_TITLE = 'המשימות שלי';
export const EMPTY_LIST = 'אין משימות פתוחות עבורך 🎉';
export const EMPTY_FILTERED = 'אין משימות שמתאימות לסינון';
export const COMPANY_GROUP = 'חברה';
const COMPANY_HEADINGS: Array<[keyof LegacyCompanyTasks, string]> = [
  ['orders', '🛒 הזמנות'],
  ['info', 'ℹ️ מידע'],
  ['guidelines', '📋 הנחיות'],
];
const APP_LINK = 'https://pm-sigma.github.io/sigmatec-operations-app/';

// ───────────────────────────── small helpers ─────────────────────────────

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function assigneeName(t: ListTask): string {
  const a = t.assignee;
  if (!a) return '';
  return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
}

/**
 * Is this task the viewer's? Hebrew names are compared LOOSELY, the same way the calendar
 * does it: EMS carries a surname the app never knows about, so "ניתאי לוי" is ניתאי.
 */
export function isMine(t: ListTask, me: string): boolean {
  const who = assigneeName(t);
  if (!me || !who) return false;
  return who === me || who.indexOf(me) !== -1 || me.indexOf(who) !== -1;
}

/** Open = not in one of the four finished statuses. Finished work is not a to-do list. */
export function isOpen(t: ListTask): boolean {
  return !EMS_CLOSED.includes(String(t?.status || ''));
}

/** The plain day a due value names, '' when it has none. Sorting compares these as strings. */
export function dueKey(t: ListTask): string {
  const raw = String(t?.expectedCompletionDate || '');
  if (!raw) return '';
  const bare = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (bare) return bare[1];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const p2 = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

// ───────────────────────────── the filters ─────────────────────────────

/**
 * The six filters, applied together. A CLOSED task is dropped before any of them run — the
 * list is "what is still open", and no combination of filters can bring finished work back.
 *
 * `mine` with nobody signed in shows EVERYTHING rather than nothing: an empty screen would
 * read as "no work", when the truth is "I do not know who you are".
 */
export function filterTasks(
  tasks: ListTask[] | null | undefined,
  filters: TaskFilters = DEFAULT_FILTERS,
  ctx: { me?: string; now?: Date } = {},
): ListTask[] {
  const me = ctx.me || '';
  const now = ctx.now || new Date();
  const q = norm(filters.q);
  return (tasks || []).filter(t => {
    if (!t || !t.id || !isOpen(t)) return false;
    if (filters.mine && me && !isMine(t, me)) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.priority && (t.priority || '') !== filters.priority) return false;
    if (filters.site && (t.site?.id || '') !== filters.site) return false;
    if (filters.overdue && !isOverdue(t, now)) return false;
    if (q) {
      const hay = norm([t.title, t.description, t.site?.name].filter(Boolean).join(' '));
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/** Is anything narrowing the list right now? (drives the "נקה סינון" affordance) */
export function hasActiveFilters(f: TaskFilters): boolean {
  return !!(f.status || f.priority || f.site || f.q.trim() || f.overdue);
}

// ───────────────────────────── the order ─────────────────────────────

/**
 * Overdue first, oldest debt at the top; then what is coming, soonest first; then whatever
 * has no date at all. A task with no date is not urgent AND not scheduled — it belongs at the
 * bottom, not silently sorted as if it were due in year 0.
 */
export function sortTasks(tasks: ListTask[] | null | undefined, now: Date = new Date()): ListTask[] {
  const rank = (t: ListTask) => (isOverdue(t, now) ? 0 : dueKey(t) ? 1 : 2);
  return (tasks || []).slice().sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    const da = dueKey(a), db = dueKey(b);
    if (da !== db) return da.localeCompare(db);
    return String(a.title || '').localeCompare(String(b.title || ''), 'he');
  });
}

// ───────────────────────────── the groups ─────────────────────────────

/**
 * The day's work by PLACE, which is how the field team reads it. Group order follows the same
 * rule the rows do — the kibbutz carrying the oldest debt first — and the site-less bucket is
 * always last: it has no card, no briefing and nowhere to drive to.
 */
export function groupTasks(tasks: ListTask[] | null | undefined, now: Date = new Date()): TaskGroup[] {
  const map = new Map<string, ListTask[]>();
  for (const t of tasks || []) {
    const k = t.site?.name || NO_SITE;
    const list = map.get(k);
    if (list) list.push(t); else map.set(k, [t]);
  }
  const groups: TaskGroup[] = [];
  for (const [kibbutz, items] of map) {
    const sorted = sortTasks(items, now);
    const dated = sorted.map(dueKey).filter(Boolean).sort();
    groups.push({
      kibbutz,
      real: kibbutz !== NO_SITE,
      items: sorted,
      overdue: sorted.filter(t => isOverdue(t, now)).length,
      due: dated[0] || '',
    });
  }
  groups.sort((a, b) => {
    if (a.real !== b.real) return a.real ? -1 : 1;
    if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
    if (a.due !== b.due) return (a.due || '9999').localeCompare(b.due || '9999');
    return a.kibbutz.localeCompare(b.kibbutz, 'he');
  });
  return groups;
}

/** The site `<select>`'s options — one per real site, Hebrew order (was `emsPopulateSiteFilter`). */
export function siteOptions(tasks: ListTask[] | null | undefined): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const t of tasks || []) {
    const id = t?.site?.id, name = t?.site?.name;
    if (id && name && !seen.has(id)) seen.set(id, name);
  }
  return Array.from(seen, ([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

// ───────────────────────────── "חברה" ─────────────────────────────

/**
 * The company block at the top of the list (spec §7g + §7m R3): an internal task with
 * `kibbutz = null` and not done.
 *
 * `legacy` is the retired home block's three lists, read straight from the settings snapshot.
 * It is a FALLBACK ONLY — the moment one real row exists, the legacy lists are ignored, so
 * the same item can never appear twice while the one-shot migration is still pending.
 */
export function companyItems(
  rows: CompanyRow[] | null | undefined,
  legacy: LegacyCompanyTasks | null | undefined,
): CompanyItem[] {
  const open = (rows || []).filter(r => r && !r.done && (r.kibbutz === null || r.kibbutz === undefined || r.kibbutz === ''));
  if (open.length) {
    return open.map(r => ({ id: String(r.id), title: String(r.title || ''), heading: '', owner: r.owner || null }));
  }
  if (rows && rows.length) return [];                 // rows exist, all done → the block is empty
  const out: CompanyItem[] = [];
  for (const [key, heading] of COMPANY_HEADINGS) {
    const list = (legacy && legacy[key]) || [];
    list.forEach((title, i) => {
      const text = String(title || '').trim();
      if (text) out.push({ id: 'legacy:' + key + ':' + i, title: text, heading, owner: null });
    });
  }
  return out;
}

// ───────────────────────────── שתף ─────────────────────────────

function heDay(d: Date): string {
  return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
}

/**
 * The one surviving "משימות באחריותי" text (§7m R4): the same header, the same company
 * section, the same per-kibbutz blocks and the same footer link the legacy report produced —
 * now built from the LIST the person is looking at, so what he shares is what he sees.
 */
export function shareText(input: {
  person: string;
  groups: TaskGroup[];
  company: CompanyItem[];
  now?: Date;
}): string {
  const now = input.now || new Date();
  const header = '*📋 משימות EMS באחריותי — ' + input.person + '*\n📅 ' + heDay(now) + '\n';

  let company = '';
  if (input.company.length) {
    company = '\n*━━━ 📌 משימות חברה כלליות ━━━*\n';
    let heading = '';
    for (const item of input.company) {
      if (item.heading && item.heading !== heading) { heading = item.heading; company += '\n*' + heading + '*\n'; }
      company += '- ' + item.title + (item.owner ? ' · ' + item.owner : '') + '\n';
    }
  }

  if (!input.groups.length) return header + company + '\n✨ אין משימות EMS פתוחות';

  let body = '';
  for (const g of input.groups) {
    body += '\n*━━━ ' + g.kibbutz + ' ━━━*\n';
    for (const t of g.items) {
      const due = dueText(t);
      const late = isOverdue(t, now);
      body += '- ' + t.title
        + ' (' + statusLabel(t.status) + ')'
        + (due ? ' · ' + (late ? '⏰ ' : '📅 ') + due : '')
        + '\n';
    }
  }
  return header + company + body + '\n🔗 ' + APP_LINK;
}

/** wa.me for one person. No phone on file → no link, so the button is hidden rather than dead. */
export function waLink(phone: string, text: string): string {
  const p = String(phone || '').replace(/\D/g, '');
  return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(text) : '';
}
