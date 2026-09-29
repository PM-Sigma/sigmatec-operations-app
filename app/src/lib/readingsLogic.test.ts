import { describe, expect, it } from 'vitest';
import {
  addActive, badgeCount, failedSources, finishToast, historyRows, isoWeekKey, israelWeekday, latestCronPerSite,
  latestRun, metersForReason, parseActive, progressText, reasonGroups, removeActive, shouldSundayCheck,
  watchVerdict, yesterdayIL, type ReadingRun,
} from './readingsLogic';

const run = (o: Partial<ReadingRun> = {}): ReadingRun => ({
  id: 'r1', site_id: 's1', reading_date: '2026-09-28', trigger: 'cron', started_by: null,
  started_at: '2026-09-29T04:00:00Z', finished_at: null, status: 'ok', progress: {}, n_ok: 250, n_blocked: 3, n_warn: 1,
  summary: null, exceptions: null, error: null, readings_file: null, exceptions_file: null,
  ems_checked: false, ems_checked_by: null, ems_checked_at: null, uploaded: false, uploaded_by: null,
  uploaded_at: null, uploaded_source: null, seen_by: [], ...o,
});

// 2026-09-29 is a Tuesday (Israel: UTC+3 in September).
const TUE = new Date('2026-09-29T10:00:00Z');

describe('dates (Asia/Jerusalem, never the browser zone)', () => {
  it('yesterday is the picker default and max', () => {
    expect(yesterdayIL(TUE)).toBe('2026-09-28');
  });
  it('just after Israeli midnight is already the next day, though UTC is still the old one', () => {
    const d = new Date('2026-09-29T21:30:00Z');                 // 00:30 on the 30th in Israel
    expect(yesterdayIL(d)).toBe('2026-09-29');
  });
  it('month and year boundaries', () => {
    expect(yesterdayIL(new Date('2026-10-01T09:00:00Z'))).toBe('2026-09-30');
    expect(yesterdayIL(new Date('2027-01-01T09:00:00Z'))).toBe('2026-12-31');
  });
  it('weekday and ISO week in Israel', () => {
    expect(israelWeekday(new Date('2026-09-27T09:00:00Z'))).toBe(0);      // Sunday
    expect(israelWeekday(new Date('2026-09-26T21:30:00Z'))).toBe(0);      // Sat 21:30 UTC = Sunday 00:30 IL
    expect(israelWeekday(new Date('2026-09-27T21:30:00Z'))).toBe(1);      // Sun 21:30 UTC = Monday 00:30 IL
    expect(isoWeekKey(new Date('2026-09-27T09:00:00Z'))).toBe('2026-W39');
    expect(isoWeekKey(new Date('2026-09-28T09:00:00Z'))).toBe('2026-W40');
  });
});

describe('Sunday auto-check — once per ISO week', () => {
  const SUN = new Date('2026-09-27T06:00:00Z');
  const base = { now: SUN, isRoster: true, hasEmsToken: true, lastWeekKey: null as string | null };
  it('runs on Sunday for a roster user with a token', () => expect(shouldSundayCheck(base)).toBe(true));
  it('not twice in the same week', () =>
    expect(shouldSundayCheck({ ...base, lastWeekKey: isoWeekKey(SUN) })).toBe(false));
  it('runs again next Sunday', () =>
    expect(shouldSundayCheck({ ...base, now: new Date('2026-10-04T06:00:00Z'), lastWeekKey: '2026-W39' })).toBe(true));
  it('never on other days, without a token, or off the roster', () => {
    expect(shouldSundayCheck({ ...base, now: TUE })).toBe(false);
    expect(shouldSundayCheck({ ...base, hasEmsToken: false })).toBe(false);
    expect(shouldSundayCheck({ ...base, isRoster: false })).toBe(false);
  });
});

describe('progressText', () => {
  it('shows each source and, once all are done, the build step', () => {
    expect(progressText({ SpeedNet: { state: 'ok', count: 197 }, DataSense: { state: 'running' } }))
      .toBe('✓ SpeedNet 197 · ⏳ DataSense…');
    expect(progressText({ SpeedNet: { state: 'ok', count: 197 }, DataSense: { state: 'ok', count: 56 } }))
      .toBe('✓ SpeedNet 197 · ✓ DataSense 56 · בונה קבצים');
    expect(progressText({ SpeedNet: { state: 'pending' }, DataSense: { state: 'pending' } })).toBe('⏳ SpeedNet… · ⏳ DataSense…');
  });
  it('a failed source is marked and does not block the build step', () => {
    expect(progressText({ SpeedNet: { state: 'failed' }, DataSense: { state: 'ok', count: 5 } }))
      .toBe('✗ SpeedNet · ✓ DataSense 5 · בונה קבצים');
  });
  it('no progress yet', () => { expect(progressText({})).toBe('מתחיל…'); expect(progressText(null)).toBe('מתחיל…'); });
});

describe('latestRun', () => {
  it('newest ok/partial by day, ignores failed and running', () => {
    const a = run({ id: 'a', reading_date: '2026-09-27' });
    const b = run({ id: 'b', reading_date: '2026-09-28', status: 'partial' });
    const c = run({ id: 'c', reading_date: '2026-09-28', status: 'failed', started_at: '2026-09-29T08:00:00Z' });
    expect(latestRun([a, c, b])?.id).toBe('b');
    expect(latestRun([c])).toBeNull();
  });
  it('same day: the later start wins', () => {
    const a = run({ id: 'a', started_at: '2026-09-29T04:00:00Z' });
    const b = run({ id: 'b', started_at: '2026-09-29T09:00:00Z', trigger: 'manual' });
    expect(latestRun([a, b])?.id).toBe('b');
  });
});

describe('historyRows — 35 days ending yesterday, gaps included', () => {
  it('35 rows, newest first, no date skipped', () => {
    const rows = historyRows([], TUE);
    expect(rows).toHaveLength(35);
    expect(rows[0].date).toBe('2026-09-28');
    expect(rows[34].date).toBe('2026-08-25');
    expect(rows.every(r => r.kind === 'gap')).toBe(true);
  });
  it('a day with only a failed run keeps the failed run (its error shows); no run = gap', () => {
    const failed = run({ id: 'f', reading_date: '2026-09-27', status: 'failed', error: 'SpeedNet חסם את הבקשה' });
    const rows = historyRows([run({ id: 'ok' }), failed], TUE);
    expect(rows[0]).toMatchObject({ kind: 'run', run: { id: 'ok' } });
    expect(rows[1]).toMatchObject({ kind: 'run', run: { id: 'f' }, needsUpload: false });
    expect(rows[2].kind).toBe('gap');
  });
  it('the best run of a day is the newest ok/partial, even when a later run failed', () => {
    const good = run({ id: 'good', started_at: '2026-09-29T04:00:00Z' });
    const bad = run({ id: 'bad', status: 'failed', started_at: '2026-09-29T09:00:00Z', trigger: 'manual' });
    expect((historyRows([bad, good], TUE)[0] as any).run.id).toBe('good');
  });
  it('needsUpload: pulled but not marked uploaded stands out; uploaded does not', () => {
    const rows = historyRows([run({ id: 'a' }), run({ id: 'b', reading_date: '2026-09-27', uploaded: true })], TUE);
    expect((rows[0] as any).needsUpload).toBe(true);
    expect((rows[1] as any).needsUpload).toBe(false);
  });
  it('runs older than the window are ignored', () => {
    const rows = historyRows([run({ reading_date: '2026-07-01' })], TUE);
    expect(rows.every(r => r.kind === 'gap')).toBe(true);
  });
});

describe('reasons summary', () => {
  const exceptions = [
    ['SpeedNet', '1502949', '1502949', '28.09 23:00', 1234.5, 'חוסם', 'אין סה״כ'],
    ['SpeedNet', '7010384', '7010384', '28.09 23:00', 88, 'חוסם', 'אין סה״כ'],
    ['DataSense', '108324', '108324', '27.09 23:00', 5, 'אזהרה', 'קריאה ישנה'],
  ];
  it('groups come straight from summary', () => {
    expect(reasonGroups({ summary: [['חוסם', 'אין סה״כ', 2], ['אזהרה', 'קריאה ישנה', 1]] }))
      .toEqual([{ kind: 'חוסם', reason: 'אין סה״כ', count: 2 }, { kind: 'אזהרה', reason: 'קריאה ישנה', count: 1 }]);
    expect(reasonGroups({ summary: null })).toEqual([]);
  });
  it('tapping a reason lists exactly its meters', () => {
    expect(metersForReason(exceptions, { kind: 'חוסם', reason: 'אין סה״כ' })).toHaveLength(2);
    expect(metersForReason(exceptions, { kind: 'אזהרה', reason: 'קריאה ישנה' })[0][1]).toBe('108324');
    expect(metersForReason(null, { kind: 'x', reason: 'y' })).toEqual([]);
  });
  it('failedSources names the source and its Hebrew message', () => {
    expect(failedSources({ progress: { SpeedNet: { state: 'failed', error: { code: 'blocked', message: 'האתר חסם' } }, DataSense: { state: 'ok', count: 5 } } }))
      .toEqual([{ name: 'SpeedNet', message: 'האתר חסם' }]);
    expect(failedSources({ progress: { X: { state: 'failed' } } })[0].message).toBe('המקור לא זמין');
  });
});

describe('badge on ⋯ עוד', () => {
  it('a partial/failed cron run nobody has opened = 1', () => {
    expect(badgeCount([run({ status: 'partial' })], 'עידן')).toBe(1);
    expect(badgeCount([run({ status: 'failed' })], 'עידן')).toBe(1);
  });
  it('0 when ok, when it was a manual run, or when this user already saw it', () => {
    expect(badgeCount([run({ status: 'ok' })], 'עידן')).toBe(0);
    expect(badgeCount([run({ status: 'failed', trigger: 'manual' })], 'עידן')).toBe(0);
    expect(badgeCount([run({ status: 'failed', seen_by: ['עידן'] })], 'עידן')).toBe(0);
    expect(badgeCount([run({ status: 'failed', seen_by: ['עידן'] })], 'עמיחי')).toBe(1);
    expect(badgeCount([run({ status: 'running' })], 'עידן')).toBe(0);
  });
  it('the newest cron run per site decides — an older failure is superseded by a newer ok', () => {
    const old = run({ id: 'old', status: 'failed', reading_date: '2026-09-27' });
    const now = run({ id: 'now', status: 'ok', reading_date: '2026-09-28' });
    const other = run({ id: 'o', site_id: 's2', status: 'failed' });
    const latest = latestCronPerSite([old, now, other, run({ id: 'm', trigger: 'manual', reading_date: '2026-09-29', status: 'failed' })]);
    expect(latest.map(r => r.id).sort()).toEqual(['now', 'o']);
    expect(badgeCount(latest, 'עידן')).toBe(1);
  });
});

describe('watcher state', () => {
  const now = 1_000_000_000_000;
  it('parseActive survives garbage and drops stale entries', () => {
    expect(parseActive(null, now)).toEqual([]);
    expect(parseActive('{oops', now)).toEqual([]);
    expect(parseActive('{"a":1}', now)).toEqual([]);
    const fresh = { id: 'a', kibbutz: 'חולדה', manual: true, startedAt: now - 60_000 };
    const stale = { id: 'b', kibbutz: 'חולדה', manual: true, startedAt: now - 3_600_000 };
    expect(parseActive(JSON.stringify([fresh, stale, { id: 5 }]), now)).toEqual([fresh]);
  });
  it('add is idempotent by id, remove drops it', () => {
    const r = { id: 'a', kibbutz: 'חולדה', manual: true, startedAt: 1 };
    expect(addActive(addActive([], r), r)).toHaveLength(1);
    expect(removeActive([r], 'a')).toEqual([]);
  });
  it('verdicts and toast copy', () => {
    expect(watchVerdict(null)).toBe('wait');
    expect(watchVerdict({ status: 'running' })).toBe('wait');
    expect(watchVerdict({ status: 'partial' })).toBe('partial');
    expect(finishToast('ok', 'חולדה', { error: null, progress: {} })).toEqual({ text: 'הקבצים של חולדה מוכנים', error: false });
    const p = finishToast('partial', 'חולדה', { error: null, progress: { SpeedNet: { state: 'failed', error: { message: 'האתר חסם' } } } });
    expect(p.error).toBe(true);
    expect(p.text).toContain('SpeedNet');
    expect(p.text).toContain('האתר חסם');
    expect(finishToast('failed', 'חולדה', { error: 'הריצה נתקעה', progress: {} }).text).toContain('הריצה נתקעה');
  });
});
