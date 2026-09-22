import { describe, expect, it } from 'vitest';
import {
  canEditHours, canSeeHours, durationMin, filterHours, fmtDuration, hoursBody, hoursPrintHtml, hoursXlsxSpec,
  monthsOf, peopleOf, totals, validateHours, type WorkSessionRow,
} from './hours';

const row = (o: Partial<WorkSessionRow> = {}): WorkSessionRow => ({
  id: 'w1', person: 'עידן', kibbutz: 'חוקוק', attendees: ['גפן'], tags: ['הדרכה'],
  started_at: '2026-09-22T08:00:00.000Z', ended_at: '2026-09-22T10:05:00.000Z', billable: false, note: null, clockify_id: 'c1', ...o,
});

describe('who', () => {
  it('the three people and the viewer see the page; only עידן and עמיחי edit', () => {
    for (const p of ['עידן', 'עמיחי', 'מתניה']) expect(canSeeHours(p, false)).toBe(true);
    expect(canSeeHours('אביאם', false)).toBe(false);
    expect(canSeeHours('צפייה', true)).toBe(true);
    expect(canEditHours('עידן', false)).toBe(true);
    expect(canEditHours('מתניה', false)).toBe(false);
    expect(canEditHours('עידן', true)).toBe(false);
  });
});

describe('duration + filters', () => {
  it('whole minutes, never negative, 0 while running', () => {
    expect(durationMin(row())).toBe(125);
    expect(fmtDuration(125)).toBe('2:05');
    expect(durationMin(row({ ended_at: null }))).toBe(0);
    expect(durationMin(row({ ended_at: '2026-09-22T07:00:00.000Z' }))).toBe(0);
  });
  it('filters by month / person / kibbutz, newest first; totals per person', () => {
    const rows = [row(), row({ id: 'w2', person: 'מתניה', started_at: '2026-08-03T08:00:00.000Z', ended_at: '2026-08-03T09:00:00.000Z' }),
      row({ id: 'w3', started_at: '2026-09-01T08:00:00.000Z', ended_at: '2026-09-01T08:30:00.000Z', kibbutz: 'גבת' })];
    expect(filterHours(rows).map(r => r.id)).toEqual(['w1', 'w3', 'w2']);
    expect(filterHours(rows, { month: '2026-09' }).map(r => r.id)).toEqual(['w1', 'w3']);
    expect(filterHours(rows, { person: 'מתניה' }).map(r => r.id)).toEqual(['w2']);
    expect(filterHours(rows, { kibbutz: 'גבת' }).map(r => r.id)).toEqual(['w3']);
    expect(monthsOf(rows)).toEqual(['2026-09', '2026-08']);
    expect(peopleOf(rows)).toEqual(['עידן', 'מתניה']);
    const t = totals(rows);
    expect(t.all).toBe(125 + 60 + 30);
    expect(t.byPerson).toEqual({ 'עידן': 155, 'מתניה': 60 });
  });
});

describe('a manual / edited row', () => {
  const draft = { person: 'עידן', kibbutz: 'חוקוק', started_at: '2026-09-22T08:00:00.000Z', ended_at: '2026-09-22T09:00:00.000Z', attendees: [], tags: ['הדרכה'], billable: true, note: 'שיחה' };
  it('validates the obvious', () => {
    expect(validateHours(draft)).toEqual([]);
    expect(validateHours({ ...draft, person: '' })).toContain('בחר עובד');
    expect(validateHours({ ...draft, ended_at: '2026-09-22T07:00:00.000Z' })).toContain('הסיום צריך להיות אחרי ההתחלה');
    expect(validateHours({ ...draft, ended_at: '2026-09-24T09:00:00.000Z' })[0]).toMatch(/24 שעות/);
  });
  it('the body mirrors the Clockify description and keeps the row shape', () => {
    expect(hoursBody(draft)).toEqual({
      person: 'עידן', kibbutz: 'חוקוק', kind: 'session', attendees: [], tags: ['הדרכה'],
      description: 'חוקוק — הדרכה · שיחה', started_at: '2026-09-22T08:00:00.000Z', ended_at: '2026-09-22T09:00:00.000Z',
      billable: true, note: 'שיחה',
    });
  });
});

describe('exports', () => {
  it('the Excel spec has the columns עידן asked for and one band per person', () => {
    const spec = hoursXlsxSpec([row(), row({ id: 'w2', person: 'מתניה' })]);
    expect(spec.columns.map(c => c.header)).toEqual(['תאריך', 'עובד', 'קיבוץ', 'התחלה', 'סיום', 'משך (שעות)', 'תגיות', 'משתתפים', 'לחיוב', 'הערה', 'Clockify']);
    expect(spec.rows[0][5]).toBe(2.08);
    expect(spec.rows[0][10]).toBe('נשלח');
    expect(spec.groupKeys).toEqual(['עידן', 'מתניה']);
  });
  it('the print page is RTL, titled, and totals the hours', () => {
    const html = hoursPrintHtml([row()], 'שעות ספטמבר');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('שעות ספטמבר');
    expect(html).toContain('סה"כ 2:05 שעות');
    expect(html).toContain('window.print()');
  });
});
