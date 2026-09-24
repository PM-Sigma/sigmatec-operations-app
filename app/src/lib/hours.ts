// ⏱ שעות עבודה מול לקוחות — the pure half of the hours page (עידן 22.9, E2).
// Rows are `work_sessions`; this file decides who may edit, how a row reads, what a month
// filter keeps, and the Excel/print shapes. No React, no network.
import { fmtDay, fmtDuration, fmtNumber } from '@/lib/format';
import { APP_PEOPLE } from './people';

export interface WorkSessionRow {
  id: string;
  person: string;
  kibbutz?: string | null;
  attendees?: string[] | null;
  tags?: string[] | null;
  description?: string | null;
  started_at: string;
  ended_at?: string | null;
  billable?: boolean | null;
  clockify_id?: string | null;
  note?: string | null;
  created_at?: string | null;
}

/** The three people the page is for; the viewer reads it too. */
export const HOURS_PEOPLE = ['עידן', 'עמיחי', 'מתניה'];
/** Who may edit rows and add manual ones (every change is logged in the database). */
export const HOURS_EDITORS = ['עידן', 'עמיחי'];

export function canSeeHours(user: string, isViewer: boolean): boolean {
  return isViewer || HOURS_PEOPLE.includes(String(user ?? '').trim());
}
export function canEditHours(user: string, isViewer: boolean): boolean {
  return !isViewer && HOURS_EDITORS.includes(String(user ?? '').trim());
}

/** Whole minutes between start and end; 0 for a row still running or with a bad stamp. */
export function durationMin(r: Pick<WorkSessionRow, 'started_at' | 'ended_at'>): number {
  const a = Date.parse(r.started_at), b = r.ended_at ? Date.parse(r.ended_at) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 60_000);
}

/** `4:30` — hours and minutes, the Excel/print cell shape. On-screen durations use the
 * shared `fmtDuration` (`@/lib/format`, "4 ש׳ 30 ד׳") instead (round 5, L2). */
export function fmtHoursCell(min: number): string {
  const m = Math.max(0, Math.round(min));
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
}

/** `YYYY-MM` of a stamp, in the viewer's local time. */
export function monthOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export interface HoursFilter { month?: string; person?: string; kibbutz?: string }

/** Newest first, narrowed by month / person / kibbutz when given. */
export function filterHours(rows: WorkSessionRow[] | null | undefined, f: HoursFilter = {}): WorkSessionRow[] {
  return (rows || [])
    .filter(r => r && r.started_at)
    .filter(r => !f.month || monthOf(r.started_at) === f.month)
    .filter(r => !f.person || r.person === f.person)
    .filter(r => !f.kibbutz || (r.kibbutz || '') === f.kibbutz)
    .slice()
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
}

/** Total minutes of a list, and per person. */
export function totals(rows: WorkSessionRow[]): { all: number; byPerson: Record<string, number> } {
  const byPerson: Record<string, number> = {};
  let all = 0;
  for (const r of rows) { const m = durationMin(r); all += m; byPerson[r.person] = (byPerson[r.person] || 0) + m; }
  return { all, byPerson };
}

/** The months that have rows, newest first — the month picker's options. */
export function monthsOf(rows: WorkSessionRow[] | null | undefined): string[] {
  const set = new Set<string>();
  (rows || []).forEach(r => { const m = monthOf(r.started_at); if (m) set.add(m); });
  return Array.from(set).sort().reverse();
}

/** The people who appear, roster order first, then anyone else. */
export function peopleOf(rows: WorkSessionRow[] | null | undefined): string[] {
  const seen = new Set((rows || []).map(r => r.person).filter(Boolean));
  const ordered = APP_PEOPLE.filter(p => seen.has(p));
  seen.forEach(p => { if (!ordered.includes(p)) ordered.push(p); });
  return ordered;
}

// ───────────────────────────── the day view (round 5, L2) ─────────────────────────────

export interface HoursDay { date: string; label: string; minutes: number; rows: WorkSessionRow[] }

const localYmd = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Rows grouped by local calendar day, newest day first, each day newest row first. */
export function hoursByDay(rows: WorkSessionRow[], now: Date = new Date()): HoursDay[] {
  const by = new Map<string, WorkSessionRow[]>();
  for (const r of rows) {
    const k = localYmd(r.started_at);
    const bucket = by.get(k);
    if (bucket) bucket.push(r); else by.set(k, [r]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, rs]) => {
      const sorted = rs.slice().sort((x, y) => (x.started_at < y.started_at ? 1 : -1));
      const [y, m, d] = date.split('-').map(Number);
      return {
        date, label: fmtDay(new Date(y, m - 1, d), now),
        minutes: sorted.reduce((n, r) => n + durationMin(r), 0),
        rows: sorted,
      };
    });
}

export interface HoursTile { id: 'total' | 'count' | 'unsent'; label: string; value: string; role?: 'warn' }

/** The summary strip above the list: total, record count, and how many still owe Clockify. */
export function hoursTiles(rows: WorkSessionRow[]): HoursTile[] {
  const unsent = rows.filter(r => !r.clockify_id).length;
  return [
    { id: 'total', label: 'סה״כ שעות', value: fmtDuration(totals(rows).all) },
    { id: 'count', label: 'רשומות', value: fmtNumber(rows.length) },
    { id: 'unsent', label: 'לא נשלחו ל-Clockify', value: fmtNumber(unsent), ...(unsent ? { role: 'warn' as const } : {}) },
  ];
}

export interface HoursDraft {
  person: string;
  kibbutz: string;
  started_at: string;   // ISO
  ended_at: string;     // ISO
  attendees: string[];
  tags: string[];
  billable: boolean;
  note: string;
}

/** What a manual or edited row must satisfy; `[]` = fine. */
export function validateHours(d: HoursDraft): string[] {
  const errs: string[] = [];
  if (!d.person) errs.push('יש לבחור עובד');
  const a = Date.parse(d.started_at), b = Date.parse(d.ended_at);
  if (!Number.isFinite(a)) errs.push('שעת התחלה חסרה');
  if (!Number.isFinite(b)) errs.push('שעת סיום חסרה');
  if (Number.isFinite(a) && Number.isFinite(b) && b <= a) errs.push('הסיום צריך להיות אחרי ההתחלה');
  if (Number.isFinite(a) && Number.isFinite(b) && b - a > 24 * 3600_000) errs.push('יותר מ-24 שעות ברצף? בדוק את התאריכים');
  return errs;
}

/** The row body a save writes (insert or update). `description` mirrors the Clockify text. */
export function hoursBody(d: HoursDraft): Record<string, unknown> {
  const head = [d.kibbutz.trim(), d.tags.join(', ')].filter(Boolean).join(' — ');
  return {
    person: d.person, kibbutz: d.kibbutz.trim() || null, kind: 'session',
    attendees: d.attendees, tags: d.tags,
    description: [head, d.note.trim()].filter(Boolean).join(' · ') || null,
    started_at: new Date(d.started_at).toISOString(), ended_at: new Date(d.ended_at).toISOString(),
    billable: !!d.billable, note: d.note.trim() || null,
  };
}

/** `2026-09-22T14:05` for a datetime-local input, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ───────────────────────────── exports ─────────────────────────────

/** The one sheet the Excel carries — js/src/21-excel-export.js `xlDownload` takes this shape. */
export function hoursXlsxSpec(rows: WorkSessionRow[], title = 'שעות מול לקוחות') {
  const columns = [
    { header: 'תאריך', type: 'd', width: 12 }, { header: 'עובד', type: 's', width: 10 },
    { header: 'קיבוץ', type: 's', width: 18 }, { header: 'התחלה', type: 's', width: 8 },
    { header: 'סיום', type: 's', width: 8 }, { header: 'משך (שעות)', type: 'n', width: 11 },
    { header: 'תגיות', type: 's', width: 24 }, { header: 'משתתפים', type: 's', width: 20 },
    { header: 'לחיוב', type: 's', width: 7 }, { header: 'הערה', type: 's', width: 30 }, { header: 'Clockify', type: 's', width: 9 },
  ];
  const clock = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const out = rows.map(r => {
    const d = new Date(r.started_at);
    return [new Date(d.getFullYear(), d.getMonth(), d.getDate()), r.person, r.kibbutz || '', clock(r.started_at), clock(r.ended_at),
      Math.round(durationMin(r) / 60 * 100) / 100, (r.tags || []).join(', '), (r.attendees || []).join(', '),
      r.billable ? 'כן' : '', r.note || '', r.clockify_id ? 'נשלח' : 'לא נשלח'];
  });
  return { sheet: title.slice(0, 31), columns, rows: out, groupKeys: rows.map(r => r.person) };
}

/** Plain HTML for the print/PDF window — the browser's print dialog is the PDF. */
export function hoursPrintHtml(rows: WorkSessionRow[], title: string): string {
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const t = totals(rows);
  const clock = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
  const body = rows.map(r => `<tr><td>${new Date(r.started_at).toLocaleDateString('he-IL')}</td><td>${esc(r.person)}</td><td>${esc(r.kibbutz)}</td>`
    + `<td>${clock(r.started_at)}–${clock(r.ended_at)}</td><td>${fmtHoursCell(durationMin(r))}</td><td>${esc((r.tags || []).join(', '))}</td>`
    + `<td>${esc((r.attendees || []).join(', '))}</td><td>${r.billable ? '✓' : ''}</td><td>${esc(r.note)}</td></tr>`).join('');
  const per = Object.entries(t.byPerson).map(([p, m]) => `${esc(p)}: ${fmtHoursCell(m)}`).join(' · ');
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Assistant,Arial,sans-serif;padding:24px;color:#1f2937}h1{font-size:20px;margin:0 0 4px}.sub{color:#5c6572;font-size:13px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #e3e8ef;padding:6px 8px;text-align:start;vertical-align:top}th{background:#f1f4f8}
tfoot td{font-weight:800}@media print{body{padding:0}}</style></head><body>
<h1>${esc(title)}</h1><div class="sub">${rows.length} רשומות · סה"כ ${fmtHoursCell(t.all)} שעות${per ? ' · ' + per : ''}</div>
<table><thead><tr><th>תאריך</th><th>עובד</th><th>קיבוץ</th><th>שעות</th><th>משך</th><th>תגיות</th><th>משתתפים</th><th>לחיוב</th><th>הערה</th></tr></thead>
<tbody>${body}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script></body></html>`;
}
