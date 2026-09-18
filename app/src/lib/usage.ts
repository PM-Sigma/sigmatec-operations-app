// Aggregation for the 📈 שימוש page (spec §7j). PURE — the island only renders what this
// returns, so every number on that screen is covered by usage.test.ts goldens.
//
// What it answers, in the order the page shows it:
//   KPI strip · person × page heat table (30 d) · actions per day (30 d bar chart)
//   · top actions (7 d) · pages nobody opened · median seconds to the first primary action
//   · "last seen" per person.
import {
  ACTION_LABEL, PAGE_KEYS, PAGE_LABEL, PRIMARY_ACTIONS, ymd, type UsageEvent,
} from './usageNarrative';

export type { UsageEvent };
export { ACTION_LABEL, PAGE_KEYS, PAGE_LABEL, PRIMARY_ACTIONS, ymd };

/**
 * The roster the heat table always shows, in display order: the five EMS logins
 * (js/src/11-search-login.js EMS_USERS). Anyone else who shows up in the data is appended by
 * aggregate(), so a viewer or a new hire is never invisible.
 */
export const USAGE_ROSTER = ['עידן', 'אביאם', 'ניתאי', 'עמיחי', 'מתניה'];

export interface HeatRow {
  person: string;
  /** page key → page views in the window */
  cells: Record<string, number>;
  total: number;
}

export interface UsageReport {
  people: string[];
  pages: string[];
  heat: HeatRow[];
  /** the biggest single cell — the shading scale is relative to it */
  maxCell: number;
  topActions: { action: string; label: string; count: number }[];
  /** page keys nobody opened in the window */
  zeroPages: string[];
  /** person → ISO of their last event, or null */
  lastSeen: Record<string, string | null>;
  /** median seconds from the session anchor (check-in, else opening קיבוצים) to the first primary action */
  medianSeconds: number | null;
  /** one entry per day in the window, ascending, zero-filled */
  perDay: { date: string; count: number }[];
  kpi: {
    /** primary actions in the last 7 days */
    actionsWeek: number;
    /** people with any event in the last 7 days */
    activePeople: number;
    people: number;
    zeroPages: number;
    medianSeconds: number | null;
  };
}

export interface AggregateOptions {
  now: Date | number | string;
  /** the roster, in display order */
  people: string[];
  pages?: string[];
  /** window of the heat table / chart, days (default 30) */
  days?: number;
  /** window of the "top actions" list, days (default 7) */
  topDays?: number;
}

const isPrimary = (e: UsageEvent) => !!e.action && PRIMARY_ACTIONS.indexOf(e.action) !== -1;
const who = (e: UsageEvent) => (e.person || '').trim();

/** Days back from `now`, as a millisecond cutoff. */
function since(now: number, days: number): number {
  return now - days * 86400_000;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** mm:ss — the KPI strip shows "1:40", not "100 seconds". */
export function mmss(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/**
 * Median seconds from a session's ANCHOR to its first primary action.
 * The anchor is a check-in when the app has them; until the field flow ships there are none,
 * so it falls back to opening the קיבוצים page (spec §7j / task brief). Sessions are grouped by
 * `session_id` when present and by person+day otherwise, so a browser that lost sessionStorage
 * still contributes instead of collapsing every event into one bucket.
 */
export function timeToFirstAction(events: UsageEvent[]): number | null {
  const anchored = events.some(e => e.action === 'checkin');
  const isAnchor = (e: UsageEvent) =>
    anchored ? e.action === 'checkin' : (e.action === 'view' && e.page === 'kibbutz');

  const buckets = new Map<string, UsageEvent[]>();
  for (const e of events) {
    const key = (e.session_id && String(e.session_id)) || (who(e) + '|' + ymd(e.at));
    const list = buckets.get(key);
    if (list) list.push(e); else buckets.set(key, [e]);
  }

  const secs: number[] = [];
  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) => +new Date(a.at) - +new Date(b.at));
    const ai = sorted.findIndex(isAnchor);
    if (ai === -1) continue;
    const t0 = +new Date(sorted[ai].at);
    // Strictly AFTER the anchor: a check-in is itself a primary action, so searching the whole
    // session would always answer 0 the moment the field flow ships.
    const first = sorted.slice(ai + 1).find(isPrimary);
    if (!first) continue;
    const d = Math.round((+new Date(first.at) - t0) / 1000);
    if (d >= 0) secs.push(d);
  }
  return median(secs);
}

export function aggregate(events: UsageEvent[], opts: AggregateOptions): UsageReport {
  const now = +new Date(opts.now);
  const days = opts.days ?? 30;
  const topDays = opts.topDays ?? 7;
  const pages = opts.pages ?? PAGE_KEYS;

  const rows = (events || [])
    .filter(e => e && e.at && !Number.isNaN(+new Date(e.at)))
    .filter(e => +new Date(e.at) >= since(now, days));

  // The roster drives the table rows: a person with no events still gets a line (that IS the
  // signal), and a name that only appears in the data is appended so nothing is hidden.
  const people = [...opts.people];
  for (const e of rows) { const n = who(e); if (n && people.indexOf(n) === -1) people.push(n); }

  const views = rows.filter(e => e.action === 'view' && e.page);

  const heat: HeatRow[] = people.map(person => {
    const cells: Record<string, number> = {};
    for (const p of pages) cells[p] = 0;
    let total = 0;
    for (const e of views) {
      if (who(e) !== person) continue;
      const p = String(e.page);
      if (!(p in cells)) continue;
      cells[p]++; total++;
    }
    return { person, cells, total };
  });
  const maxCell = heat.reduce((m, r) => Math.max(m, ...pages.map(p => r.cells[p] || 0)), 0);

  const topFrom = since(now, topDays);
  const weekRows = rows.filter(e => +new Date(e.at) >= topFrom);
  const counts = new Map<string, number>();
  for (const e of weekRows.filter(isPrimary)) {
    counts.set(String(e.action), (counts.get(String(e.action)) || 0) + 1);
  }
  const topActions = [...counts.entries()]
    // count desc, then the PRIMARY_ACTIONS order — stable, never alphabetical-by-Hebrew.
    .sort((a, b) => b[1] - a[1] || PRIMARY_ACTIONS.indexOf(a[0]) - PRIMARY_ACTIONS.indexOf(b[0]))
    .map(([action, count]) => ({ action, label: ACTION_LABEL[action] || action, count }));

  const viewed = new Set(views.map(e => String(e.page)));
  const zeroPages = pages.filter(p => !viewed.has(p));

  const lastSeen: Record<string, string | null> = {};
  for (const person of people) {
    let latest: string | null = null;
    for (const e of rows) {
      if (who(e) !== person) continue;
      if (!latest || +new Date(e.at) > +new Date(latest)) latest = e.at;
    }
    lastSeen[person] = latest;
  }

  // Zero-filled so the bar chart has a real x axis (a missing day is information).
  const perDay: { date: string; count: number }[] = [];
  const byDay = new Map<string, number>();
  for (const e of rows) { const d = ymd(e.at); byDay.set(d, (byDay.get(d) || 0) + 1); }
  for (let i = days - 1; i >= 0; i--) {
    const d = ymd(now - i * 86400_000);
    perDay.push({ date: d, count: byDay.get(d) || 0 });
  }

  const medianSeconds = timeToFirstAction(rows);
  const activePeople = new Set(weekRows.map(who).filter(Boolean)).size;

  return {
    people, pages, heat, maxCell, topActions, zeroPages, lastSeen, medianSeconds, perDay,
    kpi: {
      actionsWeek: weekRows.filter(isPrimary).length,
      activePeople,
      people: people.length,
      zeroPages: zeroPages.length,
      medianSeconds,
    },
  };
}

/**
 * Heat shading bucket 0–3 for one cell, relative to the busiest cell on the table.
 * Tokens only (the island maps the bucket to a `bg-primary/N` class) — never a literal colour.
 */
export function heatBucket(count: number, max: number): 0 | 1 | 2 | 3 {
  if (!count || max <= 0) return 0;
  const r = count / max;
  if (r >= 0.66) return 3;
  if (r >= 0.33) return 2;
  return 1;
}

/** "היום 14:02" / "אתמול" / "15.9" — the "נראה לאחרונה" strip. */
export function lastSeenLabel(iso: string | null, now: Date | number | string = Date.now()): string {
  if (!iso) return 'לא נראה';
  const today = ymd(now);
  const day = ymd(iso);
  const yesterday = ymd(+new Date(today + 'T12:00:00Z') - 86400_000);
  const d = new Date(iso);
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  if (day === today) return 'היום ' + hhmm;
  if (day === yesterday) return 'אתמול ' + hhmm;
  const [, m, dd] = day.split('-');
  return +dd + '.' + +m;
}
