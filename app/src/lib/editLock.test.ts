// Goldens for the round-5 edit lock (grill round 5, binding). See app/src/lib/editLock.ts.
import { describe, expect, it } from 'vitest';
import { ROUND5_LOCK_FLOOR, editableUntil, isLocked, ymd } from './editLock';

describe('editableUntil', () => {
  it('E1 a September date locks on 10.10', () => expect(editableUntil('2026-09-05')).toBe('2026-10-10'));
  it('E2 a December date locks on 10.1 of next year', () => expect(editableUntil('2026-12-25')).toBe('2027-01-10'));
  it('E3 only the first 10 chars of an ISO instant matter', () =>
    expect(editableUntil('2026-09-30T21:59:59.999Z')).toBe('2026-10-10'));
  it('E4 a Date is read by local day', () => expect(editableUntil(new Date(2026, 8, 1))).toBe('2026-10-10'));
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
});

describe('ymd', () => {
  it('Y1 strips time from an ISO string', () => expect(ymd('2026-09-10T09:00:00.000Z')).toBe('2026-09-10'));
  it('Y2 builds yyyy-mm-dd from a Date by local day', () => expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05'));
});
