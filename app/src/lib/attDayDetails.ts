// Attendance "what happened that day" (עידן 11.10). Pure: the caller hands in the day's attendance row,
// the person's visits, the EMS tasks and whether a draft exists; it gets back readable Hebrew lines.
// The calendar is the schedule; this is the attendance record's account of the day.
import { dayLabel, rowOrigin, type AttRow } from './attendance';
import { visitorsOf } from './field';
import { linkedTaskIds } from './visitEmsLink';

export interface DayVisit {
  id?: string; date: string; visitor: string; kibbutz?: string; duration?: number | string;
  reason?: string; summary?: string; openItems?: string; createdAt?: string; emsTaskId?: string; emsTaskIds?: string[];
  products?: Array<string | { name: string; qty?: number }>;
}
export interface DayTask { id: string; title?: string; status?: string }

export interface VisitDetail {
  kibbutz: string; when: string; reason: string; task: string; summary: string; open: string; products: string;
}
export type DayDetails =
  | { kind: 'field'; source: string; visits: VisitDetail[] }
  | { kind: 'day'; type: string; note: string; source: string }
  | { kind: 'none'; text: string; draft: string };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
/** The visit's LOCAL day: `visits.date` is a timestamp, and slicing its UTC ISO would slide the day. */
const localDay = (iso: string) => {
  const s = String(iso || '');
  if (/^\d{4}-\d\d-\d\d$/.test(s)) return s;
  const x = new Date(s);
  if (isNaN(x.getTime())) return s.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
};

export function dayDetails(i: {
  date: string; person: string; row: AttRow | null; visits: DayVisit[];
  tasks?: DayTask[]; statusLabel?: (s: string) => string; hasDraft?: boolean;
}): DayDetails {
  const label = i.statusLabel || (s => s);
  const mine = (i.visits || [])
    .filter(v => v && localDay(v.date) === i.date && visitorsOf(v).includes(i.person))
    .sort((a, b) => (String(a.date) + (a.createdAt || '')).localeCompare(String(b.date) + (b.createdAt || '')));

  if (mine.length) {
    return {
      kind: 'field', source: 'מסיכום ביקור',
      visits: mine.map(v => {
        const hrs = Number(v.duration) || 0;
        const prods = (v.products || []).map(p => (typeof p === 'string' ? p : (p.qty || 1) > 1 ? p.name + ' ×' + p.qty : p.name));
        return {
          kibbutz: v.kibbutz || '',
          // ponytail: duration only — the visit's clock time is not recorded reliably (dates are noon-anchored).
          when: hrs ? hrs + ' שעות' : '',
          reason: v.reason || '',
          // Every linked task (ems_task_ids, or the single ems_task_id before that column exists).
          task: linkedTaskIds(v).map(id => {
            const t = (i.tasks || []).find(x => String(x.id) === id);
            return t ? (t.title || 'משימת EMS') + (t.status ? ' · ' + label(t.status) : '') : 'משימת EMS מקושרת';
          }).join(' | '),
          summary: String(v.summary || '').trim(),
          open: clip(String(v.openItems || '').trim(), 160),
          products: clip(prods.join(', '), 160),
        };
      }),
    };
  }
  if (i.row) {
    const o = rowOrigin(i.row);
    return {
      kind: 'day', type: dayLabel(i.row.type), note: String(i.row.note || '').trim(),
      source: o === 'calendar' ? 'יומן-היעדרות' : o === 'auto' ? 'מסיכום ביקור' : 'דיווח ידני',
    };
  }
  return { kind: 'none', text: 'אין דיווח ליום זה', draft: i.hasDraft ? 'יש טיוטת ביקור שלא נשמרה' : '' };
}
