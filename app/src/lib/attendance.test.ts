// 📅 נוכחות + 🕎 חגים — the goldens (spec §7e).
//
// The fixture is SEPTEMBER 2026, the month the spec names, with the real holidays from
// db/company_holidays_seed.sql: ראש השנה 12–13.9, יום כיפור 21.9, סוכות 26.9, and the
// company closure 27.9–2.10. Everything the screen and the nudges decide is in here — the
// grid's cells, which days are "missing", and the three KPIs.
import { describe, expect, it } from 'vitest';
import {
  attCellLook, attLegend, ATT_FILERS, attTiles, canEditAttendance, canOverride, canSwitchPerson,
  cellsOf, DAY_LABELS, dayChip, dayLabel, EVE_DEFAULT_TYPE, eveCountdownText, holidayNote,
  isRequiredDay, kpis, mergeByDay, missingBlock, missingByPerson, missingDays, missingDaysFor,
  monthGrid, mustFile, originLine, reportedDaysFor, rowOrigin, savedToast, toggleTile, withVisitDays,
  type AttRow, type Holiday, type TileKey,
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

/** A visit summary fixture, shared by the withVisitDays describes. */
const visit = (date: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'v' + date, visitor: 'אביאם', date, kibbutz: 'דפנה', workday: true, ...extra });

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
    // round 5: no emoji, geresh
    expect(dayLabel('field')).toBe('יום שטח');
    expect(dayLabel('office')).toBe('משרד');
  });
  it('a holiday note invites, never scolds', () => {
    expect(holidayNote({ date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false }))
      .toBe('יום כיפור: הזנה אופציונלית');
    expect(holidayNote({ date: '2026-09-28', name: 'חול המועד סוכות', kind: 'company_closure', required: false }))
      .toBe('חול המועד סוכות: הזנה אופציונלית');
    expect(holidayNote(null)).toBe('');
  });
});

describe('round 5 · A5 — copy', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  it('day labels are words', () => {
    expect(DAY_LABELS).toEqual({
      field: 'יום שטח', office: 'משרד', wfh: 'מהבית', reserve: 'מילואים', vacation: 'חופש', off: 'לא בעבודה', other: 'אחר',
    });
    for (const s of Object.values(DAY_LABELS)) expect(s).not.toMatch(EMOJI);
  });
  it('a day letter carries its geresh', () => {
    expect(dayChip('2026-09-01')).toBe('יום ג׳ · 1.9');
  });
  it('the save toast says what was saved, and marks a holiday without a sermon', () => {
    const HOL = { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false } as Holiday;
    expect(savedToast('office', '2026-09-03', null)).toBe('נשמר · משרד · 3.9');
    expect(savedToast('field', '2026-09-21', HOL)).toBe('נשמר · יום שטח · 21.9 · יום חג');
  });
  it('no · יום חג suffix for an eve — it is a required day, not an optional one', () => {
    const EVE = { date: '2026-09-20', name: 'ערב יום כיפור', kind: 'holiday_eve', required: true } as Holiday;
    expect(savedToast('wfh', '2026-09-20', EVE)).toBe('נשמר · מהבית · 20.9');
  });
  it('eve copy has no emoji either', () => {
    expect(holidayNote({ date: '2026-09-20', name: 'ערב יום כיפור', kind: 'holiday_eve', required: true })).not.toMatch(EMOJI);
    expect(eveCountdownText(3)).not.toMatch(EMOJI);
  });
});

describe('round 5 · A1 — the "חסר לך" block', () => {
  it('for the person himself', () => {
    expect(missingBlock('אביאם', 'אביאם', ['2026-09-01', '2026-09-03'])).toEqual({
      show: true, title: 'חסר לך', count: 2,
      days: [
        { date: '2026-09-01', label: 'יום ג׳ · 1.9', aria: 'תיעוד יום ג׳ · 1.9' },
        { date: '2026-09-03', label: 'יום ה׳ · 3.9', aria: 'תיעוד יום ה׳ · 3.9' },
      ],
      empty: 'כל ימי העבודה בחודש מתועדים.',
    });
  });
  it('someone else looking names the person', () => {
    expect(missingBlock('ניתאי', 'עידן', []).title).toBe('חסר לניתאי');
  });
  it('a complete month says so, counting work on a holiday', () => {
    expect(missingBlock('אביאם', 'אביאם', [], 1).empty).toBe('כל ימי העבודה בחודש מתועדים · יום עבודה אחד בחג.');
    expect(missingBlock('אביאם', 'אביאם', [], 2).empty).toBe('כל ימי העבודה בחודש מתועדים · 2 ימי עבודה בחג.');
  });
  it('nobody is chased who doesn’t file', () => {
    expect(missingBlock('עידן', 'עידן', ['2026-09-01']).show).toBe(false);
    expect(missingBlock('מתניה', 'מתניה', []).show).toBe(false);
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

// ───────────── round 5 · A4: who files, and which row wins a day ─────────────

describe('round 5 · A4 — who files, and which row wins a day', () => {
  it('only אביאם and ניתאי file attendance', () => {
    expect(ATT_FILERS).toEqual(['אביאם', 'ניתאי']);
    expect(mustFile('אביאם')).toBe(true);
    expect(mustFile('ניתאי')).toBe(true);
    expect(mustFile('עידן')).toBe(false);
    expect(mustFile('')).toBe(false);
  });
  it('one row per day: manual beats calendar beats visit_auto; unknown source counts as manual', () => {
    const out = mergeByDay([
      { date: '2026-09-03', type: 'field', source: 'visit_auto' },
      { date: '2026-09-03T12:00:00.000Z', type: 'office', source: 'manual' },
      { date: '2026-09-07', type: 'vacation', source: 'calendar' },
      { date: '2026-09-07', type: 'field', source: 'visit_auto' },
      { date: '2026-09-08', type: 'wfh' },
      { date: '2026-09-08', type: 'field', source: 'visit_auto' },
      { date: '', type: 'office' },
    ]);
    expect(out.map(r => [r.date, r.type])).toEqual([
      ['2026-09-03', 'office'], ['2026-09-07', 'vacation'], ['2026-09-08', 'wfh'],
    ]);
  });
  it('a visit_auto row is a real row: a derived visit day never overrides it or duplicates it', () => {
    const out = withVisitDays([{ date: '2026-09-03', type: 'field', source: 'visit_auto', kibbutz: 'יגור' }], [visit('2026-09-03')], 'אביאם');
    expect(out).toEqual([{ date: '2026-09-03', type: 'field', source: 'visit_auto', kibbutz: 'יגור' }]);
  });
});

// ───────────── round 2 · F-2: a saved summary IS a יום שטח, and it MOVES ─────────────

describe('withVisitDays', () => {
  const manual: AttRow[] = [
    row('2026-09-01', 'office'),
    row('2026-09-02', 'wfh'),
  ];

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

  it('a manual row on the same date wins over the summary', () => {
    // round 5 rule 5: manual rows win over visits (the visit writer asks before changing a manual day)
    const out = withVisitDays([row('2026-09-03', 'office')], [visit('2026-09-03')], 'אביאם');
    expect(out).toEqual([{ ...row('2026-09-03', 'office'), date: '2026-09-03' }]);
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

// ───────────── round 5 · A2, A3: tiles and the cell look ─────────────
// Dates: 1.9.2026 is a Tuesday, 7.9 a Monday, 16.9 a Wednesday, 21.9 a Monday, 23.9 a Wednesday.

describe('round 5 · A3 — tiles', () => {
  const K = { field: 4, office: 6, away: 1, days: 11, missing: 3, onHoliday: 0, hours: 30 };
  it('a filer gets three tiles, anyone else two', () => {
    expect(attTiles(K, 'אביאם')).toEqual([
      { key: 'field', label: 'ימי שטח', value: 4, role: 'ok' },
      { key: 'office', label: 'משרד ובית', value: 6, role: 'info' },
      { key: 'missing', label: 'ימים חסרים', value: 3, role: 'danger' },
    ]);
    expect(attTiles(K, 'מתניה').map(t => t.key)).toEqual(['field', 'office']);
  });
  it('a second tap clears; another tile switches', () => {
    expect(toggleTile(null, 'field')).toBe('field');
    expect(toggleTile('field', 'field')).toBe(null);
    expect(toggleTile('field', 'office')).toBe('office');
  });
});

describe('round 5 · A2 — one look per cell', () => {
  const HOL: Holiday = { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false };
  const EVE: Holiday = { date: '2026-09-16', name: 'ערב סוכות', kind: 'holiday_eve', required: true };
  const EVE_FUT: Holiday = { date: '2026-09-29', name: 'ערב שמחת תורה', kind: 'holiday_eve', required: true };
  // A required closure: still holiday CONTEXT (purple) for a non-filer, but a normal work day
  // (red when empty) for a filer — the bug round 5 flags in attCellLook.
  const REQ_HOL: Holiday = { date: '2026-09-08', name: 'חוה״מ עבודה', kind: 'company_closure', required: true };
  // Same, but in the future — the grid state is 'future', not 'missing', so it needs its own branch.
  const FUT_REQ_HOL: Holiday = { date: '2026-09-30', name: 'חוה״מ עבודה', kind: 'company_closure', required: true };
  const rows: AttRow[] = [
    { date: '2026-09-01', type: 'field', source: 'visit_auto' },
    { date: '2026-09-02', type: 'office' },
    { date: '2026-09-03', type: 'vacation', source: 'calendar' },
  ];
  const today = new Date(2026, 8, 23, 12);
  const g = monthGrid(2026, 9, rows, [HOL, EVE, EVE_FUT, REQ_HOL, FUT_REQ_HOL], today);
  const at = (d: string) => g.cells.find(c => c.date === d)!;
  const look = (d: string, o: Partial<{ person: string; tile: TileKey | null; selected: boolean }> = {}) =>
    attCellLook(at(d), { person: 'אביאם', tile: null, selected: false, ...o });

  it('filed days by type; holiday purple; a future eve purple', () => {
    expect(look('2026-09-01').state).toBe('field');
    expect(look('2026-09-02').state).toBe('office');
    expect(look('2026-09-03').state).toBe('away');
    expect(look('2026-09-21')).toMatchObject({ state: 'holiday', label: 'יום ב׳ · 21.9 · יום כיפור' });
    expect(look('2026-09-29').state).toBe('eve');
  });
  it('a missing past workday is red for a filer, plain for anyone else', () => {
    expect(look('2026-09-07')).toMatchObject({ state: 'missing', label: 'יום ב׳ · 7.9 · לא דווחה נוכחות' });
    expect(look('2026-09-07', { person: 'מתניה' }).state).toBe('default');
  });
  it('a past eve with no row is missing for a filer, and keeps its name', () => {
    expect(look('2026-09-16')).toMatchObject({ state: 'missing', label: 'יום ד׳ · 16.9 · ערב סוכות · לא דווחה נוכחות' });
  });
  it('a past eve with no row is purple, not plain, for anyone else', () => {
    expect(look('2026-09-16', { person: 'מתניה' }).state).toBe('eve');
  });
  it('a required closure is a normal work day for a filer (red when empty), purple context for anyone else', () => {
    expect(look('2026-09-08').state).toBe('missing');
    expect(look('2026-09-08', { person: 'מתניה' }).state).toBe('holiday');
  });
  it('a future required closure is purple context too — it is never "missing" yet', () => {
    expect(look('2026-09-30').state).toBe('holiday');
  });
  it('a weekend stays plain even for a filer — no violet Saturday, no red', () => {
    expect(look('2026-09-05').state).toBe('default');   // Saturday
  });
  it('a worked holiday shows the work, not the holiday state', () => {
    const g2 = monthGrid(2026, 9, [{ date: '2026-09-21', type: 'field' }], [HOL], today);
    const c = g2.cells.find(x => x.date === '2026-09-21')!;
    const l = attCellLook(c, { person: 'אביאם', tile: null, selected: false });
    expect(l).toMatchObject({ state: 'field', label: 'יום ב׳ · 21.9 · יום כיפור · יום שטח' });
  });
  it('a tile colors only its own category; holidays and eves stay purple', () => {
    expect(look('2026-09-01', { tile: 'office' }).state).toBe('default');
    expect(look('2026-09-02', { tile: 'office' }).state).toBe('office');
    expect(look('2026-09-07', { tile: 'field' }).state).toBe('default');
    expect(look('2026-09-21', { tile: 'field' }).state).toBe('holiday');
    expect(look('2026-09-29', { tile: 'missing' }).state).toBe('eve');
  });
  it('selected wins; today is a ring on top', () => {
    expect(look('2026-09-01', { selected: true }).state).toBe('selected');
    expect(look('2026-09-23')).toMatchObject({ today: true });
  });
  it('the legend shows red only for a filer', () => {
    expect(attLegend('מתניה').map(i => i.key)).toEqual(['holiday', 'eve', 'field', 'office', 'away']);
    expect(attLegend('ניתאי').map(i => i.key)).toEqual(['holiday', 'eve', 'field', 'office', 'away', 'missing']);
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

// ───────────── round 5 · A4: where a day came from ─────────────

describe('round 5 · A4 — where a day came from', () => {
  it('origin by source', () => {
    expect(rowOrigin(null)).toBe('none');
    expect(rowOrigin({ date: '2026-09-01', type: 'office' })).toBe('manual');
    expect(rowOrigin({ date: '2026-09-01', type: 'vacation', source: 'calendar' })).toBe('calendar');
    expect(rowOrigin({ date: '2026-09-01', type: 'field', source: 'visit_auto' })).toBe('auto');
    expect(rowOrigin({ date: '2026-09-01', type: 'field', source: 'visit' })).toBe('auto');
  });
  it('the line under an automatic day', () => {
    expect(originLine({ date: '2026-09-01', type: 'field', source: 'visit_auto', kibbutz: 'יגור', hours: 4 }))
      .toBe('נרשם אוטומטית מסיכום הביקור · יגור · 4 ש׳');
    expect(originLine({ date: '2026-09-01', type: 'field', source: 'visit_auto' })).toBe('נרשם אוטומטית מסיכום הביקור');
    expect(originLine({ date: '2026-09-03', type: 'vacation', source: 'calendar' })).toBe('נרשם מהיומן');
    expect(originLine({ date: '2026-09-02', type: 'office' })).toBe('');
  });
  it('a V-written or calendar day can be changed; the pre-V derived day cannot (the legacy merge would hide the change)', () => {
    expect(canOverride({ date: 'x', type: 'field', source: 'visit_auto' })).toBe(true);
    expect(canOverride({ date: 'x', type: 'vacation', source: 'calendar' })).toBe(true);
    expect(canOverride({ date: 'x', type: 'office', source: 'manual' })).toBe(true);
    expect(canOverride({ date: 'x', type: 'field', source: 'visit' })).toBe(false);
    expect(canOverride(null)).toBe(true);
  });
});
