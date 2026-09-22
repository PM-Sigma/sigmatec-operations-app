// Field-worker arrival flow, briefing and the 2 h nudge — ALL of its decisions (spec §5).
//
// Everything here is PURE: no React, no DOM, no network, no imports. Three consumers rely on
// that, and the third is the reason for the rule:
//   1. app/src/islands/Field.tsx      — the arrival sheet, the briefing, the "היום" strip
//   2. app/src/lib/field.test.ts      — the goldens
//   3. supabase/functions/push-send/field.ts — a BYTE-IDENTICAL copy, because Deno cannot
//      import out of app/src. test-field.mjs fails the build on any drift, so treat that file
//      as generated: edit THIS one and copy it over.
//
// Keep this module import-free.

// ───────────────────────────── who is a field worker ─────────────────────────────

/** The two people the arrival flow exists for (`ATT_PEOPLE` in the legacy bundle). */
export const FIELD_PEOPLE = ['אביאם', 'ניתאי'];

// ───────────────────────────── shared row shapes ─────────────────────────────

export interface CheckinRow {
  id: string;
  person: string;
  kibbutz: string;
  /** ISO instant. */
  checked_in_at: string;
  reminded_at?: string | null;
  dismissed?: boolean | null;
}

export interface VisitRow {
  id?: string;
  visitor?: string;
  kibbutz?: string;
  /** yyyy-mm-dd */
  date?: string;
  summary?: string | null;
  open_items?: string | null;
  items?: Array<{ product?: string; qty?: number | string }> | null;
}

export interface DraftRow {
  id: string;
  person: string;
  kibbutz: string;
  date: string;
  updated_at?: string;
  payload?: Record<string, unknown> | null;
}

export interface FieldTask {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  expectedCompletionDate?: string;
  assignee?: { firstName?: string; lastName?: string } | null;
  site?: { id?: string; name?: string } | null;
  /** The kibbutz this task belongs to, resolved by the caller from the site map. */
  kibbutz?: string;
}

export interface OrderRow {
  id?: string;
  kibbutz?: string;
  status?: string;
  order_type?: string;
  orderType?: string;
  notes?: string;
  items?: Array<{ product?: string; qty?: number | string }> | null;
}

// ───────────────────────────── dates ─────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-mm-dd in the LOCAL calendar (the phone's), which is what the client stores. */
export function dayOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "11.9" — the short date a field worker reads. */
export function dm(iso: string | null | undefined): string {
  const s = String(iso || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${+m[3]}.${+m[2]}` : '';
}

/** "09:12" in the reader's own clock. */
export function hm(iso: string | null | undefined): string {
  const t = new Date(String(iso || ''));
  if (isNaN(t.getTime())) return '';
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export interface IsraelParts { date: string; hh: number; mm: number }

/**
 * Wall-clock in Israel for an instant, DST-correct via Intl. The same trick `israelNow()` in
 * push-send uses — the reminder's 20:00 cap and the quiet hours are Israel-local facts, and a
 * fixed UTC offset would be an hour wrong for half the year.
 */
export function israelParts(at: Date | string | number = new Date()): IsraelParts {
  const d = at instanceof Date ? at : new Date(at);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || '0';
  let hh = +g('hour'); if (hh === 24) hh = 0;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hh, mm: +g('minute') };
}

/** The instant (epoch ms) of `hh:mm` Israel time on the Israel-local day of `ref`. */
export function israelAt(ref: Date | string | number, hh: number, mm = 0): number {
  const { date } = israelParts(ref);
  const [y, m, d] = date.split('-').map(Number);
  // Offset = (the same wall clock read as UTC) − (the real instant). Evaluated ON that day, so
  // summer and winter each get their own answer.
  const probe = Date.UTC(y, m - 1, d, 12, 0);
  const pp = israelParts(new Date(probe));
  const asUtc = Date.UTC(+pp.date.slice(0, 4), +pp.date.slice(5, 7) - 1, +pp.date.slice(8, 10), pp.hh, pp.mm);
  const offset = asUtc - probe;
  return Date.UTC(y, m - 1, d, hh, mm) - offset;
}

// ───────────────────────────── the arrival list ─────────────────────────────

export type ArrivalGroup = 'plan' | 'tasks' | 'recent' | 'rest';

export interface ArrivalItem {
  name: string;
  /** The one line under the name — why this kibbutz is on the list at all. */
  why: string;
  /** Open tasks of mine there (0 for the lower groups) — the badge on the row. */
  count: number;
  group: ArrivalGroup;
}

export const ARRIVAL_GROUP_LABEL: Record<ArrivalGroup, string> = {
  plan: 'המסלול שלך היום',
  tasks: 'יש לך משימות פתוחות',
  recent: 'ביקרת לאחרונה',
  rest: 'כל הקיבוצים',
};

const nameOf = (k: string | { name?: string; display_name?: string | null }): string =>
  typeof k === 'string' ? k : String(k?.name || '');

const labelOfKibbutz = (k: string | { name?: string; display_name?: string | null }): string =>
  typeof k === 'string' ? k : String(k?.display_name || k?.name || '');

const heb = (a: string, b: string) => a.localeCompare(b, 'he');

export interface ArrivalInput {
  /** Every card on the page (names or rows). */
  kibbutzim: Array<string | { name?: string; display_name?: string | null }>;
  /** My open EMS tasks, already resolved to a kibbutz by the caller. */
  myTasks: FieldTask[];
  /** Saved visits (any person) — "ביקרת לאחרונה" is about MY visits. */
  visits: VisitRow[];
  me: string;
  /** Today's route from `day_plans`, in the order the person arranged it. May be absent. */
  plan?: string[];
  now?: Date;
}

/**
 * The order the arrival sheet offers kibbutzim in (spec §5.1 + ruling: the day plan first
 * when there is one). Each kibbutz appears ONCE, in the highest group that claims it:
 *   plan   — today's route, in the person's own order
 *   tasks  — my open EMS tasks there, most tasks first, then א״ב
 *   recent — I visited it lately, newest first
 *   rest   — everything else, א״ב
 */
export function arrivalOrder(i: ArrivalInput): ArrivalItem[] {
  const now = i.now || new Date();
  const names = (i.kibbutzim || []).map(nameOf).filter(Boolean);
  const label = new Map<string, string>();
  for (const k of i.kibbutzim || []) { const n = nameOf(k); if (n) label.set(n, labelOfKibbutz(k)); }

  const tasksBy = new Map<string, FieldTask[]>();
  for (const t of i.myTasks || []) {
    const k = String(t?.kibbutz || t?.site?.name || '');
    if (!k) continue;
    const list = tasksBy.get(k) || [];
    list.push(t);
    tasksBy.set(k, list);
  }

  const lastVisit = new Map<string, string>();
  for (const v of i.visits || []) {
    if (!v || !v.kibbutz || (i.me && v.visitor !== i.me)) continue;
    const d = String(v.date || '').slice(0, 10);
    if (!d) continue;
    const prev = lastVisit.get(v.kibbutz);
    if (!prev || d > prev) lastVisit.set(v.kibbutz, d);
  }
  // "Recently" = the last 30 days. Older than that is not a memory, it is history.
  const cutoff = dayOf(new Date(now.getTime() - 30 * 86400_000));

  const seen = new Set<string>();
  const out: ArrivalItem[] = [];
  const push = (name: string, group: ArrivalGroup, why: string, count: number) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, why, count, group });
  };

  const whyTasks = (list: FieldTask[]) =>
    list.slice(0, 2).map(t => String(t.title || '').trim()).filter(Boolean).join(' · ');

  for (const n of i.plan || []) {
    const list = tasksBy.get(n) || [];
    const why = list.length ? whyTasks(list) : 'משובץ למסלול של היום';
    push(n, 'plan', why, list.length);
  }

  const withTasks = names
    .filter(n => !seen.has(n) && (tasksBy.get(n) || []).length)
    .sort((a, b) => (tasksBy.get(b)!.length - tasksBy.get(a)!.length) || heb(a, b));
  for (const n of withTasks) push(n, 'tasks', whyTasks(tasksBy.get(n)!), tasksBy.get(n)!.length);

  const recent = names
    .filter(n => !seen.has(n) && (lastVisit.get(n) || '') >= cutoff)
    .sort((a, b) => (lastVisit.get(b)! < lastVisit.get(a)! ? -1 : lastVisit.get(b)! > lastVisit.get(a)! ? 1 : heb(a, b)));
  for (const n of recent) push(n, 'recent', 'ביקור אחרון ' + dm(lastVisit.get(n)!), 0);

  for (const n of names.filter(x => !seen.has(x)).sort(heb)) push(n, 'rest', '', 0);

  // A row whose display name differs from its key says so under the name — otherwise a
  // technician searching for "שדה אליהו חקלאות" cannot tell two rows apart.
  return out.map(it => {
    const shown = label.get(it.name);
    return shown && shown !== it.name && !it.why ? { ...it, why: shown } : it;
  });
}

/** The groups, in order, with their rows — what the sheet actually renders. */
export function arrivalGroups(items: ArrivalItem[]): Array<{ group: ArrivalGroup; label: string; items: ArrivalItem[] }> {
  const order: ArrivalGroup[] = ['plan', 'tasks', 'recent', 'rest'];
  return order
    .map(g => ({ group: g, label: ARRIVAL_GROUP_LABEL[g], items: (items || []).filter(x => x.group === g) }))
    .filter(g => g.items.length > 0);
}

// ───────────────────────────── should we ask at all ─────────────────────────────

export interface PromptInput {
  me: string;
  /** yyyy-mm-dd, the phone's own day. */
  today: string;
  /** `checkin_today` — the last check-in this device recorded. */
  checkin?: { date?: string; kibbutz?: string } | null;
  /** The day the person tapped "לא בקיבוץ היום". */
  dismissedDate?: string | null;
  isViewer?: boolean;
  people?: string[];
}

/**
 * "Ask him where he arrived?" — true only for a field worker, on a day he has neither checked
 * in nor said he is not out (spec §5.1). Deliberately conservative: everything unknown is a
 * reason NOT to interrupt.
 */
export function fieldShouldPrompt(i: PromptInput): boolean {
  if (!i || i.isViewer) return false;
  const people = i.people && i.people.length ? i.people : FIELD_PEOPLE;
  if (!people.includes(String(i.me || '').trim())) return false;
  if (!i.today) return false;
  if (i.checkin && String(i.checkin.date || '').slice(0, 10) === i.today) return false;
  if (String(i.dismissedDate || '').slice(0, 10) === i.today) return false;
  return true;
}

// ───────────────────────────── the briefing ─────────────────────────────

/**
 * What a `field` role may see (spec §5.1b "clean"). Everything a technician acts on in the
 * field is `true`; management signals are `false` for him and `true` for everyone else.
 */
export function audienceFor(role: string): {
  health: boolean; onboarding: boolean; billing: boolean; officeNotes: boolean; usage: boolean; admin: boolean;
} {
  const field = role === 'field';
  return {
    health: !field, onboarding: !field, billing: !field,
    officeNotes: !field, usage: !field, admin: !field,
  };
}

/** A meeting bullet is shown in the field view when it is tagged for the field, or untagged. */
export function bulletForField(audience: string | null | undefined): boolean {
  const a = String(audience || 'all');
  return a === 'all' || a === 'field';
}

export type LeaveKind = 'task' | 'prev' | 'order' | 'alert' | 'burn';

export interface LeaveItem {
  /** Stable within one briefing — the checkbox state and the prefill both key on it. */
  id: string;
  text: string;
  /** The small grey line: where this item came from. */
  sub: string;
  kind: LeaveKind;
  /** Mine-first ordering inside the task group. */
  mine?: boolean;
  /** `burn` rows only — the meter_burns row this checkbox marks ✅ נצרב (Task 23). */
  meterId?: string;
}

/** Split "מה נשאר פתוח" free text into one row per item (newlines, bullets, semicolons). */
export function splitOpenItems(text: string | null | undefined): string[] {
  return String(text || '')
    .split(/[\n;•·]+/g)
    .map(s => s.trim().replace(/^[-–—*]\s*/, '').trim())
    .filter(s => s.length > 1);
}

const isOpenOrder = (o: OrderRow): boolean => {
  const type = o.order_type || o.orderType || (/בקשת לקוח/.test(o.notes || '') ? 'customer' : 'supplier');
  if (type !== 'customer') return false;
  const st = String(o.status || '');
  return st !== 'delivered' && st !== 'cancelled' && st !== 'canceled' && st !== 'done';
};

export interface ChecklistInput {
  tasks: FieldTask[];
  prevVisit?: VisitRow | null;
  orders?: OrderRow[];
  me: string;
  kibbutz: string;
  /** 🔥 צריבות (Task 23) — already built by lib/burns.ts `burnLeaveItems`, appended last. */
  burns?: LeaveItem[];
}

/**
 * "לפני שיוצאים" (spec §5.1b "complete"): every open item at this kibbutz as one checkbox
 * row — my EMS tasks first, then the rest of them, then what the previous visit left open,
 * then stock a customer order is still waiting for. Whatever he leaves UNCHECKED pre-fills
 * "מה נשאר לי פתוח" in the visit form, so nothing quietly disappears when he drives away.
 */
export function leaveChecklist(i: ChecklistInput): LeaveItem[] {
  const out: LeaveItem[] = [];
  const mineFirst = [...(i.tasks || [])].sort((a, b) => Number(isMine(b, i.me)) - Number(isMine(a, i.me)));
  for (const t of mineFirst) {
    const mine = isMine(t, i.me);
    out.push({
      id: 'task:' + String(t.id),
      text: String(t.title || '').trim(),
      sub: 'משימת EMS · ' + (mine ? 'באחריותך' : assigneeName(t) || 'ללא אחראי'),
      kind: 'task',
      mine,
    });
  }
  const prev = i.prevVisit;
  if (prev && prev.open_items) {
    const who = [prev.visitor, dm(prev.date)].filter(Boolean).join(', ');
    splitOpenItems(prev.open_items).forEach((text, n) => {
      out.push({ id: 'prev:' + n, text, sub: 'נשאר פתוח מהביקור הקודם' + (who ? ` (${who})` : ''), kind: 'prev' });
    });
  }
  for (const o of (i.orders || []).filter(o => o && o.kibbutz === i.kibbutz && isOpenOrder(o))) {
    for (const it of o.items || []) {
      const qty = parseInt(String(it?.qty ?? ''), 10);
      const product = String(it?.product || '').trim();
      if (!product) continue;
      out.push({
        id: 'order:' + String(o.id) + ':' + product,
        text: (qty > 0 ? `לספק ${qty} × ` : 'לספק ') + product,
        sub: 'הזמנת לקוח' + (o.id ? ' #' + String(o.id).slice(0, 8) : ''),
        kind: 'order',
      });
    }
  }
  // 🔥 צריבות last: they are a temporary project, so they never push the kibbutz's own
  // open work down the list — but the technician still sees them before he drives away.
  for (const b of i.burns || []) out.push(b);
  return out.filter(x => x.text);
}

function isMine(t: FieldTask, me: string): boolean {
  return !!me && assigneeName(t).includes(me);
}
function assigneeName(t: FieldTask): string {
  const a = t?.assignee;
  return a ? [a.firstName, a.lastName].filter(Boolean).join(' ').trim() : '';
}

/**
 * The tasks a briefing lists (round 2 · G4). EVERY open task of the kibbutz — a due date is
 * an EMS bookkeeping field, not a statement about what is waiting at the gate, and a
 * technician standing there needs the whole of it. Closed work is the only thing dropped.
 */
export const BRIEF_CLOSED = ['done', 'rejected', 'not_relevant', 'cancelled'];

export function briefingTasks(tasks: FieldTask[] | null | undefined): FieldTask[] {
  return (tasks || []).filter(t => !!t && BRIEF_CLOSED.indexOf(String(t.status || '')) === -1);
}

/** The 🔥 rows of a checklist — the collapsed category's contents (round 2 · G6). */
export function burnRowsOf(items: LeaveItem[] | null | undefined): LeaveItem[] {
  return (items || []).filter(x => x && x.kind === 'burn');
}

/** …and its one summary line, so the category says what it holds while it is still shut. */
export function burnSummary(items: LeaveItem[] | null | undefined, checked: Record<string, boolean> = {}): string {
  const rows = burnRowsOf(items);
  if (!rows.length) return '';
  const left = rows.filter(x => !checked[x.id]).length;
  if (!left) return 'הכל נצרב כאן';
  return left === 1 ? 'מונה אחד ממתין לצריבה' : left + ' מונים ממתינים לצריבה';
}

/**
 * Round 2 · G6 — today's briefing opens ON THE FIRST ENTRY OF THE DAY, once. It needs a
 * route to open on (the first stop), and the latch is the last date it was shown: a reload
 * at noon does not re-open it, and tomorrow morning it opens again.
 *
 * Returns the kibbutz to open, or '' for "not now".
 */
export function briefingAutoOpen(i: {
  today: string;
  stops: string[] | null | undefined;
  lastShown?: string | null;
  isViewer?: boolean;
}): string {
  if (i.isViewer) return '';
  if (!i.today) return '';
  if (String(i.lastShown || '') === i.today) return '';
  const first = (i.stops || []).map(s => String(s || '').trim()).filter(Boolean)[0];
  return first || '';
}

/** The unchecked rows, as the one block of text the visit form's "מה נשאר לי פתוח" starts from. */
export function openItemsPrefill(items: LeaveItem[], checked: Record<string, boolean>): string {
  // `burn` rows are DELIBERATELY left out (Task 23): an unburned meter is not lost — it is a
  // row in `meter_burns` that the card chip, the strip and tomorrow's briefing all still
  // show. Ten meter serials pasted into a visit summary would be noise, not memory.
  return (items || []).filter(x => x.kind !== 'burn' && !checked?.[x.id]).map(x => x.text).join('\n');
}

/**
 * "No button without purpose" (mockup note, §7k): 🚚 תעודת משלוח appears only when there IS
 * something to hand over — an open customer order for this kibbutz, or products already
 * ticked in today's draft.
 */
export function hasSomethingToDeliver(
  kibbutz: string, orders?: OrderRow[] | null, draft?: DraftRow | null,
): boolean {
  const open = (orders || []).some(o => o && o.kibbutz === kibbutz && isOpenOrder(o) && (o.items || []).length > 0);
  if (open) return true;
  const items = (draft?.payload as any)?.items;
  return Array.isArray(items) && items.some((it: any) => it && (parseInt(String(it.qty ?? ''), 10) > 0 || it.checked));
}

// ───────────────────────────── the "היום" strip (§7k #11) ─────────────────────────────

export interface TodayStop {
  name: string;
  /** 1-based position in the route. */
  n: number;
  /** A visit is filed for it — the chip is struck through. */
  done: boolean;
  /** "2 משימות" / "צ׳ק-אין 09:12" — the short note on the chip. */
  note: string;
}

export interface TodayInput {
  me: string;
  today: string;
  checkins: CheckinRow[];
  visits: VisitRow[];
  plan?: string[];
  tasksByKibbutz?: Record<string, number>;
}

/**
 * Today's stops: the day plan first (the order he arranged), then anywhere he checked in that
 * is not already in it. A stop is `done` once a visit for it is filed.
 */
export function todayStops(i: TodayInput): TodayStop[] {
  const mine = (i.checkins || []).filter(c => c && c.person === i.me && israelParts(c.checked_in_at).date === i.today);
  const filed = new Set(
    (i.visits || [])
      .filter(v => v && v.visitor === i.me && String(v.date || '').slice(0, 10) === i.today)
      .map(v => String(v.kibbutz)),
  );
  const order: string[] = [];
  for (const n of i.plan || []) if (n && !order.includes(n)) order.push(n);
  for (const c of mine) if (!order.includes(c.kibbutz)) order.push(c.kibbutz);

  return order.map((name, idx) => {
    const c = mine.find(x => x.kibbutz === name);
    const tasks = i.tasksByKibbutz?.[name] || 0;
    const note = c ? 'צ׳ק-אין ' + hm(c.checked_in_at) : tasks ? tasks + ' משימות' : '';
    return { name, n: idx + 1, done: filed.has(name), note };
  });
}

export interface OpenNudge { checkinId: string; kibbutz: string; text: string; hasDraft: boolean }

/**
 * The in-app banner (§7k #4) — the same 2 h timer as the push, rendered client-side so it
 * shows even when the push never arrived. No quiet hours and no daily cap here: this is not a
 * notification, it is the screen telling him what is still open while he is looking at it.
 */
export function openNudges(i: {
  me: string; checkins: CheckinRow[]; visits: VisitRow[]; drafts?: DraftRow[]; now?: Date;
}): OpenNudge[] {
  const now = (i.now || new Date()).getTime();
  const out: OpenNudge[] = [];
  for (const c of i.checkins || []) {
    if (!c || c.person !== i.me || c.dismissed) continue;
    const at = new Date(c.checked_in_at).getTime();
    if (isNaN(at) || now - at < 2 * 3600_000 || now - at > 14 * 3600_000) continue;
    const day = israelParts(c.checked_in_at).date;
    const filed = (i.visits || []).some(v => v && v.visitor === c.person && v.kibbutz === c.kibbutz
      && String(v.date || '').slice(0, 10) === day);
    if (filed) continue;
    const hasDraft = (i.drafts || []).some(d => d && d.person === c.person && d.kibbutz === c.kibbutz && d.date === day);
    out.push({
      checkinId: c.id,
      kibbutz: c.kibbutz,
      hasDraft,
      text: hasDraft
        ? `יש לך טיוטה פתוחה על ${c.kibbutz} — עוד דקה וזה סגור`
        : `${c.kibbutz} — עוד לא סיכמת את הביקור (שעתיים)`,
    });
  }
  return out;
}

// ───────────────────────────── push copy (spec §5.2) ─────────────────────────────

export interface Nudge { t: string; b: string }

/**
 * The rotating pool. Index = hash(checkin id) mod N, so the same check-in always reads the
 * same words (a re-send is not a new message) and consecutive days differ. Tone is fixed by
 * §5.2: positive only, our world (שטח, מונים, חיוב, ישיבה), never a threat, never "לא נספר".
 *
 * 0–15 are §5.2's sixteen. 16–18 are the visit-context variants accepted in §7k row ג
 * (adoption report §3.5, the three "close the last little things" ones) — they read as a
 * visit nudge, which the day-log and stock-recount variants in that report do not, so those
 * stay in their own pools below until their own modes exist.
 */
export const VISIT_NUDGES: Nudge[] = [
  { t: 'עוד לא סיכמת את הביקור', b: '2 דקות עכשיו חוסכות טלפונים בסוף החודש. מה נעשה, מה נשאר? וסיימת את {kibbutz} נקי 💪' },
  { t: 'סוגרים עכשיו, נחים אחר כך', b: 'רבע שעה של פוקוס עכשיו, ושקט נפשי מוחלט בסוף החודש 🧘‍♂️' },
  { t: 'העתיד שלך מודה לך', b: 'תחשוב על עצמך ב-30 לחודש שותה קפה בנחת, בלי לרדוף אחרי מה היה ב{kibbutz} ☕✨' },
  { t: 'שליטה על השטח', b: 'מה שכתוב נשמר. מה שבראש נעלם. הסיכום של {kibbutz} הוא הכוח שלך בישיבה הבאה 💪' },
  { t: 'חוק ה-10 דקות', b: 'פשוט תתחיל. שתי שורות על {kibbutz} וזה זורם מעצמו ונמחק מהראש ⏱️🚀' },
  { t: 'כל מונה מקבל כתובת', b: 'משימה קטנה אחת שחוסכת טלפונים והפתעות בחיוב של {kibbutz} 🎯' },
  { t: 'מורידים משקל מהכתפיים', b: 'אין תחושה משחררת יותר מלסמן וי על הביקור ב{kibbutz} כבר עכשיו 📋✔️' },
  { t: 'זמן שווה זהב', b: 'השעה שתחסוך בסוף החודש שווה יותר מהדקות האלה עכשיו. תשקיע אותן בעצמך ⏳🙌' },
  { t: 'מקצוען של השטח', b: 'ככה בדיוק עובד מי שמנהל את הקיבוצים שלו ולא נותן להם לנהל אותו 💼😎' },
  { t: 'בלי דרמות ברגע האחרון', b: 'סוגרים את {kibbutz} בלי לחץ, בלי פאניקה, בשיא הסטייל 🧊👌' },
  { t: 'צעד קטן, תוצאה גדולה', b: 'נראה טכני, אבל הסיכום של {kibbutz} הוא הפעולה הכי חכמה שתעשה היום 🧠📈' },
  { t: 'ניצחון קל על הדחיינות', b: 'שלוק מים, שתי דקות, וסוגרים את הפינה של {kibbutz} כמו אלוף 🥊🏆' },
  { t: 'שקט בשטח, שקט בראש', b: 'סיכום ביקור שנכתב בזמן מביא את השינה הכי טובה בלילה 😴' },
  { t: 'חוסך לעצמך כאב ראש', b: 'מה שלוקח עכשיו 2 דקות ייקח פי ארבעה כשינסו לשחזר את {kibbutz} בסוף החודש 💡🛡️' },
  { t: 'הרגלים של תותח', b: 'עוד ביקור אחד מתועד באותו יום. ככה נבנה שם של איש שטח מסודר 🏗️🔥' },
  { t: 'יאללה, לגמור עם זה', b: 'מוזיקה טובה ברקע, שתי שורות על {kibbutz}, ועוד דקה אתה חופשי לגמרי 🎧' },
  { t: 'כמה דברים קטנים מחכים לך', b: '2 דקות על {kibbutz} וזהו, הכל סגור ומסודר ✅' },
  { t: 'הרשימה שלך כמעט נקייה', b: 'נשאר הסיכום של {kibbutz}, תגמור את זה ותתפנה לגמרי 🧹' },
  { t: 'סדר עושה שקט', b: 'כל סגירה של ביקור היא עוד דבר שיורד לך מהראש 🧠✔️' },
];

/** Adoption report §3.5, 📝 יומן היום. Their mode is Task 16; the words are pinned here. */
export const DAYLOG_NUDGES: Nudge[] = [
  { t: 'שתי דקות והיום סגור', b: 'דבר לתוך הטלפון על היום, הבינה המלאכותית עושה את השאר, אתה רק מאשר 🎙️✨' },
  { t: 'תן לפה לעבוד במקום לאצבעות', b: 'ספר מה קרה היום ב-2 משפטים, זה כל מה שצריך כדי שהיום ייכנס למערכת 🗣️📋' },
  { t: 'סוף יום, לא סוף כוח', b: 'שיחה קצרה של דקה מתעדת את כל היום, תשאיר את זה מאחוריך ותנוח 🌙' },
];

/**
 * Adoption report §3.5, 📋 הפערים שלי (rows 4–6): the words the `gapReminder` mode sends.
 *
 * The same three sentences also sit in VISIT_NUDGES at 16–18, rewritten there around ONE
 * kibbutz ("2 דקות על {kibbutz}"). These are the originals, a gaps nudge is about a LIST,
 * not a place, so `{n}` is the only substitution and no kibbutz is ever named.
 */
export const GAP_NUDGES: Nudge[] = [
  { t: 'כמה דברים קטנים מחכים לך', b: '2 דקות בפערים האישיים שלך וזהו, הכל סגור ומסודר ✅' },
  { t: 'הרשימה שלך כמעט נקייה', b: 'נשארו {n} פריטים ברשימת הפערים, תגמור את זה ותתפנה לגמרי 🧹' },
  { t: 'סדר עושה שקט', b: 'תסתכל רגע בפערים שלך, כל סגירה שם היא עוד דבר שיורד מהראש 🧠✔️' },
];

/**
 * The exact words one gaps nudge goes out with. `key` pins the rotation — person + day, so
 * the single nudge he may get today always reads the same (a retry is not a new message) and
 * tomorrow's differs.
 *
 * The plural line is skipped when there is exactly one gap: "נשארו 1 פריטים" is the kind of
 * sentence that tells a person a machine wrote it, and §7h's copy rule is that every line is
 * addressed to him. One gap therefore falls back to the neighbouring words, which carry no
 * count at all.
 */
export function gapNudgeFor(key: string, count: number): { title: string; body: string } {
  let i = hashIdx(key, GAP_NUDGES.length);
  if (count === 1 && GAP_NUDGES[i].b.indexOf('{n}') !== -1) i = (i + 1) % GAP_NUDGES.length;
  const n = GAP_NUDGES[i];
  return { title: `📋 ${n.t}`, body: n.b.replace(/\{n\}/g, String(count)) };
}

/** Adoption report §3.5 — ספירת מלאי מחדש. Their mode is the inventory work, not this task. */
export const RECOUNT_NUDGES: Nudge[] = [
  { t: 'כמעט שם עם המלאי', b: 'נשאר רק להסביר בכמה מילים מה קרה עם הספירה — ואז הכל מתועד נכון 📦📝' },
  { t: 'המספרים שלך חשובים', b: 'ספירה מדויקת עכשיו חוסכת בלבול לכולם בסוף החודש — תודה שאתה מדייק 🔢🙏' },
  { t: 'מלאי מדויק, ראש שקט', b: 'הערה קצרה על הספירה ב{product} וסיימת — עוד רגע קטן שעושה סדר גדול 📦✅' },
  { t: 'אלוף הדיוק', b: 'ספירה שמתועדת נכון היום = בלי הפתעות בהזמנה הבאה. תודה על תשומת הלב 🎯' },
];

/** The one draft-aware line (§5.1c): he already started, so the message is "finish", not "start". */
export const DRAFT_NUDGE: Nudge = {
  t: 'יש לך טיוטה פתוחה',
  b: 'יש לך טיוטה פתוחה על {kibbutz} — עוד דקה וזה סגור ✍️',
};

/** Deterministic, stable across runtimes (no Math.random, no Date). */
export function hashIdx(s: string, n: number): number {
  if (!n || n < 1) return 0;
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}

/** The exact words one nudge goes out with. Title is always prefixed `📍 <קיבוץ> — `. */
export function nudgeFor(checkinId: string, kibbutz: string, hasDraft = false): { title: string; body: string } {
  const n = hasDraft ? DRAFT_NUDGE : VISIT_NUDGES[hashIdx(checkinId, VISIT_NUDGES.length)];
  return {
    title: `📍 ${kibbutz} — ${n.t}`,
    body: n.b.replace(/\{kibbutz\}/g, kibbutz),
  };
}

// ───────────────────────── the reminder's decision (spec §5.2 + §7k ג) ─────────────────────────

/**
 * Adoption guard ג, as the review settled it (fix round 1) — THREE numbers, not one:
 *   · `PUSH_DAILY_CAP` is the ceiling on the SUM of the capped modes (visit + gap + any other
 *     non-digest nudge added later);
 *   · each capped mode has its own, smaller ceiling, so one noisy mode can never eat the whole
 *     budget and leave the others silent;
 *   · attendance and the weekly digest are EXEMPT — attendance is the record of the work day
 *     and the digest is a report, so neither may be crowded out by nudges, and neither counts
 *     towards the sum.
 */
export const PUSH_DAILY_CAP = 3;
/** At most two visit nudges a day, however many kibbutzim he stopped at. */
export const VISIT_DAILY_CAP = 2;
/** The gaps nudge (Task 18) gets exactly one. */
export const GAP_DAILY_CAP = 1;

/**
 * Modes that are neither capped nor counted (see above). `inventoryDigest` joins them for the
 * same reason the weekly one did: the 12:00 / 17:00 stock digest is a REPORT עמיחי asked for,
 * not a nudge, so a busy day of visit reminders must never swallow it (inventory spec §5.2).
 */
export const CAP_EXEMPT_EVENTS = ['attendanceCron', 'attendanceReminder', 'usageDigest', 'inventoryDigest'];

/** The per-mode ceiling, or `null` for an exempt mode. */
export function capFor(event: string): number | null {
  if (CAP_EXEMPT_EVENTS.indexOf(String(event)) !== -1) return null;
  if (event === 'visitCron') return VISIT_DAILY_CAP;
  if (event === 'gapReminder') return GAP_DAILY_CAP;
  return PUSH_DAILY_CAP;
}

/**
 * May this mode send one more push to this person today? `globalUsed` counts every capped
 * push already sent to him today, `modeUsed` only this mode's. An exempt mode always may.
 */
export function capBlocked(event: string, globalUsed: number, modeUsed: number): false | 'daily cap' | 'mode cap' {
  const own = capFor(event);
  if (own === null) return false;
  if (globalUsed >= PUSH_DAILY_CAP) return 'daily cap';
  return modeUsed >= own ? 'mode cap' : false;
}
/** Adoption guard ג: nothing between 21:00 and 06:30 Israel (except immediate low-stock). */
export const QUIET_FROM_HH = 21;
export const QUIET_TO_HH = 6;
export const QUIET_TO_MM = 30;
/** Adoption guard ג: the 2 h reminder is never sent later than 20:00 Israel. */
export const REMINDER_LATEST_HH = 20;

export function inQuietHours(at: Date | string | number): boolean {
  const { hh, mm } = israelParts(at);
  if (hh >= QUIET_FROM_HH) return true;
  return hh < QUIET_TO_HH || (hh === QUIET_TO_HH && mm < QUIET_TO_MM);
}

// ───────────── the attendance cron's two hours (spec §7h: ⏰ שעת תזכורת סוף יום) ─────────────

/** The evening nudge's hour for anyone who never chose one. */
export const EOD_DEFAULT_HH = 19;
/** The morning "days are missing" nudge. Not a preference — it is one hour for everyone. */
export const ATT_MORNING_HH = 9;

/**
 * A person's own end-of-day hour, or the default. Clamped to 17–20 (FIX ROUND 1, task-15
 * review Minor #2): `Settings.tsx`'s `EOD_HOURS` picker only ever writes 17/18/19/20, but this
 * reads whatever is actually sitting in `user_settings.eod_hour` — a stray/legacy value
 * outside that range would otherwise be honored verbatim by the cron instead of falling back
 * to the 19:00 default.
 */
export function eodHourFor(person: string, eodHours: Record<string, number | null | undefined> | null | undefined): number {
  // `null` is the column's "never chose" — and `Number(null)` is 0, i.e. midnight, so the
  // empty value has to be rejected BEFORE it is turned into a number.
  const raw = (eodHours || {})[person];
  if (raw === null || raw === undefined) return EOD_DEFAULT_HH;
  const h = Number(raw);
  return Number.isInteger(h) && h >= 17 && h <= 20 ? h : EOD_DEFAULT_HH;
}

/**
 * Who the hourly attendance job has something to say to RIGHT NOW, and which of the two
 * things it is. Pure, because the evening hour stopped being a constant the moment §7h let
 * each person pick his own: the job now runs against a different set of people every hour,
 * and that is a rule worth pinning in a test rather than reading out of a cron log.
 *
 * · morning (09:00, everyone) — the days already missing this month.
 * · evening (his own hour)    — today, which he has not filled in yet.
 *
 * A holiday silences the EVENING half only: nobody is asked to account for a day the company
 * was closed, but the missing days from before it are still missing.
 */
export function attendanceCronRuns(
  hour: number,
  people: string[],
  eodHours: Record<string, number | null | undefined> | null | undefined,
  todayIsHoliday = false,
): Array<{ person: string; kind: 'morning' | 'evening' }> {
  const out: Array<{ person: string; kind: 'morning' | 'evening' }> = [];
  for (const person of people || []) {
    if (hour === ATT_MORNING_HH) out.push({ person, kind: 'morning' });
  }
  if (!todayIsHoliday) {
    for (const person of people || []) {
      if (eodHourFor(person, eodHours) === hour) out.push({ person, kind: 'evening' });
    }
  }
  return out;
}

/** A nudge sent sooner than this after the arrival would reach him while he is still there. */
export const REMINDER_MIN_GAP_MS = 30 * 60_000;

/**
 * When this check-in's reminder is due — or `null`, meaning it never goes out (fix round 1).
 *
 * The 20:00 rule is a SEND-TIME GATE, not an accelerator: two hours after the arrival is the
 * promise, and 20:00 may only pull a nudge EARLIER than that promise, never turn a late
 * arrival into an immediate buzz. So:
 *   · due = arrival + 2 h, whenever that lands at or before 20:00 Israel;
 *   · later than that → 20:00, but ONLY if 20:00 is still at least half an hour after the
 *     arrival (`REMINDER_MIN_GAP_MS`);
 *   · otherwise no good moment is left in the day and there is NO push at all. The in-app
 *     banner (§7k #4) still carries it — the screen may say so, a phone buzz may not.
 */
export function reminderDueAt(checkedInAt: string): number | null {
  const at = new Date(checkedInAt).getTime();
  if (isNaN(at)) return null;
  const twoHours = at + 2 * 3600_000;
  const latest = israelAt(at, REMINDER_LATEST_HH, 0);
  if (twoHours <= latest) return twoHours;
  return latest - at >= REMINDER_MIN_GAP_MS ? latest : null;
}

export type SkipReason =
  | 'dismissed' | 'reminded' | 'too early' | 'too old' | 'visit exists' | 'quiet hours'
  | 'daily cap' | 'mode cap'
  /** No sendable moment was left in the day — the banner carries it, the phone stays quiet. */
  | 'late';

export interface CronInput {
  checkins: CheckinRow[];
  visits: VisitRow[];
  /** Open drafts — they do not stop the nudge, they change its words (§5.1c). */
  drafts?: DraftRow[];
  /** CAPPED pushes already sent to each person today, every mode (from `push_log`). */
  sentToday?: Record<string, number>;
  /** …and how many of those were visit nudges. */
  sentTodayVisit?: Record<string, number>;
  nowIso: string;
}

export interface CronPick { id: string; person: string; kibbutz: string; hasDraft: boolean }

export interface CronPlan {
  remind: CronPick[];
  skip: Array<{ id: string; reason: SkipReason }>;
  /**
   * Rows that are FINISHED — the caller stamps `reminded_at` so they stop being re-read every
   * quarter of an hour: the visit is filed, or the day ran out of sendable time (`late`).
   */
  settle: Array<{ id: string; reason: SkipReason }>;
}

/**
 * THE decision the `visitCron` mode makes, as one pure function (spec §5.2, guards §7k ג).
 * A row is reminded when: two hours have passed (capped at 20:00), it is less than 14 h old,
 * nobody dismissed it, nothing was sent for it yet, no visit was filed — and sending it now
 * would break neither the quiet hours nor the three-a-day cap.
 *
 * The cap counts what this very run is about to send as well, so a person with three
 * check-ins gets three pushes and not four.
 */
export function visitCronSelect(i: CronInput): CronPlan {
  const now = new Date(i.nowIso).getTime();
  const remind: CronPick[] = [];
  const skip: Array<{ id: string; reason: SkipReason }> = [];
  const settle: Array<{ id: string; reason: SkipReason }> = [];
  const used: Record<string, number> = { ...(i.sentToday || {}) };
  const usedVisit: Record<string, number> = { ...(i.sentTodayVisit || {}) };

  const rows = [...(i.checkins || [])].sort(
    (a, b) => new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime(),
  );

  for (const c of rows) {
    if (!c || !c.id) continue;
    const at = new Date(c.checked_in_at).getTime();
    const drop = (reason: SkipReason) => skip.push({ id: c.id, reason });

    if (c.dismissed) { drop('dismissed'); continue; }
    if (c.reminded_at) { drop('reminded'); continue; }
    if (isNaN(at) || now - at > 14 * 3600_000) { drop('too old'); continue; }

    const day = israelParts(c.checked_in_at).date;
    const filed = (i.visits || []).some(v => v && v.visitor === c.person && v.kibbutz === c.kibbutz
      && String(v.date || '').slice(0, 10) === day);
    // Asked BEFORE the clock: a filed visit settles the row whatever the hour is.
    if (filed) { drop('visit exists'); settle.push({ id: c.id, reason: 'visit exists' }); continue; }

    const due = reminderDueAt(c.checked_in_at);
    if (due === null) { drop('late'); settle.push({ id: c.id, reason: 'late' }); continue; }
    if (now < due) { drop('too early'); continue; }

    if (inQuietHours(now)) { drop('quiet hours'); continue; }
    const blocked = capBlocked('visitCron', used[c.person] || 0, usedVisit[c.person] || 0);
    if (blocked) { drop(blocked); continue; }

    used[c.person] = (used[c.person] || 0) + 1;
    usedVisit[c.person] = (usedVisit[c.person] || 0) + 1;
    remind.push({
      id: c.id,
      person: c.person,
      kibbutz: c.kibbutz,
      hasDraft: (i.drafts || []).some(d => d && d.person === c.person && d.kibbutz === c.kibbutz && d.date === day),
    });
  }
  return { remind, skip, settle };
}

// ───────────────────────────── deep links ─────────────────────────────

export interface PushAct { act: string; kibbutz?: string; cid?: string }

/** `?pushact=visit&kibbutz=…` / `?pushact=visitDismiss&cid=…` — what the notification asked for. */
export function pushactParse(search: string): PushAct | null {
  const q = new URLSearchParams(String(search || '').replace(/^\??/, '?'));
  const act = q.get('pushact');
  if (!act) return null;
  const out: PushAct = { act };
  const k = q.get('kibbutz'); if (k) out.kibbutz = k;
  const c = q.get('cid'); if (c) out.cid = c;
  return out;
}

// ─────────────── the visit summary's EMS link + סיבת הביקור (QA round 2, C6) ───────────────

/**
 * Whose open internal tasks a person may see — and therefore close — from the visit summary.
 *
 * עידן, 22.9: the two field people cover for each other, so אביאם must see ניתאי's open tasks
 * and ניתאי must see אביאם's. Everyone else sees their own and nobody else's. `me` is always
 * first, because the list is rendered in this order and his own tasks are what he came for.
 */
export function sharedOwners(user: string | null | undefined): string[] {
  const me = String(user || '').trim();
  if (!me) return [];
  if (!FIELD_PEOPLE.includes(me)) return [me];
  return [me, ...FIELD_PEOPLE.filter(p => p !== me)];
}

export interface VisitReason { id: string; label: string; free?: boolean }

/**
 * Why he was there, when the visit is not attached to any task. The five of §C6, in the order
 * they are shown; `אחר` carries a free-text box and is the only one that needs more typing.
 */
export const VISIT_REASONS: VisitReason[] = [
  { id: 'called', label: 'הלקוח התקשר וביקש להגיע' },
  { id: 'supply', label: 'אספקת מוצרים בלבד' },
  { id: 'fault', label: 'תקלה' },
  { id: 'planned', label: 'ביקור מתוכנן' },
  { id: 'other', label: 'אחר', free: true },
];

/** A reason is required exactly when nothing at all was linked. Linking IS the reason. */
export function visitReasonRequired(linked: {
  emsTaskIds?: ReadonlyArray<string> | null;
  internalTaskIds?: ReadonlyArray<string> | null;
}): boolean {
  return !((linked?.emsTaskIds || []).length || (linked?.internalTaskIds || []).length);
}

/** The sentence stored on `visits.reason` — empty when the answer is not complete yet. */
export function visitReasonText(reasonId: string | null | undefined, other: string | null | undefined): string {
  const r = VISIT_REASONS.find(x => x.id === String(reasonId || ''));
  if (!r) return '';
  if (!r.free) return r.label;
  const t = String(other || '').trim();
  return t ? t : '';
}

/** Is the reason answered? Only asked when `visitReasonRequired` said so. */
export function visitReasonValid(reasonId: string | null | undefined, other: string | null | undefined): boolean {
  return !!visitReasonText(reasonId, other);
}
