// Goldens for the round-5 edit lock (grill round 5, binding). See app/src/lib/editLock.ts.
import { describe, expect, it } from 'vitest';
import { ROUND5_LOCK_FLOOR, editableUntil, isLocked, ymd } from './editLock';

describe('editableUntil', () => {
  it('E1 a September date locks on 10.10', () => expect(editableUntil('2026-09-05')).toBe('2026-10-10'));
  it('E2 a December date locks on 10.1 of next year', () => expect(editableUntil('2026-12-25')).toBe('2027-01-10'));
  it('E3 only the first 10 chars of an ISO instant matter', () =>
    expect(editableUntil('2026-09-30T21:59:59.999Z')).toBe('2026-10-10'));
  it('E4 a Date is read by its Asia/Jerusalem calendar day', () => expect(editableUntil(new Date(2026, 8, 1))).toBe('2026-10-10'));
});

describe('isLocked', () => {
  it('L1 August 2026 or earlier is always locked, no matter today', () => {
    expect(isLocked('2026-08-31', '2026-09-01')).toBe(true);
    expect(isLocked('2020-01-01', '2026-09-23')).toBe(true);
    expect(isLocked(ROUND5_LOCK_FLOOR, '2026-09-01')).toBe(false); // 1.9 itself is the first editable day
  });
  it('L2 a September date is open while today is on/before its 10.10 deadline', () => {
    expect(isLocked('2026-09-05', '2026-09-23')).toBe(false);
    expect(isLocked('2026-09-05', '2026-10-10')).toBe(false); // the deadline day itself is still open
  });
  it('L3 a September date locks the day after its 10.10 deadline', () =>
    expect(isLocked('2026-09-05', '2026-10-11')).toBe(true));
  it('L4 defaults today to now (smoke, not date-sensitive)', () => expect(typeof isLocked('2026-09-05')).toBe('boolean'));
  // Opus audit: "today" must be read in Asia/Jerusalem, agreeing with the SQL trigger
  // (`at time zone 'Asia/Jerusalem'`) — a runtime whose own default timezone is UTC (a server, CI)
  // must not compute a different calendar day for the hours Israel time already crossed midnight
  // but UTC has not (00:00-03:00 Israel time = the previous UTC day, in Israel Daylight Time +3).
  it('L5 the deadline crosses at Israel midnight, not UTC midnight', () => {
    // 2026-10-10T20:30:00Z = 2026-10-10T23:30 Israel (IDT, UTC+3) — still the 10th, still open.
    expect(isLocked('2026-09-05', new Date('2026-10-10T20:30:00.000Z'))).toBe(false);
    // 2026-10-10T22:30:00Z = 2026-10-11T01:30 Israel — already the 11th, locked, although the UTC
    // calendar day is still the 10th.
    expect(isLocked('2026-09-05', new Date('2026-10-10T22:30:00.000Z'))).toBe(true);
  });
});

describe('ymd', () => {
  it('Y1 strips time from an ISO string', () => expect(ymd('2026-09-10T09:00:00.000Z')).toBe('2026-09-10'));
  it('Y2 builds yyyy-mm-dd from a Date\'s Asia/Jerusalem calendar day', () => expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05'));
  it('Y3 an instant just after Israel midnight is the NEXT day even though UTC has not turned over', () =>
    expect(ymd(new Date('2026-10-10T22:30:00.000Z'))).toBe('2026-10-11'));
});
