// The meeting-session lifecycle: open the row, tick the clock, log what happened, close the
// row. ▶ מצב ישיבה (islands/Presenter) and the dev board's walkthrough (islands/DevPresenter)
// ran two byte-identical copies of it (task 31 audit D, F14 ①) — 57 lines in which a fix to
// the log, the timer or the "a failure is never fatal" rule would have landed in one screen
// and not the other.
//
// The rule both screens keep, and which this file is built around: **the meeting runs even if
// nothing can be written.** Every failure here is swallowed; `session` simply stays null and
// the log silently does nothing. A meeting is not interrupted by its own bookkeeping.
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
  /** Stamp `ended_at`. Safe to call with no session. */
  endSession: () => Promise<void>;
}

/**
 * @param kind  'dev' for the board walkthrough, the meeting's own kind otherwise
 * @param host  who is running it
 * @param today the meeting's date (the caller already has it, and its own idea of "today")
 */
export function useMeetingRun(kind: string, host: string | null, today: string): MeetingRun {
  const [session, setSession] = React.useState<MeetingSessionRow | null>(null);
  const [seconds, setSeconds] = React.useState(0);
  // The clock is separate from the session: the row opens on mount for logging (per the "the
  // meeting runs even if nothing can be written" rule), but the visible stopwatch only ticks
  // once the person presses start, and freezes on pause. `runningSinceRef` holds the wall-clock
  // moment the current run started; `baseRef` holds seconds already accumulated before that.
  const [running, setRunning] = React.useState(false);
  const runningSinceRef = React.useRef<Date | null>(null);
  const baseRef = React.useRef(0);

  // Opened once, on mount.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const row = { date: today, kind, host: host || null, started_at: new Date().toISOString() } as MeetingSessionRow;
      try {
        const sb = await getSupabase();
        const saved = await sbWrite(() =>
          sb.from('meeting_sessions').insert(row).select('id,date,kind,started_at').single());
        if (alive) setSession((saved as unknown as MeetingSessionRow) || row);
      } catch {
        if (alive) setSession(row);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (runningSinceRef.current) return; // already running
    runningSinceRef.current = new Date();
    setRunning(true);
  }, []);

  const pause = React.useCallback(() => {
    const since = runningSinceRef.current;
    if (since) baseRef.current += tSec(since.toISOString(), new Date());
    runningSinceRef.current = null;
    setRunning(false);
  }, []);

  const log = React.useCallback(async (k: MeetingEventKind, payload: Record<string, unknown> = {}) => {
    if (!session?.id) return;
    const row = eventRow(session.id, session.started_at, k, payload, new Date());
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_events').insert(row).select('id').single());
    } catch { /* the meeting matters more than its log */ }
  }, [session]);

  const endSession = React.useCallback(async () => {
    if (!session?.id) return;
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_sessions')
        .update({ ended_at: new Date().toISOString() }).eq('id', session.id!).select('id').single());
    } catch { /* the screen closes either way */ }
  }, [session]);

  return { session, seconds, running, start, pause, log, endSession };
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
