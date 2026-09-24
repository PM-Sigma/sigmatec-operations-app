// 📊 the viewer reports hub — pure period math and the report catalog (round 5, L5). The
// actual PDF/Excel calls stay in `js/src/21-excel-export.js` (`xlHub*`, parameterised in the
// same task); this file only decides the date range a preset means and what a period is
// called, so `ViewerReports.tsx` (U12) never re-derives either.
export type Preset = 'this-month' | 'last-month' | 'last-30';

export const PRESET_LABEL: Record<Preset, string> = {
  'this-month': 'החודש',
  'last-month': 'החודש הקודם',
  'last-30': '30 הימים האחרונים',
};

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDayOfMonth = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate();

/** `{ from, to }` (inclusive, `YYYY-MM-DD`) the preset means, relative to `today`. */
export function presetRange(p: Preset, today: string): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  if (p === 'this-month') return { from: ymd(new Date(y, m - 1, 1)), to: today };
  if (p === 'last-month') {
    const lm = new Date(y, m - 2, 1);
    return { from: ymd(lm), to: ymd(new Date(lm.getFullYear(), lm.getMonth(), lastDayOfMonth(lm.getFullYear(), lm.getMonth()))) };
  }
  const from = new Date(t); from.setDate(from.getDate() - 29);
  return { from: ymd(from), to: today };
}

/** The `YYYY-MM` a preset falls in — for the month-only reports (סיכום חודשי). */
export function monthOf(p: Preset, today: string): string {
  return presetRange(p, today).to.slice(0, 7);
}

export interface ViewerReport {
  id: 'visits' | 'attendance' | 'certs' | 'certSummary';
  title: string;
  icon: string;
  /** The attendance report needs a person picked; the others don't. */
  needsPerson: boolean;
  /** A month-only report (סיכום חודשי); the others take a date range. */
  byMonth: boolean;
}

export const REPORTS: ViewerReport[] = [
  { id: 'visits', title: 'דוח ביקורי שטח', icon: 'MapPin', needsPerson: false, byMonth: false },
  { id: 'attendance', title: 'דוח נוכחות חודשי', icon: 'CalendarDays', needsPerson: true, byMonth: true },
  { id: 'certs', title: 'דוח תעודות משלוח', icon: 'Truck', needsPerson: false, byMonth: false },
  { id: 'certSummary', title: 'סיכום חודשי של תעודות', icon: 'FileSpreadsheet', needsPerson: false, byMonth: true },
];
