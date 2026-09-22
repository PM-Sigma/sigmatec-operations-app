// 🗓️ יומן — every decision the unified calendar makes, as pure functions (spec §7f).
// The island (app/src/islands/Calendar.tsx) renders these and decides nothing of its own.
// Goldens: calendar.test.ts.
//
// THE POINT OF THE REDESIGN: one calendar, three layers (📅 אירועי משרד · 📍 ביקורים ·
// 📋 משימות EMS) plus a fourth soft layer for absences (🌴/🪖/🎉), one toggle to hide the EMS
// layer, and a day panel that groups the day by KIBBUTZ — because a field day is a route
// between kibbutzim, not a list of tickets.
//
// DATES ARE STRINGS. Every date in this file is 'YYYY-MM-DD' in local time. A Date object is
// only ever an input; nothing here hands one back. That is what keeps a day from sliding by
// one when a phone is on a different timezone from the office calendar.

import { isHolidayEve, missingDaysFor, type AttRow, type Holiday } from './attendance';

// ───────────────────────────── types ─────────────────────────────

/** The three real layers + the soft absence band. */
export type Layer = 'event' | 'visit' | 'ems' | 'absence';

export type AbsenceKind = 'vacation' | 'reserve' | 'event';

/** One office event as the `calendar` edge function returns it. */
export interface OfficeEvent {
  id: string;
  title: string;
  /** ISO datetime or 'YYYY-MM-DD' for an all-day event. */
  start: string | null;
  end?: string | null;
  allDay?: boolean;
  location?: string;
  description?: string;
  /** Google's Meet link. Absent → no 🎥 button is rendered, ever. */
  hangoutLink?: string | null;
}

export interface VisitRow {
  id?: string;
  date: string;
  visitor?: string;
  kibbutz?: string;
  workday?: boolean;
  /** Round 2 · G3 — a past day SHOWS its summary, read only. */
  summary?: string | null;
  open_items?: string | null;
}

export interface CalEmsTask {
  id: string;
  title?: string;
  status?: string;
  expectedCompletionDate?: string | null;
  site?: { id?: string; name?: string } | null;
  assignee?: { firstName?: string; lastName?: string } | null;
}

export interface AbsenceRow {
  id: string;
  /** null = the whole company. */
  person: string | null;
  kind: AbsenceKind;
  start_date: string;
  end_date: string;
  note?: string | null;
  /** A company-wide 🎉 event only excuses attendance when nobody ticked "נדרשת נוכחות". */
  required?: boolean;
}

/** What the grid, the day panel and the week rows all render. */
export interface CalItem {
  /** Stable within a render — layer-prefixed so two sources can share an id. */
  key: string;
  /** 'YYYY-MM-DD' */
  date: string;
  layer: Layer;
  icon: string;
  title: string;
  kibbutz: string | null;
  /** Who it belongs to (visitor / assignee / the absent person). null = everyone. */
  person: string | null;
  /** Is this the viewer's own item? Drives the highlight-vs-dim treatment. */
  mine: boolean;
  /** Present on an EMS item — what ➕ שיבוץ PATCHes. */
  taskId?: string;
  /** Present on an office event that really has conference data. */
  meetLink?: string;
  /** Present on an absence item. */
  kind?: AbsenceKind;
}

export interface CalendarSources {
  events?: OfficeEvent[];
  visits?: VisitRow[];
  emsTasks?: CalEmsTask[];
  absences?: AbsenceRow[];
}

export interface CalendarOptions {
  /** "הסתר משימות EMS" — remembered per device. */
  hideEms?: boolean;
  /** "רק שלי" — keep only the viewer's own items. */
  onlyMine?: boolean;
  me?: string;
}

// ───────────────────────────── copy ─────────────────────────────

export const LAYER_LABELS: Record<Layer, string> = {
  event: '📅 אירועי משרד',
  visit: '📍 ביקורים',
  ems: '📋 משימות EMS',
  absence: '🌴 היעדרויות',
};

export const ABSENCE_LABELS: Record<AbsenceKind, string> = {
  vacation: '🌴 חופש',
  reserve: '🪖 מילואים',
  event: '🎉 אירוע',
};

export const ABSENCE_ICONS: Record<AbsenceKind, string> = {
  vacation: '🌴',
  reserve: '🪖',
  event: '🎉',
};

/** The route headers, derived from position — never typed by anyone (spec §7f). */
export const ROUTE_HEADERS = {
  first: '🌅 תחילת יום',
  middle: '➡️ בהמשך',
  last: '🌇 אחרון להיום',
  unplaced: '📥 לא משובץ',
} as const;

export type RouteHeader = keyof typeof ROUTE_HEADERS;

/** A day with nothing on it says so, positively (spec §6 — no system-talk). */
export const EMPTY_DAY = 'אין מה שמתוכנן ליום הזה';

/** The group a kibbutz-less item lands in. */
export const NO_KIBBUTZ = 'ללא קיבוץ';

export const HE_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** א–ה. The default week (round 2 · G1): Fri/Sat are shown by the full month only. */
export const HE_WORK_DAY_LETTERS = HE_DAY_LETTERS.slice(0, 5);

/**
 * The toggle SAYS WHERE IT GOES, not where it is: with א–ה on screen the button offers
 * "חודש מלא", and from the full month it offers the way back. A button labelled with the
 * state it is already in is the single most common way a toggle is misread.
 */
export function workWeekLabel(workWeek: boolean): string {
  return workWeek ? 'חודש מלא' : 'שבוע עבודה';
}

/**
 * Which weekday columns a view paints. Only a MONTH with the work week turned off shows
 * Fri/Sat — a week view is the working week, always, because that is the week a technician
 * plans. Sunday = 0.
 */
export function visibleDows(view: 'week' | 'month', workWeek: boolean): number[] {
  return view === 'month' && !workWeek ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
}

/** The day letters that head the grid, for the same pair of inputs. */
export function dayLetters(view: 'week' | 'month', workWeek: boolean): string[] {
  return visibleDows(view, workWeek).map(d => HE_DAY_LETTERS[d]);
}

/** One week row, narrowed to the columns `visibleDows` allows. */
export function gridDays(week: CalWeek, view: 'week' | 'month', workWeek: boolean): CalCell[] {
  const keep = visibleDows(view, workWeek);
  return week.days.filter(d => keep.indexOf(d.dow) !== -1);
}

export type DayWhen = 'past' | 'today' | 'future';

/** Past · today · future — the one place the calendar decides what a day may still become. */
export function dayWhen(date: string, today: string): DayWhen {
  if (!date) return 'future';
  if (date < today) return 'past';
  return date === today ? 'today' : 'future';
}

/**
 * Round 2 · G3: a day that is over cannot be planned. No route editing, no "הוסף למסלול",
 * no briefing — it shows what happened, and that is all it has left to say.
 */
export function canPlanDay(date: string, today: string): boolean {
  return dayWhen(date, today) !== 'past';
}

/** The visit summaries filed on a past day, read-only (round 2 · G3). */
export function visitsOn(visits: VisitRow[] | null | undefined, date: string): VisitRow[] {
  return (visits || []).filter(v => v && toKey(v.date) === date);
}

export const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט',
  'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

// ───────────────────────────── dates ─────────────────────────────

const p2 = (n: number) => String(n).padStart(2, '0');

/** Local-time 'YYYY-MM-DD'. `toISOString()` is deliberately NOT used — it is UTC. */
export function ymd(d: Date): string {
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

/** 'YYYY-MM-DD' (or an ISO datetime) → a local Date at noon, which no DST shift can move a day. */
export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Any date-ish input → 'YYYY-MM-DD', or '' when it is not a date at all. */
export function toKey(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : ymd(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                    // already a plain day
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : ymd(d);
}

export function addDays(key: string, n: number): string {
  const d = parseYmd(key);
  if (isNaN(d.getTime())) return key;
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Friday + Saturday. The one place the week's shape is written down. */
export function isWeekend(key: string): boolean {
  const dow = parseYmd(key).getDay();
  return dow === 5 || dow === 6;
}

/**
 * ISO-8601 week number. The DISPLAY is Sunday-first (Hebrew), but the NUMBER is the standard
 * one — the office, the suppliers and the EMS reports all count weeks the ISO way, and a
 * calendar that invented its own numbering would be wrong in every conversation.
 */
export function weekNumber(input: string | Date): number {
  const src = input instanceof Date ? input : parseYmd(input);
  if (isNaN(src.getTime())) return 0;
  // Thursday of this ISO week decides the year the week belongs to.
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  const dayNum = d.getUTCDay() || 7;                       // Monday=1 … Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

/** The Sunday that opens the display week containing `key`. */
export function weekStart(key: string): string {
  const d = parseYmd(key);
  if (isNaN(d.getTime())) return key;
  d.setDate(d.getDate() - d.getDay());
  return ymd(d);
}

/** The seven day keys of the display week containing `key`, Sunday → Saturday. */
export function weekDays(key: string): string[] {
  const start = weekStart(key);
  return [0, 1, 2, 3, 4, 5, 6].map(i => addDays(start, i));
}

export function heDate(key: string): string {
  const d = parseYmd(key);
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function heShort(key: string): string {
  const d = parseYmd(key);
  if (isNaN(d.getTime())) return key;
  return d.getDate() + '.' + (d.getMonth() + 1);
}

// ───────────────────────────── the month grid ─────────────────────────────

export interface CalCell {
  date: string;
  day: number;
  dow: number;
  weekend: boolean;
  /** Belongs to the month being shown (false = a lead/trail filler). */
  inMonth: boolean;
  today: boolean;
  holiday: Holiday | null;
  /** ערב חג — worked, reported, and marked on the grid like the attendance screen (F-5). */
  eve: boolean;
}

export interface CalWeek {
  /** ISO week number — the narrow column on the RIGHT (spec §7f). */
  week: number;
  days: CalCell[];
}

export interface MonthView {
  year: number;
  /** 1–12. */
  month: number;
  label: string;
  weeks: CalWeek[];
}

/** Re-exported so the calendar's cell render asks the SAME question the attendance screen does. */
export { isHolidayEve, missingDaysFor } from './attendance';

function holidayMap(holidays: Holiday[] | undefined): Record<string, Holiday> {
  const out: Record<string, Holiday> = {};
  for (const h of holidays || []) if (h && h.date) out[h.date] = h;
  return out;
}

/**
 * Six-row-max month, Sunday-first, WITH the lead and trail days filled in rather than left
 * blank: a week row that starts with three empty boxes reads as broken, and the week number
 * beside it would then belong to nothing.
 */
export function monthView(year: number, month: number, holidays: Holiday[] = [], today = ymd(new Date())): MonthView {
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());
  const hol = holidayMap(holidays);
  const weeks: CalWeek[] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const days: CalCell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = ymd(cursor);
      days.push({
        date: key,
        day: cursor.getDate(),
        dow: cursor.getDay(),
        weekend: cursor.getDay() === 5 || cursor.getDay() === 6,
        inMonth: cursor.getMonth() === month - 1,
        today: key === today,
        holiday: hol[key] || null,
        eve: isHolidayEve(hol[key]),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    // The row's number comes from its MONDAY, not its Sunday: the display week is
    // Sunday-first (Hebrew) but ISO weeks run Mon–Sun, so a row's Sunday still belongs to
    // the PREVIOUS ISO week and labelling the row with it would be off by one all year.
    weeks.push({ week: weekNumber(days[1].date), days });
    // A month that fits in five rows does not get a sixth of pure filler.
    if (w >= 4 && cursor.getMonth() !== month - 1 && days[6].date >= ymd(new Date(year, month, 0))) break;
  }
  return { year, month, label: HE_MONTHS[month - 1] + ' ' + year, weeks };
}

/**
 * The days ON THIS GRID that the person never reported — the red cells (round 2, F-4 · G).
 *
 * The answer itself belongs to the attendance screen: `missingDaysFor` is the single
 * predicate, so the calendar can never disagree with נוכחות about what is missing. All this
 * adds is "…and it is visible right now": a week row can straddle two months, so each month
 * the grid touches is asked once and the result is intersected with the cells on screen —
 * the cells that BELONG to the view, never a dimmed lead/trail filler.
 *
 * Past work days only, and that too comes from `missingDaysFor` — never today, never the
 * future, never Fri/Sat, never a holiday nobody had to work. No person (or a month whose
 * snapshot has not landed) → an empty set: "nothing to paint", never "nothing missing".
 */
export function missingInView(
  person: string,
  weeks: CalWeek[],
  rowsFor: (person: string, year: number, month: number) => AttRow[] | null | undefined,
  holidays?: Holiday[] | null,
  today: Date = new Date(),
): Set<string> {
  const out = new Set<string>();
  if (!person) return out;
  const onScreen = new Set<string>();
  const months = new Set<string>();
  for (const w of weeks || []) {
    for (const c of w.days || []) {
      // A lead/trail filler belongs to the month BEFORE or AFTER this one; it is already
      // dimmed, and shouting at him about August from September's grid would be noise. The
      // week view marks every one of its cells — there `inMonth` is true throughout.
      if (!c.inMonth) continue;
      onScreen.add(c.date);
      months.add(c.date.slice(0, 7));
    }
  }
  for (const ym of months) {
    for (const date of missingDaysFor(person, ym, rowsFor, holidays ?? [], today)) {
      if (onScreen.has(date)) out.add(date);
    }
  }
  return out;
}

/** The week view's seven columns, with the same cell shape the month grid uses. */
export function weekView(anchor: string, holidays: Holiday[] = [], today = ymd(new Date())): CalWeek {
  const hol = holidayMap(holidays);
  const days = weekDays(anchor).map(key => {
    const d = parseYmd(key);
    return {
      date: key,
      day: d.getDate(),
      dow: d.getDay(),
      weekend: d.getDay() === 5 || d.getDay() === 6,
      inMonth: true,
      today: key === today,
      holiday: hol[key] || null,
      eve: isHolidayEve(hol[key]),
    } as CalCell;
  });
  return { week: weekNumber(days[1].date), days };
}

// ───────────────────────────── items ─────────────────────────────

/** Tasks in these statuses are finished — they never take up a day. Mirrors EMS_CLOSED. */
const CLOSED = ['done', 'rejected', 'not_relevant', 'cancelled'];

const LAYER_ORDER: Record<Layer, number> = { absence: 0, event: 1, visit: 2, ems: 3 };

function personName(a: CalEmsTask['assignee']): string | null {
  if (!a) return null;
  const n = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  return n || null;
}

/** Is `person` the viewer? Hebrew names are compared loosely (the EMS name carries a surname). */
function isMine(person: string | null, me: string): boolean {
  if (!me) return false;
  if (!person) return false;
  return person === me || person.indexOf(me) !== -1 || me.indexOf(person) !== -1;
}

/**
 * THE one place the calendar's contents are decided. Everything downstream (the grid chips,
 * the day panel, the week rows, the route) reads this list and nothing else.
 *
 * `hideEms` DROPS the EMS layer. `onlyMine` does NOT drop anything — it marks: the island
 * dims what is not yours, because "the office event I am not in" still has to be on the
 * calendar or the day looks free when it is not. Callers that really want a filtered list
 * use `.filter(i => i.mine)`.
 */
export function calendarItems(src: CalendarSources, opts: CalendarOptions = {}): CalItem[] {
  const me = opts.me || '';
  const out: CalItem[] = [];

  for (const e of src.events || []) {
    const date = toKey(e.start);
    if (!date) continue;
    out.push({
      key: 'event:' + (e.id || date + ':' + e.title),
      date,
      layer: 'event',
      icon: '📅',
      title: e.title || 'אירוע',
      kibbutz: null,
      person: null,
      // An office event is everybody's: it is never dimmed by "רק שלי".
      mine: true,
      ...(e.hangoutLink ? { meetLink: String(e.hangoutLink) } : {}),
    });
  }

  for (const v of src.visits || []) {
    const date = toKey(v.date);
    if (!date) continue;
    const who = v.visitor || null;
    out.push({
      key: 'visit:' + (v.id || date + ':' + (v.kibbutz || '')),
      date,
      layer: 'visit',
      icon: '📍',
      title: (v.kibbutz || '') + (v.workday ? ' · יום עבודה' : ''),
      kibbutz: v.kibbutz || null,
      person: who,
      mine: isMine(who, me),
    });
  }

  if (!opts.hideEms) {
    for (const t of src.emsTasks || []) {
      const date = toKey(t.expectedCompletionDate);
      if (!date) continue;                                          // no due date → no place on a calendar
      if (t.status && CLOSED.indexOf(t.status) !== -1) continue;    // finished work is not a plan
      const who = personName(t.assignee);
      out.push({
        key: 'ems:' + t.id,
        date,
        layer: 'ems',
        icon: '📋',
        title: t.title || 'משימה',
        kibbutz: (t.site && t.site.name) || null,
        person: who,
        mine: isMine(who, me),
        taskId: t.id,
      });
    }
  }

  for (const a of src.absences || []) {
    for (const date of absenceDays(a)) {
      out.push({
        key: 'absence:' + a.id + ':' + date,
        date,
        layer: 'absence',
        icon: ABSENCE_ICONS[a.kind] || '🌴',
        title: ABSENCE_LABELS[a.kind] + (a.person ? ' · ' + a.person : ' · כל החברה') + (a.note ? ' · ' + a.note : ''),
        kibbutz: null,
        person: a.person,
        mine: a.person ? isMine(a.person, me) : true,
        kind: a.kind,
      });
    }
  }

  out.sort((x, y) =>
    x.date.localeCompare(y.date)
    || LAYER_ORDER[x.layer] - LAYER_ORDER[y.layer]
    || x.title.localeCompare(y.title, 'he'));
  return out;
}

/** The items of one day, in the order they were sorted into. */
export function itemsOn(items: CalItem[], date: string): CalItem[] {
  return items.filter(i => i.date === date);
}

/** `{ 'YYYY-MM-DD': CalItem[] }` — what the grid indexes by. */
export function byDate(items: CalItem[]): Record<string, CalItem[]> {
  const out: Record<string, CalItem[]> = {};
  for (const i of items) (out[i.date] = out[i.date] || []).push(i);
  return out;
}

// ───────────────────────────── grouping ─────────────────────────────

export interface KibbutzGroup {
  kibbutz: string;
  /** false for the "ללא קיבוץ" bucket — it gets no בריפינג / צ׳ק-אין actions. */
  real: boolean;
  items: CalItem[];
}

/**
 * A day, grouped the way a field day actually works: by the place you drive to. Hebrew
 * alphabetical, and the "ללא קיבוץ" bucket (office events, company absences) always LAST —
 * it is context, not a stop on the route.
 */
export function groupByKibbutz(items: CalItem[]): KibbutzGroup[] {
  const map = new Map<string, CalItem[]>();
  for (const i of items) {
    const k = i.kibbutz || NO_KIBBUTZ;
    const list = map.get(k);
    if (list) list.push(i); else map.set(k, [i]);
  }
  const groups: KibbutzGroup[] = [];
  for (const [kibbutz, list] of map) groups.push({ kibbutz, real: kibbutz !== NO_KIBBUTZ, items: list });
  groups.sort((a, b) => {
    if (a.real !== b.real) return a.real ? -1 : 1;
    return a.kibbutz.localeCompare(b.kibbutz, 'he');
  });
  return groups;
}

// ───────────────────────────── the route ─────────────────────────────

export interface RouteRow {
  kibbutz: string;
  header: RouteHeader;
  headerLabel: string;
  /** Position in the saved route, or -1 for an unplaced kibbutz. */
  index: number;
  /** How much is due there that day (EMS tasks + visits). */
  count: number;
  taskIds: string[];
}

/**
 * The saved order + whatever the day has that is NOT in it, with the headers DERIVED from
 * position (spec §7f: free-text headers are not needed and are not offered).
 *
 * `stops` is the person's own order from `day_plans`; `dueByKibbutz` is what the day actually
 * holds. A stop that no longer has anything due still shows — he put it there on purpose.
 */
export function routeWithHeaders(
  stops: string[],
  dueByKibbutz: Record<string, string[]> = {},
): RouteRow[] {
  const seen = new Set<string>();
  const placed: string[] = [];
  for (const s of stops || []) {
    const name = String(s || '').trim();
    if (!name || seen.has(name)) continue;       // a duplicate stop is a save bug, not a second visit
    seen.add(name);
    placed.push(name);
  }
  const rows: RouteRow[] = placed.map((kibbutz, i) => ({
    kibbutz,
    header: (i === 0 ? 'first' : i === placed.length - 1 ? 'last' : 'middle') as RouteHeader,
    headerLabel: '',
    index: i,
    count: (dueByKibbutz[kibbutz] || []).length,
    taskIds: (dueByKibbutz[kibbutz] || []).slice(),
  }));
  // One stop is the start of the day, not the end of it.
  if (rows.length === 1) rows[0].header = 'first';

  const rest = Object.keys(dueByKibbutz)
    .filter(k => k && k !== NO_KIBBUTZ && !seen.has(k))
    .sort((a, b) => a.localeCompare(b, 'he'));
  for (const kibbutz of rest) {
    rows.push({
      kibbutz,
      header: 'unplaced',
      headerLabel: '',
      index: -1,
      count: dueByKibbutz[kibbutz].length,
      taskIds: dueByKibbutz[kibbutz].slice(),
    });
  }
  for (const r of rows) r.headerLabel = ROUTE_HEADERS[r.header];
  return rows;
}

/** What the day holds per kibbutz — the second argument to `routeWithHeaders`. */
export function dueByKibbutz(items: CalItem[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of items) {
    if (!i.kibbutz) continue;
    const list = out[i.kibbutz] || (out[i.kibbutz] = []);
    if (i.taskId) list.push(i.taskId);
  }
  return out;
}

/**
 * Move one stop. Out-of-range indexes return the list UNCHANGED rather than throwing — ↑ on
 * the first row and ↓ on the last are ordinary taps, not errors, and a drag can end nowhere.
 */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const out = (list || []).slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** The `stops` jsonb `day_plans` stores: order + the tasks that were on each stop. */
export function stopsPayload(order: string[], due: Record<string, string[]> = {}): Array<{ kibbutz: string; task_ids: string[] }> {
  return (order || []).map(kibbutz => ({ kibbutz, task_ids: (due[kibbutz] || []).slice() }));
}

/** …and back. A payload written by an older build (plain strings) still reads. */
export function stopsOrder(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((s: any) => (typeof s === 'string' ? s : s && s.kibbutz))
    .filter((s: any): s is string => !!s && typeof s === 'string');
}

// ───────────────────────────── the EMS scheduler ─────────────────────────────

export interface TaskPatch {
  id: string;
  body: { expectedCompletionDate: string | null };
}

export interface SchedulePlan {
  patches: TaskPatch[];
  /** The exact PATCHes that put every task back where it was — the toast's undo. */
  undo: TaskPatch[];
  count: number;
  /** The toast text, already counted. */
  message: string;
}

/**
 * Midday, deliberately: EMS stores a full timestamp, and a date written at 00:00 local comes
 * back as the PREVIOUS day for anyone east of UTC. `saveEmsTask` in js/src/14-calendar.js
 * uses the same T12:00:00 for the same reason.
 */
export function dueAt(date: string): string {
  return new Date(date + 'T12:00:00').toISOString();
}

/**
 * "שבץ N משימות ל-<date>" as a pair of PATCH lists. Tasks already due that day are skipped —
 * re-writing the same date is a wasted round trip and a confusing undo.
 */
export function scheduleTasksPlan(tasks: CalEmsTask[], date: string): SchedulePlan {
  const patches: TaskPatch[] = [];
  const undo: TaskPatch[] = [];
  for (const t of tasks || []) {
    if (!t || !t.id) continue;
    const current = toKey(t.expectedCompletionDate);
    if (current === date) continue;
    patches.push({ id: t.id, body: { expectedCompletionDate: dueAt(date) } });
    undo.push({
      id: t.id,
      body: { expectedCompletionDate: current ? dueAt(current) : null },
    });
  }
  const count = patches.length;
  return {
    patches,
    undo,
    count,
    message: count === 1 ? 'משימה אחת נקבעה ל' + heShort(date) : count + ' משימות נקבעו ל' + heShort(date),
  };
}

// ───────────────────────────── absences ─────────────────────────────

/**
 * The days an absence really covers: every date in the range EXCEPT weekends and except a
 * holiday nobody was expected on. That is the same rule the attendance screen uses for
 * "missing", and it has to be — a vacation row generated for יום שישי would show up as a
 * work day in the monthly report.
 *
 * `holidays` is optional: the CALENDAR renders the full band (a vacation visually covers the
 * weekend it spans), while the attendance GENERATOR passes the list and gets work days only.
 */
export function absenceDays(a: AbsenceRow, holidays?: Holiday[]): string[] {
  const start = toKey(a.start_date);
  const end = toKey(a.end_date) || start;
  if (!start || end < start) return [];
  const hol = holidayMap(holidays);
  const out: string[] = [];
  let cursor = start;
  // 370 days is a year and a bit — a range longer than that is a typo, not a vacation.
  for (let i = 0; i < 370 && cursor <= end; i++) {
    if (holidays) {
      const h = hol[cursor];
      const skip = isWeekend(cursor) || (h && !h.required);
      if (!skip) out.push(cursor);
    } else {
      out.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Only these two have attendance rows to generate (spec §7f). */
export const ATTENDANCE_PEOPLE = ['אביאם', 'ניתאי'];

export interface GeneratedAttRow {
  person: string;
  date: string;
  dayType: 'vacation' | 'reserve';
  source: 'calendar';
  note: string;
}

/**
 * The attendance rows a 🌴/🪖 range generates. A 🎉 event generates NOTHING — it marks the day
 * not-required (like a holiday), which is a different table.
 *
 * `existing` is the person's manual rows: A MANUAL ROW ALWAYS WINS. Someone who typed "משרד"
 * on a day inside his own vacation range meant it.
 */
export function absenceAttendance(
  a: AbsenceRow,
  holidays: Holiday[] = [],
  existing: Array<{ person?: string; date: string; source?: string }> = [],
): GeneratedAttRow[] {
  if (a.kind === 'event') return [];
  const people = a.person ? [a.person] : ATTENDANCE_PEOPLE.slice();
  const manual = new Set(
    existing.filter(r => r.source !== 'calendar').map(r => (r.person || '') + '|' + toKey(r.date)),
  );
  const dayType = a.kind === 'reserve' ? 'reserve' : 'vacation';
  const out: GeneratedAttRow[] = [];
  for (const person of people) {
    if (ATTENDANCE_PEOPLE.indexOf(person) === -1) continue;   // nobody else files attendance
    for (const date of absenceDays(a, holidays)) {
      if (manual.has(person + '|' + date)) continue;
      out.push({ person, date, dayType, source: 'calendar', note: a.note || ABSENCE_LABELS[a.kind] });
    }
  }
  return out;
}

// ───────────────────────────── roles ─────────────────────────────

export interface CalendarAbilities {
  /** ➕ (schedule tasks, add an event, declare an absence). */
  canAdd: boolean;
  /** Drag + ↑↓ on the route. */
  canReorder: boolean;
  /** Enter an absence for SOMEONE ELSE. A technician may only do his own. */
  canAbsentOthers: boolean;
  /** The unified view of everyone (עמיחי / עידן). */
  seesEveryone: boolean;
}

/** Who may do what (spec §7f: "viewer sees the calendar read-only"). */
export function abilities(role: string, me: string): CalendarAbilities {
  if (role === 'viewer') {
    return { canAdd: false, canReorder: false, canAbsentOthers: false, seesEveryone: true };
  }
  const admin = role === 'idan' || me === 'עידן' || me === 'עמיחי';
  return { canAdd: true, canReorder: true, canAbsentOthers: admin, seesEveryone: admin };
}
