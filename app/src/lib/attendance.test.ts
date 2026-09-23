// 📅 נוכחות + 🕎 חגים — the goldens (spec §7e).
//
// The fixture is SEPTEMBER 2026, the month the spec names, with the real holidays from
// db/company_holidays_seed.sql: ראש השנה 12–13.9, יום כיפור 21.9, סוכות 26.9, and the
// company closure 27.9–2.10. Everything the screen and the nudges decide is in here — the
// grid's cells, which days are "missing", and the three KPIs.
import { describe, expect, it } from 'vitest';
import {
  canEditAttendance, canSwitchPerson, cellsOf, dayLabel, EVE_DEFAULT_TYPE, eveCountdownText,
  holidayNote, isRequiredDay, kpis, missingByPerson, missingDays, missingDaysFor, monthGrid,
  reportedDaysFor, withVisitDays, type AttRow, type Holiday,
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
      .toBe('יום כיפור: הזנה אופציונלית');
    expect(holidayNote({ date: '2026-09-28', name: 'חול המועד סוכות', kind: 'company_closure', required: false }))
      .toBe('חול המועד סוכות: הזנה אופציונלית');
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

describe('missingByPerson (עידן 20.9 #2 — the overview strip)', () => {
  const holidays: Holiday[] = [];
  const today = new Date('2026-09-20T09:00:00+03:00');
  const day = (d: string, type = 'office') => ({ date: d, type } as AttRow);

  it('counts each person, worst first, holiday-aware through missingDays', () => {
    // September 2026: 1..19 are before today. אביאם filed two of them, ניתאי filed none.
    const rowsFor = (p: string) => (p === 'אביאם' ? [day('2026-09-01'), day('2026-09-02')] : []);
    const out = missingByPerson(['אביאם', 'ניתאי'], rowsFor, holidays, today, 2026, 9);
    expect(out.map(r => r.person)).toEqual(['ניתאי', 'אביאם']);
    expect(out[0].count).toBeGreaterThan(out[1].count);
    expect(out.every(r => r.known)).toBe(true);
    // the dates are real days of the month, all strictly before today
    expect(out[1].dates.every(d => d < '2026-09-20')).toBe(true);
    expect(out[1].dates).not.toContain('2026-09-01');
  });

  it('a person whose rows are not loaded yet is `known: false`, not a clean slate', () => {
    const out = missingByPerson(['אביאם', 'ניתאי'], p => (p === 'ניתאי' ? null : []), holidays, today, 2026, 9);
    const nitai = out.find(r => r.person === 'ניתאי')!;
    expect(nitai.known).toBe(false);
    expect(nitai.count).toBe(0);
    // …and it sorts last, behind everyone whose count is real
    expect(out[out.length - 1].person).toBe('ניתאי');
  });

  it('skips blanks and tolerates an empty roster', () => {
    expect(missingByPerson([], () => [], holidays, today)).toEqual([]);
    expect(missingByPerson(['', 'אביאם'], () => [], holidays, today, 2026, 9).map(r => r.person)).toEqual(['אביאם']);
  });
});

// ───────────── round 2 · F-2: a saved summary IS a יום שטח, and it MOVES ─────────────

describe('withVisitDays', () => {
  const manual: AttRow[] = [
    row('2026-09-01', 'office'),
    row('2026-09-02', 'wfh'),
  ];
  const visit = (date: string, extra: Record<string, unknown> = {}) =>
    ({ id: 'v' + date, visitor: 'אביאם', date, kibbutz: 'דפנה', workday: true, ...extra });

  it('a saved summary becomes a field day nobody had to file', () => {
    const out = withVisitDays(manual, [visit('2026-09-03')], 'אביאם');
    const d3 = out.find(r => r.date === '2026-09-03')!;
    expect(d3.type).toBe('field');
    expect(d3.source).toBe('visit');
    expect(d3.kibbutz).toBe('דפנה');
    expect(d3.hours).toBe(8);
  });

  it('editing the visit date MOVES the day, and the old date goes back to missing', () => {
    const before = withVisitDays(manual, [visit('2026-09-03')], 'אביאם');
    const after = withVisitDays(before, [visit('2026-09-07')], 'אביאם');
    expect(after.map(r => r.date)).not.toContain('2026-09-03');
    expect(after.find(r => r.date === '2026-09-07')!.type).toBe('field');
    expect(missingDays(after, HOLIDAYS, AFTER, 2026, 9)).toContain('2026-09-03');
  });

  it('unless another summary covers the old date', () => {
    const out = withVisitDays(manual, [visit('2026-09-03', { id: 'other' }), visit('2026-09-07')], 'אביאם');
    expect(out.filter(r => r.type === 'field').map(r => r.date)).toEqual(['2026-09-03', '2026-09-07']);
    expect(missingDays(out, HOLIDAYS, AFTER, 2026, 9)).not.toContain('2026-09-03');
  });

  it('or a manual row was filed there', () => {
    const before = withVisitDays(manual, [visit('2026-09-03')], 'אביאם');
    const withManual = withVisitDays([...before, row('2026-09-03', 'office')], [visit('2026-09-07')], 'אביאם');
    expect(withManual.find(r => r.date === '2026-09-03')!.type).toBe('office');
  });

  it('never duplicates a date: two visits on one day are ONE row, and it is idempotent', () => {
    const visits = [visit('2026-09-03'), visit('2026-09-03', { id: 'v2', kibbutz: 'חוקוק', workday: false, duration: 2 })];
    const once = withVisitDays(manual, visits, 'אביאם');
    const twice = withVisitDays(once, visits, 'אביאם');
    expect(once.filter(r => r.date === '2026-09-03')).toHaveLength(1);
    expect(once.find(r => r.date === '2026-09-03')!.kibbutz).toBe('דפנה, חוקוק');
    expect(once.find(r => r.date === '2026-09-03')!.hours).toBe(10);
    expect(twice).toEqual(once);
  });

  it('the summary wins over a manual row on the same date', () => {
    const out = withVisitDays([row('2026-09-03', 'office')], [visit('2026-09-03')], 'אביאם');
    expect(out.find(r => r.date === '2026-09-03')!.type).toBe('field');
  });

  it('a visit of another person is not your day', () => {
    const out = withVisitDays(manual, [visit('2026-09-03', { visitor: 'ניתאי' })], 'אביאם');
    expect(out.map(r => r.date)).not.toContain('2026-09-03');
  });

  it('keeps the manual month untouched', () => {
    const out = withVisitDays(manual, [visit('2026-09-03')], 'אביאם');
    expect(out.map(r => r.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
});

// ───────────── round 2 · F-5: ערב חג — required, and מהבית by default ─────────────

describe('ערב חג', () => {
  const EVES: Holiday[] = [...HOLIDAYS,
    { date: '2026-09-20', name: 'ערב יום כיפור', kind: 'holiday_eve', required: true }];

  it('is a required work day, unlike the חג itself', () => {
    expect(isRequiredDay('2026-09-20', EVES)).toBe(true);    // ערב יום כיפור, a Sunday
    expect(isRequiredDay('2026-09-21', EVES)).toBe(false);   // יום כיפור itself
  });

  it('an empty one is missing, and the grid marks it', () => {
    const grid = monthGrid(2026, 9, [], EVES, AFTER);
    const cell = grid.cells.find(c => c.date === '2026-09-20')!;
    expect(cell.eve).toBe(true);
    expect(cell.state).toBe('missing');
    expect(missingDays([], EVES, AFTER, 2026, 9)).toContain('2026-09-20');
  });

  it('invites the default rather than calling itself optional', () => {
    const eve = EVES.find(h => h.kind === 'holiday_eve')!;
    expect(holidayNote(eve)).toContain('מהבית');
    expect(holidayNote(eve)).not.toContain('אופציונלית');
    expect(EVE_DEFAULT_TYPE).toBe('wfh');
    expect(eveCountdownText(3)).toContain('3');
  });

  it('a plain חג cell is not an ערב חג', () => {
    const grid = monthGrid(2026, 9, [], EVES, AFTER);
    expect(grid.cells.find(c => c.date === '2026-09-21')!.eve).toBe(false);
  });
});

// ───────────── round 2 · F-4: missingDaysFor, for the calendar ─────────────

describe('missingDaysFor', () => {
  const rowsFor = (person: string) => (person === 'אביאם' ? [row('2026-09-01', 'office')] : null);

  it('answers one person one month, by month string or pair', () => {
    const a = missingDaysFor('אביאם', '2026-09', rowsFor, HOLIDAYS, AFTER);
    const b = missingDaysFor('אביאם', { year: 2026, month: 9 }, rowsFor, HOLIDAYS, AFTER);
    expect(a).toEqual(b);
    expect(a).not.toContain('2026-09-01');
    expect(a).toContain('2026-09-02');
    expect(a).not.toContain('2026-09-21');       // יום כיפור is never owed
  });

  it('an unloaded month paints nothing, rather than painting everything red', () => {
    expect(missingDaysFor('ניתאי', '2026-09', rowsFor, HOLIDAYS, AFTER)).toEqual([]);
  });
});

// ───────────── round 5 · B: reportedDaysFor, the green mirror ─────────────

describe('reportedDaysFor', () => {
  const rowsFor = (person: string) => (person === 'אביאם' ? [row('2026-09-01', 'office'), row('2026-09-02', 'field')] : null);

  it('answers the days that already have a row, including a future one', () => {
    expect(reportedDaysFor('אביאם', '2026-09', rowsFor, HOLIDAYS, AFTER)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('an unloaded month paints nothing', () => {
    expect(reportedDaysFor('ניתאי', '2026-09', rowsFor, HOLIDAYS, AFTER)).toEqual([]);
  });
});

// ───────────── round 2 · F-6: אביאם sees ניתאי, and only sees ─────────────

describe('who may look and who may write', () => {
  it('the two field workers see each other', () => {
    expect(canSwitchPerson('אביאם')).toBe(true);
    expect(canSwitchPerson('ניתאי')).toBe(true);
    expect(canSwitchPerson('עמיחי')).toBe(true);
    expect(canSwitchPerson('עידן', { isIdan: true })).toBe(true);
    expect(canSwitchPerson('מתניה')).toBe(false);
  });
  it('but only עידן and עמיחי write the day of someone else', () => {
    expect(canEditAttendance('אביאם', 'אביאם')).toBe(true);
    expect(canEditAttendance('אביאם', 'ניתאי')).toBe(false);
    expect(canEditAttendance('עמיחי', 'ניתאי')).toBe(true);
    expect(canEditAttendance('עידן', 'ניתאי', { isIdan: true })).toBe(true);
    expect(canEditAttendance('צפייה', 'צפייה', { isViewer: true })).toBe(false);
  });
});
