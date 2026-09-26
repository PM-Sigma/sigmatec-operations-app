// ▶ מצב ישיבה — #sigma-presenter (company-process spec §1.2 + §1.2b).
//
// The in-meeting screen, and nothing else. עידן shares it while the company meeting runs:
// one kibbutz fills the screen, the arrow keys walk the board's own order, and the only
// things he can do are mark a moment, park a tangent, or write one line. There is no
// recording here — §8b closed that: he records locally and the file syncs to Drive.
//
// Two rules the whole file obeys:
//   · Typing is OPTIONAL, never required (עידן 18.9). The quick-note line is always visible
//     and always empty; a meeting where nobody types is a complete meeting.
//   · The ✏️ line creates IMMEDIATELY (§1.2b ruling). Nothing is held until "בצע" — the room
//     is watching the shared screen, so what was decided has to exist before the screen moves.
//
// Copy rule (master spec §6): everything on screen is Hebrew, nothing explains the app's own
// mechanics, and nothing tells anyone who else can see what.
import * as React from 'react';
import { useMeetingRun } from '@/lib/meetingRun';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast as sonnerToast } from 'sonner';

// Every toast this screen shows lands at bottom-center (round-5/6: the app's default top toast
// covered the compact header, and top-center collided with the sticky header regardless of
// which action fired it — the close/undo toast wasn't the only offender). This is the ONE place
// that decides that, so a future toast call here can't reintroduce a top one by omission.
const toast = {
  success: (msg: string, opts?: Parameters<typeof sonnerToast.success>[1]) =>
    sonnerToast.success(msg, { position: 'bottom-center', ...opts }),
  error: (msg: string, opts?: Parameters<typeof sonnerToast.error>[1]) =>
    sonnerToast.error(msg, { position: 'bottom-center', ...opts }),
  dismiss: (...args: Parameters<typeof sonnerToast.dismiss>) => sonnerToast.dismiss?.(...args),
};

// Presenter-scoped toast offset (round-6 item 1, fix-up): the `<Toaster>` (main.tsx) is ONE
// React component that re-renders its own `[data-sonner-toaster]` `style` attribute (including
// `--offset-bottom`/`--mobile-offset-bottom`) on every toast add/remove — a plain
// `el.style.setProperty(...)` from outside React gets silently wiped the very next time it
// re-renders, which is why the toast kept landing at Sonner's stock 24px/16px offset no matter
// how often this file reapplied it. A `bottom: … !important` rule in an actual stylesheet beats
// an element's own inline style, and reads a var on `<html>` that only THIS code ever touches —
// so it survives every Toaster re-render, no fight with React needed. There can be more than
// one `[data-sonner-toaster]` (Sonner keeps a separate one per active position); the ones NOT
// using `bottom` positioning simply ignore this rule, so applying it to all of them is safe.
const PRESENTER_TOAST_STYLE_ID = 'presenter-toast-offset-style';
function ensurePresenterToastStyle(): void {
  if (document.getElementById(PRESENTER_TOAST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRESENTER_TOAST_STYLE_ID;
  style.textContent = '[data-sonner-toaster]{bottom:var(--presenter-dock-offset,24px) !important;}';
  document.head.appendChild(style);
}
import { Bookmark, ChevronLeft, ChevronRight, MoreHorizontal, Pause, Pencil, Play, Video, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { BubbleButton } from '@/components/ui/bubble-button';
import { mount } from '@/islands';
import { fetchKibbutzRows } from '@/lib/kibbutzRows';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { INTERNAL_TASKS_WRITABLE } from '@/lib/caps';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { createInternalTask, useInternalTasks } from '@/components/home/InternalTasks';
import { openFor as internalOpenFor } from '@/lib/internalTasks';
import { useBurnAccess, useBurns } from '@/components/home/Burns';
import { stepsForKibbutz as onboardingStepsForKibbutz, useOnboardingSteps } from '@/components/home/OnboardingProgress';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { emitNotesChanged, NOTES_QUERY_KEY } from '@/components/home/MeetingNotes';
import { energyText, labelOf, sectionOf, type KibbutzRow } from '@/lib/kibbutzim';
import type { EmsTask } from '@/bridge';
import {
  chipDate, MEETING_PEOPLE, notesForKibbutz, taskFromBullet,
  type MeetingKind, type NoteRow,
} from '@/lib/meetingNotes';
import {
  canPresent, clockText, liveChips, momentLine, nextIndex,
  presenterOrder, type LiveChipId, type MeetingSessionRow,
} from '@/lib/meetingSession';
import { dm } from '@/lib/field';
import { canCloseInMeeting, createCloseQueue, sendClose, type CloseStatus, type PendingClose } from '@/lib/meetingClose';
import { statusBlocks } from '@/lib/meetingStatus';
import { useMeetingTimeline } from './presenter/useMeetingTimeline';
import { MeetingTimeline } from './presenter/MeetingTimeline';
import { StatusBlocksRow } from './presenter/StatusBlocks';
import { MomentSheet } from './presenter/MomentSheet';
import { MomentsList } from './presenter/MomentsList';

export const PRESENTER_OPEN_EVENT = 'sigma-open-presenter';

/** Cold-open flag, consumed synchronously inside the island's first render (see Gaps.tsx). */
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
try { window.addEventListener(PRESENTER_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

/** Open מצב ישיבה from anywhere (⋯ עוד, a deep link). No-op before the island mounts. */
export function openPresenter(): void {
  pendingOpen = true;   // cleared by the listener, or drained by the island's first effect
  try { window.dispatchEvent(new CustomEvent(PRESENTER_OPEN_EVENT)); } catch { /* no DOM */ }
}

// ───────────────────────────── reads ─────────────────────────────

const fetchKibbutzim = () => fetchKibbutzRows<KibbutzRow>();   // F14 ⑫ — the ONE reader

async function fetchNotes(): Promise<NoteRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('kibbutz_meeting_notes')
    .select('id,kibbutz,meeting_date,meeting_kind,seq,text,owners,ems_task_id,done_at');
  if (error) throw error;
  return (data || []) as NoteRow[];
}

/** Today's office events — the SAME query the calendar island holds, so the 🎥 link is one fetch. */
async function fetchEvents(from: string, to: string): Promise<Array<{ title?: string; hangoutLink?: string | null }>> {
  try { return (await sigma.calFetchEvents?.({ from, to })) || []; }
  catch { return []; }
}

const ymd = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ישיבת חברה / ישיבת פיתוח on today's calendar — the meeting this session belongs to. */
function todaysMeeting(events: Array<{ title?: string; hangoutLink?: string | null }>) {
  const dev = /ישיבת\s*פיתוח|פיתוח/;
  const company = /ישיבת\s*חברה|חברה/;
  const hit = (events || []).find(e => dev.test(String(e?.title || '')) || company.test(String(e?.title || '')));
  if (!hit) return null;
  return {
    kind: (dev.test(String(hit.title || '')) ? 'dev' : 'company') as MeetingKind & ('company' | 'dev'),
    meetLink: hit.hangoutLink ? String(hit.hangoutLink) : '',
  };
}

// ───────────────────────────── the state strips ─────────────────────────────

interface StripItem { label: string; value: string }

/**
 * The two strips §1.2 asks for, built from data the CARD already has — no new table, no new
 * fetch. עידן's point is that they disagree: a kibbutz can be calm on one and loud on the
 * other, and the meeting should see both at once.
 */
function useStrips(row: KibbutzRow | null, notes: NoteRow[]): {
  admin: StripItem[]; field: StripItem[]; openTasks: string[]; emsTasks: EmsTask[];
} {
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('ems-cache-synced', () => setTick(t => t + 1));
  useSigmaEvent('visit-saved', () => setTick(t => t + 1));

  return React.useMemo(() => {
    if (!row) return { admin: [], field: [], openTasks: [], emsTasks: [] };
    const name = row.name;
    const month = ymd().slice(0, 7);

    const tasks: EmsTask[] = (() => {
      try { return sigma.emsCacheTasksForKibbutz?.(name) || []; }
      catch { return []; }
    })();
    const openTasks = tasks.map(t => String(t?.title || '').trim()).filter(Boolean);
    const visits = (() => {
      try { return (sigma.loadAllVisitsCombined?.() || []) as Array<{ kibbutz?: string; date?: string }>; }
      catch { return []; }
    })();
    const visitsThisMonth = visits.filter(v => v?.kibbutz === name && String(v?.date || '').startsWith(month)).length;

    const groups = notesForKibbutz(notes, name);
    const openBullets = groups.flatMap(g => g.bullets).filter(b => !b.done_at).length;
    const lastSeen = groups[0]?.meeting_date;

    return {
      admin: [
        { label: 'מדור', value: sectionOf(row) === 'new' ? '🆕 לקוח חדש' : '✅ פעיל' },
        { label: 'פתוחים מישיבות', value: String(openBullets) },
        { label: 'נסקר לאחרונה', value: lastSeen ? chipDate(lastSeen) : '—' },
      ],
      field: [
        { label: 'אנרגיה', value: energyText(row) },
        { label: 'משימות EMS פתוחות', value: String(tasks.length) },
        { label: 'ביקורים החודש', value: String(visitsThisMonth) },
        { label: 'מונים', value: String(row.ems_params?.meters?.total ?? '—') },
      ],
      openTasks,
      emsTasks: tasks,
    };
  }, [row, notes, tick]);
}

/**
 * Task 28's own strip, when it exists. It is read through the bridge rather than imported, so
 * this screen has NO dependency on that task: nothing there → nothing rendered, no error.
 *
 * Every layer of the defence is deliberate and none of it is redundant (Task 18 review note):
 * `presenterStrip?.()` covers "the health island never mounted"; `Array.isArray` covers a
 * future implementation that answers with an object or a promise; `String(...?? '')` covers a
 * row with a missing or non-string field; the `catch` covers a throwing implementation. A
 * meeting is being run on this screen — it may render less, never blank.
 */
function useExtraStrip(row: KibbutzRow | null): StripItem[] {
  return React.useMemo(() => {
    if (!row) return [];
    try {
      const raw = (sigma as unknown as { presenterStrip?: (k: string) => unknown }).presenterStrip?.(row.name);
      if (!Array.isArray(raw)) return [];
      return raw
        .map(x => ({ label: String((x as StripItem)?.label ?? ''), value: String((x as StripItem)?.value ?? '') }))
        .filter(x => x.label || x.value);
    } catch { return []; }
  }, [row]);
}

function Strip({ title, items, testid }: { title: string; items: StripItem[]; testid: string }) {
  if (!items.length) return null;
  return (
    <div
      data-testid={testid}
      className="flex-1 rounded-2xl border border-border bg-card/70 p-3"
    >
      <div className="mb-2 text-[13px] font-extrabold text-muted-foreground">{title}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {items.map(it => (
          <React.Fragment key={it.label}>
            <dt className="text-[13px] text-muted-foreground">{it.label}</dt>
            <dd className="text-[15px] font-extrabold text-foreground"><bdi>{it.value}</bdi></dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

/**
 * "ניהולי"/region as small chip-style tags rather than a titled headline box (item 3). No new
 * backend logic: this reads the same `row.region`/`row.name` the card already shows, and no
 * update path for region data is wired anywhere client-side today, so the chip is read-only for
 * now — the edit affordance the spec allows for (§Package H item 3) is left to a follow-up once
 * an existing kibbutz-update function surfaces one (checked `app/src/lib/kibbutzim.ts` /
 * `kibbutzRows.ts`: no client-side region-update function exists there to reuse without adding
 * new backend logic, which the ground rules forbid).
 */
function RegionChips({ row }: { row: KibbutzRow | null }) {
  if (!row) return null;
  const chips = [String(row.region || '—'), sectionOf(row) === 'new' ? '🆕 לקוח חדש' : '✅ פעיל'];
  return (
    <div data-testid="presenter-region-chips" className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex min-h-7 items-center rounded-full border border-border bg-muted px-2.5 text-[12px] font-bold text-foreground"
        >
          <bdi>{c}</bdi>
        </span>
      ))}
    </div>
  );
}

// ───────────────────────────── the ✏️ live sheet ─────────────────────────────

const CHIP_PREFIX: Partial<Record<LiveChipId, string>> = { decision: '🧭 ', idea: '💡 ' };

function LiveSheet({
  open, onOpenChange, kibbutz, session, notes, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kibbutz: string;
  session: MeetingSessionRow | null;
  notes: NoteRow[];
  onDone: () => void;
}) {
  const chips = React.useMemo(() => liveChips({ internalTasks: INTERNAL_TASKS_WRITABLE }), []);
  const [chip, setChip] = React.useState<LiveChipId>('ems');
  const [text, setText] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (open) { setText(''); setOwner(''); setChip('ems'); } }, [open]);

  const date = session?.date || ymd();
  const kind = (session?.kind || 'company') as MeetingKind;

  /** The next free seq for this kibbutz's bullets today — the table's unique key needs one. */
  function nextSeq(): number {
    const mine = (notes || []).filter(
      n => n.kibbutz === kibbutz && n.meeting_date === date && String(n.meeting_kind) === kind);
    return mine.reduce((max, n) => Math.max(max, Number(n.seq) || 0), 0) + 1;
  }

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      if (chip === 'ems') {
        const res = (await sigma.createTask(taskFromBullet({
          kibbutz, text: body, owners: owner ? [owner] : [], meeting_date: date, meeting_kind: kind,
        }))) as { error?: string; id?: string } | null;
        if (res && res.error) throw new Error(String(res.error));
        toast.success(res && res.id ? 'נפתחה משימה' : 'המשימה תיפתח כשתהיה רשת');
        track('presenter-live', 'ems');
      } else if (chip === 'internal') {
        // D2: 🔒 opens an internal_tasks row, not a kibbutz_meeting_notes bullet — the previous
        // wiring fell through to the `else` below and silently mis-filed it as a note.
        await createInternalTask(body, kibbutz, owner || null, sigma.getCurrentUser?.() || '');
        toast.success('נפתחה משימה פנימית');
        track('presenter-live', 'internal');
      } else {
        const sb = await getSupabase();
        await sbWrite(() => sb.from('kibbutz_meeting_notes').insert({
          kibbutz,
          meeting_date: date,
          meeting_kind: kind,
          seq: nextSeq(),
          text: (CHIP_PREFIX[chip] || '') + body,
          owners: owner ? [owner] : [],
          source: 'live',
        }).select('id').single());
        toast.success('נוסף לכרטיס');
        track('presenter-live', chip);
      }
      emitNotesChanged({ kibbutz, live: true });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as Error)?.message || 'לא הצלחתי, נסה שוב');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="presenter-live" className="max-h-[88svh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle className="text-base"><bdi>{kibbutz}</bdi></SheetTitle>
          <SheetDescription>שורה אחת, ותיכנס עכשיו</SheetDescription>
        </SheetHeader>

        <textarea
          data-testid="live-text"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          autoFocus
          placeholder="מה נאמר"
          className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-base outline-none focus:border-[color:var(--brand-1)]"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(c => (
            <button
              key={c.id}
              type="button"
              data-testid={'live-chip-' + c.id}
              aria-pressed={chip === c.id}
              onClick={() => setChip(c.id)}
              className={
                'min-h-9 rounded-full border px-3 text-[13px] font-extrabold ' +
                (chip === c.id
                  ? 'border-transparent s-brand'
                  : 'border-border bg-card text-foreground')
              }
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="live-owner" className="text-[13px] text-muted-foreground">אחריות</label>
          <select
            id="live-owner"
            data-testid="live-owner"
            value={owner}
            onChange={e => setOwner(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-muted px-3 text-[15px] text-foreground"
          >
            <option value="">—</option>
            {MEETING_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            type="button"
            data-testid="live-submit"
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
            className="min-h-11 rounded-xl s-brand px-5 text-[15px] font-extrabold disabled:opacity-50"
          >
            הזן
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────── the overlay ─────────────────────────────

function PresenterOverlay({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { name: me, isViewer } = useCurrentUser();
  const today = ymd();

  const kibbutzim = useQuery({ queryKey: ['kibbutzim'], queryFn: fetchKibbutzim });
  const notesQ = useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: fetchNotes });
  // The SAME key the calendar island uses for one day, so the two share one fetch.
  const eventsQ = useQuery({
    queryKey: ['cal', 'events', today, today],
    queryFn: () => fetchEvents(today, today),
    staleTime: 5 * 60 * 1000,
  });

  const rows = React.useMemo(() => presenterOrder(kibbutzim.data || []), [kibbutzim.data]);
  const notes = notesQ.data || [];
  const meeting = React.useMemo(() => todaysMeeting(eventsQ.data || []), [eventsQ.data]);
  const internalTasksQ = useInternalTasks();

  const [idx, setIdx] = React.useState(0);
  const { session, seconds, running, start, pause, log, mark, noteMark, endSession } =
    useMeetingRun(meeting?.kind || 'company', me, today);   // F14 ①

  const [draft, setDraft] = React.useState('');
  const [liveOpen, setLiveOpen] = React.useState(false);
  const [exitOpen, setExitOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);

  // The dock's REAL rendered height, not a guessed padding — a fixed pb drifts the moment the
  // footer's own content changes height (designer round-6 item 3). `--dock-h` is set as a CSS
  // var on the dialog root and `main` reads it back, so there is exactly one source of truth.
  const footerRef = React.useRef<HTMLElement | null>(null);
  const [dockH, setDockH] = React.useState(144);   // a sane first-paint fallback before measured
  React.useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const measure = () => setDockH(Math.ceil(el.getBoundingClientRect().height));
    measure();
    // jsdom (vitest) has no ResizeObserver — the fallback measurement above still runs once,
    // which is all a golden render needs; a real browser gets the live remeasure.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Presenter-scoped toast offset (round-6 item 1): the ONE global `<Toaster>` (main.tsx) is
  // shared app-wide, so this reads a var on `<html>` + an injected stylesheet rule rather than
  // touching that shared component — package S is free to change the app's normal offset
  // without a merge fight here, and this rule only ever WINS while a bottom toast exists,
  // never while there is none. Bottom-center toasts must clear the dock (12px breathing room
  // above it) instead of landing under the composer at 1440 or below the fold on a short phone.
  React.useEffect(() => {
    ensurePresenterToastStyle();
    document.documentElement.style.setProperty('--presenter-dock-offset', (dockH + 12) + 'px');
    return () => { document.documentElement.style.removeProperty('--presenter-dock-offset'); };
  }, [dockH]);

  const noteRef = React.useRef<HTMLInputElement | null>(null);
  const logged = React.useRef<string>('');

  const current = rows[Math.min(idx, Math.max(rows.length - 1, 0))] || null;
  const strips = useStrips(current, notes);
  const extra = useExtraStrip(current);
  // ── M-R1/M-R2: one per-kibbutz timeline of everything since the previous meeting ──────────
  const [windowMode, setWindowMode] = React.useState<'since' | '30d'>('since');
  const timeline = useMeetingTimeline(current?.name || '', windowMode);
  const emsOpenCount = timeline.items.filter(i => i.kind === 'ems').length + timeline.olderOpen.length;

  // ── M-R7: burns + onboarding status blocks, no longer on the card ─────────────────────────
  const { canSee: burnsVisible } = useBurnAccess();
  const burnsQ = useBurns(burnsVisible);
  const onboardingQ = useOnboardingSteps();
  const blocks = React.useMemo(() => {
    if (!current) return null;
    return statusBlocks({
      kibbutz: current.name,
      burns: burnsQ.data || [],
      burnsVisible,
      steps: onboardingStepsForKibbutz(onboardingQ.data, current.name),
      emsOpen: emsOpenCount,
      internalOpen: internalOpenFor(internalTasksQ.data, current.name).length,
      now: new Date(),
    });
  }, [current, burnsQ.data, burnsVisible, onboardingQ.data, emsOpenCount, internalTasksQ.data]);

  // ── M-R8: one-click EMS close, 5 s deferred commit with undo ───────────────────────────────
  const canClose = canCloseInMeeting(me, isViewer);
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, CloseStatus>>({});
  const [queuedTaskIds, setQueuedTaskIds] = React.useState<Set<string>>(new Set());
  // The one toast per taskId that offers "ביטול" — kept so a settle (timer OR an early flush)
  // can dismiss it instead of leaving it on screen with a dead undo button (Opus round-5 audit,
  // item 1: "undo lies after flush"), and so the settle path never shows a SECOND toast for the
  // same click (item 5: the success toast was showing twice — once on click, once on settle).
  const closeToastIds = React.useRef<Record<string, string | number>>({});
  const closeQueueRef = React.useRef<ReturnType<typeof createCloseQueue> | null>(null);
  if (!closeQueueRef.current) {
    closeQueueRef.current = createCloseQueue({
      send: sendClose,
      onSettled: (p, r) => {
        setPendingTaskIds(prev => { const n = { ...prev }; delete n[p.taskId]; return n; });
        const toastId = closeToastIds.current[p.taskId];
        if (toastId != null) { toast.dismiss(toastId); delete closeToastIds.current[p.taskId]; }
        if (r.skipped === 'already-closed') {
          toast.error('המשימה כבר נסגרה', { position: 'bottom-center' });
        } else if (r.error) {
          toast.error('לא הצלחתי, נסה שוב', { position: 'bottom-center' });
        } else {
          // No second success toast here (Opus item 5) — the click's own toast already said so,
          // and dismissing it above is confirmation enough that the undo window closed.
          if (r.queued) setQueuedTaskIds(prev => new Set(prev).add(p.taskId));
          timeline.refetch();
        }
      },
    });
  }
  const closeQueue = closeQueueRef.current;

  const onCloseTask = React.useCallback((taskId: string, status: CloseStatus) => {
    if (!canClose) return;
    const p: PendingClose = { taskId, status, by: me, at: new Date() };
    const undo = closeQueue.schedule(p);
    setPendingTaskIds(prev => ({ ...prev, [taskId]: status }));
    try { navigator.vibrate?.(10); } catch { /* not every browser */ }
    const toastId = toast.success(status === 'done' ? 'המשימה סומנה כבוצעה' : 'המשימה סומנה כבוטלה', {
      duration: 5000,
      position: 'bottom-center',   // designer round-5: a top toast covered the header
      action: {
        label: 'ביטול',
        onClick: () => {
          // `undo()` reports whether it actually cancelled anything — a click that loses the
          // race against a flush (screen closing, kibbutz change) must NOT pretend it worked.
          if (undo()) setPendingTaskIds(prev => { const n = { ...prev }; delete n[taskId]; return n; });
        },
      },
    });
    closeToastIds.current[taskId] = toastId;
  }, [canClose, closeQueue, me]);

  // Flush on the app closing during the 5 s undo (review focus #1): pagehide, tab hidden, and —
  // via the effect's own cleanup — on leaving the kibbutz on screen or unmounting on exit.
  React.useEffect(() => {
    const flush = () => { void closeQueue.flush(); };
    window.addEventListener('pagehide', flush);
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [closeQueue]);
  React.useEffect(() => () => { void closeQueue.flush(); }, [closeQueue, idx]);

  // ── M-R5: "סמן רגע" — the tap marks at once, the sheet only offers an optional note ────────
  const [moments, setMoments] = React.useState<Array<{ id: string; t_sec: number; kibbutz?: string; hint?: string }>>([]);
  const [markOpen, setMarkOpen] = React.useState(false);
  const markPendingId = React.useRef<string>('');

  const doMark = React.useCallback(async (openSheet: boolean) => {
    const kib = current?.name || undefined;
    try {
      const { id, t_sec } = await mark(kib || null);
      track('presenter-marker');
      setMoments(prev => [...prev, { id, t_sec, kibbutz: kib }]);
      if (openSheet) { markPendingId.current = id; setMarkOpen(true); }
      else { toast.success('סומן', { position: 'bottom-center' }); }
    } catch {
      // the meeting matters more than the marker (same rule meetingRun.ts's own log() follows) —
      // but silently swallowing it here would leave the room thinking a moment WAS recorded.
      toast.error('לא הצלחתי לסמן, נסה שוב', { position: 'bottom-center' });
    }
  }, [mark, current?.name]);

  const onSaveMomentNote = React.useCallback((note: string) => {
    const id = markPendingId.current;
    if (!id) return;
    void noteMark(id, note);
    setMoments(prev => prev.map(m => (m.id === id ? { ...m, hint: note } : m)));
  }, [noteMark]);

  const momentLines = React.useMemo(
    () => moments.map(m => momentLine(m as any)), [moments]);

  // Every arrival at a kibbutz is a segment boundary — but ONLY once the meeting is actually
  // running (the clock started) or a session already exists for some other reason (a mark, a
  // live chip). Gating on `running || session?.id` — rather than `session?.id` alone (D1's
  // original bug) or not gating at all (this file's OWN first attempt at the D1 fix, which
  // silently reintroduced an eager insert: opening the screen always arrives at kibbutz #1,
  // so an unconditional log() on mount recreated exactly the bug D1 was meant to remove) — is
  // what makes merely opening and closing מצב ישיבה write nothing (Presenter.test.tsx: "open,
  // then close, writes nothing"), while pressing play still logs the kibbutz already on screen.
  // Keyed on idx + name (not session.id, which isn't set yet the instant `running` flips) so
  // StrictMode's double render cannot log the same arrival twice.
  React.useEffect(() => {
    if (!current || (!running && !session?.id)) return;
    const key = idx + '|' + current.name;
    if (logged.current === key) return;
    logged.current = key;
    void log('kibbutz', { kibbutz: current.name });
  }, [running, session?.id, idx, current?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ────────────────────────────────────────────────────────────
  const move = React.useCallback((dir: number) => {
    setIdx(i => nextIndex(i, rows.length, dir));
  }, [rows.length]);

  const park = React.useCallback(() => {
    void log('parking', { kibbutz: current?.name });
    track('presenter-parking');
    toast.success('נרשם להמשך');
  }, [log, current?.name]);

  const saveNote = React.useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    void log('note', { kibbutz: current?.name, hint: body });
    track('presenter-note');
    setDraft('');
    toast.success('נרשם');
  }, [draft, log, current?.name]);

  const finish = React.useCallback(async () => {
    await closeQueue.flush();
    await endSession();
    track('presenter-close');
    void qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
    onClose();
  }, [closeQueue, endSession, qc, onClose]);

  // ── keys ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        // …from the ✏️ sheet → back to the screen. …from the note field → back to
        // navigation. …from navigation → the one confirm before the meeting screen closes.
        if (liveOpen) { setLiveOpen(false); return; }
        if (typing) { el?.blur(); return; }
        toast.dismiss();   // one toast at a time (round-6 item 3): a leftover "נרשם"/close toast
        setExitOpen(true); // must not sit behind the exit sheet or stack with a second one
        return;
      }
      if (liveOpen || exitOpen) return;

      if (typing) {
        // The quick-note line owns Enter and nothing else; every other key is text.
        if (e.key === 'Enter') { e.preventDefault(); saveNote(); }
        return;
      }

      switch (e.key) {
        // RTL: the board runs right → left, so ← is forward and → is back.
        case 'ArrowLeft': e.preventDefault(); move(1); break;
        case 'ArrowRight': e.preventDefault(); move(-1); break;
        case 'j': case 'J': case 'י': e.preventDefault(); move(1); break;
        case 'k': case 'K': case 'ל': e.preventDefault(); move(-1); break;
        case ' ': e.preventDefault(); void doMark(false); break;   // סמן רגע, bare — the screen does not move
        case 'p': case 'P': case 'פ': e.preventDefault(); park(); break;   // …nor here (§1.2)
        case 'n': case 'N': case 'מ': e.preventDefault(); noteRef.current?.focus(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [liveOpen, exitOpen, move, doMark, park, saveNote]);

  const n = rows.length;

  return (
    <div
      data-testid="presenter"
      role="dialog"
      aria-modal="true"
      aria-label="מצב ישיבה"
      dir="rtl"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background"
      style={{ '--dock-h': dockH + 'px' } as React.CSSProperties}
    >
      {/* ── header (sticky, M-U1): X · timer · counter · play — one compact row. The Meet link
             moves behind ⋯ (designer round-5: "מהישיבה הקודמת" next to the timer is gone —
             עידן asked, and the timeline already covers it). Edge-to-edge + its OWN top inset
             (designer round-6: the outer container's p-4/sm:p-8 used to sit ABOVE this sticky
             header, so that strip of the page showed whatever had scrolled to the very top
             through it instead of the header's solid background). */}
      <header className="sticky top-0 z-20 flex min-w-0 flex-none items-center gap-2 border-b border-border bg-background px-4 pb-3 pt-4 sm:px-8 sm:pt-8">
        <button
          type="button"
          data-testid="presenter-exit"
          onClick={() => { toast.dismiss(); setExitOpen(true); }}
          aria-label="סגירה"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-1)] focus-visible:ring-offset-2"
        >
          <X size={18} aria-hidden />
        </button>
        <button
          type="button"
          data-testid="presenter-timer-toggle"
          onClick={() => (running ? pause() : start())}
          aria-label={running ? 'עצירת השעון' : 'הפעלת השעון'}
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-border text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-1)] focus-visible:ring-offset-2"
        >
          {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <span data-testid="presenter-timer" className="text-[18px] font-extrabold tabular-nums text-foreground">
          <bdi>{clockText(seconds)}</bdi>
        </span>
        <span data-testid="presenter-counter" className="text-[14px] font-extrabold text-muted-foreground">
          <bdi>{n ? Math.min(idx + 1, n) : 0} / {n}</bdi>
        </span>
        <span className="flex-1" />
        {meeting?.meetLink && (
          <div className="relative flex-none">
            <button
              type="button"
              data-testid="presenter-more"
              onClick={() => setMoreOpen(v => !v)}
              aria-label="עוד"
              aria-expanded={moreOpen}
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-border text-foreground"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
            {moreOpen && (
              <a
                href={meeting.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="presenter-meet"
                onClick={() => setMoreOpen(false)}
                className="absolute end-0 top-11 z-10 inline-flex min-h-9 flex-none items-center gap-1 whitespace-nowrap rounded-xl border border-border bg-card px-3 text-[13px] font-extrabold text-foreground shadow-[var(--e1)]"
              >
                <Video size={15} aria-hidden /> Meet
              </a>
            )}
          </div>
        )}
      </header>

      {/* ── the kibbutz ──────────────────────────────────────────────────── */}
      {/* `--dock-h` (measured off the real footer, see the ResizeObserver above) — the footer is
          `sticky bottom-0` and reserves no space of its own in the flow, so without this the
          scrollable dialog lets its content scroll UNDER it instead of stopping above it. A
          GUESSED pb (round-5's pb-36) drifts the moment the footer's own height changes — e.g.
          the Meet ⋯ row, a longer quick-note placeholder, or a locale with taller Hebrew line
          height (designer round-6 item 3). */}
      <main className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-8" style={{ paddingBottom: 'var(--dock-h)' }}>
        {!current ? (
          <p className="text-[17px] text-muted-foreground">אין קיבוצים להצגה</p>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <h1
                data-testid="presenter-kibbutz"
                className="min-w-0 truncate text-[30px] font-extrabold leading-tight text-foreground sm:text-[48px]"
              >
                <bdi>{labelOf(current)}</bdi>
              </h1>
              <button
                type="button"
                data-testid="presenter-edit"
                onClick={() => setLiveOpen(true)}
                aria-label="הוספת שורה"
                className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-foreground"
              >
                <Pencil size={18} aria-hidden />
              </button>
            </div>

            <RegionChips row={current} />

            <div className="flex flex-col gap-3 sm:flex-row">
              <Strip title="ניהולי" items={strips.admin} testid="presenter-strip-admin" />
              <Strip title="שטח ומערכת" items={strips.field} testid="presenter-strip-field" />
              <Strip title="מצב" items={extra} testid="presenter-strip-extra" />
            </div>

            {blocks && <StatusBlocksRow blocks={blocks} />}

            <SegmentedControl
              value={timeline.previousMeeting ? windowMode : '30d'}
              onChange={setWindowMode}
              options={
                timeline.previousMeeting
                  ? [
                      { value: 'since' as const, label: `מאז ${dm(timeline.previousMeeting)}` },
                      { value: '30d' as const, label: '30 יום' },
                    ]
                  : [{ value: '30d' as const, label: '30 יום' }]
              }
            />

            <MeetingTimeline
              items={timeline.items}
              olderOpen={timeline.olderOpen}
              now={new Date()}
              canClose={canClose}
              onClose={onCloseTask}
              pendingTaskIds={pendingTaskIds}
              queuedTaskIds={queuedTaskIds}
              onToggle30d={timeline.previousMeeting && windowMode === 'since' ? () => setWindowMode('30d') : undefined}
            />

            {/* designer round-6: the collapsed "מהישיבה הקודמת" card is removed entirely — its
                bullets are the exact same notes the timeline above already shows (kind 'note'),
                so a second, collapsed copy of them added nothing. */}
          </>
        )}
      </main>

      {/* ── nav: big prev/next arrows with the neighbour's name, then the always-visible
             quick note edge-to-edge below it ──────────────────────────────────────────── */}
      {/* Edge-to-edge + its OWN bottom inset (designer round-6 item 4: the composer's right edge
          looked clipped when the outer container's padding was removed for the header fix —
          this restores that same inset directly on the footer, symmetric with header/main). */}
      <footer
        ref={footerRef}
        className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-border bg-background px-4 pb-4 pt-3 sm:px-8 sm:pb-8"
      >
        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="presenter-prev"
            onClick={() => move(-1)}
            aria-label="הקודם"
            className="flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border text-foreground"
          >
            <ChevronRight size={26} aria-hidden />
            <span className="min-w-0 max-w-full truncate px-2 text-[12px] font-bold text-muted-foreground">
              <bdi>{rows[idx - 1] ? labelOf(rows[idx - 1]) : ''}</bdi>
            </span>
          </button>
          <button
            type="button"
            data-testid="presenter-next"
            onClick={() => move(1)}
            aria-label="הבא"
            className="flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border text-foreground"
          >
            <ChevronLeft size={26} aria-hidden />
            <span className="min-w-0 max-w-full truncate px-2 text-[12px] font-bold text-muted-foreground">
              <bdi>{rows[idx + 1] ? labelOf(rows[idx + 1]) : ''}</bdi>
            </span>
          </button>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2">
          <input
            ref={noteRef}
            data-testid="presenter-quicknote"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="שורה אחת, אם בא לך"
            aria-label="שורה אחת, אם בא לך"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-[15px] text-foreground outline-none focus:border-[color:var(--brand-1)]"
          />
          <BubbleButton
            variant="neutral"
            size="md"
            icon={<Bookmark size={16} aria-hidden />}
            data-testid="presenter-marker"
            onClick={() => void doMark(true)}
            className="flex-none"
          >
            סמן רגע
          </BubbleButton>
        </div>
      </footer>

      <LiveSheet
        open={liveOpen}
        onOpenChange={setLiveOpen}
        kibbutz={current?.name || ''}
        session={session}
        notes={notes}
        onDone={() => void qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY })}
      />

      <MomentSheet open={markOpen} onOpenChange={setMarkOpen} onSave={onSaveMomentNote} />

      <Sheet open={exitOpen} onOpenChange={setExitOpen}>
        <SheetContent side="bottom" data-testid="presenter-exit-sheet">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">לצאת ממצב ישיבה?</SheetTitle>
            <SheetDescription>מה שנרשם נשאר בכרטיסים</SheetDescription>
          </SheetHeader>
          <MomentsList lines={momentLines} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="presenter-exit-yes"
              onClick={() => void finish()}
              className="min-h-11 flex-1 rounded-xl s-brand px-4 text-[15px] font-extrabold"
            >
              יציאה
            </button>
            <button
              type="button"
              data-testid="presenter-exit-no"
              onClick={() => setExitOpen(false)}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 text-[15px] font-extrabold text-foreground"
            >
              חזרה
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ───────────────────────────── the island ─────────────────────────────

function PresenterIsland() {
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
    const on = () => { pendingOpen = false; setOpen(true); track('presenter-open'); };
    window.addEventListener(PRESENTER_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(PRESENTER_OPEN_EVENT, on as EventListener);
  }, []);

  React.useEffect(() => { if (open) track('presenter-open'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  if (!canPresent(isAdminNow(user), isViewer)) return null;
  return <PresenterOverlay onClose={() => setOpen(false)} />;
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

export function Presenter() {
  return <SigmaProviders><PresenterIsland /></SigmaProviders>;
}

export function mountPresenter(opts?: { open?: boolean }): boolean {
  if (opts?.open) pendingOpen = true;
  const ok = mount('sigma-presenter', Presenter);
  if (!ok) return false;
  (window as any).sigmaOpenPresenter = openPresenter;
  registerMoreItem({
    id: 'presenter',
    label: 'מצב ישיבה',
    icon: 'Presentation',
    group: 'admin',
    visible: () => {
      try {
        const me = sigma.getCurrentUser?.() || '';
        return canPresent(isAdminNow(me), !!sigma.isViewer?.());
      } catch { return false; }
    },
    onSelect: openPresenter,
  });
  return true;
}
