// ▶ ישיבת פיתוח — #sigma-dev-presenter (company-process spec §7, master spec §7d, D-U2).
//
// A SEPARATE island from ▶ מצב ישיבה (Presenter.tsx), not a `mode` prop on it. The two screens
// share their shell — the timer, the counter, the key map, the session row and the event log —
// and that shell is already extracted into lib/meetingSession.ts, which is exactly what this
// file imports. What is NOT shared is everything below the header: the company meeting walks
// kibbutz ROWS and renders two state strips, a bullet history and a ✏️ sheet that writes to
// kibbutz_meeting_notes; the dev meeting walks GitHub CARDS grouped by domain → priority
// (lib/devMeeting.ts, D-L2) and marks them locally (lib/devMarks.ts, D-L3).
//
// D-U2: the walk is grouped by domain (parent issue) instead of by board column, "חדש השבוע"
// is its own screen, and the per-card action is a LOCAL mark — sprint / clarify / defer — that
// never reaches GitHub. The prep card's per-row accept is the SAME local mark ("לספרינט"), not
// `moveToSprint`: nothing in this file writes to the board any more. The one still-real write
// (the person actually drags a card to the sprint) happens on 💻 לוח פיתוח, not here.
//
// Copy rule (master spec §6): Hebrew on screen, no app mechanics explained, nothing about who
// else can see what.
import * as React from 'react';
import { useMeetingRun } from '@/lib/meetingRun';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Copy, MapPin, Pause, Play, SlidersHorizontal, X } from 'lucide-react';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { FilterChip } from '@/components/ui/chip';
import { sigma, useCurrentUser } from '@/bridge';
import { DEV_BOARD_QUERY_KEY, fetchDevBoard } from '@/lib/devBoard';
import {
  canRunDevMeeting, devPrep, parseTitle, stageOf, STAGE_LABEL,
  type DevCard, type DevComment, type DevPrep,
} from '@/lib/sprintPrep';
import {
  applyDevFilters, groupByDomain, newThisWeek, priorityTier, PRIO_LABEL, type DevFilters, type DomainGroup,
} from '@/lib/devMeeting';
import {
  loadMarks, marksSummary, marksText, pruneOldMarks, setMark, MARK_LABEL,
  type DevMark, type MarkEntry,
} from '@/lib/devMarks';
import { clockText, nextIndex } from '@/lib/meetingSession';
import { FiltersSheet, activeFilterCount } from '@/islands/dev/FiltersSheet';

export const DEV_PRESENTER_OPEN_EVENT = 'sigma-open-dev-presenter';

/** Cold-open flag, consumed synchronously inside the island's first render. */
let pendingOpen = false;

// ─────────────────────── the open latch (the REAL daylog.spec flake) ───────────────────────
// `mount()` calls `createRoot(...).render(...)`, which SCHEDULES a render — main.tsx flips its
// `mounted` flag the instant that returns, but the component's own window listener only exists
// after React commits, one tick later. An open event dispatched in that gap therefore reached
// nobody: main.tsx saw `mounted === true` and stood down, and the island was not listening yet.
// That is the daylog.spec.ts timeout that was filed to Task 18 as a flake, and it is a real user
// bug — tapping ⋯ → יומן היום at the moment the chunk lands did nothing. (`openDayLog()` alone
// could not cover it: the ⋯ row and the specs dispatch the raw event.)
//
// This listener is attached when the CHUNK evaluates — strictly before the first render — and
// only raises the flag. The component's own handler is registered later, so on a warm open it
// runs after this one and clears the flag again.
try { window.addEventListener(DEV_PRESENTER_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

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

/** The walk, flattened out of `groupByDomain` in order (domain → tier → board order). */
function flattenWalk(groups: DomainGroup[]): DevCard[] {
  return groups.flatMap(g => g.tiers.flatMap(t => t.cards));
}

/** Index of `card.number` inside its domain group, for the ←/→ "jump to next domain" step. */
function domainStarts(groups: DomainGroup[]): number[] {
  const starts: number[] = [];
  let i = 0;
  for (const g of groups) {
    const n = g.tiers.reduce((s, t) => s + t.cards.length, 0);
    if (n > 0) starts.push(i);
    i += n;
  }
  return starts;
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
  prep, cards, marks, onMark, onStart,
}: {
  prep: DevPrep; cards: DevCard[]; marks: Record<number, MarkEntry>;
  onMark: (number: number, mark: DevMark) => void; onStart: () => void;
}) {
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
          className="min-h-11 rounded-xl s-brand px-5 text-[15px] font-extrabold"
        >
          התחל ישיבה
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PrepList testid="dev-nospec" title="בלי תיאור" cards={prep.cardsWithoutSpec} empty="הכל מאופיין" />
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
            {prep.sprint.map(e => {
              const marked = marks[e.issue_number]?.mark === 'sprint';
              return (
                <li key={e.issue_number} data-testid={'dev-proposed-' + e.issue_number} className="flex items-center gap-2">
                  <span className="flex-1 text-[15px] text-foreground">
                    <bdi>#{e.issue_number} · {parseTitle(e.title).desc || e.title}</bdi>
                    <span className="ms-2 text-[13px] text-muted-foreground"><bdi>{e.parent} · {e.why}</bdi></span>
                  </span>
                  <button
                    type="button"
                    data-testid={'dev-accept-' + e.issue_number}
                    disabled={marked}
                    onClick={() => onMark(e.issue_number, 'sprint')}
                    className="min-h-9 flex-none rounded-xl border border-border px-3 text-[13px] font-extrabold text-foreground disabled:opacity-50"
                  >
                    {marked ? 'הועבר' : 'העבר לספרינט הקרוב'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[15px] text-muted-foreground">אין מועמדים</p>
        )}
        <p className="sr-only">{cards.length} כרטיסים</p>
      </section>
    </div>
  );
}

// ───────────────────────────── חדש השבוע ─────────────────────────────

function NewThisWeekScreen({ cards, onStart }: { cards: DevCard[]; onStart: () => void }) {
  return (
    <div data-testid="dev-new-week" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-extrabold text-foreground">חדש השבוע</h2>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="dev-new-week-start"
          onClick={onStart}
          className="min-h-11 rounded-xl s-brand px-5 text-[15px] font-extrabold"
        >
          המשך לסבב
        </button>
      </div>
      {cards.length ? (
        <ul className="flex flex-col gap-1.5">
          {cards.map(c => (
            <li key={c.number} data-testid={'dev-new-week-' + c.number} className="rounded-2xl border border-border bg-card/70 p-3 text-[15px] text-foreground">
              <bdi>#{c.number} · {parseTitle(c.title).desc || c.title}</bdi>
              <div className="mt-1 text-[13px] text-muted-foreground"><bdi>{STAGE_LABEL[stageOf(c)]}</bdi></div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted-foreground">אין כרטיסים חדשים השבוע</p>
      )}
    </div>
  );
}

// ───────────────────────────── the mark bar ─────────────────────────────

const MARKS: DevMark[] = ['sprint', 'clarify', 'defer'];

function MarkBar({ current, note, onMark, onNote }: {
  current: DevMark | undefined; note: string; onMark: (m: DevMark) => void; onNote: (v: string) => void;
}) {
  const [showNote, setShowNote] = React.useState(false);
  return (
    <div data-testid="dev-mark-bar" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {MARKS.map(m => (
          <FilterChip key={m} selected={current === m} onClick={() => onMark(m)}>
            {MARK_LABEL[m]}
          </FilterChip>
        ))}
        <FilterChip selected={showNote} onClick={() => setShowNote(v => !v)}>הערה</FilterChip>
      </div>
      {showNote && (
        <input
          type="text"
          data-testid="dev-mark-note"
          aria-label="הערה"
          value={note}
          onChange={e => onNote(e.target.value)}
          placeholder="הערה קצרה…"
          className="min-h-10 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-[color:var(--brand-1)]"
        />
      )}
    </div>
  );
}

// ───────────────────────────── summary ─────────────────────────────

function SummaryScreen({ marks, cards, today, onFinish }: {
  marks: Record<number, MarkEntry>; cards: DevCard[]; today: string; onFinish: () => void;
}) {
  const summary = React.useMemo(() => marksSummary(marks, cards), [marks, cards]);
  const copy = React.useCallback(() => {
    try { void navigator.clipboard?.writeText(marksText(summary, today)); } catch { /* no clipboard */ }
    toast.success('הועתק');
    track('dev-meeting-copy-summary');
  }, [summary, today]);

  return (
    <div data-testid="dev-summary" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-extrabold text-foreground">סיכום ישיבה</h2>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="dev-summary-copy"
          onClick={copy}
          className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-extrabold text-foreground"
        >
          <Copy size={16} aria-hidden /> העתקה
        </button>
        <button
          type="button"
          data-testid="dev-summary-finish"
          onClick={onFinish}
          className="min-h-11 flex-none rounded-xl s-brand px-5 text-[15px] font-extrabold"
        >
          סיום
        </button>
      </div>
      {summary.length ? (
        summary.map(g => (
          <section key={g.mark} data-testid={'dev-summary-' + g.mark} className="rounded-2xl border border-border bg-card/70 p-3">
            <h3 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">{g.label}</h3>
            <ul className="flex flex-col gap-1">
              {g.rows.map(r => (
                <li key={r.number} className="text-[15px] text-foreground">
                  <bdi>#{r.number} · {r.title}{r.note ? ' — ' + r.note : ''}</bdi>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="text-[15px] text-muted-foreground">לא סומן כלום בישיבה הזו</p>
      )}
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

  // Local marks — D-L3, never sent to GitHub. Keyed by the meeting DATE, so a reopen the same
  // day sees the same marks; pruned once per mount so old days don't pile up.
  const [marks, setMarks] = React.useState<Record<number, MarkEntry>>(() => loadMarks(today));
  React.useEffect(() => { pruneOldMarks(today); }, [today]);
  const mark = React.useCallback((number: number, m: DevMark, note?: string) => {
    setMarks(setMark(today, { number, mark: m, note, at: new Date().toISOString() } as MarkEntry));
  }, [today]);

  const [phase, setPhase] = React.useState<'prep' | 'new' | 'walk' | 'summary'>('prep');
  const [idx, setIdx] = React.useState(0);
  const [filters, setFilters] = React.useState<DevFilters>({});
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [note, setNote] = React.useState('');

  // F14 ①: the session row, the clock and the event log are ONE hook now, shared with
  // ▶ מצב ישיבה (islands/Presenter) — the two screens ran identical copies of all three.
  const {
    session, seconds, running, start: startClock, pause: pauseClock, log, endSession,
  } = useMeetingRun('dev', me, today);
  const logged = React.useRef<string>('');

  // groupByDomain resolves each card's domain by looking its `parent` number up in the list it
  // is given — so it needs the FULL board (parents included) to resolve anything, never the
  // already-filtered rows (which have every Main Fields parent stripped out already, same fix
  // as DevBoard.tsx 1e7e0906). The filter is applied AFTER grouping: keep only the qualifying
  // issue numbers inside each tier, then drop tiers/domains left with nothing in them.
  const filteredCards = React.useMemo(() => applyDevFilters(cards, filters, Date.now()), [cards, filters]);
  const groups = React.useMemo(() => {
    const keep = new Set(filteredCards.map(c => c.number));
    return groupByDomain(cards)
      .map(g => ({
        ...g,
        tiers: g.tiers
          .map(t => ({ ...t, cards: t.cards.filter(c => keep.has(c.number)) }))
          .filter(t => t.cards.length > 0),
      }))
      .filter(g => g.tiers.length > 0)
      .map(g => ({ ...g, count: g.tiers.reduce((n, t) => n + t.cards.length, 0) }));
  }, [cards, filteredCards]);
  const walk = React.useMemo(() => flattenWalk(groups), [groups]);
  const starts = React.useMemo(() => domainStarts(groups), [groups]);
  const newWeek = React.useMemo(() => newThisWeek(cards, Date.now()), [cards]);

  const current = walk[Math.min(idx, Math.max(walk.length - 1, 0))] || null;
  const currentDomain = React.useMemo(() => {
    let acc = 0;
    for (const g of groups) {
      const n = g.tiers.reduce((s, t) => s + t.cards.length, 0);
      if (n > 0 && idx < acc + n) return g;
      acc += n;
    }
    return null;
  }, [groups, idx]);

  // Every arrival at a card is a segment boundary. Keyed so StrictMode cannot log it twice.
  React.useEffect(() => {
    if (phase !== 'walk' || !current) return;
    const key = phase + '|' + idx + '|' + current.number;
    if (logged.current === key) return;
    logged.current = key;
    setNote(marks[current.number]?.note || '');
    void log('issue', { issue_number: current.number, hint: current.title });
  }, [phase, idx, current?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Prep → חדש השבוע. The board is re-read first, so a local mark is already reflected. */
  const toNewWeek = React.useCallback(async () => {
    try { await board.refetch(); } catch { /* the walk runs on what we already have */ }
    setPhase('new');
    track('dev-meeting-start');
  }, [board]);

  const toWalk = React.useCallback(() => {
    setIdx(0);
    setPhase('walk');
  }, []);

  const move = React.useCallback((dir: number) => {
    setIdx(i => nextIndex(i, walk.length, dir));
  }, [walk.length]);

  /** ←/→ jump to the first card of the next/previous domain. */
  const moveDomain = React.useCallback((dir: number) => {
    setIdx(i => {
      if (!starts.length) return i;
      if (dir > 0) {
        const next = starts.find(s => s > i);
        return next !== undefined ? next : i;
      }
      const prevCandidates = starts.filter(s => s < i);
      return prevCandidates.length ? prevCandidates[prevCandidates.length - 1] : starts[0];
    });
  }, [starts]);

  const marker = React.useCallback(() => {
    if (!current) return;
    void log('issue', { issue_number: current.number, hint: '📌' });
    track('dev-meeting-marker');
    toast.success('📌 סומן');
  }, [log, current]);

  const setCurrentMark = React.useCallback((m: DevMark) => {
    if (!current) return;
    mark(current.number, m, note || undefined);
    track('dev-meeting-mark:' + m);
  }, [current, mark, note]);

  const setCurrentNote = React.useCallback((v: string) => {
    setNote(v);
    if (current) mark(current.number, marks[current.number]?.mark || 'clarify', v || undefined);
  }, [current, mark, marks]);

  const toSummary = React.useCallback(() => setPhase('summary'), []);

  const finish = React.useCallback(async () => {
    await endSession();
    track('dev-meeting-close');
    onClose();
  }, [endSession, onClose]);

  // ── keys — the same map ▶ מצב ישיבה uses (Task 24), so the two screens feel like one.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { e.preventDefault(); void finish(); return; }
      if (phase !== 'walk') return;
      switch (e.key) {
        // RTL: the board runs right → left, so ← is forward and → is back.
        case 'ArrowLeft': e.preventDefault(); moveDomain(1); break;
        case 'ArrowRight': e.preventDefault(); moveDomain(-1); break;
        case 'j': case 'J': case 'י': e.preventDefault(); move(1); break;
        case 'k': case 'K': case 'ל': e.preventDefault(); move(-1); break;
        case ' ': e.preventDefault(); marker(); break;   // 📌 — the screen does not move
        case '1': e.preventDefault(); setCurrentMark('sprint'); break;
        case '2': e.preventDefault(); setCurrentMark('clarify'); break;
        case '3': e.preventDefault(); setCurrentMark('defer'); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, move, moveDomain, marker, setCurrentMark, finish]);

  const n = walk.length;
  const cardComments = (current?.comments || []);
  const cardQuestions = prep.questions.filter(q => Number(q.issue_number) === Number(current?.number));
  const assignees = React.useMemo(
    () => Array.from(new Set(cards.map(c => c.assignee).filter(Boolean))) as string[],
    [cards],
  );
  const fCount = activeFilterCount(filters);

  return (
    <div
      data-testid="dev-presenter"
      role="dialog"
      aria-modal="true"
      aria-label="ישיבת פיתוח"
      dir="rtl"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background p-4 sm:p-8"
    >
      <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          data-testid="dev-timer-toggle"
          onClick={() => (running ? pauseClock() : startClock())}
          aria-label={running ? 'עצירת השעון' : 'הפעלת השעון'}
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-border text-foreground"
        >
          {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <span data-testid="dev-timer" className="text-[20px] font-extrabold tabular-nums text-foreground">
          <bdi>{clockText(seconds)}</bdi>
        </span>
        {phase === 'walk' && (
          <span data-testid="dev-counter" className="text-[14px] font-extrabold text-muted-foreground">
            <bdi>{n ? Math.min(idx + 1, n) : 0} / {n}</bdi>
          </span>
        )}
        <span className="flex-1" />
        {phase === 'walk' && (
          <button
            type="button"
            data-testid="dev-filters-open"
            onClick={() => setFiltersOpen(true)}
            aria-label="סינון"
            className="relative inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border text-foreground"
          >
            <SlidersHorizontal size={16} aria-hidden />
            {fCount > 0 && (
              <span
                data-testid="dev-filters-badge"
                className="pointer-events-none absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sigma-ink)] px-1 text-[10px] font-bold text-[hsl(var(--card))]"
              >
                <bdi>{fCount}</bdi>
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          data-testid="dev-exit"
          onClick={() => void finish()}
          aria-label="סגירה"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border text-foreground"
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
          <PrepScreen prep={prep} cards={cards} marks={marks} onMark={mark} onStart={() => void toNewWeek()} />
        ) : phase === 'new' ? (
          <NewThisWeekScreen cards={newWeek} onStart={toWalk} />
        ) : phase === 'summary' ? (
          <SummaryScreen marks={marks} cards={cards} today={today} onFinish={() => void finish()} />
        ) : !current ? (
          <p data-testid="dev-empty" className="text-[17px] text-muted-foreground">אין כרטיסים להצגה</p>
        ) : (
          <>
            <div data-testid="dev-domain" className="text-[13px] font-extrabold text-muted-foreground">
              <bdi>{currentDomain?.domain?.title || 'ללא אפיון'}</bdi>
            </div>
            <div data-testid="dev-column" className="text-[12px] font-bold text-muted-foreground">
              {STAGE_LABEL[stageOf(current)]} · {PRIO_LABEL[priorityTier(current)]}
            </div>
            <h1 data-testid="dev-card-title" className="text-[28px] font-extrabold leading-tight text-foreground sm:text-[40px]">
              <bdi>{current.title}</bdi>
            </h1>
            {current.assignee && (
              <div data-testid="dev-card-assignee" className="text-[14px] text-muted-foreground"><bdi>{current.assignee}</bdi></div>
            )}

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

            <MarkBar
              current={marks[current.number]?.mark}
              note={note}
              onMark={setCurrentMark}
              onNote={setCurrentNote}
            />
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
          {idx >= n - 1 ? (
            <button
              type="button"
              data-testid="dev-to-summary"
              onClick={toSummary}
              className="min-h-11 flex-none rounded-xl s-brand px-4 text-[13px] font-extrabold"
            >
              לסיכום
            </button>
          ) : (
            <span className="flex-1" />
          )}
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

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        assignees={assignees}
        onApply={f => { setFilters(f); setIdx(0); }}
      />
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
  // The cold-load open is already handled: `openX()` raises `pendingOpen` before it dispatches,
  // and the `useState` initializer above drains it during the very render `mount()` schedules —
  // strictly before this effect commits. So this effect only has to carry the WARM path (the
  // island is mounted, somebody dispatches the event). A second `pendingOpen` drain here would
  // be dead code: the initializer has always cleared it by the time we get here.
    const on = () => { pendingOpen = false; setOpen(true); track('dev-meeting-open'); };
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
