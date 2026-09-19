// ▶ ישיבת פיתוח — #sigma-dev-presenter (company-process spec §7, master spec §7d).
//
// A SEPARATE island from ▶ מצב ישיבה (Presenter.tsx), not a `mode` prop on it. The two screens
// share their shell — the timer, the counter, the key map, the session row and the event log —
// and that shell is already extracted into lib/meetingSession.ts, which is exactly what this
// file imports. What is NOT shared is everything below the header: the company meeting walks
// kibbutz ROWS and renders two state strips, a bullet history and a ✏️ sheet that writes to
// kibbutz_meeting_notes; the dev meeting walks GitHub CARDS across three board columns and
// writes to the board. Threading a `mode` prop through Presenter.tsx would have branched its
// data source, its strips, its body, its sheet and its footer — five forks in one 721-line
// file, for two screens that only agree on their frame. Two islands, one shared pure core.
//
// The board is read through the SAME github Edge Function the 💻 לוח פיתוח page uses, under the
// one shared react-query key in lib/devBoard.ts — one fetch for the walk and the prep card.
// The only write is the EXISTING "העבר לספרינט הקרוב" action; nothing here creates a ticket
// (Git Ticket System: every card is a child under a Main Fields parent).
//
// Copy rule (master spec §6): Hebrew on screen, no app mechanics explained, nothing about who
// else can see what.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser } from '@/bridge';
import { DEV_BOARD_QUERY_KEY, fetchDevBoard, moveToSprint } from '@/lib/devBoard';
import {
  canRunDevMeeting, devPrep, parseTitle, stageOf, STAGE_LABEL,
  type DevCard, type DevComment, type DevPrep,
} from '@/lib/sprintPrep';
import {
  clockText, eventRow, nextIndex, tSec,
  type MeetingEventKind, type MeetingSessionRow,
} from '@/lib/meetingSession';

export const DEV_PRESENTER_OPEN_EVENT = 'sigma-open-dev-presenter';

/** Cold-open flag, consumed synchronously inside the island's first render. */
let pendingOpen = false;

/** Open ▶ ישיבת פיתוח from anywhere (⋯ עוד, a deep link). No-op before the island mounts. */
export function openDevPresenter(): void {
  pendingOpen = true;   // cleared by the listener, or drained by the island's first effect
  try { window.dispatchEvent(new CustomEvent(DEV_PRESENTER_OPEN_EVENT)); } catch { /* no DOM */ }
}

const ymd = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Which kibbutzim are red right now, read NULL-SAFELY through the bridge (Task 28 publishes
 * `sigma.healthBands`). No health island on the page → no list → `rankCard` simply adds no
 * bonus. This screen has no import of that task and no dependency on it.
 */
function useRedKibbutzim(): string[] {
  return React.useMemo(() => {
    try {
      const bands = (sigma as unknown as { healthBands?: () => Record<string, string> }).healthBands?.();
      if (!bands) return [];
      return Object.keys(bands).filter(k => String(bands[k]) === 'red');
    } catch { return []; }
  }, []);
}

/** The comments the board handed us, flattened with their issue number attached. */
function commentsOf(cards: DevCard[]): DevComment[] {
  return (cards || []).flatMap(c => (c.comments || []).map(m => ({ ...m, issue_number: m.issue_number ?? c.number })));
}

// ───────────────────────────── the 📋 prep card ─────────────────────────────

function PrepList({
  testid, title, cards, empty,
}: { testid: string; title: string; cards: DevCard[]; empty: string }) {
  return (
    <section data-testid={testid} className="rounded-2xl border border-border bg-card/70 p-3">
      <h3 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">{title}</h3>
      {cards.length ? (
        <ul className="flex flex-col gap-1">
          {cards.map(c => (
            <li key={c.number} className="text-[15px] text-foreground">
              <bdi>#{c.number} · {parseTitle(c.title).desc || c.title}</bdi>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function PrepScreen({
  prep, cards, onStart,
}: { prep: DevPrep; cards: DevCard[]; onStart: () => void }) {
  const [busy, setBusy] = React.useState<number | null>(null);
  const [done, setDone] = React.useState<number[]>([]);

  async function accept(n: number) {
    if (busy !== null) return;
    setBusy(n);
    try {
      await moveToSprint([n]);
      setDone(d => (d.includes(n) ? d : [...d, n]));
      track('dev-meeting-accept');
      toast.success('הועבר לספרינט הקרוב');
    } catch (e) {
      toast.error((e as Error)?.message || 'לא הצלחתי, נסה שוב');
    } finally { setBusy(null); }
  }

  return (
    <div data-testid="dev-prep" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-extrabold text-foreground">📋 הכן ישיבת פיתוח</h2>
        <span data-testid="dev-burndown" className="text-[17px] font-extrabold text-foreground">
          <bdi>{prep.burndown.done}/{prep.burndown.total} · {prep.burndown.pct}%</bdi>
        </span>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="dev-start"
          onClick={onStart}
          className="min-h-11 rounded-xl bg-brand-grad px-5 text-[15px] font-extrabold text-white"
        >
          התחל ישיבה
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PrepList testid="dev-nospec" title="ללא אפיון" cards={prep.cardsWithoutSpec} empty="הכל מאופיין" />
        <PrepList testid="dev-blocked" title="תקוע מעל שבוע" cards={prep.blocked} empty="שום דבר לא תקוע" />
      </div>

      <section data-testid="dev-questions" className="rounded-2xl border border-border bg-card/70 p-3">
        <h3 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">שאלות פתוחות</h3>
        {prep.questions.length ? (
          <ul className="flex flex-col gap-1">
            {prep.questions.map((q, i) => (
              <li key={String(q.id ?? i)} className="text-[15px] text-foreground">
                <bdi>#{q.issue_number} · {q.body}</bdi>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted-foreground">אין שאלות פתוחות</p>
        )}
      </section>

      <section data-testid="dev-proposed" className="rounded-2xl border border-border bg-card/70 p-3">
        <h3 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">הצעה לספרינט הקרוב</h3>
        {prep.sprint.length ? (
          <ul className="flex flex-col gap-2">
            {prep.sprint.map(e => (
              <li key={e.issue_number} data-testid={'dev-proposed-' + e.issue_number} className="flex items-center gap-2">
                <span className="flex-1 text-[15px] text-foreground">
                  <bdi>#{e.issue_number} · {parseTitle(e.title).desc || e.title}</bdi>
                  <span className="ms-2 text-[13px] text-muted-foreground"><bdi>{e.parent} · {e.why}</bdi></span>
                </span>
                <button
                  type="button"
                  data-testid={'dev-accept-' + e.issue_number}
                  disabled={busy !== null || done.includes(e.issue_number)}
                  onClick={() => void accept(e.issue_number)}
                  className="min-h-9 flex-none rounded-xl border border-border px-3 text-[13px] font-extrabold text-foreground disabled:opacity-50"
                >
                  {done.includes(e.issue_number) ? 'הועבר' : 'העבר לספרינט הקרוב'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted-foreground">אין מועמדים</p>
        )}
        <p className="sr-only">{cards.length} כרטיסים</p>
      </section>
    </div>
  );
}

// ───────────────────────────── the overlay ─────────────────────────────

function DevPresenterOverlay({ onClose }: { onClose: () => void }) {
  const { name: me } = useCurrentUser();
  const today = ymd();
  const redKibbutzim = useRedKibbutzim();

  const board = useQuery({
    queryKey: DEV_BOARD_QUERY_KEY('open'),
    // with comments: the questions strip and the per-card list are built from them (Task 18)
    queryFn: () => fetchDevBoard('open', { comments: true }),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
  const cards = React.useMemo(() => board.data || [], [board.data]);

  // ONE derivation, for both the walk and the prep card (spec §7: no second data path).
  const prep = React.useMemo(
    () => devPrep(cards, { comments: commentsOf(cards), redKibbutzim, cap: 8 }),
    [cards, redKibbutzim],
  );

  const [phase, setPhase] = React.useState<'prep' | 'walk'>('prep');
  const [idx, setIdx] = React.useState(0);
  const [session, setSession] = React.useState<MeetingSessionRow | null>(null);
  const [seconds, setSeconds] = React.useState(0);
  const logged = React.useRef<string>('');

  const walk = prep.walk;
  const current = walk[Math.min(idx, Math.max(walk.length - 1, 0))] || null;

  // ── the session row ── opened once. A failure is never fatal: the meeting runs either way.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const row: MeetingSessionRow = {
        date: today, kind: 'dev', host: me || null, started_at: new Date().toISOString(),
      };
      try {
        const sb = await getSupabase();
        const saved = await sbWrite(() =>
          sb.from('meeting_sessions').insert(row).select('id,date,kind,started_at').single());
        if (alive) setSession((saved as MeetingSessionRow) || row);
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

  const log = React.useCallback(async (kind: MeetingEventKind, payload: Record<string, unknown> = {}) => {
    if (!session?.id) return;
    const row = eventRow(session.id, session.started_at, kind, payload, new Date());
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_events').insert(row).select('id').single());
    } catch { /* the meeting matters more than its log */ }
  }, [session]);

  // Every arrival at a card is a segment boundary. Keyed so StrictMode cannot log it twice.
  React.useEffect(() => {
    if (!session?.id || phase !== 'walk' || !current) return;
    const key = session.id + '|' + idx + '|' + current.number;
    if (logged.current === key) return;
    logged.current = key;
    void log('issue', { issue_number: current.number, hint: current.title });
  }, [session?.id, phase, idx, current?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Into the walk. The board is re-read FIRST, so a card accepted on the prep card is already
   * in ספרינט הקרוב when the room gets there — the accepted move is not refetched at the
   * moment it happens, because a list that reshuffles under the cursor mid-meeting is worse
   * than a list that settles once, on the way in.
   */
  const start = React.useCallback(async () => {
    try { await board.refetch(); } catch { /* the walk runs on what we already have */ }
    setPhase('walk');
    track('dev-meeting-start');
  }, [board]);

  const move = React.useCallback((dir: number) => {
    setIdx(i => nextIndex(i, walk.length, dir));
  }, [walk.length]);

  const marker = React.useCallback(() => {
    if (!current) return;
    void log('issue', { issue_number: current.number, hint: '📌' });
    track('dev-meeting-marker');
    toast.success('📌 סומן');
  }, [log, current]);

  const finish = React.useCallback(async () => {
    if (session?.id) {
      try {
        const sb = await getSupabase();
        await sbWrite(() => sb.from('meeting_sessions')
          .update({ ended_at: new Date().toISOString() }).eq('id', session.id!).select('id').single());
      } catch { /* the screen closes either way */ }
    }
    track('dev-meeting-close');
    onClose();
  }, [session, onClose]);

  // ── keys — the same map ▶ מצב ישיבה uses (Task 24), so the two screens feel like one.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { e.preventDefault(); void finish(); return; }
      if (phase !== 'walk') return;
      switch (e.key) {
        // RTL: the board runs right → left, so ← is forward and → is back.
        case 'ArrowLeft': e.preventDefault(); move(1); break;
        case 'ArrowRight': e.preventDefault(); move(-1); break;
        case 'j': case 'J': case 'י': e.preventDefault(); move(1); break;
        case 'k': case 'K': case 'ל': e.preventDefault(); move(-1); break;
        case ' ': e.preventDefault(); marker(); break;   // 📌 — the screen does not move
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, move, marker, finish]);

  const n = walk.length;
  const cardComments = (current?.comments || []);
  const cardQuestions = prep.questions.filter(q => Number(q.issue_number) === Number(current?.number));

  return (
    <div
      data-testid="dev-presenter"
      role="dialog"
      aria-modal="true"
      aria-label="ישיבת פיתוח"
      dir="rtl"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background p-4 sm:p-8"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <span data-testid="dev-timer" className="text-[22px] font-extrabold tabular-nums text-foreground">
          <bdi>{clockText(seconds)}</bdi>
        </span>
        {phase === 'walk' && (
          <span data-testid="dev-counter" className="text-[15px] font-extrabold text-muted-foreground">
            <bdi>{n ? Math.min(idx + 1, n) : 0} / {n}</bdi>
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          data-testid="dev-exit"
          onClick={() => void finish()}
          aria-label="סגירה"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-4 py-5">
        {board.isLoading ? (
          <p className="text-[17px] text-muted-foreground">טוען את הלוח…</p>
        ) : board.isError ? (
          <p data-testid="dev-error" className="text-[17px] text-muted-foreground">
            <bdi>{(board.error as Error)?.message || 'לא הצלחתי לטעון את הלוח'}</bdi>
          </p>
        ) : phase === 'prep' ? (
          <PrepScreen prep={prep} cards={cards} onStart={() => void start()} />
        ) : !current ? (
          <p data-testid="dev-empty" className="text-[17px] text-muted-foreground">אין כרטיסים להצגה</p>
        ) : (
          <>
            <div data-testid="dev-column" className="text-[13px] font-extrabold text-muted-foreground">
              {STAGE_LABEL[stageOf(current)]}
            </div>
            <h1 data-testid="dev-card-title" className="text-[28px] font-extrabold leading-tight text-foreground sm:text-[40px]">
              <bdi>{current.title}</bdi>
            </h1>

            <section data-testid="dev-card-body" className="rounded-2xl border border-border bg-card/70 p-3">
              <p className="whitespace-pre-wrap text-[17px] leading-snug text-foreground">
                <bdi>{String(current.body || '').trim() || 'אין תיאור'}</bdi>
              </p>
            </section>

            <section data-testid="dev-card-comments" className="rounded-2xl border border-border bg-card/70 p-3">
              <h2 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">הערות</h2>
              {cardComments.length ? (
                <ul className="flex flex-col gap-1">
                  {cardComments.map((m, i) => (
                    <li key={String(m.id ?? i)} className="text-[15px] text-foreground">
                      <bdi>{m.author ? m.author + ': ' : ''}{m.body}</bdi>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-muted-foreground">אין הערות</p>
              )}
            </section>

            <section data-testid="dev-card-questions" className="rounded-2xl border border-border bg-card/70 p-3">
              <h2 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">שאלות פתוחות</h2>
              {cardQuestions.length ? (
                <ul className="flex flex-col gap-1">
                  {cardQuestions.map((q, i) => (
                    <li key={String(q.id ?? i)} className="text-[15px] text-foreground"><bdi>{q.body}</bdi></li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-muted-foreground">אין שאלות פתוחות</p>
              )}
            </section>
          </>
        )}
      </main>

      {phase === 'walk' && (
        <footer className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background pt-3">
          <button
            type="button"
            data-testid="dev-prev"
            onClick={() => move(-1)}
            aria-label="הקודם"
            className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-foreground"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="dev-marker"
            onClick={marker}
            className="inline-flex min-h-11 flex-none items-center gap-1 rounded-xl border border-border px-3 text-[13px] font-extrabold text-foreground"
          >
            <MapPin size={16} aria-hidden /> סמן רגע
          </button>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="dev-next"
            onClick={() => move(1)}
            aria-label="הבא"
            className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-foreground"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
        </footer>
      )}
    </div>
  );
}

// ───────────────────────────── the island ─────────────────────────────

function DevPresenterIsland() {
  const [open, setOpen] = React.useState(() => {
    if (pendingOpen) { pendingOpen = false; return true; }
    return false;
  });
  const { name: user, isViewer } = useCurrentUser();

  React.useEffect(() => {
  // The window event is only half the wiring. `mount()` returns synchronously, but THIS effect
  // runs after React has committed — so an open dispatched in that gap (the ⋯ row tapped the
  // instant the chunk lands, or a Playwright spec that dispatches right after boot) reaches an
  // island that is not listening yet and is lost: the sheet silently never opens. `openX()`
  // therefore raises `pendingOpen` as well as dispatching, and the effect drains it on attach.
  // That is the real cause of the daylog.spec.ts timeout flake filed to Task 18 — a race, not
  // a slow machine, which is why the fix is a drain and not a longer timeout.
    const on = () => { pendingOpen = false; setOpen(true); track('dev-meeting-open'); };
    if (pendingOpen) { pendingOpen = false; setOpen(true); }
    window.addEventListener(DEV_PRESENTER_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(DEV_PRESENTER_OPEN_EVENT, on as EventListener);
  }, []);

  if (!open) return null;
  if (!canRunDevMeeting(user, { isAdmin: isAdminNow(user), isViewer })) return null;
  return <DevPresenterOverlay onClose={() => setOpen(false)} />;
}

/**
 * "admin" = the bridge's `canManageStaff()` (js/src/00-bridge.js) — עידן + עמיחי — asked LIVE,
 * because a role read once at registration goes stale the moment someone uses changeUser().
 *
 * The literal list is a FALLBACK for the one case the bridge cannot answer: the legacy bundle
 * has not finished evaluating yet. It is therefore a second copy of a permission rule, which
 * is how gates drift apart — so test-integration.mjs pins it against `canManageStaff`'s own
 * definition and fails the build if either side gains or loses a name. Change one, change both.
 */
function isAdminNow(user?: string): boolean {
  try {
    if (sigma.isAdmin?.()) return true;
  } catch { /* legacy not up */ }
  return user === 'עידן' || user === 'עמיחי';
}

export function DevPresenter() {
  return <SigmaProviders><DevPresenterIsland /></SigmaProviders>;
}

export function mountDevPresenter(opts?: { open?: boolean }): boolean {
  if (opts?.open) pendingOpen = true;
  const ok = mount('sigma-dev-presenter', DevPresenter);
  if (!ok) return false;
  (window as any).sigmaOpenDevPresenter = openDevPresenter;
  registerMoreItem({
    id: 'dev-presenter',
    label: 'ישיבת פיתוח',
    icon: 'GitPullRequest',
    group: 'admin',
    visible: () => {
      try {
        const me = sigma.getCurrentUser?.() || '';
        return canRunDevMeeting(me, { isAdmin: isAdminNow(me), isViewer: !!sigma.isViewer?.() });
      } catch { return false; }
    },
    onSelect: openDevPresenter,
  });
  return true;
}
