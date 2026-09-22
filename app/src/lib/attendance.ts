// 📅 נוכחות + 🕎 חגים — every decision the attendance screen makes, as pure functions
// (spec §7e). The island (app/src/islands/Attendance.tsx) renders these; it decides nothing
// of its own. Goldens: attendance.test.ts, September 2026.
//
// THE ONE RULE THIS FILE EXISTS FOR: a day is "missing" only when someone was expected.
// Friday and Saturday are not work days, and neither is an Israeli holiday or a company
// closure (`company_holidays.required = false`). Working on such a day is perfectly allowed
// — the day then counts as a work day and the report marks it 🕎 — but nobody is ever asked
// to explain a holiday he took.

// ───────────────────────────── types ─────────────────────────────

export type DayType = 'field' | 'office' | 'wfh' | 'reserve' | 'vacation' | 'off' | 'other';

export type HolidayKind = 'holiday' | 'chol_hamoed' | 'company_closure' | 'holiday_eve';

export interface Holiday {
  /** 'YYYY-MM-DD' */
  date: string;
  name: string;
  kind: HolidayKind;
  /** false (the usual case) = attendance is optional and the day is never missing. */
  required: boolean;
}

/** One day of a person's month, already merged (a day with two visits is ONE row). */
/**
 * One visit summary, as the legacy snapshot (`SHEET_DATA.visits`) carries it. Only the four
 * fields the attendance rule needs are typed; everything else on a visit is none of its
 * business.
 */
export interface VisitLike {
  id?: string;
  visitor?: string;
  /** 'YYYY-MM-DD' or anything Date-ish — the date the person says the visit happened on. */
  date?: unknown;
  kibbutz?: string;
  duration?: number | string;
  workday?: boolean;
}

export interface AttRow {
  /** 'YYYY-MM-DD' */
  date: string;
  type: DayType;
  kibbutz?: string;
  hours?: number;
  note?: string;
  /** Where the row came from — a visit summary or a manual entry. */
  source?: 'visit' | 'manual' | 'calendar';
}

/**
 * What a cell in the month grid is. `state` is the ONLY thing the grid colours by, so the
 * precedence is decided here once instead of in JSX:
 *   what he DID  →  weekend  →  holiday  →  today / future  →  missing
 * Work always wins: a field day on יום כיפור is green, with `onHoliday` for the 🕎.
 */
export type CellState = 'field' | 'office' | 'away' | 'weekend' | 'holiday' | 'today' | 'future' | 'missing';

export interface DayCell {
  date: string;
  day: number;
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  weekend: boolean;
  holiday: Holiday | null;
  /** Was anyone expected that day? */
  required: boolean;
  row: AttRow | null;
  state: CellState;
  today: boolean;
  /** A filled day that falls on a non-required holiday → the 🕎 marker in the reports. */
  onHoliday: boolean;
  /** ערב חג — a work day that needs a report, with מהבית as its default (round 2, F-5). */
  eve: boolean;
}

export interface MonthGrid {
  year: number;
  /** 1–12, NOT the JS 0-based month — every date in this file is an ISO string. */
  month: number;
  label: string;
  /** Blank cells before the 1st (Sunday-first). */
  lead: number;
  cells: DayCell[];
  weeks: Array<Array<DayCell | null>>;
}

export interface Kpis {
  field: number;
  office: number;
  away: number;
  days: number;
  missing: number;
  onHoliday: number;
  hours: number;
}

// ───────────────────────────── copy ─────────────────────────────

/** The same seven labels the legacy day-type buttons carry (js/src/04-attendance-daily.js). */
export const DAY_LABELS: Record<DayType, string> = {
  field: '🌾 יום שטח',
  office: '🏢 משרד',
  wfh: '🏠 מהבית',
  reserve: '🪖 מילואים',
  vacation: '🌴 חופש',
  off: '🚫 לא בעבודה',
  other: '➕ אחר',
};

/** The order the one-tap row offers them in — the common ones first. */
export const DAY_ORDER: DayType[] = ['field', 'office', 'wfh', 'vacation', 'reserve', 'off', 'other'];

export const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט',
  'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export const HE_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function dayLabel(type: DayType | string): string {
  return DAY_LABELS[type as DayType] || DAY_LABELS.other;
}

/**
 * What the day sheet says on a holiday. It INVITES (spec §6: positive, no system-talk) —
 * the person is not doing anything wrong by filling it in, and not doing anything wrong by
 * leaving it empty either.
 */
export function holidayNote(h: Holiday | null | undefined): string {
  if (isHolidayEve(h)) return h!.name + ' · ברירת המחדל היא ' + DAY_LABELS[EVE_DEFAULT_TYPE];
  if (!h || h.required) return '';
  return h.name + ' — הזנה אופציונלית';
}

// ───────────────────────────── ערבי חג (round 2, F-5) ─────────────────────────────
//
// An ערב חג is the opposite of a חג: people DO work, most of them from home, and the day is
// still required — the report is what tells עידן who was where. So the rule is two lines and
// no more: the kind marks the day, the default type is מהבית, and the screen offers to file
// that default after a short countdown the person can always stop.

/** The one type an ערב חג fills itself with unless the person says otherwise. */
export const EVE_DEFAULT_TYPE: DayType = 'wfh';

/** How long the day sheet waits before saving that default (ms). */
export const EVE_COUNTDOWN_MS = 4000;

export function isHolidayEve(h: Holiday | null | undefined): boolean {
  return !!h && h.kind === 'holiday_eve';
}

/** The countdown line, second by second. `secs` is whole seconds, floored at 0. */
export function eveCountdownText(secs: number): string {
  const n = Math.max(0, Math.round(secs));
  return 'נשמר ' + DAY_LABELS[EVE_DEFAULT_TYPE] + ' בעוד ' + n + '…';
}

/** The short label a grid cell shows under the number. */
export function holidayShort(h: Holiday | null | undefined): string {
  if (!h) return '';
  if (h.kind === 'holiday_eve') return 'ערב חג';
  if (h.kind === 'company_closure') return 'סגירה';
  if (h.kind === 'chol_hamoed') return 'חוה״מ';
  return 'חג';
}

// ───────────────────────────── dates ─────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** A local Date → 'YYYY-MM-DD'. Local on purpose: the work day is a WALL-CLOCK day here. */
export function ymd(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** 'YYYY-MM-DD' (or anything Date-ish) → 'YYYY-MM-DD', or '' when it is not a date at all. */
export function toYmd(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : ymd(d);
}

/** Day of week for an ISO date, 0 = Sunday. UTC maths so a timezone can never shift it. */
export function dowOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Friday (5) and Saturday (6). */
export const isWeekend = (date: string): boolean => dowOf(date) > 4;

/** 'YYYY-MM-DD' → '3.9' for a chip, and 'ג׳ 3.9' when the day letter helps. */
export function dm(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return d + '.' + m;
}

export function dayChip(date: string): string {
  return 'יום ' + HE_DAY_LETTERS[dowOf(date)] + ' · ' + dm(date);
}

// ───────────────────────────── holidays ─────────────────────────────

export function holidayIndex(holidays: Holiday[] | null | undefined): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const h of holidays || []) {
    const key = toYmd(h?.date);
    if (key) map.set(key, { ...h, date: key, required: !!h.required });
  }
  return map;
}

/**
 * Was anyone expected at work that day? Sun–Thu, unless a holiday row says otherwise.
 * This is the single predicate the grid, the chips, the legacy report and the push nudges
 * all answer with — the missing-days bug the spec warns about is exactly what happens when
 * two of them disagree.
 */
export function isRequiredDay(date: string, holidays: Holiday[] | Map<string, Holiday> | null | undefined): boolean {
  if (isWeekend(date)) return false;
  const idx = holidays instanceof Map ? holidays : holidayIndex(holidays);
  const h = idx.get(date);
  return !h || !!h.required;
}

// ───────────────────────────── the month grid ─────────────────────────────

/** `month` is 1–12. `rows` may hold any month; only this one's are used. */
export function monthGrid(
  year: number,
  month: number,
  rows: AttRow[] | null | undefined,
  holidays: Holiday[] | null | undefined,
  today: Date = new Date(),
): MonthGrid {
  const idx = holidayIndex(holidays);
  const byDate = new Map<string, AttRow>();
  for (const r of rows || []) {
    const key = toYmd(r?.date);
    if (key && key.slice(0, 7) === year + '-' + pad(month)) byDate.set(key, { ...r, date: key });
  }

  const todayKey = ymd(today);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();   // day 0 of next month = last of this
  const cells: DayCell[] = [];

  for (let d = 1; d <= days; d++) {
    const date = year + '-' + pad(month) + '-' + pad(d);
    const dow = dowOf(date);
    const weekend = dow > 4;
    const holiday = idx.get(date) || null;
    const required = !weekend && (!holiday || !!holiday.required);
    const row = byDate.get(date) || null;
    const isToday = date === todayKey;
    const onHoliday = !!row && !!holiday && !holiday.required;

    let state: CellState;
    if (row) state = row.type === 'field' ? 'field' : (row.type === 'office' || row.type === 'wfh') ? 'office' : 'away';
    else if (weekend) state = 'weekend';
    else if (holiday && !holiday.required) state = 'holiday';
    else if (isToday) state = 'today';
    else if (date > todayKey) state = 'future';
    else state = 'missing';

    cells.push({ date, day: d, dow, weekend, holiday, required, row, state, today: isToday, onHoliday,
      eve: isHolidayEve(holiday) });
  }

  const lead = cells.length ? cells[0].dow : 0;
  const weeks: Array<Array<DayCell | null>> = [];
  let week: Array<DayCell | null> = new Array(lead).fill(null);
  for (const c of cells) {
    week.push(c);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

  return { year, month, label: HE_MONTHS[month - 1] + ' ' + year, lead, cells, weeks };
}

/** The cells of one state — what the phone's chip row is built from. */
export function cellsOf(grid: MonthGrid, state: CellState): DayCell[] {
  return grid.cells.filter(c => c.state === state);
}

/**
 * Required weekdays of the month with nothing on them, from the 1st up to YESTERDAY.
 * Ascending ISO dates. `year`/`month` (1–12) default to the month `today` is in.
 */
export function missingDays(
  rows: AttRow[] | null | undefined,
  holidays: Holiday[] | null | undefined,
  today: Date = new Date(),
  year?: number,
  month?: number,
): string[] {
  const y = year ?? today.getFullYear();
  const m = month ?? today.getMonth() + 1;
  const grid = monthGrid(y, m, rows, holidays, today);
  const todayKey = ymd(today);
  return grid.cells.filter(c => c.state === 'missing' && c.date < todayKey).map(c => c.date);
}

/**
 * The three chips at the top of the phone screen (שטח · משרד · חסרים) plus what the desktop
 * table's footer adds. `missing` is passed in rather than recomputed so the number on screen
 * can never disagree with the chips under it.
 */
export function kpis(
  rows: AttRow[] | null | undefined,
  missing: string[] | null | undefined = [],
  holidays: Holiday[] | null | undefined = [],
): Kpis {
  const idx = holidayIndex(holidays);
  const out: Kpis = { field: 0, office: 0, away: 0, days: 0, missing: (missing || []).length, onHoliday: 0, hours: 0 };
  for (const r of rows || []) {
    const date = toYmd(r?.date);
    if (!date) continue;
    out.days++;
    out.hours += Number(r.hours) || 0;
    if (r.type === 'field') out.field++;
    else if (r.type === 'office' || r.type === 'wfh') out.office++;
    else out.away++;
    const h = idx.get(date);
    if (h && !h.required) out.onHoliday++;
  }
  out.hours = Math.round(out.hours * 100) / 100;
  return out;
}

/**
 * Missing days for SEVERAL people at once — the "who still owes days" overview עידן and
 * עמיחי get at the top of the attendance screen (עידן 20.9 #2).
 *
 * `rowsFor` is a reader rather than a map because the rows come out of the legacy
 * `SHEET_DATA` snapshot one person at a time, and that snapshot may not be there yet: a
 * reader that answers `null` means "not loaded", which is not the same as "nothing missing"
 * and must not be shown as a clean slate. Those people are returned with `known: false`.
 *
 * Holiday-aware by construction — it is `missingDays` per person, nothing else.
 */
export function missingByPerson(
  people: string[] | null | undefined,
  rowsFor: (person: string) => AttRow[] | null | undefined,
  holidays: Holiday[] | null | undefined,
  today: Date = new Date(),
  year?: number,
  month?: number,
): Array<{ person: string; dates: string[]; count: number; known: boolean }> {
  const out: Array<{ person: string; dates: string[]; count: number; known: boolean }> = [];
  for (const person of people || []) {
    if (!person) continue;
    const rows = rowsFor(person);
    if (rows == null) { out.push({ person, dates: [], count: 0, known: false }); continue; }
    const dates = missingDays(rows, holidays, today, year, month);
    out.push({ person, dates, count: dates.length, known: true });
  }
  // Worst first — the point of the strip is who needs chasing. Ties keep the roster order,
  // and an unknown person sorts last rather than pretending to be a zero.
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.known) - Number(a.r.known) || b.r.count - a.r.count || a.i - b.i)
    .map(x => x.r);
}

// ───────────────── a saved visit IS a יום שטח (round 2, F-2) ─────────────────
//
// THE RULE: a visit summary someone saved is that person's attendance for that date. Nobody
// files a יום שטח by hand after writing a summary, and nobody should have to — and when the
// visit's date is corrected, the field day MOVES with it: the new date becomes a field day,
// the old one goes back to being whatever it was without the visit (missing, unless a manual
// row or another summary covers it).
//
// It is written as a DERIVATION, not as a write: the field days are computed from the visit
// list every time, so an edited date needs nothing to be undone. The legacy snapshot already
// merges visits into the month (js/src/04-attendance-daily.js attRowsFor); this function is
// the same merge as a pure rule, and it is idempotent — running it over rows that already
// carry the visit days changes nothing and NEVER duplicates a date.

/** Hours a workday visit is worth when it carries no duration (the legacy WORKDAY_HOURS). */
export const WORKDAY_HOURS = 8;

/** The visits of one person, by date: 'YYYY-MM-DD' → the visits saved for that day. */
export function visitsByDate(
  visits: VisitLike[] | null | undefined,
  person?: string,
): Map<string, VisitLike[]> {
  const out = new Map<string, VisitLike[]>();
  for (const v of visits || []) {
    if (!v) continue;
    if (person && v.visitor && v.visitor !== person) continue;
    const date = toYmd(v.date);
    if (!date) continue;
    const list = out.get(date);
    if (list) list.push(v); else out.set(date, [v]);
  }
  return out;
}

/** The field day a date's visits add up to: kibbutzim joined, hours summed. */
export function visitDayRow(date: string, dayVisits: VisitLike[]): AttRow {
  const kibbutzim = Array.from(new Set(dayVisits.map(v => (v.kibbutz || '').trim()).filter(Boolean)));
  const hours = dayVisits.reduce(
    (s, v) => s + (v.workday ? WORKDAY_HOURS : (Number(v.duration) || 0)), 0);
  return {
    date,
    type: 'field',
    kibbutz: kibbutzim.join(', '),
    hours: Math.round(hours * 100) / 100,
    source: 'visit',
  };
}

/**
 * The person's month with every saved summary folded in as an automatic יום שטח.
 *
 * One row per date, always: a date that has a visit is a field day sourced `visit` (it wins
 * over a manual row — the summary is the stronger evidence), a date that has none keeps
 * whatever the person filed by hand. Sorted by date.
 */
export function withVisitDays(
  rows: AttRow[] | null | undefined,
  visits: VisitLike[] | null | undefined,
  person?: string,
): AttRow[] {
  const byDate = new Map<string, AttRow>();
  for (const r of rows || []) {
    const date = toYmd(r?.date);
    if (!date) continue;
    // A row the legacy merge already derived from a visit is dropped here and rebuilt below
    // from the visits themselves — that is what makes an edited visit date move the day
    // instead of leaving a ghost behind.
    if (r.source === 'visit') continue;
    byDate.set(date, { ...r, date });
  }
  for (const [date, dayVisits] of visitsByDate(visits, person)) {
    byDate.set(date, visitDayRow(date, dayVisits));
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ───────────────── the month's gaps, for whoever asks (round 2, F-4) ─────────────────

/** How a caller hands over a month: 'YYYY-MM', or the pair. */
export type MonthRef = string | { year: number; month: number };

export function monthRef(m: MonthRef, today: Date = new Date()): { year: number; month: number } {
  if (typeof m === 'string') {
    const mm = /^(\d{4})-(\d{2})/.exec(m);
    if (mm) return { year: Number(mm[1]), month: Number(mm[2]) };
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }
  return { year: m.year, month: m.month };
}

/**
 * The missing days of ONE person in ONE month — the question the calendar asks so it can
 * paint those cells red (Package G owns the cell; this owns the answer, so the two screens
 * can never disagree).
 *
 * `rowsFor` defaults to the legacy snapshot reader on the bridge, which is what makes the
 * call site a one-liner: `missingDaysFor('ניתאי', '2026-09')`. It answers `[]` when the
 * snapshot is not there yet — "nothing to paint", never "nothing missing" — and a caller
 * that wants to tell the two apart passes its own reader.
 */
export function missingDaysFor(
  person: string,
  month: MonthRef,
  rowsFor?: (person: string, year: number, month: number) => AttRow[] | null | undefined,
  holidays?: Holiday[] | null,
  today: Date = new Date(),
): string[] {
  const { year, month: m } = monthRef(month, today);
  const read = rowsFor || defaultRowsFor;
  const rows = read(person, year, m);
  if (!rows) return [];
  const hol = holidays ?? defaultHolidays();
  return missingDays(rows, hol, today, year, m);
}

function bridge(): any {
  try { return (globalThis as any).sigma || null; } catch { return null; }
}

function defaultRowsFor(person: string, year: number, month: number): AttRow[] | null {
  try { return (bridge()?.attRows?.(person, year, month) || null) as AttRow[] | null; } catch { return null; }
}

function defaultHolidays(): Holiday[] {
  try { return (bridge()?.attHolidays?.() || []) as Holiday[]; } catch { return []; }
}

// ───────────────── who may look, who may write (round 2, F-6) ─────────────────
//
// אביאם asked to SEE ניתאי's month so he can tell him to fill it in; he is not asking to
// fill it in for him. So the two questions are answered separately: switching person is
// wide, editing someone else's day is not.

export interface AttViewerFlags {
  isIdan?: boolean;
  isViewer?: boolean;
}

/** The two field workers see each other (read), and so do עידן · עמיחי · צפייה. */
export function canSwitchPerson(user: string, flags: AttViewerFlags = {}): boolean {
  return !!flags.isIdan || !!flags.isViewer || user === 'עמיחי'
    || user === 'אביאם' || user === 'ניתאי';
}

/** Writing a day: your own month always; someone else's only for עידן and עמיחי. */
export function canEditAttendance(user: string, person: string, flags: AttViewerFlags = {}): boolean {
  if (!person || person === user) return !flags.isViewer;
  return !!flags.isIdan || user === 'עמיחי';
}
