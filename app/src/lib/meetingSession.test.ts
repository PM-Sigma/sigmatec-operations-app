// Goldens for מצב ישיבה's pure core (company-process spec §1.2 + §1.2b). Written BEFORE the
// island: every decision the presenter screen makes — what order the kibbutzim come in, what
// the clock says, where an arrow key lands, what the carry-over line reads, what row an event
// becomes and who may open the screen at all — is settled here, so Presenter.tsx stays a
// rendering shell over functions that are covered without a DOM.
import { describe, it, expect } from 'vitest';
import type { KibbutzRow } from './kibbutzim';
import type { MeetingGroup, NoteRow } from './meetingNotes';
import {
  canPresent, carryOverLine, eventRow, isRealMeeting, nextIndex, presenterOrder,
  previousMeetingDate, tSec,
} from './meetingSession';

// ───────────────────────────── fixtures ─────────────────────────────

const REGIONS = [
  'גליל וגולן', 'העמקים', 'מישור החוף והשרון', 'שפלה ומרכז', 'דרום, עוטף עזה והנגב',
];

/** 30 rows: 6 per region, the first two of each filed as a new client. */
function catalog(): KibbutzRow[] {
  const rows: KibbutzRow[] = [];
  REGIONS.forEach((region, r) => {
    for (let i = 0; i < 6; i++) {
      rows.push({
        name: `ק${r}-${String.fromCharCode(1488 + (5 - i))}`,   // ה ד ג ב א — deliberately NOT alphabetical
        region,
        section: i < 2 ? 'new' : 'active',
        energy: ['electric'],
        kind: 'kibbutz',
      });
    }
  });
  return rows;
}

const note = (over: Partial<NoteRow>): NoteRow => ({
  kibbutz: 'דפנה',
  meeting_date: '2026-09-10',
  meeting_kind: 'company',
  seq: 1,
  text: 'להשלים החלפת מונה',
  ...over,
});

// ───────────────────────────── presenterOrder ─────────────────────────────

describe('presenterOrder', () => {
  const ordered = presenterOrder(catalog());

  it('walks every live card exactly once', () => {
    expect(ordered).toHaveLength(30);
    expect(new Set(ordered.map(r => r.name)).size).toBe(30);
  });

  it('puts every 🆕 new client before every ✅ active one', () => {
    const lastNew = ordered.map(r => r.section).lastIndexOf('new');
    const firstActive = ordered.map(r => r.section).indexOf('active');
    expect(lastNew).toBe(9);           // 2 per region × 5
    expect(firstActive).toBe(10);
  });

  it('keeps the board\'s region order inside each section, north → south', () => {
    const regionsOf = (from: number, to: number) =>
      ordered.slice(from, to).map(r => r.region).filter((v, i, a) => a.indexOf(v) === i);
    expect(regionsOf(0, 10)).toEqual(REGIONS);
    expect(regionsOf(10, 30)).toEqual(REGIONS);
  });

  it('sorts alphabetically (he) inside a region, not by insertion order', () => {
    const firstRegionActive = ordered.slice(10, 14).map(r => r.name);
    expect(firstRegionActive).toEqual(['ק0-א', 'ק0-ב', 'ק0-ג', 'ק0-ד']);
  });

  it('is the SAME comparator the board uses — a sub-site follows its parent', () => {
    const rows: KibbutzRow[] = [
      { name: 'בית', region: REGIONS[0], section: 'active', kind: 'kibbutz' },
      { name: 'אלון', region: REGIONS[0], section: 'active', kind: 'kibbutz' },
      { name: 'בית — מחלבה', region: REGIONS[0], section: 'active', kind: 'subsite', parent: 'בית' },
    ];
    expect(presenterOrder(rows).map(r => r.name)).toEqual(['אלון', 'בית', 'בית — מחלבה']);
  });

  it('never presents an archived card, and survives empty / null input', () => {
    const rows = catalog();
    rows[0].archived_at = '2026-01-01';
    expect(presenterOrder(rows)).toHaveLength(29);
    expect(presenterOrder([])).toEqual([]);
    expect(presenterOrder(null)).toEqual([]);
  });
});

// ───────────────────────────── tSec ─────────────────────────────

describe('tSec', () => {
  const start = '2026-09-19T20:00:00.000Z';

  it('counts whole seconds from started_at', () => {
    expect(tSec(start, new Date('2026-09-19T20:00:00.000Z'))).toBe(0);
    expect(tSec(start, new Date('2026-09-19T20:01:30.400Z'))).toBe(90);
    expect(tSec(start, new Date('2026-09-19T21:05:09.999Z'))).toBe(3909);
  });

  it('clamps clock skew to 0 instead of logging a negative offset', () => {
    // The phone's clock is behind the server's `now()` — a real case, and a negative t_sec
    // would put the event BEFORE the recording starts and break the transcript split.
    expect(tSec(start, new Date('2026-09-19T19:59:55.000Z'))).toBe(0);
  });

  it('answers 0 for a session with no / an unparseable started_at', () => {
    expect(tSec(null, new Date(start))).toBe(0);
    expect(tSec(undefined, new Date(start))).toBe(0);
    expect(tSec('לא תאריך', new Date(start))).toBe(0);
  });
});

// ───────────────────────────── nextIndex ─────────────────────────────

describe('nextIndex', () => {
  it('moves one step in either direction', () => {
    expect(nextIndex(3, 10, 1)).toBe(4);
    expect(nextIndex(3, 10, -1)).toBe(2);
  });

  it('CLAMPS at both ends — the last kibbutz never wraps back to the first', () => {
    expect(nextIndex(9, 10, 1)).toBe(9);
    expect(nextIndex(0, 10, -1)).toBe(0);
  });

  it('is safe on an empty or not-yet-loaded list', () => {
    expect(nextIndex(0, 0, 1)).toBe(0);
    expect(nextIndex(5, 0, -1)).toBe(0);
    // An out-of-range index is normalized into the list FIRST and then stepped, in both
    // directions — so the two ends behave the same way.
    expect(nextIndex(-3, 10, 1)).toBe(1);
    expect(nextIndex(99, 10, -1)).toBe(8);
  });
});

// ───────────────────────────── carryOverLine ─────────────────────────────

describe('carryOverLine', () => {
  const today = '2026-09-19';

  const rows: NoteRow[] = [
    // the meeting happening RIGHT NOW — must be ignored
    note({ kibbutz: 'דפנה', meeting_date: today, seq: 1, text: 'נאמר היום' }),
    note({ kibbutz: 'דפנה', meeting_date: today, seq: 2, text: 'גם היום' }),
    // the most recent PREVIOUS meeting — three open, one done
    note({ kibbutz: 'דפנה', meeting_date: '2026-09-12', seq: 1 }),
    note({ kibbutz: 'דפנה', meeting_date: '2026-09-12', seq: 2 }),
    note({ kibbutz: 'דפנה', meeting_date: '2026-09-12', seq: 3 }),
    note({ kibbutz: 'דפנה', meeting_date: '2026-09-12', seq: 4, done_at: '2026-09-13T08:00:00Z' }),
    // older still — not counted, however open it is
    note({ kibbutz: 'דפנה', meeting_date: '2026-09-05', seq: 1 }),
    note({ kibbutz: 'דפנה', meeting_date: '2026-09-05', seq: 2 }),
    // another kibbutz entirely
    note({ kibbutz: 'חוקוק', meeting_date: '2026-09-12', seq: 1 }),
  ];

  it('counts only the most recent PREVIOUS meeting\'s open bullets', () => {
    expect(carryOverLine(rows, 'דפנה', today)).toBe('מהישיבה הקודמת: 3 פתוחים');
  });

  it('says it in the singular for one', () => {
    const one = [
      note({ meeting_date: today, seq: 1 }),
      note({ meeting_date: '2026-09-12', seq: 1 }),
      note({ meeting_date: '2026-09-12', seq: 2, done_at: '2026-09-13T08:00:00Z' }),
    ];
    expect(carryOverLine(one, 'דפנה', today)).toBe('מהישיבה הקודמת: פתוח אחד');
  });

  it('is null when nothing carried over — the header simply has no line', () => {
    const closed = [
      note({ meeting_date: '2026-09-12', seq: 1, done_at: '2026-09-13T08:00:00Z' }),
      note({ meeting_date: '2026-09-12', seq: 2, done_at: '2026-09-13T08:00:00Z' }),
    ];
    expect(carryOverLine(closed, 'דפנה', today)).toBeNull();
    expect(carryOverLine([], 'דפנה', today)).toBeNull();
    expect(carryOverLine(null, 'דפנה', today)).toBeNull();
  });

  it('is null for a kibbutz that has never been on an agenda', () => {
    expect(carryOverLine(rows, 'יסעור', today)).toBeNull();
  });

  it('accepts the grouped shape notesForKibbutz already returns', () => {
    const groups: MeetingGroup[] = [
      { meeting_date: today, meeting_kind: 'company', bullets: [note({ meeting_date: today })] },
      {
        meeting_date: '2026-09-12',
        meeting_kind: 'company',
        bullets: [note({ meeting_date: '2026-09-12', seq: 1 }), note({ meeting_date: '2026-09-12', seq: 2 })],
      },
    ];
    expect(carryOverLine(groups, 'דפנה', today)).toBe('מהישיבה הקודמת: 2 פתוחים');
  });

  it('with no `today` given, the newest meeting IS the previous one', () => {
    // Opening the screen on a day with no meeting row yet: there is no "current" meeting to
    // exclude, so the newest one on file is what carried over.
    expect(carryOverLine(rows, 'דפנה')).toBe('מהישיבה הקודמת: 2 פתוחים');
  });
});

// ───────────────────────────── eventRow ─────────────────────────────

describe('eventRow', () => {
  const sid = 'aaaaaaaa-0000-4000-8000-000000000001';
  const start = '2026-09-19T20:00:00.000Z';
  const now = new Date('2026-09-19T20:02:00.000Z');

  it('stamps every row with the session and the offset, never a wall clock', () => {
    const row = eventRow(sid, start, 'marker', { kibbutz: 'דפנה' }, now);
    expect(row).toEqual({ session_id: sid, t_sec: 120, kind: 'marker', kibbutz: 'דפנה' });
    expect(row).not.toHaveProperty('created_at');
  });

  it('kibbutz — the segment boundary carries the name and nothing else', () => {
    expect(eventRow(sid, start, 'kibbutz', { kibbutz: 'חוקוק' }, now))
      .toEqual({ session_id: sid, t_sec: 120, kind: 'kibbutz', kibbutz: 'חוקוק' });
  });

  it('parking — the current kibbutz becomes the HINT, not the row\'s kibbutz', () => {
    // A tangent is not about the kibbutz on screen; it only came up while it was there.
    expect(eventRow(sid, start, 'parking', { kibbutz: 'דפנה' }, now))
      .toEqual({ session_id: sid, t_sec: 120, kind: 'parking', hint: 'דפנה' });
  });

  it('note — the typed line rides in `hint`, with its kibbutz', () => {
    expect(eventRow(sid, start, 'note', { kibbutz: 'דפנה', hint: 'לבדוק את המונה הראשי' }, now))
      .toEqual({ session_id: sid, t_sec: 120, kind: 'note', kibbutz: 'דפנה', hint: 'לבדוק את המונה הראשי' });
  });

  it('general — no kibbutz at all', () => {
    expect(eventRow(sid, start, 'general', {}, now))
      .toEqual({ session_id: sid, t_sec: 120, kind: 'general' });
  });

  it('issue — a dev-meeting item keyed to its number', () => {
    expect(eventRow(sid, start, 'issue', { issue_number: 104, kibbutz: 'דפנה' }, now))
      .toEqual({ session_id: sid, t_sec: 120, kind: 'issue', issue_number: 104 });
  });

  it('drops empty strings rather than writing blank columns', () => {
    expect(eventRow(sid, start, 'note', { kibbutz: '  ', hint: '   ' }, now))
      .toEqual({ session_id: sid, t_sec: 120, kind: 'note' });
  });
});

// ───────────────────────────── canPresent ─────────────────────────────

describe('canPresent', () => {
  it('is for the admins who run the meeting', () => {
    expect(canPresent(true, false)).toBe(true);
  });

  it('is never for a viewer — not even one the app also calls an admin', () => {
    expect(canPresent(false, false)).toBe(false);
    expect(canPresent(false, true)).toBe(false);
    expect(canPresent(true, true)).toBe(false);
  });

  it('treats missing role information as "no"', () => {
    expect(canPresent(undefined as unknown as boolean, undefined as unknown as boolean)).toBe(false);
  });
});

// ───────────────────────────── isRealMeeting / previousMeetingDate (D1) ─────────────────────────────

describe('isRealMeeting', () => {
  const s = (min: number) => ({
    started_at: '2026-09-16T07:00:00Z',
    ended_at: new Date(Date.parse('2026-09-16T07:00:00Z') + min * 60e3).toISOString(),
  });

  it('10 minutes, or one note/marker/parking, or notes that day', () => {
    expect(isRealMeeting(s(3), ['kibbutz', 'kibbutz'], false)).toBe(false);
    expect(isRealMeeting(s(12), [], false)).toBe(true);
    expect(isRealMeeting(s(3), ['marker'], false)).toBe(true);
    expect(isRealMeeting({ started_at: '2026-09-16T07:00:00Z', ended_at: null }, [], true)).toBe(true);
  });

  it('a still-open session with no notes and no marker/parking is not (yet) a real meeting', () => {
    expect(isRealMeeting({ started_at: '2026-09-16T07:00:00Z', ended_at: null }, ['kibbutz'], false)).toBe(false);
  });

  it('parking alone also counts, same as a marker', () => {
    expect(isRealMeeting(s(1), ['parking'], false)).toBe(true);
  });
});

describe('previousMeetingDate', () => {
  it('an accidental open on a Tuesday does not move the window', () => {
    const sessions = [
      { id: 'a', date: '2026-09-22', kind: 'company', started_at: '2026-09-22T12:00:00Z', ended_at: '2026-09-22T12:01:00Z' },
      { id: 'b', date: '2026-09-16', kind: 'company', started_at: '2026-09-16T07:00:00Z', ended_at: '2026-09-16T08:10:00Z' },
    ] as any;
    expect(previousMeetingDate(sessions, { a: ['kibbutz'] }, new Set(), '2026-09-23', 'company')).toBe('2026-09-16');
  });

  it('today never counts; the other kind never counts', () => {
    const sessions = [
      { id: 'c', date: '2026-09-23', kind: 'company', started_at: '2026-09-23T07:00:00Z', ended_at: '2026-09-23T08:00:00Z' },
      { id: 'd', date: '2026-09-20', kind: 'dev', started_at: '2026-09-20T07:00:00Z', ended_at: '2026-09-20T08:00:00Z' },
    ] as any;
    expect(previousMeetingDate(sessions, {}, new Set(), '2026-09-23', 'company')).toBe(null);
  });

  it('a short session redeemed by notes filed that day still counts', () => {
    const sessions = [
      { id: 'e', date: '2026-09-18', kind: 'company', started_at: '2026-09-18T07:00:00Z', ended_at: '2026-09-18T07:02:00Z' },
    ] as any;
    expect(previousMeetingDate(sessions, {}, new Set(['2026-09-18']), '2026-09-23', 'company')).toBe('2026-09-18');
  });

  it('no sessions at all → null', () => {
    expect(previousMeetingDate([], {}, new Set(), '2026-09-23', 'company')).toBe(null);
  });
});
