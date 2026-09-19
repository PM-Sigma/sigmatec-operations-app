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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, MapPin, Pencil, Video, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { INTERNAL_TASKS_WRITABLE } from '@/lib/caps';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { emitNotesChanged, NOTES_QUERY_KEY } from '@/components/home/MeetingNotes';
import { energyText, labelOf, sectionOf, type KibbutzRow } from '@/lib/kibbutzim';
import {
  chipDate, MEETING_PEOPLE, notesForKibbutz, taskFromBullet,
  type MeetingKind, type NoteRow,
} from '@/lib/meetingNotes';
import {
  canPresent, carryOverLine, clockText, eventRow, liveChips, nextIndex, presenterOrder, tSec,
  type LiveChipId, type MeetingEventKind, type MeetingSessionRow,
} from '@/lib/meetingSession';

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

async function fetchKibbutzim(): Promise<KibbutzRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('kibbutzim').select('*').is('archived_at', null);
  if (error) throw error;
  return (data || []) as KibbutzRow[];
}

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
function useStrips(row: KibbutzRow | null, notes: NoteRow[]): { admin: StripItem[]; field: StripItem[] } {
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('ems-cache-synced', () => setTick(t => t + 1));
  useSigmaEvent('visit-saved', () => setTick(t => t + 1));

  return React.useMemo(() => {
    if (!row) return { admin: [], field: [] };
    const name = row.name;
    const month = ymd().slice(0, 7);

    const tasks = (() => {
      try { return (sigma.emsCacheTasksForKibbutz?.(name) as Array<Record<string, unknown>>) || []; }
      catch { return []; }
    })();
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
        { label: 'איזור', value: String(row.region || '—') },
        { label: 'פתוחים מישיבות', value: String(openBullets) },
        { label: 'נסקר לאחרונה', value: lastSeen ? chipDate(lastSeen) : '—' },
      ],
      field: [
        { label: 'אנרגיה', value: energyText(row) },
        { label: 'משימות EMS פתוחות', value: String(tasks.length) },
        { label: 'ביקורים החודש', value: String(visitsThisMonth) },
        { label: 'מונים', value: String(row.ems_params?.meters?.total ?? '—') },
      ],
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

// ───────────────────────────── the ✏️ live sheet ─────────────────────────────

/** How long ago a bullet's meeting was, in meetings' terms the room understands. */
function ageText(iso: string, today: string): string {
  const days = Math.round((new Date(today).getTime() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(days) || days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 14) return `לפני ${days} ימים`;
  const weeks = Math.round(days / 7);
  return `לפני ${weeks} שבועות`;
}

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
          <SheetDescription>שורה אחת — ותיכנס עכשיו</SheetDescription>
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
                  ? 'border-transparent bg-brand-grad text-white'
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
            className="min-h-11 rounded-xl bg-brand-grad px-5 text-[15px] font-extrabold text-white disabled:opacity-50"
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
  const { name: me } = useCurrentUser();
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

  const [idx, setIdx] = React.useState(0);
  const [session, setSession] = React.useState<MeetingSessionRow | null>(null);
  const [draft, setDraft] = React.useState('');
  const [liveOpen, setLiveOpen] = React.useState(false);
  const [exitOpen, setExitOpen] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const noteRef = React.useRef<HTMLInputElement | null>(null);
  const logged = React.useRef<string>('');

  const current = rows[Math.min(idx, Math.max(rows.length - 1, 0))] || null;
  const strips = useStrips(current, notes);
  const extra = useExtraStrip(current);
  const groups = React.useMemo(
    () => (current ? notesForKibbutz(notes, current.name) : []), [notes, current]);
  const lastMeeting = groups.find(g => g.meeting_date < today) || null;
  const carry = React.useMemo(
    () => (current ? carryOverLine(notes, current.name, today) : null), [notes, current, today]);

  // ── the session row ────────────────────────────────────────────────────
  // Opened once, on mount. A failure is NOT fatal: the meeting has to run whether or not the
  // log can be written, so the screen works with `session === null` and simply logs nothing.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const row: MeetingSessionRow = {
        date: today,
        kind: meeting?.kind || 'company',
        host: me || null,
        started_at: new Date().toISOString(),
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

  // ── the timer ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    const t = window.setInterval(() => setSeconds(tSec(session?.started_at, new Date())), 1000);
    setSeconds(tSec(session?.started_at, new Date()));
    return () => window.clearInterval(t);
  }, [session?.started_at]);

  // ── the log ────────────────────────────────────────────────────────────
  const log = React.useCallback(async (kind: MeetingEventKind, payload: Record<string, unknown> = {}) => {
    if (!session?.id) return;
    const row = eventRow(session.id, session.started_at, kind, payload, new Date());
    try {
      const sb = await getSupabase();
      await sbWrite(() => sb.from('meeting_events').insert(row).select('id').single());
    } catch { /* the meeting matters more than its log */ }
  }, [session]);

  // Every arrival at a kibbutz is a segment boundary. Keyed so StrictMode's double render
  // cannot log the same arrival twice.
  React.useEffect(() => {
    if (!session?.id || !current) return;
    const key = session.id + '|' + idx + '|' + current.name;
    if (logged.current === key) return;
    logged.current = key;
    void log('kibbutz', { kibbutz: current.name });
  }, [session?.id, idx, current?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ────────────────────────────────────────────────────────────
  const move = React.useCallback((dir: number) => {
    setIdx(i => nextIndex(i, rows.length, dir));
  }, [rows.length]);

  const marker = React.useCallback(() => {
    void log('marker', { kibbutz: current?.name });
    track('presenter-marker');
    toast.success('📌 סומן');
  }, [log, current?.name]);

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
    if (session?.id) {
      try {
        const sb = await getSupabase();
        await sbWrite(() => sb.from('meeting_sessions')
          .update({ ended_at: new Date().toISOString() }).eq('id', session.id!).select('id').single());
      } catch { /* the screen closes either way */ }
    }
    track('presenter-close');
    void qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
    onClose();
  }, [session, qc, onClose]);

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
        setExitOpen(true);
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
        case ' ': e.preventDefault(); marker(); break;          // 📌 — the screen does not move
        case 'p': case 'P': case 'פ': e.preventDefault(); park(); break;   // …nor here (§1.2)
        case 'n': case 'N': case 'מ': e.preventDefault(); noteRef.current?.focus(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [liveOpen, exitOpen, move, marker, park, saveNote]);

  const n = rows.length;

  return (
    <div
      data-testid="presenter"
      role="dialog"
      aria-modal="true"
      aria-label="מצב ישיבה"
      dir="rtl"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-background p-4 sm:p-8"
    >
      {/* ── header: clock · counter · carry-over · 🎥 ─────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <span data-testid="presenter-timer" className="text-[22px] font-extrabold tabular-nums text-foreground">
          <bdi>{clockText(seconds)}</bdi>
        </span>
        <span data-testid="presenter-counter" className="text-[15px] font-extrabold text-muted-foreground">
          <bdi>{n ? Math.min(idx + 1, n) : 0} / {n}</bdi>
        </span>
        {carry && (
          <span data-testid="presenter-carry" className="text-[15px] font-bold text-[color:var(--warning)]">
            {carry}
          </span>
        )}
        <span className="flex-1" />
        {meeting?.meetLink && (
          <a
            href={meeting.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="presenter-meet"
            className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border px-3 text-[13px] font-extrabold text-foreground"
          >
            <Video size={15} aria-hidden /> Meet
          </a>
        )}
        <button
          type="button"
          data-testid="presenter-exit"
          onClick={() => setExitOpen(true)}
          aria-label="סגירה"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {/* ── the kibbutz ──────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col gap-4 py-5">
        {!current ? (
          <p className="text-[17px] text-muted-foreground">אין קיבוצים להצגה</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <h1
                data-testid="presenter-kibbutz"
                className="text-[34px] font-extrabold leading-tight text-foreground sm:text-[48px]"
              >
                <bdi>{labelOf(current)}</bdi>
              </h1>
              <button
                type="button"
                data-testid="presenter-edit"
                onClick={() => setLiveOpen(true)}
                aria-label="הוספת שורה"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-foreground"
              >
                <Pencil size={18} aria-hidden />
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Strip title="ניהולי" items={strips.admin} testid="presenter-strip-admin" />
              <Strip title="שטח ומערכת" items={strips.field} testid="presenter-strip-field" />
              <Strip title="מצב" items={extra} testid="presenter-strip-extra" />
            </div>

            <section data-testid="presenter-bullets" className="flex-1">
              {lastMeeting ? (
                <>
                  <h2 className="mb-1.5 text-[13px] font-extrabold text-muted-foreground">
                    <bdi>מהישיבה של {chipDate(lastMeeting.meeting_date)} · {ageText(lastMeeting.meeting_date, today)}</bdi>
                  </h2>
                  <ul className="flex flex-col gap-1.5">
                    {lastMeeting.bullets.map(b => (
                      <li
                        key={b.id || b.seq}
                        className={
                          'text-[17px] leading-snug sm:text-[20px] ' +
                          (b.done_at ? 'text-muted-foreground line-through' : 'text-foreground')
                        }
                      >
                        <bdi>{b.text}</bdi>
                        {(b.owners || []).length ? (
                          <span className="ms-2 text-[13px] text-muted-foreground">
                            <bdi>{(b.owners || []).join(' · ')}</bdi>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[17px] text-muted-foreground">אין בולטים קודמים</p>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── the always-visible quick note ─────────────────────────────────── */}
      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background pt-3">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="הקודם"
          className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
        <input
          ref={noteRef}
          data-testid="presenter-quicknote"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="שורה אחת, אם בא לך"
          aria-label="שורה אחת, אם בא לך"
          className="min-h-11 flex-1 rounded-xl border border-border bg-muted px-3 text-[15px] text-foreground outline-none focus:border-[color:var(--brand-1)]"
        />
        <button
          type="button"
          data-testid="presenter-marker"
          onClick={marker}
          className="inline-flex min-h-11 flex-none items-center gap-1 rounded-xl border border-border px-3 text-[13px] font-extrabold text-foreground"
        >
          <MapPin size={16} aria-hidden /> סמן רגע
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="הבא"
          className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
      </footer>

      <LiveSheet
        open={liveOpen}
        onOpenChange={setLiveOpen}
        kibbutz={current?.name || ''}
        session={session}
        notes={notes}
        onDone={() => void qc.invalidateQueries({ queryKey: NOTES_QUERY_KEY })}
      />

      <Sheet open={exitOpen} onOpenChange={setExitOpen}>
        <SheetContent side="bottom" data-testid="presenter-exit-sheet">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">לצאת ממצב ישיבה?</SheetTitle>
            <SheetDescription>מה שנרשם נשאר בכרטיסים</SheetDescription>
          </SheetHeader>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="presenter-exit-yes"
              onClick={() => void finish()}
              className="min-h-11 flex-1 rounded-xl bg-brand-grad px-4 text-[15px] font-extrabold text-white"
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
