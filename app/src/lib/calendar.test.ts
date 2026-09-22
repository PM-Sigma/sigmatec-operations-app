// Goldens for the unified calendar (spec §7f, Task 13).
//
// The fixture month is SEPTEMBER 2026 — the same month attendance.test.ts uses, so a reader
// comparing the two screens is comparing the same days. 1.9.2026 is a Tuesday.
import { describe, expect, it } from 'vitest';
import type { Holiday } from './attendance';
import {
  abilities, absenceAttendance, absenceDays, byDate, calendarItems, dueAt, dueByKibbutz,
  groupByKibbutz, heShort, isWeekend, itemsOn, monthView, NO_KIBBUTZ, reorder, ROUTE_HEADERS,
  routeWithHeaders, scheduleTasksPlan, stopsOrder, stopsPayload, toKey, weekDays, weekNumber,
  weekView, ymd,
  type AbsenceRow, type CalEmsTask, type OfficeEvent, type VisitRow,
  canPlanDay, dayLetters, dayWhen, gridDays, monthView as monthViewR2, visibleDows, visitsOn,
  workWeekLabel,
} from './calendar';

// ───────────────────────────── fixture ─────────────────────────────

const HOLIDAYS = [
  { date: '2026-09-12', name: 'ראש השנה', kind: 'holiday', required: false },
  { date: '2026-09-13', name: 'ראש השנה', kind: 'holiday', required: false },
  { date: '2026-09-21', name: 'יום כיפור', kind: 'holiday', required: false },
] as unknown as Array<{ date: string; name: string; kind: any; required: boolean }>;

const EVENTS: OfficeEvent[] = [
  { id: 'ev1', title: 'ישיבת חברה', start: '2026-09-06T08:00:00+03:00', hangoutLink: 'https://meet.google.com/abc-defg-hij' },
  { id: 'ev2', title: 'ישיבת פיתוח', start: '2026-09-06T10:00:00+03:00' },
  { id: 'ev3', title: 'כנס אנרגיה', start: '2026-09-17' },
];

const VISITS: VisitRow[] = [
  { id: 'v1', date: '2026-09-08T09:00:00+03:00', visitor: 'אביאם', kibbutz: 'יגור', workday: true },
  { id: 'v2', date: '2026-09-08T14:00:00+03:00', visitor: 'ניתאי', kibbutz: 'דגניה' },
];

const TASKS: CalEmsTask[] = [
  { id: 't1', title: 'בדיקת מונים', status: 'new', expectedCompletionDate: '2026-09-08T12:00:00.000Z', site: { id: 's1', name: 'יגור' }, assignee: { firstName: 'אביאם', lastName: 'כהן' } },
  { id: 't2', title: 'החלפת בקר', status: 'in_progress', expectedCompletionDate: '2026-09-08T12:00:00.000Z', site: { id: 's2', name: 'חוקוק' }, assignee: { firstName: 'ניתאי', lastName: 'לוי' } },
  { id: 't3', title: 'משימה סגורה', status: 'done', expectedCompletionDate: '2026-09-08T12:00:00.000Z', site: { id: 's1', name: 'יגור' }, assignee: null },
  { id: 't4', title: 'בלי תאריך', status: 'new', expectedCompletionDate: null, site: { id: 's3', name: 'גבת' }, assignee: null },
];

const ABSENCES: AbsenceRow[] = [
  { id: 'a1', person: 'ניתאי', kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-13', note: 'חופש משפחתי' },
];

// ───────────────────────────── dates ─────────────────────────────

describe('dates', () => {
  it('ymd is local, never UTC', () => {
    expect(ymd(new Date(2026, 8, 1, 23, 30))).toBe('2026-09-01');
  });

  it('toKey folds a datetime, a plain day and a Date onto one shape', () => {
    expect(toKey('2026-09-08')).toBe('2026-09-08');
    expect(toKey(new Date(2026, 8, 8, 12))).toBe('2026-09-08');
    expect(toKey('')).toBe('');
    expect(toKey('not a date')).toBe('');
  });

  it('weekend is Friday + Saturday', () => {
    expect(isWeekend('2026-09-04')).toBe(true);   // Friday
    expect(isWeekend('2026-09-05')).toBe(true);   // Saturday
    expect(isWeekend('2026-09-06')).toBe(false);  // Sunday
  });

  it('weekNumber is ISO-8601', () => {
    expect(weekNumber('2026-09-08')).toBe(37);
    expect(weekNumber('2026-01-01')).toBe(1);
    // 2026-12-31 is a Thursday → still week 53 of 2026.
    expect(weekNumber('2026-12-31')).toBe(53);
    // 2027-01-01 is a Friday → it belongs to ISO week 53 of 2026, not week 1.
    expect(weekNumber('2027-01-01')).toBe(53);
  });

  it('the display week is Sunday → Saturday', () => {
    expect(weekDays('2026-09-08')).toEqual([
      '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12',
    ]);
  });

  it('heShort is the day.month a chip shows', () => {
    expect(heShort('2026-09-08')).toBe('8.9');
  });
});

// ───────────────────────────── the grid ─────────────────────────────

describe('monthView', () => {
  const m = monthView(2026, 9, HOLIDAYS as Holiday[], '2026-09-08');

  it('is Sunday-first, labelled in Hebrew, and carries the ISO week on each row', () => {
    expect(m.label).toBe('ספטמבר 2026');
    expect(m.weeks[0].days[0].dow).toBe(0);
    // 1.9.2026 is a Tuesday → the first row opens on Sunday 30.8.
    expect(m.weeks[0].days[0].date).toBe('2026-08-30');
    expect(m.weeks[0].days[0].inMonth).toBe(false);
    expect(m.weeks.map(w => w.week)).toEqual([36, 37, 38, 39, 40]);
  });

  it('marks today, the weekend and the holidays', () => {
    const all = m.weeks.flatMap(w => w.days);
    expect(all.find(d => d.date === '2026-09-08')!.today).toBe(true);
    expect(all.find(d => d.date === '2026-09-04')!.weekend).toBe(true);
    expect(all.find(d => d.date === '2026-09-12')!.holiday!.name).toBe('ראש השנה');
    expect(all.find(d => d.date === '2026-09-08')!.holiday).toBeNull();
  });

  it('weekView gives the same cells for one week', () => {
    const w = weekView('2026-09-08', HOLIDAYS as Holiday[], '2026-09-08');
    expect(w.week).toBe(37);
    expect(w.days.map(d => d.date)).toEqual(weekDays('2026-09-08'));
    expect(w.days[6].holiday!.name).toBe('ראש השנה');
  });
});

// ───────────────────────────── items ─────────────────────────────

describe('calendarItems', () => {
  const items = calendarItems(
    { events: EVENTS, visits: VISITS, emsTasks: TASKS, absences: ABSENCES },
    { me: 'אביאם' },
  );

  it('folds four sources into one sorted list', () => {
    expect(items.filter(i => i.date === '2026-09-06').map(i => i.title))
      .toEqual(['ישיבת חברה', 'ישיבת פיתוח']);
    // Absence band first, then the events, visits and tasks of the day.
    expect(itemsOn(items, '2026-09-08').map(i => i.layer)).toEqual(['visit', 'visit', 'ems', 'ems']);
  });

  it('drops a closed task and a task with no due date', () => {
    expect(items.some(i => i.taskId === 't3')).toBe(false);
    expect(items.some(i => i.taskId === 't4')).toBe(false);
  });

  it('marks what is mine and leaves an office event everyone’s', () => {
    const mine = items.filter(i => i.mine).map(i => i.key);
    expect(mine).toContain('ems:t1');          // assignee אביאם כהן ⊃ אביאם
    expect(mine).toContain('visit:v1');
    expect(mine).toContain('event:ev1');       // an office event is never dimmed
    expect(mine).not.toContain('ems:t2');      // ניתאי's
  });

  it('hideEms removes the EMS layer and nothing else', () => {
    const hidden = calendarItems({ events: EVENTS, visits: VISITS, emsTasks: TASKS }, { hideEms: true });
    expect(hidden.some(i => i.layer === 'ems')).toBe(false);
    expect(hidden.filter(i => i.layer === 'visit')).toHaveLength(2);
  });

  it('exposes a Meet link only where Google gave one', () => {
    expect(items.find(i => i.key === 'event:ev1')!.meetLink).toBe('https://meet.google.com/abc-defg-hij');
    expect(items.find(i => i.key === 'event:ev2')!.meetLink).toBeUndefined();
  });

  it('spreads an absence across every day of its range, weekend included', () => {
    const band = items.filter(i => i.layer === 'absence').map(i => i.date);
    expect(band).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']);
  });

  it('byDate indexes what the grid draws', () => {
    expect(Object.keys(byDate(items))).toContain('2026-09-08');
    expect(byDate(items)['2026-09-17'].map(i => i.title)).toEqual(['כנס אנרגיה']);
  });
});

// ───────────────────────────── grouping + route ─────────────────────────────

describe('groupByKibbutz', () => {
  const day = itemsOn(
    calendarItems({ events: EVENTS, visits: VISITS, emsTasks: TASKS }, { me: 'אביאם' }),
    '2026-09-08',
  );
  const groups = groupByKibbutz(day);

  it('groups by the place you drive to, Hebrew order', () => {
    expect(groups.map(g => g.kibbutz)).toEqual(['דגניה', 'חוקוק', 'יגור']);
    expect(groups.find(g => g.kibbutz === 'יגור')!.items.map(i => i.layer)).toEqual(['visit', 'ems']);
  });

  it('puts the kibbutz-less bucket last and marks it not real', () => {
    const withEvent = groupByKibbutz(day.concat(
      calendarItems({ events: [{ id: 'x', title: 'ישיבה', start: '2026-09-08' }] })[0],
    ));
    const last = withEvent[withEvent.length - 1];
    expect(last.kibbutz).toBe(NO_KIBBUTZ);
    expect(last.real).toBe(false);
  });
});

describe('routeWithHeaders', () => {
  const due = { יגור: ['t1'], חוקוק: ['t2'], דגניה: [] as string[] };

  it('derives 🌅 / ➡️ / 🌇 from position', () => {
    const rows = routeWithHeaders(['יגור', 'חוקוק', 'דגניה'], due);
    expect(rows.map(r => r.headerLabel)).toEqual([
      ROUTE_HEADERS.first, ROUTE_HEADERS.middle, ROUTE_HEADERS.last,
    ]);
    expect(rows[0].count).toBe(1);
    expect(rows[2].count).toBe(0);              // a stop he chose, with nothing due — still his stop
  });

  it('a single stop is the start of the day, not the end of it', () => {
    expect(routeWithHeaders(['יגור'], { יגור: ['t1'] }).map(r => r.header)).toEqual(['first']);
  });

  it('two stops are the first and the last', () => {
    expect(routeWithHeaders(['יגור', 'חוקוק'], { יגור: ['t1'], חוקוק: ['t2'] }).map(r => r.header))
      .toEqual(['first', 'last']);
  });

  it('a kibbutz with work due but no place in the route sits under 📥 לא משובץ', () => {
    const rows = routeWithHeaders(['יגור'], due);
    const unplaced = rows.filter(r => r.header === 'unplaced');
    expect(unplaced.map(r => r.kibbutz)).toEqual(['דגניה', 'חוקוק']);
    expect(unplaced[0].headerLabel).toBe(ROUTE_HEADERS.unplaced);
    expect(unplaced.every(r => r.index === -1)).toBe(true);
  });

  it('an empty route is all-unplaced, and an empty day is nothing at all', () => {
    expect(routeWithHeaders([], due).every(r => r.header === 'unplaced')).toBe(true);
    expect(routeWithHeaders([], {})).toEqual([]);
  });

  it('ignores a duplicated stop', () => {
    // …and the ones it never placed follow, in Hebrew order, under 📥 לא משובץ.
    expect(routeWithHeaders(['יגור', 'יגור'], due).map(r => r.kibbutz)).toEqual(['יגור', 'דגניה', 'חוקוק']);
  });

  it('dueByKibbutz counts only the real stops', () => {
    const day = itemsOn(calendarItems({ visits: VISITS, emsTasks: TASKS }), '2026-09-08');
    expect(dueByKibbutz(day)).toEqual({ יגור: ['t1'], דגניה: [], חוקוק: ['t2'] });
  });
});

describe('reorder', () => {
  const list = ['א', 'ב', 'ג', 'ד'];
  it('moves a stop', () => {
    expect(reorder(list, 0, 2)).toEqual(['ב', 'ג', 'א', 'ד']);
    expect(reorder(list, 3, 0)).toEqual(['ד', 'א', 'ב', 'ג']);
  });
  it('↑ on the first row and ↓ on the last change nothing', () => {
    expect(reorder(list, 0, -1)).toEqual(list);
    expect(reorder(list, 3, 4)).toEqual(list);
    expect(reorder(list, 1, 1)).toEqual(list);
  });
  it('never mutates the input', () => {
    reorder(list, 0, 3);
    expect(list).toEqual(['א', 'ב', 'ג', 'ד']);
  });
});

describe('stops payload', () => {
  it('round-trips through the jsonb shape', () => {
    const payload = stopsPayload(['יגור', 'חוקוק'], { יגור: ['t1'] });
    expect(payload).toEqual([{ kibbutz: 'יגור', task_ids: ['t1'] }, { kibbutz: 'חוקוק', task_ids: [] }]);
    expect(stopsOrder(payload)).toEqual(['יגור', 'חוקוק']);
  });
  it('still reads a plain-string payload, and shrugs at junk', () => {
    expect(stopsOrder(['יגור', 'חוקוק'])).toEqual(['יגור', 'חוקוק']);
    expect(stopsOrder(null)).toEqual([]);
    expect(stopsOrder([null, 3, { kibbutz: 'גבת' }])).toEqual(['גבת']);
  });
});

// ───────────────────────────── the scheduler ─────────────────────────────

describe('scheduleTasksPlan', () => {
  it('PATCHes the date and hands back the exact undo', () => {
    const plan = scheduleTasksPlan([TASKS[0], TASKS[3]], '2026-09-15');
    expect(plan.count).toBe(2);
    expect(plan.patches).toEqual([
      { id: 't1', body: { expectedCompletionDate: dueAt('2026-09-15') } },
      { id: 't4', body: { expectedCompletionDate: dueAt('2026-09-15') } },
    ]);
    expect(plan.undo).toEqual([
      { id: 't1', body: { expectedCompletionDate: dueAt('2026-09-08') } },
      // a task that had no date goes back to having none
      { id: 't4', body: { expectedCompletionDate: null } },
    ]);
    expect(plan.message).toBe('2 משימות נקבעו ל15.9');
  });

  it('skips a task already due that day', () => {
    const plan = scheduleTasksPlan([TASKS[0], TASKS[1]], '2026-09-08');
    expect(plan.count).toBe(0);
    expect(plan.patches).toEqual([]);
  });

  it('counts one in the singular', () => {
    expect(scheduleTasksPlan([TASKS[3]], '2026-09-15').message).toBe('משימה אחת נקבעה ל15.9');
  });

  it('writes the due date at midday so no timezone moves it a day', () => {
    expect(dueAt('2026-09-15')).toBe(new Date('2026-09-15T12:00:00').toISOString());
  });
});

// ───────────────────────────── absences ─────────────────────────────

describe('absences', () => {
  const vacation: AbsenceRow = { id: 'a1', person: 'ניתאי', kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-14', note: 'חופש' };

  it('the band covers every day; the generator covers only work days', () => {
    expect(absenceDays(vacation)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14']);
    // 11.9 Friday + 12.9 Saturday are the weekend; 13.9 is ראש השנה (required=false).
    expect(absenceDays(vacation, HOLIDAYS as Holiday[])).toEqual(['2026-09-10', '2026-09-14']);
  });

  it('generates attendance rows for the person, source=calendar', () => {
    expect(absenceAttendance(vacation, HOLIDAYS as Holiday[])).toEqual([
      { person: 'ניתאי', date: '2026-09-10', dayType: 'vacation', source: 'calendar', note: 'חופש' },
      { person: 'ניתאי', date: '2026-09-14', dayType: 'vacation', source: 'calendar', note: 'חופש' },
    ]);
  });

  it('מילואים files as reserve', () => {
    const reserve: AbsenceRow = { ...vacation, kind: 'reserve', end_date: '2026-09-10', note: '' };
    expect(absenceAttendance(reserve, HOLIDAYS as Holiday[])[0].dayType).toBe('reserve');
    expect(absenceAttendance(reserve, HOLIDAYS as Holiday[])[0].note).toBe('🪖 מילואים');
  });

  it('a manual row always wins', () => {
    const rows = absenceAttendance(vacation, HOLIDAYS as Holiday[], [
      { person: 'ניתאי', date: '2026-09-10', source: 'manual' },
      { person: 'ניתאי', date: '2026-09-14', source: 'calendar' },   // a previous generation — replaceable
    ]);
    expect(rows.map(r => r.date)).toEqual(['2026-09-14']);
  });

  it('a company-wide range covers both people who file attendance', () => {
    const all: AbsenceRow = { id: 'a2', person: null, kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-10' };
    expect(absenceAttendance(all, HOLIDAYS as Holiday[]).map(r => r.person)).toEqual(['אביאם', 'ניתאי']);
  });

  it('a 🎉 event generates nothing — it marks the day, it does not file it', () => {
    expect(absenceAttendance({ ...vacation, kind: 'event' }, HOLIDAYS as Holiday[])).toEqual([]);
  });

  it('nobody else has attendance to generate', () => {
    expect(absenceAttendance({ ...vacation, person: 'עידן' }, HOLIDAYS as Holiday[])).toEqual([]);
  });

  it('a reversed or empty range is nothing', () => {
    expect(absenceDays({ ...vacation, start_date: '2026-09-14', end_date: '2026-09-10' })).toEqual([]);
    expect(absenceDays({ ...vacation, start_date: '', end_date: '' })).toEqual([]);
  });
});

// ───────────────────────────── roles ─────────────────────────────

describe('abilities', () => {
  it('the viewer reads and nothing else', () => {
    expect(abilities('viewer', 'צפייה')).toEqual({
      canAdd: false, canReorder: false, canAbsentOthers: false, seesEveryone: true,
    });
  });
  it('a field worker schedules and reorders, for himself', () => {
    expect(abilities('team', 'אביאם')).toEqual({
      canAdd: true, canReorder: true, canAbsentOthers: false, seesEveryone: false,
    });
  });
  it('עמיחי sees everyone and may file for anyone', () => {
    expect(abilities('team', 'עמיחי')).toEqual({
      canAdd: true, canReorder: true, canAbsentOthers: true, seesEveryone: true,
    });
  });
  it('עידן too', () => {
    expect(abilities('idan', 'עידן').canAbsentOthers).toBe(true);
  });
});

// ───────────── round 2 · package G — the work-week grid and the day's tense ─────────────

describe('the work week (G1)', () => {
  it('א–ה is five columns; only a full MONTH shows Fri/Sat', () => {
    expect(visibleDows('month', true)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleDows('month', false)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // A week view is the WORKING week, always — the toggle is a month affair.
    expect(visibleDows('week', true)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleDows('week', false)).toEqual([0, 1, 2, 3, 4]);
  });

  it('the day letters follow the columns', () => {
    expect(dayLetters('month', true)).toEqual(['א', 'ב', 'ג', 'ד', 'ה']);
    expect(dayLetters('month', false)).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']);
  });

  it('the toggle says WHERE IT GOES, not where it is', () => {
    expect(workWeekLabel(true)).toBe('חודש מלא');
    expect(workWeekLabel(false)).toBe('שבוע עבודה');
  });

  it('a week row is narrowed to the visible columns, in order', () => {
    const week = monthViewR2(2026, 9).weeks[1];
    const five = gridDays(week, 'month', true);
    expect(five).toHaveLength(5);
    expect(five.map(d => d.dow)).toEqual([0, 1, 2, 3, 4]);
    expect(gridDays(week, 'month', false)).toHaveLength(7);
    // Nothing is re-ordered — the same cells, minus two.
    expect(five.map(d => d.date)).toEqual(week.days.slice(0, 5).map(d => d.date));
  });
});

describe('past · today · future (G3)', () => {
  it('names the tense of a day', () => {
    expect(dayWhen('2026-09-21', '2026-09-22')).toBe('past');
    expect(dayWhen('2026-09-22', '2026-09-22')).toBe('today');
    expect(dayWhen('2026-09-23', '2026-09-22')).toBe('future');
  });
  it('a day that is over cannot be planned — today still can', () => {
    expect(canPlanDay('2026-09-21', '2026-09-22')).toBe(false);
    expect(canPlanDay('2026-09-22', '2026-09-22')).toBe(true);
    expect(canPlanDay('2026-09-23', '2026-09-22')).toBe(true);
  });
  it('a past day shows the summaries filed ON it, and nothing from its neighbours', () => {
    const visits = [
      { id: 'a', date: '2026-09-21', kibbutz: 'גבת', summary: 'הוחלף מונה' },
      { id: 'b', date: '2026-09-22', kibbutz: 'דגניה', summary: 'ביקור' },
      { id: 'c', date: '2026-09-21T08:00:00', kibbutz: 'חוקוק', summary: 'עוד ביקור' },
    ];
    expect(visitsOn(visits, '2026-09-21').map(v => v.kibbutz)).toEqual(['גבת', 'חוקוק']);
    expect(visitsOn([], '2026-09-21')).toEqual([]);
  });
});

describe('the route ignores EMS due dates (G4)', () => {
  it('a kibbutz placed by hand is a stop even when nothing is DUE there that day', () => {
    const rows = routeWithHeaders(['גבת'], {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kibbutz: 'גבת', header: 'first', index: 0, count: 0, taskIds: [] });
  });
  it('…and the order he saved is the order he gets, due dates or not', () => {
    const rows = routeWithHeaders(['גבת', 'דגניה', 'חוקוק'], { דגניה: ['t1'] });
    expect(rows.map(r => r.kibbutz)).toEqual(['גבת', 'דגניה', 'חוקוק']);
    expect(rows.map(r => r.header)).toEqual(['first', 'middle', 'last']);
    expect(rows.map(r => r.count)).toEqual([0, 1, 0]);
  });
});
