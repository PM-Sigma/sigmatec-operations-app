// מצב ישיבה — the pure core (company-process spec §1.2 + §1.2b). Almost entirely no React, no
// DOM, no network, so every decision the presenter screen makes is covered by goldens
// (meetingSession.test.ts) and the island stays a rendering shell. The one exception is
// `fetchPreviousMeetingDate` at the bottom (package M, D1): it reads `meeting_sessions` /
// `meeting_events` / `kibbutz_meeting_notes` and hands the pure `previousMeetingDate` its rows.
//
// The one rule that shapes this file: the navigation log is a TIMELINE, not a record of the
// meeting. Its rows are offsets from the session's start, because §1.3 lines them up against
// the recording to split the transcript per kibbutz. Anything that has to survive the meeting
// (a task, a decision, a bullet) is written by the ✏️ live quick-note to the tables that
// already own it — never here.
import { getSupabase } from './supabase';
import { groupBySection, sectionOf, type KibbutzRow } from './kibbutzim';
import { notesForKibbutz, type MeetingGroup, type NoteRow } from './meetingNotes';

export type MeetingEventKind = 'kibbutz' | 'marker' | 'parking' | 'general' | 'note' | 'issue';

/** A row of `meeting_sessions` (db/meeting_sessions.sql). */
export interface MeetingSessionRow {
  id?: string;
  date: string;
  kind: 'company' | 'dev';
  started_at?: string | null;
  ended_at?: string | null;
  host?: string | null;
  calendar_event_id?: string | null;
}

/** A row of `meeting_events` (db/meeting_events.sql), exactly as it goes on the wire. */
export interface MeetingEventRow {
  session_id: string;
  t_sec: number;
  kind: MeetingEventKind;
  kibbutz?: string;
  issue_number?: number;
  hint?: string;
}

export interface EventPayload {
  kibbutz?: string | null;
  issue_number?: number | null;
  hint?: string | null;
}

// ───────────────────────────── order ─────────────────────────────

/**
 * The walk order: exactly the board's own order, flattened — 🆕 new clients first, then ✅
 * active, each in region order (north → south) with the region's own alphabetical-he sort and
 * a sub-site pinned to its parent.
 *
 * `groupBySection` IS that comparator (lib/kibbutzim.ts); re-implementing it here is how the
 * meeting and the screen behind it would drift apart, so it is imported rather than copied.
 * Archived cards are dropped: nobody reviews a kibbutz that is off the board.
 */
export function presenterOrder(rows: KibbutzRow[] | null | undefined): KibbutzRow[] {
  const live = (rows || []).filter(r => r && r.name && !r.archived_at);
  const grouped = groupBySection(live);
  return [...grouped.new, ...grouped.active].flatMap(g => g.rows);
}

/** The card's own label for the counter and the event rows. */
export const isNew = (row: KibbutzRow | null | undefined): boolean => !!row && sectionOf(row) === 'new';

// ───────────────────────────── the clock ─────────────────────────────

/**
 * Seconds since the session started — a whole number, never negative.
 *
 * The clamp is not defensive noise: phones drift from the server's `now()`, and a negative
 * offset would place the event before the recording begins and mis-split the transcript.
 */
export function tSec(startedAt: string | number | Date | null | undefined, now: Date | number = Date.now()): number {
  // `new Date(null)` is the epoch, not Invalid Date — so a missing started_at would otherwise
  // report 56 years of meeting instead of 0.
  if (startedAt === null || startedAt === undefined || startedAt === '') return 0;
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt as string).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** `mm:ss` (and `h:mm:ss` past the hour) — the header's live timer. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(s / 60) % 60;
  const ss = s % 60;
  const hh = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

// ───────────────────────────── navigation ─────────────────────────────

/**
 * One step, CLAMPED. No wrap: arriving back at the first kibbutz after the last one looks
 * like the meeting restarted, and in a room full of people that is a real confusion.
 */
export function nextIndex(i: number, len: number, dir: number): number {
  const n = Math.floor(Number(len) || 0);
  if (n <= 0) return 0;
  const from = Math.min(Math.max(Math.floor(Number(i) || 0), 0), n - 1);
  const step = Number(dir) > 0 ? 1 : -1;
  return Math.min(Math.max(from + step, 0), n - 1);
}

// ───────────────────────────── carry-over ─────────────────────────────

const isGroups = (v: unknown): v is MeetingGroup[] =>
  Array.isArray(v) && v.length > 0 && Array.isArray((v[0] as MeetingGroup)?.bullets);

/**
 * `'מהישיבה הקודמת: 3 פתוחים'` — what was left open the LAST time this kibbutz was reviewed,
 * or `null` when nothing was (the header then simply has no line; "0 פתוחים" would be noise).
 *
 * `today` is the meeting being held right now: its own bullets are excluded, because a line
 * written twenty seconds ago is not something that carried over. Omit it (there is no row for
 * today yet) and the newest meeting on file is the previous one.
 *
 * Takes either raw note rows or the grouped shape `notesForKibbutz` already returns, so the
 * island can hand over whichever it is holding.
 */
export function carryOverLine(
  rows: NoteRow[] | MeetingGroup[] | null | undefined,
  kibbutz: string,
  today?: string,
): string | null {
  const groups: MeetingGroup[] = isGroups(rows)
    ? (rows as MeetingGroup[]).filter(g => !!g)
    : notesForKibbutz((rows || []) as NoteRow[], kibbutz);
  // notesForKibbutz already sorts newest-first; a caller-supplied list may not.
  const sorted = groups.slice().sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : a.meeting_date > b.meeting_date ? -1 : 0));
  const previous = sorted.find(g => !today || String(g.meeting_date) < String(today));
  if (!previous) return null;
  const open = (previous.bullets || []).filter(b => b && !b.done_at).length;
  if (!open) return null;
  return open === 1 ? 'מהישיבה הקודמת: פתוח אחד' : `מהישיבה הקודמת: ${open} פתוחים`;
}

// ───────────────────────────── events ─────────────────────────────

const clean = (v: unknown): string => String(v ?? '').trim();

/**
 * One navigation-log row, ready to insert. Pure, so the wire shape is pinned by a golden
 * instead of by whatever the island happened to send.
 *
 * Per kind, only the columns that MEAN something for it are written:
 *   · `parking` puts the kibbutz that was on screen in `hint`, not in `kibbutz` — a tangent is
 *     not about that kibbutz, it only came up while it was there (§1.2);
 *   · `note` carries the typed line in `hint`;
 *   · `general` and `issue` have no kibbutz at all.
 */
export function eventRow(
  sessionId: string,
  startedAt: string | number | Date | null | undefined,
  kind: MeetingEventKind,
  payload: EventPayload = {},
  now: Date | number = Date.now(),
): MeetingEventRow {
  const row: MeetingEventRow = { session_id: sessionId, t_sec: tSec(startedAt, now), kind };
  const kib = clean(payload.kibbutz);
  const hint = clean(payload.hint);

  if (kind === 'parking') {
    if (kib || hint) row.hint = hint || kib;
    return row;
  }
  if (kind === 'issue') {
    const n = Number(payload.issue_number);
    if (Number.isFinite(n)) row.issue_number = Math.floor(n);
    if (hint) row.hint = hint;
    return row;
  }
  if (kind === 'general') {
    if (hint) row.hint = hint;
    return row;
  }
  if (kib) row.kibbutz = kib;
  if (hint) row.hint = hint;
  return row;
}

/** `'12:04 · גבים · לבדוק שוב'` — the clock, the kibbutz when present, the note when present. */
export function momentLine(e: MeetingEventRow): string {
  return [clockText(e.t_sec), e.kibbutz, e.hint].filter(Boolean).join(' · ');
}

// ───────────────────────────── roles ─────────────────────────────

/**
 * Who may open מצב ישיבה: the admins who actually run the meeting (עידן, עמיחי). A viewer
 * never can — the screen writes to the meeting log, and a read-only account has nothing to
 * write with.
 */
export function canPresent(isAdmin: boolean, isViewer: boolean): boolean {
  return !!isAdmin && !isViewer;
}

// ───────────────────────────── the ✏️ chips ─────────────────────────────

export type LiveChipId = 'ems' | 'internal' | 'note' | 'decision' | 'idea';

export interface LiveChip {
  id: LiveChipId;
  label: string;
}

/** The classification chips, in the order §1.2b lists them. */
export const LIVE_CHIPS: LiveChip[] = [
  { id: 'ems', label: '📋 משימת EMS' },
  { id: 'internal', label: '🔒 פנימי' },
  { id: 'note', label: '📝 הערה' },
  { id: 'decision', label: '🧭 הכרעה' },
  { id: 'idea', label: '💡 רעיון' },
];

/**
 * The chips this build can actually honour. 🔒 פנימי is offered only where an internal-task
 * WRITE path exists — Task 26 ships that screen; until then the table is read-only in the
 * client, and a chip that silently does nothing during a meeting is worse than no chip.
 */
export function liveChips(caps: { internalTasks?: boolean } = {}): LiveChip[] {
  return LIVE_CHIPS.filter(c => c.id !== 'internal' || !!caps.internalTasks);
}

// ───────────────────────────── D1: a real previous meeting ─────────────────────────────

/**
 * A session counts as an actual meeting — not an accidental tap that opened and closed the
 * screen — when it ran at least 10 minutes, or logged at least one 🔖 marker / 🅿️ parking
 * event, or has meeting notes filed under its date. A still-running session (`ended_at` null)
 * only counts via the marker/parking/notes routes; there is no duration yet to judge by.
 */
export function isRealMeeting(
  s: { started_at: string; ended_at: string | null },
  eventKinds: string[],
  hasNotesThatDay: boolean,
): boolean {
  if (hasNotesThatDay) return true;
  if ((eventKinds || []).some(k => k === 'marker' || k === 'parking')) return true;
  if (!s.ended_at) return false;
  const minutes = (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000;
  return minutes >= 10;
}

/**
 * The most recent REAL previous session's date, or `null` when there is none — the boundary
 * `windowStartFor` (meetingTimeline.ts) builds the timeline window from. `sessions` is already
 * narrowed to `date < today`; this only applies the kind filter and the `isRealMeeting` rule,
 * so a Tuesday accidental open (D1) never becomes "the previous meeting".
 */
export function previousMeetingDate(
  sessions: MeetingSessionRow[] | null | undefined,
  eventsBySession: Record<string, string[]>,
  noteDates: Set<string>,
  today: string,
  kind: 'company' | 'dev',
): string | null {
  const real = (sessions || [])
    .filter(s => s.kind === kind && s.date < today)
    .filter(s => isRealMeeting(
      { started_at: s.started_at || '', ended_at: s.ended_at ?? null },
      eventsBySession[s.id || ''] || [],
      noteDates.has(s.date),
    ))
    .map(s => s.date)
    .sort();
  return real.length ? real[real.length - 1] : null;
}

/**
 * The live read behind `previousMeetingDate`: the last 20 sessions of `kind` before `today`,
 * their events (for the marker/parking check) and the meeting-note dates in that same range
 * (for the notes-filed-that-day check). Never throws — no previous meeting is a safe default,
 * same as every other read in this file's "the meeting matters more than its bookkeeping" rule.
 */
export async function fetchPreviousMeetingDate(kind: 'company' | 'dev', today: string): Promise<string | null> {
  try {
    const sb = await getSupabase();
    const { data: sessionsData, error } = await sb.from('meeting_sessions')
      .select('id,date,kind,started_at,ended_at')
      .eq('kind', kind).lt('date', today).order('date', { ascending: false }).limit(20);
    if (error) throw error;
    const sessions = (sessionsData || []) as MeetingSessionRow[];
    if (!sessions.length) return null;

    const ids = sessions.map(s => s.id).filter(Boolean) as string[];
    const eventsBySession: Record<string, string[]> = {};
    if (ids.length) {
      const { data: events } = await sb.from('meeting_events').select('session_id,kind').in('session_id', ids);
      for (const e of (events || []) as Array<{ session_id: string; kind: string }>) {
        (eventsBySession[e.session_id] ||= []).push(e.kind);
      }
    }

    const oldest = sessions[sessions.length - 1].date;
    const { data: notes } = await sb.from('kibbutz_meeting_notes')
      .select('meeting_date').gte('meeting_date', oldest).lt('meeting_date', today);
    const noteDates = new Set(((notes || []) as Array<{ meeting_date: string }>).map(n => n.meeting_date));

    return previousMeetingDate(sessions, eventsBySession, noteDates, today, kind);
  } catch { return null; }
}
