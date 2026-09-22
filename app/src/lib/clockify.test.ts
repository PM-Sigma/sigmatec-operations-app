// @vitest-environment jsdom
// Goldens for the ▶/■ hours rules (Task 29). Everything the timer decides is in clockify.ts
// and is pure over plain values, so the component can stay a rendering shell: who may track,
// how long a session has been running (across a reload and across midnight), what exactly is
// sent to Clockify, and what the tag cache does when the API blinks.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTO_STOP_MS, autoStop, autoStopDue, canTrackTime, elapsed, elapsedFor, endedAtFor, entryPayload, formatElapsed, loadRunning, pauseSession, projectIdFor, resumeSession, saveRunning, tagsMatching,
  clearRunning, startBlockedBy, tagIdsFor, tagsCached, TAGS_KEY, RUNNING_KEY,
  israelHHMM, timerNudgeFor, timerStaleSelect, type TimerRow,
} from './clockify';

const TAGS = [
  { id: 't1', name: 'הדרכה על המערכת' },
  { id: 't2', name: 'טיפול בתקלות' },
  { id: 't3', name: 'הקמת מונים' },
];
const PROJECTS = [
  { id: 'p1', name: 'חוקוק', billable: true },
  { id: 'p2', name: 'אור הנר', billable: true },
];

beforeEach(() => { localStorage.clear(); });

describe('canTrackTime — the role matrix (spec §8b: עידן + מתניה, nobody else)', () => {
  it.each([
    ['עידן', false, true],
    ['מתניה', false, true],
    ['אביאם', false, false],
    ['עמיחי', false, false],
    ['ניתאי', false, false],
    ['אליה', false, false],
    ['', false, false],
    ['עידן', true, false],     // a viewer is never a tracker, whatever the name says
    ['מתניה', true, false],
  ])('%s (viewer=%s) → %s', (user, isViewer, expected) => {
    expect(canTrackTime(user as string, isViewer as boolean)).toBe(expected);
  });

  it('trims the stored name (one stray space must not hide the button)', () => {
    expect(canTrackTime(' עידן ', false)).toBe(true);
  });
});

describe('elapsed', () => {
  it('counts seconds from the stored start — a reload keeps the clock running', () => {
    const started = '2026-09-19T08:00:00.000Z';
    expect(elapsed(started, Date.parse('2026-09-19T08:00:30.000Z'))).toBe(30);
    // the "reload": the component remounts with nothing but `started_at` from storage
    expect(elapsed(started, Date.parse('2026-09-19T09:42:07.000Z'))).toBe(6127);
  });

  it('crosses midnight without resetting or going negative', () => {
    const started = '2026-09-19T22:30:00.000Z';
    expect(elapsed(started, Date.parse('2026-09-20T01:00:00.000Z'))).toBe(9000);
  });

  it('a clock that went backwards reads 0, never a negative timer', () => {
    expect(elapsed('2026-09-19T10:00:00.000Z', Date.parse('2026-09-19T09:00:00.000Z'))).toBe(0);
  });

  it('formats hours:minutes:seconds, hours uncapped past a day', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(59)).toBe('00:59');
    expect(formatElapsed(6127)).toBe('01:42:07');
    expect(formatElapsed(90000)).toBe('25:00:00');
  });
});

describe('entryPayload — the golden Clockify entry', () => {
  const base = {
    person: 'עידן',
    kibbutz: 'חוקוק',
    started_at: '2026-09-19T08:00:00.000Z',
    ended_at: '2026-09-19T09:00:00.000Z',
    tags: ['הדרכה על המערכת', 'טיפול בתקלות'],
    attendees: ['גפן'],
    billable: false,
    note: '',
  };

  it('description is "<kibbutz> — <tags, ", ">", ISO stamps, project resolved', () => {
    const p = entryPayload(base, { projects: PROJECTS, tags: TAGS });
    expect(p.description).toBe('חוקוק — הדרכה על המערכת, טיפול בתקלות');
    expect(p.start).toBe('2026-09-19T08:00:00.000Z');
    expect(p.end).toBe('2026-09-19T09:00:00.000Z');
    expect(p.projectId).toBe('p1');
    expect(p.tagIds).toEqual(['t1', 't2']);
    expect(p.billable).toBe(false);
  });

  it('NO tags → the kibbutz alone, with no dangling " — "', () => {
    const p = entryPayload({ ...base, tags: [] }, { projects: PROJECTS, tags: TAGS });
    expect(p.description).toBe('חוקוק');
    expect(p.description).not.toContain('—');
    expect(p.tagIds).toEqual([]);
  });

  it('billable is carried through when it is turned on', () => {
    expect(entryPayload({ ...base, billable: true }, { projects: PROJECTS, tags: TAGS }).billable).toBe(true);
  });

  it('an unmatched kibbutz → no project, and the name stays in the description', () => {
    const p = entryPayload({ ...base, kibbutz: 'גבת' }, { projects: PROJECTS, tags: TAGS });
    expect(p.projectId).toBeNull();
    expect(p.description).toBe('גבת — הדרכה על המערכת, טיפול בתקלות');
  });

  it('a tag the workspace does not know is dropped from tagIds but kept in the text', () => {
    const p = entryPayload({ ...base, tags: ['טיפול בתקלות', 'משהו שהומצא'] }, { projects: PROJECTS, tags: TAGS });
    expect(p.tagIds).toEqual(['t2']);
    expect(p.description).toBe('חוקוק — טיפול בתקלות, משהו שהומצא');
  });

  it('a note is appended after the tags, never instead of them', () => {
    const p = entryPayload({ ...base, note: 'שיחה עם גפן' }, { projects: PROJECTS, tags: TAGS });
    expect(p.description).toBe('חוקוק — הדרכה על המערכת, טיפול בתקלות · שיחה עם גפן');
  });

  it('no kibbutz and no tags → an empty description, not " — "', () => {
    const p = entryPayload({ ...base, kibbutz: '', tags: [] }, { projects: PROJECTS, tags: TAGS });
    expect(p.description).toBe('');
  });
});

describe('projectIdFor / tagIdsFor', () => {
  it('matches the project by name, trimmed and case-insensitively', () => {
    expect(projectIdFor(' חוקוק ', PROJECTS)).toBe('p1');
    expect(projectIdFor('אור הנר', PROJECTS)).toBe('p2');
  });
  it('falls back to null rather than guessing a neighbouring project', () => {
    expect(projectIdFor('חוקוק עילית', PROJECTS)).toBeNull();
    expect(projectIdFor('', PROJECTS)).toBeNull();
  });
  it('tagIdsFor keeps the picked order and drops unknowns', () => {
    expect(tagIdsFor(['טיפול בתקלות', 'לא קיים', 'הקמת מונים'], TAGS)).toEqual(['t2', 't3']);
  });
});

describe('tagsCached — fake clock, stale-on-failure', () => {
  const t0 = Date.parse('2026-09-19T08:00:00.000Z');
  const min = 60_000;

  it('first call fetches and stores under the versioned key', async () => {
    let calls = 0;
    const out = await tagsCached(async () => { calls++; return TAGS; }, t0);
    expect(out).toEqual(TAGS);
    expect(calls).toBe(1);
    expect(JSON.parse(localStorage.getItem(TAGS_KEY) as string).tags).toEqual(TAGS);
  });

  it('inside the TTL it never calls the fetcher again', async () => {
    let calls = 0;
    const f = async () => { calls++; return TAGS; };
    await tagsCached(f, t0);
    await tagsCached(f, t0 + 59 * min);
    expect(calls).toBe(1);
  });

  it('past the TTL it refetches', async () => {
    let calls = 0;
    const f = async () => { calls++; return TAGS; };
    await tagsCached(f, t0);
    await tagsCached(f, t0 + 61 * min);
    expect(calls).toBe(2);
  });

  it('a failed refetch keeps the STALE list — the picker is never empty because the API blinked', async () => {
    await tagsCached(async () => TAGS, t0);
    const out = await tagsCached(async () => { throw new Error('clockify 502'); }, t0 + 120 * min);
    expect(out).toEqual(TAGS);
  });

  it('a failure with nothing cached yet returns an empty list instead of throwing', async () => {
    await expect(tagsCached(async () => { throw new Error('offline'); }, t0)).resolves.toEqual([]);
  });

  it('corrupt cache contents are ignored, not crashed on', async () => {
    localStorage.setItem(TAGS_KEY, '{not json');
    const out = await tagsCached(async () => TAGS, t0);
    expect(out).toEqual(TAGS);
  });
});

describe('the running session: persisted, one per person', () => {
  const t0 = Date.parse('2026-09-19T08:00:00.000Z');

  it('round-trips through storage, so a reload finds it still running', () => {
    saveRunning({ person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString() });
    const back = loadRunning('עידן');
    expect(back?.kibbutz).toBe('חוקוק');
    expect(elapsed(back!.started_at, t0 + 45_000)).toBe(45);
  });

  it('is per person — מתניה never sees עידן\'s running timer', () => {
    saveRunning({ person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString() });
    expect(loadRunning('מתניה')).toBeNull();
  });

  it('duplicate-start guard: a second kibbutz is blocked by the first, the same one is not', () => {
    const running = { person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString() };
    expect(startBlockedBy(running, 'אור הנר')).toBe('חוקוק');
    expect(startBlockedBy(running, 'חוקוק')).toBeNull();
    expect(startBlockedBy(null, 'אור הנר')).toBeNull();
  });

  it('clearRunning removes only that person\'s session', () => {
    saveRunning({ person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString() });
    saveRunning({ person: 'מתניה', kibbutz: 'גפן', started_at: new Date(t0).toISOString() });
    clearRunning('עידן');
    expect(loadRunning('עידן')).toBeNull();
    expect(loadRunning('מתניה')?.kibbutz).toBe('גפן');
    expect(localStorage.getItem(RUNNING_KEY)).toBeTruthy();
  });
});


describe('22.9 (E1) — pauses, the auto-stop, the tag search', () => {
  const t0 = Date.parse('2026-09-22T08:00:00.000Z');
  const base = { person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString() };
  it('a pause freezes the clock and a resume banks it', () => {
    const p = pauseSession(base, t0 + 600_000);                 // paused at 10:00 of work
    expect(elapsedFor(p, t0 + 1_800_000)).toBe(600);            // 20 minutes later: still 10:00
    const r = resumeSession(p, t0 + 1_800_000);                 // resumed after a 20-minute pause
    expect(r.paused_at).toBeUndefined();
    expect(r.paused_ms).toBe(1_200_000);
    expect(elapsedFor(r, t0 + 2_400_000)).toBe(1200);           // 40 min in, 20 worked
    expect(endedAtFor(r, t0 + 2_400_000)).toBe(new Date(t0 + 1_200_000).toISOString());   // start + 20 min WORKED
  });
  it('the auto-stop fires at 2 h of WORK, once, and never while paused', () => {
    expect(autoStopDue(base, t0 + AUTO_STOP_MS - 1000)).toBe(false);
    expect(autoStopDue(base, t0 + AUTO_STOP_MS)).toBe(true);
    const stopped = autoStop(base);
    expect(stopped.paused_at).toBe(new Date(t0 + AUTO_STOP_MS).toISOString());
    expect(autoStopDue(stopped, t0 + AUTO_STOP_MS + 60_000)).toBe(false);
    expect(elapsedFor(stopped, t0 + AUTO_STOP_MS + 3_600_000)).toBe(7200);
    const withPause = resumeSession(pauseSession(base, t0 + 600_000), t0 + 1_800_000);
    expect(autoStopDue(withPause, t0 + AUTO_STOP_MS + 1_199_000)).toBe(false);
    expect(autoStopDue(withPause, t0 + AUTO_STOP_MS + 1_200_000)).toBe(true);
  });
  it('a stored session without the new fields still reads (backwards compatible)', () => {
    saveRunning(base);
    const back = loadRunning('עידן')!;
    expect(elapsedFor(back, t0 + 45_000)).toBe(45);
    expect(autoStopDue(back, t0 + 45_000)).toBe(false);
  });
  it('tagsMatching narrows by substring, case-insensitively', () => {
    const tags = [{ id: '1', name: 'הדרכה על המערכת' }, { id: '2', name: 'טיפול בתקלות' }, { id: '3', name: 'Billing' }];
    expect(tagsMatching(tags, '').length).toBe(3);
    expect(tagsMatching(tags, 'תקל').map(t => t.id)).toEqual(['2']);
    expect(tagsMatching(tags, 'bill').map(t => t.id)).toEqual(['3']);
  });
});


// ─────────── the SERVER nudge: a ▶ clock nobody stopped (עידן 22.9) ───────────
// The in-app auto-stop above only fires while a screen is open. These are the goldens the
// `timerStale` cron runs on instead — the SAME two-hour arithmetic, over the open
// `work_sessions` rows, so a phone that stayed in a pocket still gets told.
describe('timerStaleSelect', () => {
  const t0 = Date.parse('2026-09-22T08:00:00.000Z');
  const now = t0 + AUTO_STOP_MS;
  const row = (over: Partial<TimerRow> = {}): TimerRow => ({
    id: 'ws-1', person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString(), ...over,
  });

  it('picks a clock that has run exactly two hours, and not a second earlier', () => {
    expect(timerStaleSelect([row()], now - 1000)).toEqual([]);
    expect(timerStaleSelect([row()], now)).toEqual([
      { id: 'ws-1', person: 'עידן', kibbutz: 'חוקוק', started_at: new Date(t0).toISOString() },
    ]);
  });

  it('a closed row, an already-nudged row and a paused row are all left alone', () => {
    expect(timerStaleSelect([row({ ended_at: new Date(now).toISOString() })], now)).toEqual([]);
    expect(timerStaleSelect([row({ reminded_at: new Date(now).toISOString() })], now)).toEqual([]);
    expect(timerStaleSelect([row({ paused_at: new Date(t0 + 60_000).toISOString() })], now)).toEqual([]);
  });

  it('a pause is not worked time — the two hours move with it, exactly like autoStopDue', () => {
    const paused = row({ paused_ms: 1_200_000 });               // 20 minutes banked
    expect(timerStaleSelect([paused], now)).toEqual([]);
    expect(timerStaleSelect([paused], now + 1_199_000)).toEqual([]);
    expect(timerStaleSelect([paused], now + 1_200_000)).toHaveLength(1);
    // the golden the server shares with the screen
    expect(autoStopDue({ person: 'עידן', kibbutz: 'חוקוק', started_at: paused.started_at, paused_ms: 1_200_000 }, now + 1_200_000)).toBe(true);
  });

  it('junk is skipped rather than thrown on: the cron must never 500 on one bad row', () => {
    const rows = [
      row({ id: '', person: 'עידן' }),
      row({ id: 'ws-2', person: '' }),
      row({ id: 'ws-3', started_at: 'not a date' }),
      null as any,
    ];
    expect(timerStaleSelect(rows, now)).toEqual([]);
    expect(timerStaleSelect(null as any, now)).toEqual([]);
  });

  it('the longest-running clock is nudged first, and a missing kibbutz becomes an empty string', () => {
    const older = row({ id: 'ws-old', started_at: new Date(t0 - 3_600_000).toISOString(), kibbutz: null });
    const picks = timerStaleSelect([row(), older], now);
    expect(picks.map(p => p.id)).toEqual(['ws-old', 'ws-1']);
    expect(picks[0].kibbutz).toBe('');
  });
});

describe('timerNudgeFor', () => {
  it('says which clock and since when, in Israel time', () => {
    // 05:00 UTC on a summer day = 08:00 in Israel
    const n = timerNudgeFor('חוקוק', '2026-09-22T05:00:00.000Z');
    expect(n.title).toBe('עדכן את השעון של חוקוק');
    expect(n.body).toBe('רץ מאז 08:00 — סגור אותו או המשך');
  });
  it('winter time is Israel time too (UTC+2), not a fixed offset', () => {
    expect(israelHHMM('2026-01-15T05:00:00.000Z')).toBe('07:00');
  });
  it('an unusable start or kibbutz still produces a sentence a person can act on', () => {
    const n = timerNudgeFor('', 'not a date');
    expect(n.title).toBe('עדכן את השעון של הקיבוץ');
    expect(n.body).toBe('רץ כבר שעתיים — סגור אותו או המשך');
    expect(israelHHMM('not a date')).toBe('');
  });
});
