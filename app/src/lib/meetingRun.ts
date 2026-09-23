// The meeting-session lifecycle: open the row, tick the clock, log what happened, close the
// row. ▶ מצב ישיבה (islands/Presenter) and the dev board's walkthrough (islands/DevPresenter)
// ran two byte-identical copies of it (task 31 audit D, F14 ①) — 57 lines in which a fix to
// the log, the timer or the "a failure is never fatal" rule would have landed in one screen
// and not the other.
//
// The rule both screens keep, and which this file is built around: **the meeting runs even if
// nothing can be written.** Every failure here is swallowed; `session` simply stays null and
// the log silently does nothing. A meeting is not interrupted by its own bookkeeping.
//
// D1 (package M): the session row is LAZY — nothing is written on mount any more, only on the
// first `start()` or `log()`. Opening מצב ישיבה on a day and immediately leaving (an accidental
// tap) used to plant a `meeting_sessions` row that `previousMeetingDate` then treated as a real
// meeting, quietly resetting every timeline window to that day. `ensureSession` memoises the
// insert behind a ref-held promise so a `start()` and a `log()` racing each other still insert
// exactly once, and `log()` awaits it so the event always lands under a real session id.
import * as React from 'react';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { eventRow, tSec, type MeetingEventKind, type MeetingSessionRow } from '@/lib/meetingSession';

export interface MeetingRun {
  /** The row, once it exists. Null while it is being written, and forever if that failed. */
  session: MeetingSessionRow | null;
  /** Seconds since the meeting started, ticking. */
  seconds: number;
  /** Whether the visible clock is ticking. Starts false: the row opens for logging, the clock does not. */
  running: boolean;
  /** Start (or resume) the visible clock. */
  start: () => void;
  /** Pause the visible clock; `seconds` freezes where it is. */
  pause: () => void;
  /** Append one event. A no-op without a session id. */
  log: (kind: MeetingEventKind, payload?: Record<string, unknown>) => Promise<void>;
  /** "סמן רגע" (M-L4): logs a `marker` at once — the moment is the tap, not a later save — and
   *  hands back the new event's id (for `noteMark`) and its clock offset (for `momentLine`). */
  mark: (kibbutz: string | null) => Promise<{ id: string; t_sec: number }>;
  /** Attach an optional one-line note to a marker after the fact (the "סמן רגע" sheet's save). */
  noteMark: (id: string, note: string) => Promise<void>;
  /** Stamp `ended_at`. Safe to call with no session. */
  endSession: () => Promise<void>;
}

/** Collapse newlines (and any run of whitespace) to a single space and cut at 120 — a moment's
 *  note stays one short line. */
function clampNote(note: string): string {
  return String(note || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * @param kind  'dev' for the board walkthrough, the meeting's own kind otherwise
 * @param host  who is running it
 * @param today the meeting's date (the caller already has it, and its own idea of "today")
 */
export function useMeetingRun(kind: string, host: string | null, today: string): MeetingRun {
  const [session, setSession] = React.useState<MeetingSessionRow | null>(null);
  const [seconds, setSeconds] = React.useState(0);
  // The clock is separate from the session: the row opens lazily, on the first start()/log()
  // (D1), but the visible stopwatch only ticks once the person presses start, and freezes on
  // pause. `runningSinceRef` holds the wall-clock moment the current run started; `baseRef`
  // holds seconds already accumulated before that.
  const [running, setRunning] = React.useState(false);
  const runningSinceRef = React.useRef<Date | null>(null);
  const baseRef = React.useRef(0);
  const sessionPromiseRef = React.useRef<Promise<MeetingSessionRow> | null>(null);

  /** Insert the session row on first use, memoised so a racing start()+log() insert once. */
  const ensureSession = React.useCallback((): Promise<MeetingSessionRow> => {
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    const row = { date: today, kind, host: host || null, started_at: new Date().toISOString() } as MeetingSessionRow;
    const p = (async () => {
      try {
        const sb = await getSupabase();
        const saved = await sbWrite(() =>
          sb.from('meeting_sessions').insert(row).select('id,date,kind,started_at').single());
        const result = (saved as unknown as MeetingSessionRow) || row;
        setSession(result);
        return result;
      } catch {
        setSession(row);
        return row;
      }
    })();
    sessionPromiseRef.current = p;
    return p;
  }, [kind, host, today]);

  React.useEffect(() => {
    if (!running) return;
    const tick = () => {
      const since = runningSinceRef.current;
      setSeconds(baseRef.current + (since ? tSec(since.toISOString(), new Date()) : 0));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const start = React.useCallback(() => {
    void ensureSession();
    if (runningSinceRef.current) return; // already running
    runningSinceRef.current = new Date();
    setRunning(true);
  }, [ensureSession]);

  const pause = React.useCallback(() => {
    const since = runningSinceRef.current;
    if (since) baseRef.current += tSec(since.toISOString(), new Date());
    runningSinceRef.current = null;
    setRunning(false);
  }, []);

  const log = React.useCallback(async (k: MeetingEventKind, payload: Record<string, unknown> = {}) => {
    const s = await ensureSession();
    if (!s?.id) return;
    const row = eventRow(s.id, s.started_at, k, payload, new Date());
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_events').insert(row).select('id').single());
    } catch { /* the meeting matters more than its log */ }
  }, [ensureSession]);

  const mark = React.useCallback(async (kibbutz: string | null): Promise<{ id: string; t_sec: number }> => {
    const s = await ensureSession();
    const row = eventRow(s.id || '', s.started_at, 'marker', { kibbutz: kibbutz || undefined }, new Date());
    try {
      const sb = await getSupabase();
      const saved = await sbWrite(() => sb.from('meeting_events').insert(row).select('id').single());
      const id = (saved as { id?: string } | null)?.id || '';
      return { id, t_sec: row.t_sec };
    } catch {
      return { id: '', t_sec: row.t_sec };
    }
  }, [ensureSession]);

  const noteMark = React.useCallback(async (id: string, note: string): Promise<void> => {
    if (!id) return;
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_events').update({ hint: clampNote(note) }).eq('id', id).select('id').single());
    } catch { /* the meeting matters more than its log */ }
  }, []);

  const endSession = React.useCallback(async () => {
    if (!session?.id) return;
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_sessions')
        .update({ ended_at: new Date().toISOString() }).eq('id', session.id!).select('id').single());
    } catch { /* the screen closes either way */ }
  }, [session]);

  return { session, seconds, running, start, pause, log, mark, noteMark, endSession };
}

// ───────────────────────── since the previous meeting ─────────────────────────

/** A task shape common to EMS and internal tasks, reduced to what "since last meeting" needs. */
export interface SinceLastTask {
  id: string;
  title: string;
  /** ISO timestamp the task was opened/created. */
  openedAt: string;
  /** ISO timestamp the task was closed, or null/undefined while still open. */
  closedAt?: string | null;
}

export interface SinceLastMeeting {
  /** Opened after the previous meeting and still open. */
  openedSince: SinceLastTask[];
  /** Opened after the previous meeting and since closed. */
  closedSince: SinceLastTask[];
}

const EMPTY_SINCE_LAST: SinceLastMeeting = { openedSince: [], closedSince: [] };

/**
 * Pure split of "what happened since the previous meeting" for one kibbutz's tasks:
 * everything opened strictly after `previousMeetingDate` (an ISO date/timestamp), split into
 * still-open vs. since-closed. `null` `previousMeetingDate` (no prior session) returns nothing,
 * since there is no boundary to compare against.
 */
export function sinceLastMeeting(
  tasks: SinceLastTask[] | null | undefined,
  previousMeetingDate: string | null | undefined,
): SinceLastMeeting {
  if (!previousMeetingDate) return EMPTY_SINCE_LAST;
  const boundary = new Date(previousMeetingDate).getTime();
  if (Number.isNaN(boundary)) return EMPTY_SINCE_LAST;
  const openedSince: SinceLastTask[] = [];
  const closedSince: SinceLastTask[] = [];
  for (const t of tasks || []) {
    if (!t?.openedAt) continue;
    const opened = new Date(t.openedAt).getTime();
    if (Number.isNaN(opened) || opened <= boundary) continue;
    if (t.closedAt) closedSince.push(t);
    else openedSince.push(t);
  }
  return { openedSince, closedSince };
}
