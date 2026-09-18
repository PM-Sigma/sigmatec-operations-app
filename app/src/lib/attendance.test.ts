// 📅 נוכחות + 🕎 חגים — the goldens (spec §7e).
//
// The fixture is SEPTEMBER 2026, the month the spec names, with the real holidays from
// db/company_holidays_seed.sql: ראש השנה 12–13.9, יום כיפור 21.9, סוכות 26.9, and the
// company closure 27.9–2.10. Everything the screen and the nudges decide is in here — the
// grid's cells, which days are "missing", and the three KPIs.
import { describe, expect, it } from 'vitest';
import {
  cellsOf, dayLabel, holidayNote, isRequiredDay, kpis, missingDays, monthGrid,
  type AttRow, type Holiday,
} from './attendance';

// ───────────────────────────── the September 2026 fixture ─────────────────────────────

/** Exactly the rows db/company_holidays_seed.sql seeds for this stretch. */
const HOLIDAYS: Holiday[] = [
  { date: '2026-09-12', name: 'ראש השנה 5787', kind: 'holiday', required: false },
  { date: '2026-09-13', name: 'ראש השנה ב׳', kind: 'holiday', required: false },
  { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false },
  { date: '2026-09-26', name: 'סוכות א׳', kind: 'holiday', required: false },
  { date: '2026-09-27', name: 'חול המועד סוכות', kind: 'company_closure', required: false },
  { date: '2026-09-28', name: 'חול המועד סוכות', kind: 'company_closure', required: false },
  { date: '2026-09-29', name: 'חול המועד סוכות', kind: 'company_closure', required: false },
  { date: '2026-09-30', name: 'חול המועד סוכות', kind: 'company_closure', required: false },
  { date: '2026-10-01', name: 'חול המועד סוכות', kind: 'company_closure', required: false },
  { date: '2026-10-02', name: 'חול המועד סוכות', kind: 'company_closure', required: false },
  { date: '2026-10-03', name: 'שמיני עצרת', kind: 'holiday', required: false },
];

const row = (date: string, type: AttRow['type'], extra: Partial<AttRow> = {}): AttRow =>
  ({ date, type, ...extra });

/** A month that is fully behind us, so "missing" covers all of it. */
const AFTER = new Date(2026, 9, 15);   // 15.10.2026

describe('isRequiredDay', () => {
  it('a plain weekday is required', () => {
    expect(isRequiredDay('2026-09-01', HOLIDAYS)).toBe(true);   // Tue
    expect(isRequiredDay('2026-09-10', HOLIDAYS)).toBe(true);   // Thu
  });
  it('Friday and Saturday never are', () => {
    expect(isRequiredDay('2026-09-04', HOLIDAYS)).toBe(false);  // Fri
    expect(isRequiredDay('2026-09-05', HOLIDAYS)).toBe(false);  // Sat
  });
  it('a holiday and a company closure are not', () => {
    expect(isRequiredDay('2026-09-21', HOLIDAYS)).toBe(false);  // יום כיפור, a Monday
    expect(isRequiredDay('2026-09-28', HOLIDAYS)).toBe(false);  // חול המועד, a Monday
  });
  it('a holiday marked required IS a work day again', () => {
    const worked = HOLIDAYS.map(h => (h.date === '2026-09-28' ? { ...h, required: true } : h));
    expect(isRequiredDay('2026-09-28', worked)).toBe(true);
  });
});

describe('monthGrid', () => {
  const grid = monthGrid(2026, 9, [], HOLIDAYS, AFTER);

  it('covers the month and labels it in Hebrew', () => {
    expect(grid.label).toBe('ספטמבר 2026');
    expect(grid.cells).toHaveLength(30);
    expect(grid.cells[0].date).toBe('2026-09-01');
    expect(grid.cells[29].date).toBe('2026-09-30');
  });

  it('lays out Sunday-first weeks with the right leading gap', () => {
    // 1.9.2026 is a Tuesday → two blanks before it.
    expect(grid.lead).toBe(2);
    expect(grid.weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(grid.weeks[0][2]?.date).toBe('2026-09-01');
    expect(grid.weeks.every(w => w.length === 7)).toBe(true);
    expect(grid.weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it('marks weekends, holidays and closures', () => {
    const at = (d: string) => grid.cells.find(c => c.date === d)!;
    expect(at('2026-09-04').state).toBe('weekend');
    expect(at('2026-09-05').state).toBe('weekend');
    expect(at('2026-09-21').state).toBe('holiday');
    expect(at('2026-09-21').holiday?.name).toBe('יום כיפור');
    expect(at('2026-09-28').state).toBe('holiday');
    expect(at('2026-09-28').holiday?.kind).toBe('company_closure');
    // A Saturday that is ALSO a holiday reads as the weekend it is — nobody was expected in
    // either case, and a violet Saturday only adds noise.
    expect(at('2026-09-12').state).toBe('weekend');
    expect(at('2026-09-12').holiday?.name).toBe('ראש השנה 5787');
  });

  it('an empty required weekday in the past is missing', () => {
    const at = (d: string) => grid.cells.find(c => c.date === d)!;
    expect(at('2026-09-01').state).toBe('missing');
    expect(at('2026-09-20').state).toBe('missing');
  });

  it('filled days carry their row and their kind', () => {
    const rows = [
      row('2026-09-01', 'field', { kibbutz: 'חוקוק', hours: 8, source: 'visit' }),
      row('2026-09-02', 'office'),
      row('2026-09-03', 'wfh'),
      row('2026-09-06', 'vacation'),
    ];
    const g = monthGrid(2026, 9, rows, HOLIDAYS, AFTER);
    const at = (d: string) => g.cells.find(c => c.date === d)!;
    expect(at('2026-09-01').state).toBe('field');
    expect(at('2026-09-01').row?.kibbutz).toBe('חוקוק');
    expect(at('2026-09-02').state).toBe('office');
    expect(at('2026-09-03').state).toBe('office');
    expect(at('2026-09-06').state).toBe('away');
  });

  it('a day worked ON a holiday is a work day, and says so', () => {
    const g = monthGrid(2026, 9, [row('2026-09-21', 'field', { kibbutz: 'דפנה' })], HOLIDAYS, AFTER);
    const c = g.cells.find(x => x.date === '2026-09-21')!;
    expect(c.state).toBe('field');           // the work wins over the violet
    expect(c.holiday?.name).toBe('יום כיפור');
    expect(c.onHoliday).toBe(true);          // → the 🕎 marker in the report
  });

  it('today and the days after it are never missing', () => {
    const g = monthGrid(2026, 9, [], HOLIDAYS, new Date(2026, 8, 16));   // 16.9.2026, a Wednesday
    const at = (d: string) => g.cells.find(c => c.date === d)!;
    expect(at('2026-09-15').state).toBe('missing');
    expect(at('2026-09-16').state).toBe('today');
    expect(at('2026-09-17').state).toBe('future');
    expect(at('2026-09-16').today).toBe(true);
  });

  it('ignores rows from another month', () => {
    const g = monthGrid(2026, 9, [row('2026-08-31', 'office'), row('2026-10-01', 'office')], HOLIDAYS, AFTER);
    expect(g.cells.filter(c => c.row)).toHaveLength(0);
  });
});

describe('missingDays', () => {
  it('September 2026: weekends, the holidays and the closure are all out', () => {
    expect(missingDays([], HOLIDAYS, AFTER, 2026, 9)).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-20', '2026-09-22', '2026-09-23', '2026-09-24',
    ]);
  });

  it('a filled day drops out — including one filled on a holiday', () => {
    const rows = [row('2026-09-01', 'office'), row('2026-09-21', 'field')];
    const out = missingDays(rows, HOLIDAYS, AFTER, 2026, 9);
    expect(out).not.toContain('2026-09-01');
    expect(out).not.toContain('2026-09-21');
    expect(out[0]).toBe('2026-09-02');
  });

  it('stops at yesterday', () => {
    expect(missingDays([], HOLIDAYS, new Date(2026, 8, 3), 2026, 9)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('defaults to the month `today` is in', () => {
    expect(missingDays([], HOLIDAYS, new Date(2026, 8, 3))).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('with no holiday list, only weekends are skipped', () => {
    const out = missingDays([], [], AFTER, 2026, 9);
    expect(out).toContain('2026-09-21');
    expect(out).toContain('2026-09-28');
    expect(out).not.toContain('2026-09-04');
    expect(out).toHaveLength(22);   // every Sun–Thu of the month
  });

  it('a holiday someone marked required comes back into the list', () => {
    const worked = HOLIDAYS.map(h => (h.date === '2026-09-28' ? { ...h, required: true } : h));
    expect(missingDays([], worked, AFTER, 2026, 9)).toContain('2026-09-28');
  });
});

describe('kpis', () => {
  const rows = [
    row('2026-09-01', 'field', { kibbutz: 'חוקוק', hours: 8 }),
    row('2026-09-02', 'field', { kibbutz: 'דפנה', hours: 5 }),
    row('2026-09-03', 'office'),
    row('2026-09-06', 'wfh'),
    row('2026-09-07', 'vacation'),
    row('2026-09-21', 'field', { kibbutz: 'יגור' }),      // worked on יום כיפור
  ];

  it('counts שטח / משרד / חסרים the way the three chips show them', () => {
    const missing = missingDays(rows, HOLIDAYS, AFTER, 2026, 9);
    expect(kpis(rows, missing, HOLIDAYS)).toEqual({
      field: 3, office: 2, away: 1, days: 6, missing: 11, onHoliday: 1, hours: 13,
    });
  });

  it('an empty month is all zeros, not NaN', () => {
    expect(kpis([], [], HOLIDAYS)).toEqual({ field: 0, office: 0, away: 0, days: 0, missing: 0, onHoliday: 0, hours: 0 });
  });
});

describe('copy', () => {
  it('day types read the way the buttons do', () => {
    expect(dayLabel('field')).toBe('🌾 יום שטח');
    expect(dayLabel('office')).toBe('🏢 משרד');
  });
  it('a holiday note invites, never scolds', () => {
    expect(holidayNote({ date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false }))
      .toBe('יום כיפור — הזנה אופציונלית');
    expect(holidayNote({ date: '2026-09-28', name: 'חול המועד סוכות', kind: 'company_closure', required: false }))
      .toBe('חול המועד סוכות — הזנה אופציונלית');
    expect(holidayNote(null)).toBe('');
  });
});

describe('cellsOf', () => {
  it('flattens a month into the chips the phone lists', () => {
    const rows = [row('2026-09-01', 'office')];
    const g = monthGrid(2026, 9, rows, HOLIDAYS, AFTER);
    expect(cellsOf(g, 'missing').map(c => c.date)).toEqual(missingDays(rows, HOLIDAYS, AFTER, 2026, 9));
  });
});
