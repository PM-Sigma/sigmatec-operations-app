import { describe, expect, it } from 'vitest';
import {
  CLOSED_CARD_SECTIONS, OPEN_CARD_SECTIONS, detailTabKey, fmtDay, lastVisitLine, lastVisitReport, latestVisitFor,
} from './kibbutzDetail';

const now = new Date(2026, 8, 22);   // 22.9.2026
const visit = { id: 'v1', kibbutz: 'חוקוק', date: '2026-09-10T09:00:00.000Z', visitor: 'אביאם' };

describe('section order (עידן, QA קיבוצים 3 + 4)', () => {
  it('closed card: EMS, internal, last visit, meetings', () => {
    expect(CLOSED_CARD_SECTIONS).toEqual(['ems', 'internal', 'lastVisit', 'meetings']);
  });
  it('open card: EMS, internal, last visit report, meetings, מצב הקיבוץ', () => {
    expect(OPEN_CARD_SECTIONS).toEqual(['ems', 'internal', 'lastVisitReport', 'meetings', 'status']);
  });
  it('legacy tab names map onto the two tabs', () => {
    expect(detailTabKey('meetings')).toBe('status');
    expect(detailTabKey('visit')).toBe('visits');
    expect(detailTabKey('visits')).toBe('visits');
    expect(detailTabKey(undefined)).toBe('status');
    expect(detailTabKey('garbage')).toBe('status');
  });
});

describe('fmtDay', () => {
  it('d.m this year, d.m.yy another year', () => {
    expect(fmtDay(new Date(2026, 8, 10), now)).toBe('10.9');
    expect(fmtDay(new Date(2025, 11, 3), now)).toBe('3.12.25');
  });
});

describe('lastVisitLine (port of test-last-visit-line.mjs, new copy: no emoji, no "!")', () => {
  it('no visit, no task → null', () => expect(lastVisitLine(null, [], now)).toBeNull());
  it('a visit → its date', () => {
    expect(lastVisitLine(visit, [], now)).toEqual({ label: 'ביקור אחרון', date: '10.9', late: false });
  });
  it('a task due in the future → still the visit', () => {
    expect(lastVisitLine(visit, [{ expectedCompletionDate: '2026-10-01', status: 'new' }], now))
      .toEqual({ label: 'ביקור אחרון', date: '10.9', late: false });
  });
  it('an overdue task with no visit after it → the due date, late', () => {
    expect(lastVisitLine(visit, [{ expectedCompletionDate: '2026-09-15', status: 'in_progress' }], now))
      .toEqual({ label: 'ביקור אחרון', date: '15.9', late: true, note: 'ללא סיכום ביקור' });
  });
  it('overdue and no visit at all → late', () => {
    expect(lastVisitLine(null, [{ expectedCompletionDate: '2026-09-15', status: 'new' }], now)?.late).toBe(true);
  });
  it('the oldest overdue due date wins', () => {
    expect(lastVisitLine(null, [
      { expectedCompletionDate: '2026-09-18', status: 'new' },
      { expectedCompletionDate: '2026-09-12', status: 'new' },
    ], now)?.date).toBe('12.9');
  });
  it('closed tasks never make it late', () => {
    for (const s of ['done', 'rejected', 'not_relevant', 'cancelled']) {
      expect(lastVisitLine(visit, [{ expectedCompletionDate: '2026-09-15', status: s }], now)?.late).toBe(false);
    }
  });
  it('due today is not late (day granularity)', () => {
    expect(lastVisitLine(visit, [{ expectedCompletionDate: '2026-09-22', status: 'new' }], now)?.late).toBe(false);
  });
  it('a visit after the due date clears it', () => {
    expect(lastVisitLine({ ...visit, date: '2026-09-20T09:00:00.000Z' },
      [{ expectedCompletionDate: '2026-09-15', status: 'new' }], now)).toEqual({ label: 'ביקור אחרון', date: '20.9', late: false });
  });
});

describe('latestVisitFor', () => {
  it('newest visit of that kibbutz only', () => {
    const rows = [
      visit,
      { ...visit, id: 'v2', date: '2026-09-18T09:00:00.000Z' },
      { ...visit, id: 'v3', kibbutz: 'יגור', date: '2026-09-21T09:00:00.000Z' },
      { ...visit, id: 'v4', date: '' },
    ];
    expect(latestVisitFor(rows, 'חוקוק')?.id).toBe('v2');
    expect(latestVisitFor(rows, 'אין כזה')).toBeNull();
  });
});

describe('lastVisitReport', () => {
  it('structured fields, workday as יום עבודה, products with qty, open items from either key', () => {
    const r = lastVisitReport({
      ...visit, visitor: 'אביאם, ניתאי', duration: 8, workday: true, contact: 'רוני',
      products: [{ name: 'מונה', qty: 2 }, 'כבל'], productsOther: 'ברגים', summary: 'הוחלף מונה', open_items: 'לבדוק תקשורת',
    }, now);
    expect(r).toEqual({
      date: '10.9', hours: 'יום עבודה', visitors: 'אביאם, ניתאי', contact: 'רוני',
      products: ['מונה ×2', 'כבל'], productsOther: 'ברגים', summary: 'הוחלף מונה', openItems: 'לבדוק תקשורת',
    });
  });
  it('hours use the formatter: 1.5 → "1.5 ש׳"', () => {
    expect(lastVisitReport({ ...visit, duration: 1.5 }, now).hours).toBe('1.5 ש׳');
  });
});
