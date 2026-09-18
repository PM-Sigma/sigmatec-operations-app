// The weekly usage narrative (spec §7j, wording rules from docs/reports/2026-09-18-adoption-strategy.md §5.4).
//
// PURE and DEPENDENCY-FREE on purpose: the very same sentences are pushed to עידן on Sunday
// 08:00 by the `push-send` Edge Function, which runs on Deno and cannot import from app/src.
// The function therefore carries a BYTE-IDENTICAL copy at
// `supabase/functions/push-send/usageNarrative.ts`, and test-usage-track.mjs fails the build
// if the two files ever drift. Keep this module free of imports so the copy stays possible.
//
// PII (review fix round 1): nothing here may quote a stored `target` that could be user input.
// A search miss is counted, never quoted — see the SEARCH_MISS branch.
//
// TONE (adoption §5.4, non-negotiable):
//   • system health FIRST — a dead page or a failing search points at the product, not a person
//   • describe behaviour, never rank people against each other (no "הכי", no superlatives)
//   • no adjectives that imply a pattern of failure ("שוב", "עדיין") — עידן supplies judgment, not this text
//   • person-level facts only as patterns ("לא השתמש בעמוד X כלל השבוע"), never as a verdict

export interface UsageEvent {
  person?: string | null;
  /** app page key — 'kibbutz' | 'inventory' | … ; null for an action with no page context */
  page?: string | null;
  /** 'view' for a page view, 'mount' for an island, otherwise a primary/dead-end action key */
  action?: string | null;
  target?: string | null;
  /** ISO timestamp */
  at: string;
  session_id?: string | null;
  device?: string | null;
}

/** The app's pages, in the order the heat table and the narrative walk them. */
export const PAGE_LABEL: Record<string, string> = {
  kibbutz: 'קיבוצים',
  inventory: 'מלאי',
  attendance: 'נוכחות',
  ems: 'משימות EMS',
  mytasks: 'משימות',
  calendar: 'יומן',
  staff: 'עובדים',
  dev: 'פיתוח',
  pushlog: 'התראות',
};

export const PAGE_KEYS: string[] = Object.keys(PAGE_LABEL);

/**
 * The primary actions — "the job got done" signals. Anything not listed here (page views,
 * island mounts, dead ends) is deliberately NOT a primary action: it never counts towards
 * "top actions", the weekly headline or the time-to-first-action median.
 */
export const ACTION_LABEL: Record<string, string> = {
  checkin: 'צ׳ק-אין לקיבוץ',
  'visit-saved': 'סיכום ביקור נשמר',
  'cert-issued': 'תעודת משלוח הופקה',
  'ems-task-created': 'משימת EMS נוצרה',
  'ems-task-scheduled': 'משימת EMS שובצה ליום',
  'order-approved': 'הזמנה אושרה',
  'stock-report': 'דיווח מלאי',
  'feedback-sent': 'פנייה נשלחה בתיבה',
  'notes-imported': 'סיכומי ישיבה יובאו',
  'kibbutz-created': 'קיבוץ נוסף',
  'daylog-parsed': 'יומן היום נותח',
};

export const PRIMARY_ACTIONS: string[] = Object.keys(ACTION_LABEL);

/** Dead-end signals — a UI problem, not a person problem (adoption §5.2). */
export const SEARCH_MISS = 'search-no-results';
export const SHEET_DISMISSED = 'sheet-dismissed';

/** Pages worth naming when a person never opened one. Kept short so the narrative stays readable. */
const NOTABLE_PAGES = ['kibbutz', 'mytasks', 'calendar', 'inventory'];

const TZ = 'Asia/Jerusalem';

/** 'YYYY-MM-DD' in Israel — the same day boundary the app and the cron gate use. */
export function ymd(at: string | number | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(+d)) return '';
  // en-CA gives ISO-shaped output, so no part juggling is needed.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Saturday in Israel — excluded from "X days out of Y" so the denominator is a work week. */
function isSaturday(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

const isPrimary = (e: UsageEvent) => !!e.action && PRIMARY_ACTIONS.indexOf(e.action) !== -1;
const person = (e: UsageEvent) => (e.person || '').trim();

function countBy<T>(rows: T[], key: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** "3 פעמים" / "פעם אחת" — Hebrew reads badly with a bare 1. */
function times(n: number): string {
  return n === 1 ? 'פעם אחת' : n + ' פעמים';
}

/** "יום אחד" / "4 ימים" — same reason ("1 ימים" is not Hebrew). */
function days(n: number): string {
  return n === 1 ? 'יום אחד' : n + ' ימים';
}

/**
 * The weekly narrative, as sentences. `events` is the week being reported, `prevWeekEvents`
 * the week before it (only used for the "(שבוע שעבר N)" comparison — pass [] to omit it),
 * `people` the roster in the order lines should appear, `pages` the page keys in scope.
 *
 * Deterministic: same input → same sentences, in the same order. Goldens in usageNarrative.test.ts.
 */
export function usageNarrative(
  events: UsageEvent[],
  prevWeekEvents: UsageEvent[] = [],
  people: string[] = [],
  pages: string[] = PAGE_KEYS,
): string[] {
  const rows = (events || []).filter(e => e && e.at);
  const prev = (prevWeekEvents || []).filter(e => e && e.at);
  if (!rows.length) return ['לא נרשמה שום פעילות באפליקציה השבוע.'];

  const out: string[] = [];
  const views = rows.filter(e => e.action === 'view' && e.page);

  // ── 1. system health first (adoption §5.4: "lead with system health, not person health") ──
  const viewedPages = new Set(views.map(e => String(e.page)));
  const dead = pages.filter(p => !viewedPages.has(p));
  if (dead.length === 1) {
    out.push('עמוד ' + (PAGE_LABEL[dead[0]] || dead[0]) + ' לא נפתח על ידי אף אחד השבוע.');
  } else if (dead.length > 1) {
    out.push('דפים ללא שימוש השבוע: ' + dead.map(p => PAGE_LABEL[p] || p).join(', ') + '.');
  }

  // §7j's example quoted the terms ("לא נמצאו: 'גשר'"). Review fix round 1 overruled that:
  // a typed query is typed text, so it is never stored and therefore cannot be quoted. The
  // COUNT is what points at the product, which is the line's whole purpose (adoption §5.4).
  const misses = rows.filter(e => e.action === SEARCH_MISS);
  if (misses.length) {
    out.push('החיפוש בקיבוצים נכשל ' + times(misses.length) + ' ולא החזיר תוצאה.');
  }

  const dismissed = rows.filter(e => e.action === SHEET_DISMISSED);
  if (dismissed.length >= 2) {
    out.push('טופס נפתח ונסגר בלי שמירה ' + times(dismissed.length) + '.');
  }

  // ── 2. per person, as behaviour — never a comparison ──
  const workdays = new Set<string>();
  for (const e of rows) { const d = ymd(e.at); if (d && !isSaturday(d)) workdays.add(d); }
  const denom = workdays.size;

  const roster = people && people.length
    ? people
    : Array.from(new Set(rows.map(person).filter(Boolean))).sort();

  for (const name of roster) {
    const mine = rows.filter(e => person(e) === name);
    if (!mine.length) {
      out.push(name + ' לא נכנס לאפליקציה כלל השבוע.');
      continue;
    }
    const seen = new Set<string>();
    for (const e of mine) { const d = ymd(e.at); if (d) seen.add(d); }

    let line = name + ' נכנס ' + days(seen.size) + (denom ? ' מתוך ' + denom : '');
    const byAction = countBy(mine.filter(isPrimary), e => String(e.action));
    // A stable pick: highest count, then the PRIMARY_ACTIONS order — never alphabetical by
    // name, which would make the headline jump around between weeks for equal counts.
    let top = '', topN = 0;
    for (const a of PRIMARY_ACTIONS) {
      const n = byAction.get(a) || 0;
      if (n > topN) { top = a; topN = n; }
    }
    if (top) {
      const before = prev.filter(e => person(e) === name && e.action === top).length;
      line += '; ' + ACTION_LABEL[top] + ' אצלו ' + times(topN)
        + (prev.length ? ' (שבוע שעבר ' + before + ')' : '');
    }
    out.push(line + '.');

    // One unused page per person, and only a page SOMEBODY ELSE used — otherwise it is a
    // product fact (already said above), not a personal pattern.
    const minePages = new Set(mine.filter(e => e.action === 'view').map(e => String(e.page)));
    const gap = NOTABLE_PAGES.find(p =>
      pages.indexOf(p) !== -1 && !minePages.has(p) && viewedPages.has(p));
    if (gap) out.push(name + ' לא השתמש בעמוד ' + (PAGE_LABEL[gap] || gap) + ' כלל השבוע.');
  }

  return out;
}

/** The push body: the three most valuable sentences + where the rest lives. */
export function digestBody(sentences: string[]): string {
  const head = (sentences || []).slice(0, 3).join(' ');
  return (head ? head + ' ' : '') + 'עוד ב-📈 שימוש';
}

/** ISO week tag `usage-<yyyy>-w<ww>` — the push_log idempotency key for one weekly digest. */
export function weekTag(at: string | number | Date): string {
  const d = at instanceof Date ? new Date(at) : new Date(at);
  const day = ymd(d);
  const [y, m, dd] = day.split('-').map(Number);
  // ISO-8601 week number, computed on a UTC clone of the Israel calendar date.
  const utc = new Date(Date.UTC(y, m - 1, dd));
  const dow = (utc.getUTCDay() + 6) % 7;            // Mon=0 … Sun=6
  utc.setUTCDate(utc.getUTCDate() - dow + 3);       // the Thursday of that ISO week
  const firstThu = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
  const fDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDow + 3);
  const week = 1 + Math.round((+utc - +firstThu) / (7 * 86400000));
  return 'usage-' + utc.getUTCFullYear() + '-w' + String(week).padStart(2, '0');
}
