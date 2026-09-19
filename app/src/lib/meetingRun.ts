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
    const t = window.setInterval(() => setSeconds(tSec(session?.started_at, new Date())), 1000);
    setSeconds(tSec(session?.started_at, new Date()));
    return () => window.clearInterval(t);
  }, [session?.started_at]);

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

  return { session, seconds, log, endSession };
}
