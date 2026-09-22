// ▶ / ■ Clockify per kibbutz (Task 29 — spec §6 + the closed §8b ruling).
//
// The control sits on the kibbutz card and belongs to עידן and מתניה only; everyone else sees
// NOTHING (not a disabled button). ▶ starts a local session that survives a reload — the
// elapsed time is derived from `started_at` in storage, never from a counter in memory — and
// one person can only have one running session at a time.
//
// ■ opens the stop sheet: who attended (the kibbutz's `site_contacts`, addable inline exactly
// like the visit summary), which tags (the LIVE workspace vocabulary, cached an hour), an
// optional note and the billable toggle (default off). On confirm the entry goes to Clockify
// through the `clockify` edge function — the only holder of the credentials — and the
// `work_sessions` row is written.
//
// THE failure rule (spec §8b): if Clockify fails, the row is STILL written with
// `clockify_id = null`. Hours are never lost because a third-party API blinked; the entry is
// pushed on a later quiet retry. Every save ends with `work-session-saved` on the bus
// (docs/integration-map.md).
import * as React from 'react';
import { Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/bridge';
import { track } from '@/lib/track';
import {
  autoStop, autoStopDue, canTrackTime, clearRunning, elapsedFor, formatElapsed, loadRunning, saveRunning, startBlockedBy,
  type RunningSession,
} from '@/lib/clockify';

/** The bus event every saved session emits (docs/integration-map.md). */
export { WORK_SESSION_SAVED } from '@/components/home/workTimerEvents';

/** The sheets are LAZY chunks — a card that never stops a timer never loads them. */
const StopSheet = React.lazy(() => import('@/components/home/WorkTimerStopSheet'));
const EditSheet = React.lazy(() => import('@/components/home/WorkTimerEditSheet'));

/** The 2 h notice — a system notification when allowed, a toast always (עידן 22.9, E1). */
function notifyAutoStop(kibbutz: string, onOpen: () => void) {
  toast.warning('השעון של ' + kibbutz + ' נעצר אחרי שעתיים. עדכן אותו', { action: { label: 'פתח', onClick: onOpen }, duration: 20_000 });
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('עדכן את השעון של ' + kibbutz, { body: 'השעון נעצר אחרי שעתיים. פתח כדי לסגור או להמשיך.', tag: 'work-timer-' + kibbutz, dir: 'rtl', lang: 'he' });
      n.onclick = () => { try { window.focus(); } catch { /* */ } onOpen(); n.close(); };
    }
  } catch { /* no notifications here */ }
}

// ───────────────────────────── the control ─────────────────────────────

export function WorkTimer({ kibbutz }: { kibbutz: string }) {
  const { name: user, isViewer } = useCurrentUser();
  const allowed = canTrackTime(user, isViewer);

  const [running, setRunning] = React.useState<RunningSession | null>(null);
  const [nowTs, setNowTs] = React.useState(() => Date.now());
  const [sheet, setSheet] = React.useState(false);
  const [edit, setEdit] = React.useState(false);

  // The running session is read from STORAGE on mount — that is what makes a reload keep the
  // clock instead of restarting it.
  React.useEffect(() => {
    if (!allowed) return;
    setRunning(loadRunning(user));
  }, [allowed, user, kibbutz]);

  const mine = running && running.kibbutz === kibbutz ? running : null;

  // One interval, only while THIS card's timer is the running one. Every tick also asks
  // whether the 2 h auto-stop is due — a phone that came back from the background catches
  // up on the first tick, and the stop lands at exactly start + 2 h of work.
  React.useEffect(() => {
    if (!mine) return;
    const tick = () => {
      setNowTs(Date.now());
      const cur = loadRunning(user);
      if (cur && cur.kibbutz === kibbutz && autoStopDue(cur)) {
        const stopped = autoStop(cur);
        saveRunning(stopped);
        setRunning(stopped);
        track('clockify_autostop', kibbutz);
        notifyAutoStop(kibbutz, () => setEdit(true));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mine?.started_at, mine?.paused_at, kibbutz, user]);

  if (!allowed) return null;

  const start = () => {
    const current = loadRunning(user);
    const blocked = startBlockedBy(current, kibbutz);
    if (blocked) {
      // One running session per person: the second ▶ does not silently take over.
      toast.info('כבר רץ טיימר על ' + blocked + ' — עצור אותו קודם');
      return;
    }
    const s: RunningSession = { person: user, kibbutz, started_at: new Date().toISOString() };
    saveRunning(s);
    setRunning(s);
    setNowTs(Date.now());
    track('clockify_start', kibbutz);
  };

  return (
    <>
      <button
        type="button"
        data-testid={mine ? 'work-timer-stop' : 'work-timer-start'}
        title={mine ? 'עצור וסגור שעות' : 'התחל מדידת שעות'}
        onClick={e => { e.stopPropagation(); if (mine) setEdit(true); else start(); }}
        className={
          'work-timer inline-flex min-h-[32px] items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ' +
          (mine
            ? 'bg-[color:var(--sigma-warn)]/20 text-foreground'
            : 'bg-muted text-muted-foreground hover:bg-primary/10')
        }
      >
        {mine ? (mine.paused_at ? <Play className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />) : <Play className="h-3.5 w-3.5" />}
        {mine && <span data-testid="work-timer-elapsed">{formatElapsed(elapsedFor(mine, nowTs))}{mine.paused_at ? ' ⏸' : ''}</span>}
      </button>
      {mine && edit && (
        <React.Suspense fallback={null}>
        <EditSheet
          running={mine}
          onChange={s => { setRunning(s); setNowTs(Date.now()); }}
          onStop={() => { setEdit(false); setSheet(true); }}
          onDrop={() => { clearRunning(user); setRunning(null); setEdit(false); track('clockify_drop', kibbutz); toast.info('התזמון נמחק'); }}
          onClose={() => setEdit(false)}
        />
        </React.Suspense>
      )}
      {mine && sheet && (
        <React.Suspense fallback={null}>
        <StopSheet
          running={mine}
          onClose={() => setSheet(false)}
          onSaved={() => { setSheet(false); clearRunning(user); setRunning(null); }}
        />
        </React.Suspense>
      )}
    </>
  );
}

