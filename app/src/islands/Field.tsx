// #sigma-field + #sigma-today — the field worker's day (spec §5, decisions §7k 1/4/11/ג).
//
// ONE SCREEN (§7k #1): "לאיזה קיבוץ הגעת?" and the briefing are the same bottom sheet. Picking
// a kibbutz does not open a second surface — the sheet's content morphs in place (Motion
// `AnimatePresence`, 320 ms, the sheet keeps its identity), and the two sticky CTAs
// 📍 סיכום ביקור / 🚚 תעודת משלוח are already there when it does.
//
// What the briefing shows is decided by §5.1b: clean (no health, onboarding, billing, admin
// or office-tagged notes for the `field` role) but COMPLETE — it ends with "לפני שיוצאים",
// one checkbox per open item, and whatever he leaves unticked pre-fills "מה נשאר לי פתוח" in
// the visit form. Nothing he saw at the kibbutz is allowed to evaporate when he drives away.
//
// Every DECISION in here is pure and lives in app/src/lib/field.ts (goldens: field.test.ts);
// this file is the rendering shell, the writes and the wiring.
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import {
  AlarmClock, CalendarDays, Check, ChevronDown, ClipboardList, Download, Loader2, MapPin, Mic,
  Plus, Save, Search, Send, Square, Sun, Trash2, Truck, X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { isGateOpen, useEmsGate } from '@/lib/session';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, sigmaBus, useCurrentUser, useSigmaEvent, type EmsTask } from '@/bridge';
import { sortTasksForCard, statusLabel, taskMeta, type CardEmsTask } from '@/lib/emsTasks';
import { burnLeaveItems } from '@/lib/burns';
import { markBurned, useBurnAccess, useBurns } from '@/components/home/Burns';
import { notesForKibbutz, type NoteRow } from '@/lib/meetingNotes';
import { useMeetingNotes } from '@/components/home/MeetingNotes';
import { roleOf } from '@/lib/landing';
import { todayISO, useVisitDraft } from '@/lib/visitDrafts';
import {
  arrivalGroups, arrivalOrder, briefingAutoOpen, briefingTasks, bulletForField, burnRowsOf,
  burnSummary, dm, fieldShouldPrompt, hasSomethingToDeliver,
  hm, leaveChecklist, openItemsPrefill, openNudges, sharedOwners, todayStops,
  visitReasonRequired, visitReasonText, VISIT_REASONS,
  type ArrivalItem, type CheckinRow, type DraftRow, type FieldTask, type LeaveItem, type OrderRow,
  type VisitRow,
} from '@/lib/field';
import {
  CHAPTERS, canSubmit, draftAge, missingFields, openingVisitDate,
  type ChapterDraft, type ChapterId, type ReturnedItem,
} from '@/lib/visitDraft';
import { pickableProducts, productGroups, searchProducts } from '@/lib/productSearch';
import { parseDayLog, readCatalog } from '@/lib/daylogChain';
import { normalizeDayLog, type DayLogVisit } from '@/lib/daylog';
import { buildWhisperPrompt, speechCaps, startLive, startRecording, uploadAndTranscribe, type RecordSession } from '@/lib/speech';
import { runMutation } from '@/lib/pending';

// ───────────────────────────── keys & storage ─────────────────────────────

/** The bus event a new check-in announces (docs/integration-map.md). */
export const CHECKIN_CREATED = 'checkin-created';
/** The device's memory of today's arrival — what stops the sheet asking twice. */
export const CHECKIN_KEY = 'checkin_today';
/** The day he said he is not out in the field. */
export const NO_FIELD_KEY = 'field_no_visit_v1';
/** Round 2 · G6 — the date today's briefing was already opened on. One per day, no more. */
export const BRIEF_SHOWN_KEY = 'brief_shown_v1';
/** Is the "היום" strip folded? His choice, remembered (§7k #11). */
export const TODAY_FOLDED_KEY = 'sigma_today_folded_v1';
/**
 * The sheet arrived uninvited today already (fix round 1). Keyed BY CALENDAR DAY in
 * localStorage, not by browser session: a session latch meant a reload asked him again on the
 * same morning, and — worse — a phone that is never really closed would not ask him again the
 * NEXT day. A new date is a new key, so the prompt comes back exactly once a day.
 */
export const arrivalPromptKey = (day: string) => 'arrival_dismissed_' + day;

const readJson = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; }
  catch { return null; }
};
const writeJson = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};
const readStr = (key: string): string => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};

// ───────────────────────────── data ─────────────────────────────

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

async function fetchCheckins(person: string): Promise<CheckinRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('field_checkins').select('*')
    .eq('person', person).gte('checked_in_at', startOfToday()).order('checked_in_at');
  if (error) throw error;
  return (data || []) as CheckinRow[];
}

/**
 * Today's route. `day_plans` is the calendar task's table (§7f) and may not exist yet, so a
 * missing table is a normal answer here, not an error: the list simply falls back to the
 * task/visit ordering and the "היום" strip shows only where he checked in.
 */
async function fetchDayPlan(person: string, day: string): Promise<string[]> {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('day_plans').select('*').eq('person', person).eq('date', day);
    if (error) return [];
    const rows = (data || []) as Array<{ stops?: unknown; kibbutz?: string; seq?: number }>;
    const first = rows[0] as any;
    if (first && Array.isArray(first.stops)) {
      return (first.stops as any[]).map(s => String(typeof s === 'string' ? s : s?.kibbutz || '')).filter(Boolean);
    }
    return rows
      .filter(r => r && r.kibbutz)
      .sort((a, b) => (a.seq || 0) - (b.seq || 0))
      .map(r => String(r.kibbutz));
  } catch { return []; }
}

/** Statuses that mean an order is finished — nothing left to hand over. */
const CLOSED_ORDER_STATUS = ['delivered', 'cancelled', 'canceled', 'done'];
const ORDER_PAGE = 500;

/**
 * Open CUSTOMER orders — what makes 🚚 meaningful and what the checklist lists as stock to
 * take with him. Filtered SERVER-SIDE (fix round 1): the old flat 300-row cap silently dropped
 * the oldest open order once the table grew, which on this screen reads as "there is nothing
 * to deliver" — the one answer that must never be a guess. Paged until the server stops
 * sending, with a hard ceiling so a runaway table cannot spin the phone.
 */
async function fetchOpenOrders(): Promise<OrderRow[]> {
  try {
    const sb = await getSupabase();
    const out: OrderRow[] = [];
    for (let page = 0; page < 20; page++) {
      const { data, error } = await sb.from('orders').select('*')
        .not('status', 'in', '(' + CLOSED_ORDER_STATUS.join(',') + ')')
        .order('id')
        .range(page * ORDER_PAGE, page * ORDER_PAGE + ORDER_PAGE - 1);
      if (error) return out;
      const rows = (data || []) as OrderRow[];
      out.push(...rows);
      if (rows.length < ORDER_PAGE) break;
    }
    return out;
  } catch { return []; }
}

async function fetchKibbutzNames(): Promise<Array<{ name: string; display_name?: string | null }>> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('kibbutzim').select('*').is('archived_at', null);
  if (error) throw error;
  return (data || []) as Array<{ name: string; display_name?: string | null }>;
}

function useVisits(): VisitRow[] {
  const read = React.useCallback((): VisitRow[] => {
    try { return (sigma?.loadAllVisitsCombined?.() as VisitRow[]) || []; } catch { return []; }
  }, []);
  const [rows, setRows] = React.useState<VisitRow[]>(read);
  useSigmaEvent('visit-saved', () => setRows(read()));
  useSigmaEvent('user-changed', () => setRows(read()));
  return rows;
}

/** Every open EMS task of mine, resolved to its kibbutz through the legacy site map. */
function useMyTasksByKibbutz(names: string[], me: string): FieldTask[] {
  const read = React.useCallback((): FieldTask[] => {
    const out: FieldTask[] = [];
    for (const name of names) {
      let tasks: EmsTask[] = [];
      try { tasks = (sigma?.emsCacheTasksForKibbutz?.(name) as EmsTask[]) || []; } catch { tasks = []; }
      for (const t of tasks) {
        const who = t.assignee ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(' ') : '';
        if (me && !who.includes(me)) continue;
        out.push({ ...(t as any), kibbutz: name });
      }
    }
    return out;
  }, [names.join('|'), me]);
  const [tasks, setTasks] = React.useState<FieldTask[]>(read);
  React.useEffect(() => { setTasks(read()); }, [read]);
  useSigmaEvent('ems-cache-synced', () => setTasks(read()));
  return tasks;
}

// ───────────────────────────── the arrival list ─────────────────────────────

function ArrivalRow({ item, onPick }: { item: ArrivalItem; onPick: (name: string) => void }) {
  return (
    <button
      type="button"
      data-kibbutz={item.name}
      onClick={() => onPick(item.name)}
      // `.kb` in the mockup: 60 px tall, radius 14, the muted surface, the count as a
      // gradient pill. A thumb in a kibbutz gateway does not aim well.
      className="mb-2 flex min-h-[60px] w-full items-center gap-2.5 rounded-[14px] border border-border bg-muted px-3.5 py-3 text-start transition-transform active:scale-[.98]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold text-foreground">{item.name}</span>
        {item.why && <span className="mt-0.5 block truncate text-[12px] font-medium text-muted-foreground">{item.why}</span>}
      </span>
      {item.count > 0 && (
        <span className="shrink-0 rounded-full bg-brand-grad px-2.5 py-[3px] text-[12px] font-bold text-white">
          {item.count}
        </span>
      )}
    </button>
  );
}

function Arrival({
  items, loading, query, onQuery, onPick, onSkip, onStraightToVisit, date, onDate,
}: {
  items: ArrivalItem[];
  loading: boolean;
  query: string;
  onQuery: (q: string) => void;
  onPick: (name: string) => void;
  onSkip: () => void;
  onStraightToVisit: () => void;
  date: string;
  onDate: (d: string) => void;
}) {
  const groups = React.useMemo(() => arrivalGroups(items), [items]);
  return (
    <div className="px-4 pb-6">
      <SheetTitle className="text-[22px] font-extrabold tracking-[-.01em]">לאיזה קיבוץ הגעת?</SheetTitle>
      <SheetDescription className="mb-3 mt-1 text-[13px] text-muted-foreground">
        נכין לך את כל מה שקורה שם: משימות, סיכום הישיבה וביקור קודם.
      </SheetDescription>

      {/* Round 4 · Package Z, item 3: עידן — "היה פעם בחירת תאריכים ואז גישה לקיבוץ".
          The day comes first, because a summary typed at night belongs to the day of the
          visit. It rides into the chapters draft and from there into `visits.date`. */}
      <label className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5">
        <span className="shrink-0 text-[13px] font-bold text-muted-foreground">תאריך הביקור</span>
        <input
          type="date"
          value={date}
          data-testid="arrival-date"
          onChange={e => onDate(e.target.value)}
          aria-label="תאריך הביקור"
          className="min-w-0 flex-1 bg-transparent text-start text-[15px] font-semibold text-foreground outline-none"
        />
      </label>

      <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="חפש קיבוץ…"
          aria-label="חפש קיבוץ"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </div>

      {loading && !items.length && (
        // §7k #10: paint from cache first; a skeleton only when there is no cache at all.
        <div className="mt-2 grid gap-2" data-testid="arrival-skeleton">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[60px] rounded-[14px]" />)}
        </div>
      )}

      {groups.map(g => (
        <div key={g.group}>
          <div className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-[.03em] text-muted-foreground">
            {g.label}
          </div>
          {g.items.map(it => <ArrivalRow key={it.name} item={it} onPick={onPick} />)}
        </div>
      ))}

      {!loading && !items.length && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">אין קיבוץ שמתאים לחיפוש.</p>
      )}

      <button
        type="button"
        onClick={onStraightToVisit}
        className="mt-1 w-full py-2 text-center text-[13.5px] font-bold text-[color:var(--sigma-ink)]"
      >
        ישר לסיכום ביקור →
      </button>
      <button
        type="button"
        onClick={onSkip}
        // The thin-bordered secondary: an opt-out should be reachable, never inviting.
        className="mt-1.5 min-h-[48px] w-full rounded-xl border border-border bg-transparent text-[14px] font-semibold text-muted-foreground"
      >
        לא בקיבוץ היום
      </button>
    </div>
  );
}

// ───────────────────────────── the briefing ─────────────────────────────

function BriefSection({ title, badge, children }: { title: React.ReactNode; badge?: string; children: React.ReactNode }) {
  return (
    <section className="mx-3 mt-3.5">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold tracking-[.02em] text-muted-foreground">
        {title}
        {badge && <span className="rounded-full bg-primary/10 px-2 py-[3px] text-[11px] font-semibold text-foreground">{badge}</span>}
      </h3>
      {children}
    </section>
  );
}

function TaskRow({ task, mine }: { task: CardEmsTask; mine: boolean }) {
  const meta = taskMeta(task);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => sigma.openKibbutzEmsTask(task.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sigma.openKibbutzEmsTask(task.id); } }}
      className="flex cursor-pointer flex-col gap-0.5 border-t border-border py-[7px] first:border-t-0 first:pt-0"
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={'inline-block h-2 w-2 shrink-0 rounded-full ' + (meta.overdue ? 'bg-destructive' : 'bg-muted-foreground')} />
        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-foreground">{task.title}</span>
        {mine && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold">באחריותך</span>}
      </div>
      {/* The briefing NEVER clamps (§7k #2): he is standing at the kibbutz reading it. */}
      {task.description && (
        <p className="my-[3px] whitespace-pre-line text-[14px] leading-[1.55] text-muted-foreground">{task.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground [&>span]:rounded-md [&>span]:border [&>span]:border-border [&>span]:bg-card [&>span]:px-1.5 [&>span]:py-px">
        {meta.due && <span className={meta.overdue ? 'font-semibold text-destructive' : ''}>{meta.overdue ? '⏰' : '📅'} <bdi>{meta.due}</bdi></span>}
        <span>{statusLabel(task.status)}</span>
      </div>
    </div>
  );
}

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-[14px] border border-border bg-card p-3">{children}</div>
);

/**
 * ══════ ROUND 2 · PACKAGE G — BRIEFING REGION (start) ══════
 * Everything between this marker and the one below belongs to Package G (calendar +
 * briefing). Package C owns the visit FORM further down the same file.
 *
 * G6 — one checklist row, so the open list and the collapsed 🔥 category render identically.
 */
function LeaveRow({ item, on, onToggle }: { item: LeaveItem; on: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(item.id)}
      data-leave-item={item.id}
      className="flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-start"
    >
      <span
        aria-hidden
        className={'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border-2 ' +
          (on ? 'border-transparent bg-brand-grad text-white' : 'border-border')}
      >
        {on && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={'block text-[14.5px] font-semibold ' + (on ? 'text-muted-foreground line-through' : '')}>{item.text}</span>
        <span className="block text-[12px] font-medium text-muted-foreground">{item.sub}</span>
      </span>
    </button>
  );
}

/**
 * G6 — 🔥 צריבות is a CATEGORY, collapsed, with a summary line. Thirty meter serials are a
 * project, not a checklist: they pushed the kibbutz's own work off the screen. The line says
 * how many are left, so it is still answerable without opening it.
 */
function BurnCategory({
  items, checked, onToggle,
}: { items: LeaveItem[]; checked: Record<string, boolean>; onToggle: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  if (!items.length) return null;
  return (
    <section className="mt-2 rounded-xl border border-border bg-card" data-testid="brief-burns">
      <button
        type="button"
        aria-expanded={open}
        data-testid="brief-burns-toggle"
        onClick={() => setOpen(v => !v)}
        className="flex min-h-[48px] w-full items-center gap-2 px-3 py-2 text-start"
      >
        <span className="text-[14.5px] font-bold">🔥 צריבות</span>
        <span className="text-[12px] font-medium text-muted-foreground" data-testid="brief-burns-summary">
          {burnSummary(items, checked)}
        </span>
        <ChevronDown className={'ms-auto h-4 w-4 text-muted-foreground transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-2 pb-2">
          {items.map(item => <LeaveRow key={item.id} item={item} on={!!checked[item.id]} onToggle={onToggle} />)}
        </div>
      )}
    </section>
  );
}

function Briefing({
  kibbutz, checkinAt, tasks, notes, prevVisit, checklist, checked, onToggle, canDeliver, onVisit, onCert,
}: {
  kibbutz: string;
  checkinAt: string | null;
  tasks: CardEmsTask[];
  notes: NoteRow[];
  prevVisit: VisitRow | null;
  checklist: LeaveItem[];
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  canDeliver: boolean;
  onVisit: () => void;
  onCert: () => void;
}) {
  const mineIds = new Set(checklist.filter(x => x.kind === 'task' && x.mine).map(x => x.id.slice(5)));
  const openCount = checklist.filter(x => !checked[x.id]).length;
  // G6 — the 🔥 rows leave the flat list and become their own collapsed category.
  const burnItems = burnRowsOf(checklist);
  const plainItems = checklist.filter(x => x.kind !== 'burn');
  const latest = notes[0];

  return (
    <div className="flex max-h-[inherit] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-[104px]">
        {/* the one brand-gradient touchpoint on this screen (§6) */}
        <div className="rounded-b-[28px] bg-brand-grad px-4 pb-[18px] pt-3 text-white">
          <div className="text-[12px] font-semibold opacity-85">📍 הגעת ל־</div>
          <h2 className="text-[26px] font-extrabold tracking-[-.01em]">{kibbutz}</h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {checkinAt && (
              <span className="rounded-full bg-white/20 px-2.5 py-[5px] text-[12px] font-semibold">
                🕘 צ׳ק-אין <bdi>{hm(checkinAt)}</bdi>
              </span>
            )}
          </div>
        </div>

        {!!tasks.length && (
          <BriefSection title={<><ClipboardList className="h-3.5 w-3.5" /> המשימות שלך כאן</>} badge={String(tasks.length)}>
            <Panel>{tasks.map(t => <TaskRow key={t.id} task={t} mine={mineIds.has(String(t.id))} />)}</Panel>
          </BriefSection>
        )}

        {latest && (
          <BriefSection title={<><CalendarDays className="h-3.5 w-3.5" /> {`ישיבה ${dm(latest.meeting_date)}`}</>}>
            <Panel>
              {notes.slice(0, 6).map(n => (
                <div key={n.id || n.text} className="flex items-start gap-2 py-[5px] text-[14.5px] leading-[1.55]">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span className="flex-1">{n.text}</span>
                </div>
              ))}
            </Panel>
          </BriefSection>
        )}

        {!!checklist.length && (
          <BriefSection title={<><Check className="h-3.5 w-3.5" /> לפני שיוצאים</>} badge={openCount + ' פתוחים'}>
            <div className="flex flex-col gap-1.5">
              {plainItems.map(item => <LeaveRow key={item.id} item={item} on={!!checked[item.id]} onToggle={onToggle} />)}
            </div>
            <BurnCategory items={burnItems} checked={checked} onToggle={onToggle} />
          </BriefSection>
        )}

        {prevVisit && (
          <BriefSection title={<><MapPin className="h-3.5 w-3.5" /> {`ביקור קודם · ${dm(prevVisit.date)}${prevVisit.visitor ? ' · ' + prevVisit.visitor : ''}`}</>}>
            <div className="rounded-[14px] border border-border bg-card p-3 text-[13.5px] leading-[1.55]">
              {prevVisit.summary && <p className="whitespace-pre-line">{prevVisit.summary}</p>}
              {prevVisit.open_items && (
                <p className="mt-2 rounded-[10px] border-s-[3px] border-[color:var(--sigma-warn)] bg-[color:var(--sigma-warn)]/10 px-2.5 py-2 text-[13px]">
                  <b className="block text-[12px] text-[color:var(--sigma-warn-ink)]">נשאר פתוח</b>
                  <span className="whitespace-pre-line">{prevVisit.open_items}</span>
                </p>
              )}
            </div>
          </BriefSection>
        )}

        {!tasks.length && !latest && !checklist.length && !prevVisit && (
          <p className="mx-3 mt-6 text-center text-[13.5px] text-muted-foreground">
            אין כאן שום דבר פתוח, יום נקי. תכתוב מה עשית וזהו.
          </p>
        )}
      </div>

      {/* the two CTAs, always reachable — the whole point of the one-screen decision */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex gap-2 bg-gradient-to-t from-background from-70% to-transparent px-3 pb-5 pt-2.5">
        <ShimmerButton
          onClick={onVisit}
          data-testid="brief-visit"
          // The brand gradient token, not a near-miss of it (audit B · F-15).
          background="var(--brand-grad)"
          className="pointer-events-auto min-h-[58px] flex-1 rounded-xl text-[16px] font-extrabold text-white shadow-[0_10px_24px_color-mix(in_srgb,var(--brand-1)_45%,transparent)]"
        >
          <MapPin className="h-[22px] w-[22px]" /> סיכום ביקור
        </ShimmerButton>
        {/* "no button without purpose": 🚚 only when there IS something to hand over */}
        {canDeliver && (
          <ShimmerButton
            onClick={onCert}
            data-testid="brief-cert"
            shimmerColor="rgba(255,255,255,.25)"
            className="pointer-events-auto min-h-[58px] flex-1 rounded-xl bg-foreground text-[16px] font-extrabold text-background"
          >
            <Truck className="h-[22px] w-[22px]" /> תעודת משלוח
          </ShimmerButton>
        )}
      </div>
    </div>
  );
}

// ══════ ROUND 2 · PACKAGE G — BRIEFING REGION (end) ══════

// ─────────────────── the visit summary, in chapters (§7p) ───────────────────
//
// The old summary was one long form with one save at the end, so an interruption — and in
// the field there is always one — cost the whole thing. §7p cut it into five short chapters.
// Ruling 22.9 evening (עידן): "את סיכום הביקור אני לא רוצה בהמשכים אני רוצה בגלילה" — so the
// chapters are no longer turned one at a time. They are STACKED, in order, in one scrolling
// sheet: 🎙 at the top, then מה עשיתי down to שליחה, and a chapter that is not part of this
// visit (🚚 with nothing to hand over) is simply not there.
//
// **שמור וסגור** is still the whole draft and nothing else (no visit, no stock movement, no
// certificate, no EMS comment); **שלח** sits at the bottom and is the only thing that files.
//
// Every rule is pure and lives in app/src/lib/visitDraft.ts (goldens: visitDraft.test.ts).
// The draft itself is the LEGACY store (js/src/09-visits.js): same table, same mirror, same
// (person, kibbutz, date) key, so a chapters draft and a form draft are one kind of thing.

/** What the opener may ask for. */
export interface VisitChaptersOpen {
  chapter?: ChapterId;
  openItems?: string;
  /**
   * Round 4 · Package Z, item 3: the day the visit HAPPENED, picked on the arrival sheet.
   * A visit written up in the evening, or the next morning, is the normal case — so the day
   * is asked before the kibbutz list, not guessed from the clock at write-up time.
   */
  date?: string;
}

/** The global the other islands (the strip's nudge, gaps, the push deep link) call. */
export const VISIT_CHAPTERS_API = 'sigmaVisitChapters';

/** Is there anything in here worth keeping? Decides whether a stray tap is allowed to close. */
function chapterDraftHasContent(d: ChapterDraft): boolean {
  return !!(String(d.summary || '').trim() || String(d.openItems || '').trim()
    || String(d.productsOther || '').trim() || String(d.contact || '').trim()
    || (d.products || []).length || d.duration || d.workday);
}

/**
 * One labelled field. `required` prints the red star §C3 asks for, and `miss` is the IN-PLACE
 * red mark the save puts on it — a frame plus the word חובה, right where the answer is missing,
 * instead of a toast that says "חסרים פרטים" and leaves him hunting.
 */
const Field2 = ({ label, name, required, miss, children }: {
  label: string; name?: string; required?: boolean; miss?: boolean; children: React.ReactNode;
}) => (
  <label className="block scroll-mt-4" id={name ? 'vc-field-' + name : undefined} data-req={required ? '1' : undefined}>
    <span className="mb-1 block text-[12.5px] font-bold text-muted-foreground">
      {label}
      {required && <span className="text-[color:var(--priority)]"> *</span>}
      {miss && <span data-testid="vc-miss" className="font-extrabold text-[color:var(--priority)]"> · חובה</span>}
    </span>
    <div className={miss ? 'rounded-xl outline outline-2 outline-offset-2 outline-[color:var(--priority)]' : ''}>
      {children}
    </div>
  </label>
);

const AREA =
  'min-h-[132px] w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-[15px] leading-[1.6] outline-none placeholder:text-muted-foreground focus:border-[color:var(--brand-1)]';
const LINE =
  'min-h-[44px] w-full rounded-xl border border-border bg-muted px-3 text-[15px] outline-none focus:border-[color:var(--brand-1)]';
const CHIP_ON = 'border-transparent bg-brand-grad text-white';
const CHIP_OFF = 'border-border bg-muted text-foreground';

/** The quick hours chips — the same five the legacy form offers, spelled the same way. */
const HOUR_CHIPS = [0.5, 1, 2, 3, 4];

/**
 * One chapter of the scrolling summary. There is no stepper any more: every chapter is on
 * screen, under its own heading, in §7p's order. `name` is the anchor a failed שלח scrolls
 * to, and `miss` prints the same in-place red mark `Field2` does.
 */
const Chapter = ({ id, name, required, miss, children }: {
  id: ChapterId; name?: string; required?: boolean; miss?: boolean; children: React.ReactNode;
}) => (
  <section
    id={name ? 'vc-field-' + name : undefined}
    data-testid={'vc-chapter-' + id}
    className="scroll-mt-4"
  >
    <h3 className="mb-1.5 text-[15px] font-extrabold">
      {CHAPTERS.find(c => c.id === id)?.title}
      {required && <span className="text-[color:var(--priority)]"> *</span>}
      {miss && <span data-testid="vc-miss" className="text-[color:var(--priority)]"> · חובה</span>}
    </h3>
    <div className={miss ? 'rounded-xl outline outline-2 outline-offset-2 outline-[color:var(--priority)]' : ''}>
      {children}
    </div>
  </section>
);

// ───────────────────── C4 · מוצרים נוספים, searched by keyword ─────────────────────
//
// ── ציוד שסופק: the 3-column tile grid (QA round 3, J2) ──────────────────────────────────
//
// Parity with the legacy form (`renderProductsForVisitor` + `tileTap` in js/src/09-visits.js),
// which round 1 built only there: products are grouped by category ('מונים' first), each group
// is a 3-column grid of tiles in a-b-c order, one tap sets qty 1 and opens −/+/🗑 ON the tile
// for ~3 s, and after that the tile falls back to the quiet name + count.

const TILE_EDIT_MS = 3000;

function ProductTiles({ groups, stock, qtyOf, setQty }: {
  groups: Array<{ category: string; names: string[] }>;
  stock: Record<string, number>;
  qtyOf: (name: string) => number;
  setQty: (name: string, qty: number) => void;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // The stepper closes itself, and the timer never outlives the sheet.
  const hold = React.useCallback((name: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    setEditing(name);
    if (name) timer.current = setTimeout(() => setEditing(null), TILE_EDIT_MS);
  }, []);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const tap = (name: string) => {
    // First tap picks ONE. A tap on an already-picked tile only re-opens the stepper, so a
    // thumb landing twice never silently doubles the quantity.
    if (qtyOf(name) < 1) setQty(name, 1);
    hold(editing === name ? null : name);
  };
  const step = (name: string, d: number) => {
    const max = stock[name] ?? Infinity;
    const next = Math.max(0, Math.min(qtyOf(name) + d, max));
    setQty(name, next);
    hold(next > 0 ? name : null);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="vc-tiles">
      {groups.map(g => (
        <div key={g.category}>
          <div className="mb-1.5 text-[12px] font-bold text-muted-foreground" data-tile-head={g.category}>
            {g.category}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {g.names.map(name => {
              const q = qtyOf(name);
              const out = (stock[name] || 0) === 0 && q === 0;
              const open = editing === name;
              return (
                <button
                  key={name}
                  type="button"
                  data-product={name}
                  data-qty={q || undefined}
                  data-editing={open ? '1' : undefined}
                  onClick={() => tap(name)}
                  className={
                    'relative flex min-h-[64px] flex-col justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center '
                    + (q > 0 ? 'border-[color:var(--brand-1)] bg-primary/10 ' : 'border-border bg-card ')
                    + (out ? 'opacity-55 ' : '')
                  }
                >
                  <span className="line-clamp-2 text-[12.5px] font-bold leading-[1.25]"><bdi>{name}</bdi></span>
                  {open ? (
                    <span className="mt-0.5 flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                      <span role="button" aria-label={'פחות: ' + name} data-step="-"
                            onClick={() => step(name, -1)}
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-border bg-muted text-[15px] font-bold">−</span>
                      <bdi className="min-w-[16px] text-[13px] font-extrabold">{q}</bdi>
                      <span role="button" aria-label={'עוד: ' + name} data-step="+"
                            onClick={() => step(name, 1)}
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-border bg-muted text-[15px] font-bold">+</span>
                      <span role="button" aria-label={'הסר: ' + name} data-step="del"
                            onClick={() => { setQty(name, 0); hold(null); }}
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-border bg-muted text-[13px]">🗑</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {q > 0 ? <b className="text-[12.5px] text-foreground"><bdi>{q}</bdi></b> : <>במלאי <bdi>{stock[name] || 0}</bdi></>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// The old field was a `<datalist>` matching a PREFIX of the exact catalog spelling, so "לנדיס"
// and "360" found nothing and the product was typed as free text, where the stock ledger never
// sees it. The rule is `@/lib/productSearch`; this is only its surface: one hit is offered as
// one chip, several are offered as several, and nothing at all still lets him write free text.

function ProductSearch({ catalog, onPick, freeText, onFreeText }: {
  catalog: string[];
  onPick: (name: string) => void;
  freeText: string;
  onFreeText: (v: string) => void;
}) {
  const [q, setQ] = React.useState('');
  const res = React.useMemo(() => searchProducts(q, catalog), [q, catalog]);
  const typed = q.trim();
  const take = (name: string) => { onPick(name); setQ(''); };

  return (
    <div className="flex flex-col gap-2">
      <Field2 label="מוצרים נוספים">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            data-testid="vc-product-search"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && res.picked) { e.preventDefault(); take(res.picked); } }}
            placeholder="לנדיס, 360, em133…"
            aria-label="חפש מוצר בקטלוג"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {!!q && (
            <button type="button" aria-label="נקה חיפוש" onClick={() => setQ('')} className="shrink-0 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </Field2>

      {!!typed && !!res.hits.length && (
        <div className="flex flex-wrap gap-1.5" data-testid="vc-product-hits">
          {res.hits.map(name => (
            <button
              key={name}
              type="button"
              data-product-hit={name}
              onClick={() => take(name)}
              className={'min-h-[38px] flex-none rounded-xl border px-3 text-[13.5px] font-bold ' +
                (res.picked === name ? CHIP_ON : CHIP_OFF)}
            >
              <bdi>{name}</bdi>
            </button>
          ))}
          {res.needsPick && (
            <span className="w-full text-[12px] font-semibold text-muted-foreground">
              יש כמה כאלה. בחר איזה מהם.
            </span>
          )}
        </div>
      )}

      {typed.length >= 2 && !res.hits.length && (
        <button
          type="button"
          data-testid="vc-product-freetext"
          onClick={() => { onFreeText(freeText ? freeText + ', ' + typed : typed); setQ(''); }}
          className="min-h-[42px] rounded-xl border border-dashed border-border bg-transparent px-3 text-[13.5px] font-bold text-muted-foreground"
        >
          זה לא בקטלוג. רשום כטקסט: <bdi>{typed}</bdi>
        </button>
      )}

      {!!freeText && (
        <Field2 label="משהו אחר שהשארת">
          <input
            data-testid="vc-products-other"
            value={freeText}
            onChange={e => onFreeText(e.target.value)}
            placeholder="כבל, מתאם…"
            className={LINE}
          />
        </Field2>
      )}
    </div>
  );
}

// ───────────────────── C5 · 🔧 ציוד שהוחזר מהקיבוץ ─────────────────────
// Collapsed by default (it is the rare case), a ➕ adds a row, and a row is ONE clean line at
// 360 px: name takes what is left, quantity is 56 px, the bin is 36 px. Nothing clips.

function ReturnedItems({ rows, onChange }: {
  rows: ReturnedItem[]; onChange: (rows: ReturnedItem[]) => void;
}) {
  const [open, setOpen] = React.useState(rows.length > 0);
  const patch = (i: number, p: Partial<ReturnedItem>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="rounded-xl border border-border bg-muted/40">
      <button
        type="button"
        data-testid="vc-returned-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-[13.5px] font-bold"
      >
        <span className="flex-1 text-start">🔧 ציוד שהוחזר מהקיבוץ</span>
        {!!rows.length && <span className="rounded-full bg-brand-grad px-2 py-px text-[11px] text-white">{rows.length}</span>}
        <ChevronDown className={'h-4 w-4 text-muted-foreground transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          <p className="text-[12px] text-muted-foreground">פריטים שלקחת בחזרה. בניהול המלאי תחליט מה תקין ומה תקול.</p>
          {rows.map((r, i) => (
            <div key={i} data-testid="vc-returned-row" className="flex items-center gap-1.5">
              <input
                value={r.name}
                onChange={e => patch(i, { name: e.target.value })}
                placeholder="מה הוחזר"
                aria-label={'פריט שהוחזר ' + (i + 1)}
                className="h-[42px] min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 text-[14px] outline-none"
              />
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={r.qty || ''}
                onChange={e => patch(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                aria-label={'כמות שהוחזרה ' + (i + 1)}
                className="h-[42px] w-[56px] flex-none rounded-xl border border-border bg-background text-center text-[14px] outline-none"
              />
              <button
                type="button"
                aria-label={'הסר פריט שהוחזר ' + (i + 1)}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="grid h-[42px] w-[36px] flex-none place-items-center rounded-xl border border-border text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid="vc-returned-add"
            onClick={() => { setOpen(true); onChange([...rows, { name: '', qty: 1 }]); }}
            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[13.5px] font-bold text-muted-foreground"
          >
            <Plus className="h-4 w-4" /> הוסף פריט
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────── C8 · 🎙 הקלט סיכום ביקור (ניסיוני) ─────────────────────
//
// The SAME chain יומן היום runs (`@/lib/daylogChain`): dictate or paste, one `parse-daylog`
// call, and the answer drops into the fields — every one of which stays editable, because the
// model drafts and the person signs. No new provider, no second cost path.

const VOICE_TIPS = [
  'דבר קרוב לטלפון, משפט אחד על כל דבר שעשית.',
  'תגיד את שם הקיבוץ, את המוצרים ואת הכמויות בקול.',
  'אפשר גם להדביק טקסט מווטסאפ במקום להקליט.',
];

function VoiceIntake({ kibbutz, busy, onFill }: {
  kibbutz: string;
  busy: boolean;
  onFill: (v: DayLogVisit, rawLen: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [listening, setListening] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const live = React.useRef<{ stop: () => void } | null>(null);
  const rec = React.useRef<RecordSession | null>(null);
  // What was in the box BEFORE the current live session started — kept exactly as typed, so a
  // live update (which replaces the SESSION'S OWN contribution, never appends) can glue its
  // rebuilt transcript back onto it. `liveFinal` is that session's finalised text so far.
  const sessionPrefix = React.useRef('');
  const liveFinal = React.useRef('');

  const append = (chunk: string) => {
    const t = String(chunk || '').trim();
    if (!t) return;
    setText(prev => (prev ? prev.replace(/\s+$/, '') + ' ' + t : t));
  };

  // REPLACES the box with prefix + sessionText (never appends) — this is what fixes the
  // Android duplication bug (round 3, עידן's S24): `startLive` now hands back the whole
  // session transcript on every event instead of a delta, so gluing it on top of the
  // untouched prefix is the only thing that must happen here.
  const applyLive = (sessionText: string) => {
    const prefix = sessionPrefix.current.replace(/\s+$/, '');
    setText(sessionText ? (prefix ? prefix + ' ' + sessionText : sessionText) : prefix);
  };

  const startVoice = async () => {
    const caps = speechCaps();
    setListening(true);
    if (caps.speechRecognition && !caps.forceOffLive) {
      sessionPrefix.current = text;
      liveFinal.current = '';
      live.current = startLive({
        onFinal: full => { liveFinal.current = full; applyLive(full); },
        // Shown live too now (round 3) — replaced on every event, glued after whatever is
        // already finalised THIS session, same as the box shows while typing.
        onInterim: interim => applyLive(interim ? (liveFinal.current ? liveFinal.current + ' ' + interim : interim) : liveFinal.current),
        onError: () => { setListening(false); live.current = null; toast.error('ההקלטה נכשלה. אפשר להקליד'); },
        onEnd: () => { setListening(false); live.current = null; },
      });
      if (live.current) return;
    }
    if (!caps.mediaRecorder) { setListening(false); toast.error('הדפדפן הזה לא תומך בהקלטה. אפשר להקליד'); return; }
    rec.current = await startRecording({
      onError: () => { setListening(false); rec.current = null; toast.error('אין הרשאה למיקרופון. אפשר להקליד'); },
    });
    if (!rec.current) setListening(false);
  };

  const stopVoice = async () => {
    setListening(false);
    if (live.current) { live.current.stop(); live.current = null; return; }
    const session = rec.current;
    rec.current = null;
    if (!session) return;
    setWorking(true);
    try {
      const audio = await session.stop();
      if (audio) {
        const names = (() => { try { return sigma.kibbutzNames?.() || []; } catch { return []; } })();
        const hint = buildWhisperPrompt(kibbutz, names);
        append((await uploadAndTranscribe(audio, hint)).text);
      }
    } catch (e: any) {
      toast.error(String(e?.message || 'התמלול נכשל. אפשר להקליד'));
    } finally { setWorking(false); }
  };

  /**
   * Analyse. The chain answers with DAYS, so the visit for THIS kibbutz is preferred and the
   * first one is the fallback — never a silent merge of two kibbutzim into one summary.
   */
  const analyse = async () => {
    const raw = text.trim();
    if (!raw) { toast.error('אין מה לנתח. תקליט או תדביק טקסט'); return; }
    setWorking(true);
    try {
      const catalog = readCatalog();
      const res = normalizeDayLog(await parseDayLog(raw, catalog), catalog);
      const v = res.visits.find(x => x.kibbutz === kibbutz) || res.visits[0];
      if (!v) { toast.error('לא הצלחתי להוציא מזה סיכום. אפשר לכתוב ידנית'); return; }
      onFill(v, raw.length);
      toast.success('מילאתי מה שהבנתי. תעבור על הכל.');
      setOpen(false);
    } catch (e: any) {
      if (String(e?.message) !== 'CANCELLED') toast.error(String(e?.message || 'הניתוח נכשל'));
    } finally { setWorking(false); }
  };

  return (
    <div className="mx-4 mb-2 rounded-xl border border-border bg-muted/40" data-testid="vc-voice">
      <button
        type="button"
        data-testid="vc-voice-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-[13.5px] font-bold"
      >
        <Mic className="h-4 w-4 text-[color:var(--brand-1)]" />
        <span className="flex-1 text-start">🎙 הקלט סיכום ביקור</span>
        <span className="rounded-full border border-border px-2 py-px text-[10.5px] font-bold text-muted-foreground">ניסיוני</span>
        <ChevronDown className={'h-4 w-4 text-muted-foreground transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <ul className="list-inside list-disc text-[12px] leading-[1.6] text-muted-foreground">
            {VOICE_TIPS.map(t => <li key={t}>{t}</li>)}
          </ul>
          <textarea
            data-testid="vc-voice-text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="מה שתקליט יופיע כאן, ואפשר גם להדביק טקסט."
            className="min-h-[92px] w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14.5px] leading-[1.55] outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="vc-voice-mic"
              disabled={busy || working}
              onClick={() => (listening ? void stopVoice() : void startVoice())}
              className={'flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl border text-[14px] font-extrabold disabled:opacity-50 ' +
                (listening ? 'border-transparent bg-[color:var(--priority)] text-white' : CHIP_OFF)}
            >
              {listening ? <><Square className="h-4 w-4" /> עצור</> : <><Mic className="h-4 w-4" /> הקלט</>}
            </button>
            <button
              type="button"
              data-testid="vc-voice-analyse"
              disabled={working || !text.trim()}
              onClick={() => void analyse()}
              className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-grad text-[14px] font-extrabold text-white disabled:opacity-50"
            >
              {working ? <><Loader2 className="h-4 w-4 animate-spin" /> מנתח…</> : 'מלא את הסיכום'}
            </button>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            כל שדה נשאר לעריכה. מה שתתקן נשמר ומשפר את הפעם הבאה.
          </p>
        </div>
      )}
    </div>
  );
}

// ───────────────────── C6 · לאיזו משימה זה שייך ─────────────────────
//
// NEVER preselected (round 1 picked the first open task for him, and a wrong task got the
// comment). The kibbutz's open EMS tasks and the open internal tasks of everyone in
// `sharedOwners(me)` are one multi-select list; the summary is posted as a comment to EVERY
// selected EMS task, and every selected internal task is marked done. Selecting NOTHING is a
// legitimate answer — and then סיבת הביקור is required instead.

interface InternalRow { id: string; title: string; owner?: string | null; kibbutz?: string | null; done?: boolean }

function PickRow({ on, title, sub, onToggle, testid }: {
  on: boolean; title: string; sub?: string; onToggle: () => void; testid: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={on}
      onClick={onToggle}
      className="flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-start"
    >
      <span
        aria-hidden
        className={'grid h-[20px] w-[20px] shrink-0 place-items-center rounded-[6px] border-2 ' +
          (on ? 'border-transparent bg-brand-grad text-white' : 'border-border')}
      >
        {on && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{title}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}
async function fetchInternalOpen(owners: string[]): Promise<InternalRow[]> {
  if (!owners.length) return [];
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('internal_tasks').select('*').eq('done', false);
    if (error) return [];
    return ((data || []) as InternalRow[]).filter(r => owners.includes(String(r.owner || '')));
  } catch { return []; }
}

const OPEN_EMS = ['done', 'cancelled', 'canceled', 'closed'];

function VisitChapters({ me, today }: { me: string; today: string }) {
  const [open, setOpen] = React.useState(false);
  const [kibbutz, setKibbutz] = React.useState('');
  const [draftId, setDraftId] = React.useState('');
  /** A chapter an opener asked to land on (🚚 → תעודת משלוח). Scrolled to, then forgotten. */
  const [jump, setJump] = React.useState<ChapterId | 0>(0);
  const [d, setD] = React.useState<ChapterDraft>({});
  const [resumedAt, setResumedAt] = React.useState('');
  const [certNum, setCertNum] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  /** C3: which REQUIRED fields the last שלח found missing — the in-place red marks. */
  const [miss, setMiss] = React.useState<string[]>([]);
  /** C7: the visit is filed; this sheet is now the certificate screen for it. */
  const [sentVisitId, setSentVisitId] = React.useState('');
  /** The id this sheet already filed. A second שלח on it does nothing at all. */
  const sentRef = React.useRef('');

  // The same query key the briefing uses, so this costs no extra request.
  const ordersQ = useQuery({ queryKey: ['openOrders'], queryFn: fetchOpenOrders, enabled: open });

  // C6: אביאם sees ניתאי's open internal tasks and vice versa — `sharedOwners` is the rule.
  const owners = React.useMemo(() => sharedOwners(me), [me]);
  const internalQ = useQuery({
    queryKey: ['internalOpen', owners.join('|')],
    queryFn: () => fetchInternalOpen(owners),
    enabled: open,
  });

  /** The kibbutz's OPEN EMS tasks. Read off the same cache the briefing reads. */
  const emsTasks = React.useMemo<CardEmsTask[]>(() => {
    if (!open || !kibbutz) return [];
    let raw: CardEmsTask[] = [];
    try { raw = (sigma?.emsCacheTasksForKibbutz?.(kibbutz) as CardEmsTask[]) || []; } catch { raw = []; }
    return raw.filter(t => !OPEN_EMS.includes(String(t.status || '').toLowerCase()));
  }, [open, kibbutz]);

  const internalTasks = React.useMemo<InternalRow[]>(
    () => ((internalQ.data || []) as InternalRow[]).filter(r => !r.kibbutz || r.kibbutz === kibbutz),
    [internalQ.data, kibbutz],
  );

  // Chapter 4 exists only when there IS something to hand over: an open customer order for
  // this kibbutz, or equipment he ticked in chapter 3 (§7p, "🚚 only when").
  const deliver = React.useMemo(() => hasSomethingToDeliver(
    kibbutz,
    (ordersQ.data || []) as OrderRow[],
    { payload: { items: (d.products || []).map(p => ({ qty: p.qty })) } } as unknown as DraftRow,
  ), [kibbutz, ordersQ.data, d.products]);

  /** Everything the pure rules judge: what he typed, plus the facts only the app knows. */
  const model = React.useMemo<ChapterDraft>(
    () => ({ ...d, kibbutz, visitor: me, date: d.date || today, deliver, certIssued: certNum > 0 }),
    [d, kibbutz, me, today, deliver, certNum],
  );
  const verdict = React.useMemo(() => canSubmit(model), [model]);
  const needReason = visitReasonRequired({ emsTaskIds: d.emsTaskIds, internalTaskIds: d.internalTaskIds });

  // Refs, so the autosave and the openers never read a stale render.
  const ref = React.useRef({ model, draftId, kibbutz });
  ref.current = { model, draftId, kibbutz };

  /** Write the draft NOW. The one persistence path — autosave and שמור וסגור share it. */
  const persist = React.useCallback((patch: Partial<ChapterDraft> = {}) => {
    const cur = ref.current;
    if (!cur.kibbutz) return;
    const payload = { ...cur.model, ...patch } as Record<string, unknown>;
    if (!chapterDraftHasContent(payload as ChapterDraft)) return;   // an untouched sheet leaves nothing
    try {
      sigma.visitDraftPut?.({ id: cur.draftId, person: me, kibbutz: cur.kibbutz, date: today, payload });
    } catch (e) { console.warn('[visit-chapters] draft', e); }
  }, [me, today]);

  // Autosave, 800 ms after the last change — the same rhythm the legacy form uses.
  React.useEffect(() => {
    if (!open || sentVisitId) return;
    const t = setTimeout(() => persist(), 800);
    return () => clearTimeout(t);
  }, [open, d, deliver, persist, sentVisitId]);

  // A certificate is issued in a LEGACY modal that announces nothing, so the certificate
  // screen asks — only while it is on screen, and only until the answer is yes.
  React.useEffect(() => {
    const vid = sentVisitId || draftId;
    if (!open || (!deliver && !sentVisitId) || !vid || certNum) return;
    let live = true;
    const ask = () => {
      Promise.resolve(sigma.certIssuedForVisit?.(vid) ?? 0)
        .then(n => { if (live && n) setCertNum(Number(n) || 0); })
        .catch(() => { /* no pass, no table — the gate stays closed, which is the safe way */ });
    };
    ask();
    const t = setInterval(ask, 3000);
    return () => { live = false; clearInterval(t); };
  }, [open, deliver, draftId, certNum, sentVisitId]);

  const set = React.useCallback((patch: Partial<ChapterDraft>) => {
    setD(p => ({ ...p, ...patch }));
    setMiss(m => (m.length ? m.filter(k => !(k in patch) && !(k === 'hours' && ('duration' in patch || 'workday' in patch))
      && !(k === 'reason' && ('reasonId' in patch || 'reasonOther' in patch))
      && !(k === 'reason' && ('emsTaskIds' in patch || 'internalTaskIds' in patch))) : m));
  }, []);

  /** Put something under his eyes inside the sheet. The page behind it never moves. */
  const scrollTo = React.useCallback((sel: string) => {
    window.requestAnimationFrame(() => {
      try { document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch { /* nothing to scroll to is not a failure */ }
    });
  }, []);

  // 🚚 asked for the certificate chapter: it is on the page already, so we just go to it.
  React.useEffect(() => {
    if (!open || !jump) return;
    const t = setTimeout(() => { scrollTo('[data-testid="vc-chapter-' + jump + '"]'); setJump(0); }, 250);
    return () => clearTimeout(t);
  }, [open, jump, deliver, scrollTo]);

  /** Open on this kibbutz, resuming whatever is already stored for (me, kibbutz, today). */
  const openOn = React.useCallback((name: string, opts: VisitChaptersOpen = {}) => {
    const k = String(name || '').trim();
    if (!k) return;
    let row: { id?: string; updated_at?: string; payload?: Record<string, unknown> } | null = null;
    try { row = (sigma.visitDraftFor?.(k, me, today) as any) || null; } catch { row = null; }
    const stored = (row?.payload || {}) as ChapterDraft;
    const next: ChapterDraft = {
      ...stored,
      // The briefing's unticked leftovers pre-fill chapter 2 — but never over his own words.
      openItems: String(stored.openItems || '').trim() || opts.openItems || '',
      date: openingVisitDate(stored.date, opts.date, today),
    };
    setKibbutz(k);
    setD(next);
    setCertNum(0);
    setMiss([]);
    setSentVisitId('');
    sentRef.current = '';
    let id = String(row?.id || '');
    if (!id) { try { id = String(sigma.visitDraftId?.() || ''); } catch { id = ''; } }
    setDraftId(id || 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    setJump(opts.chapter ?? 0);
    setResumedAt(String(row?.updated_at || ''));
    setOpen(true);
    track('visit-chapters-open', k);
  }, [me, today]);

  // The one global the rest of the app calls (the strip's nudge, gaps, the push deep link).
  React.useEffect(() => {
    const api = { open: openOn };
    (window as any)[VISIT_CHAPTERS_API] = api;
    return () => { if ((window as any)[VISIT_CHAPTERS_API] === api) delete (window as any)[VISIT_CHAPTERS_API]; };
  }, [openOn]);

  const close = React.useCallback(() => { setOpen(false); }, []);

  /** שמור וסגור — on EVERY chapter. Persist, close, and nothing else happens (§7p). */
  const saveAndClose = React.useCallback(() => {
    persist();
    setOpen(false);
    toast.success('נשמר. תמשיך מתי שנוח לך.');
    track('visit-chapters-save', ref.current.kibbutz);
  }, [persist]);

  /** C8: what the analysis filled. Every field stays editable; nothing is saved behind him. */
  const fillFromVoice = React.useCallback((v: DayLogVisit) => {
    const products = (v.items || []).filter(i => i.resolved).map(i => ({ name: i.product, qty: Number(i.qty) || 1 }));
    const loose = (v.items || []).filter(i => !i.resolved).map(i => i.product).join(', ');
    set({
      summary: v.summary || '',
      openItems: v.open_items || '',
      date: v.date || today,
      workday: !!v.workday,
      duration: v.workday ? '' : (v.duration_hours ? String(v.duration_hours) : ''),
      products,
      productsOther: loose,
      emsTaskIds: (v.task_matches || []).map(m => String(m.task_id)),
    });
  }, [set, today]);

  /** שלח — chapter 5 only, and the only thing here that creates anything. */
  const send = React.useCallback(async () => {
    const cur = ref.current;
    if (sentRef.current && sentRef.current === cur.draftId) return;     // idempotent by id
    const gaps = missingFields(cur.model);
    if (gaps.length) {
      setMiss(gaps.map(g => g.key));
      scrollTo('#vc-field-' + gaps[0].key);                             // straight to the first miss
      toast.error(gaps[0].reason);
      return;
    }
    const v = canSubmit(cur.model);
    if (!v.ok) { toast.error(v.reason || 'לא ניתן לשלוח'); return; }
    // Claimed BEFORE the round trip: a double-tap on a phone arrives long before the answer.
    sentRef.current = cur.draftId;
    setSending(true);
    const emsIds = cur.model.emsTaskIds || [];
    const internalIds = cur.model.internalTaskIds || [];
    try {
      const res = await runMutation(
        Promise.resolve(sigma.saveVisitFromData?.({
          id: cur.draftId,
          kibbutz: cur.kibbutz,
          visitor: me,
          date: cur.model.date || today,
          duration: cur.model.duration || '',
          workday: !!cur.model.workday,
          summary: cur.model.summary || '',
          openItems: cur.model.openItems || '',
          products: cur.model.products || [],
          productsOther: cur.model.productsOther || '',
          contact: cur.model.contact || '',
          returned: cur.model.returned || [],
          // C6: the column may not exist yet (db/visits_reason.sql is not applied) — the legacy
          // writer drops unknown keys rather than failing, so a missing column costs a reason.
          reason: needReason ? visitReasonText(cur.model.reasonId, cur.model.reasonOther) : '',
          emsTaskId: emsIds[0] || '',
          // C7: the certificate comes AFTER the save on this sheet, so the pre-save gate is off.
          certAfter: true,
        }) ?? Promise.resolve({ ok: false, error: 'שמירת ביקור אינה זמינה' })),
        {
          loading: 'שומר את הסיכום…',
          success: 'הסיכום נשלח 🎉',
          error: 'השליחה נכשלה',
          retry: () => { sentRef.current = ''; void send(); },
        },
      );
      if (res && (res as any).ok) {
        const visitId = String((res as any).id || cur.draftId);
        try { sigma.visitDraftDiscard?.(cur.draftId); } catch { /* it is filed; the draft is noise */ }
        set({ submittedId: visitId });
        track('visit-chapters-send', cur.kibbutz);

        // C6: the summary is posted as a comment to EVERY selected EMS task (the first one is
        // already carried by `emsTaskId`; the rest go through the same queueing writer).
        const body = (cur.model.summary || '').trim();
        for (const id of emsIds.slice(1)) {
          try { sigma.emsWrite?.({ kind: 'comment', taskId: id, message: '📍 סיכום ביקור ' + cur.kibbutz + '\n' + body }); }
          catch (e) { console.warn('[visit-chapters] ems comment', e); }
        }
        // … and every selected internal task is marked done.
        if (internalIds.length) {
          try {
            const sb = await getSupabase();
            await Promise.all(internalIds.map(id =>
              sbWrite(() => sb.from('internal_tasks').update({ done: true }).eq('id', id).select('id').single() as any)));
          } catch (e) { console.warn('[visit-chapters] internal done', e); }
        }

        // C7: equipment was supplied → this sheet becomes the certificate screen instead of
        // closing. Nothing is printed; the certificate opens in the app with שלח / הורד on it.
        if ((cur.model.products || []).length) {
          setSentVisitId(visitId);
        } else {
          setOpen(false);
        }
      } else {
        sentRef.current = '';                                   // it did not happen — let him retry
        toast.error(String((res as any)?.error || 'השליחה נכשלה'));
      }
    } catch {
      sentRef.current = '';
    } finally { setSending(false); }
  }, [me, today, set, needReason, scrollTo]);

  // §7p: a sheet holding his words never closes by accident. "לשמור" IS שמור וסגור, and
  // "לבטל" only closes — the draft is never thrown away here (§7p: never auto-delete).
  const guard = useUnsavedGuard({
    dirty: () => !sentRef.current && chapterDraftHasContent(ref.current.model),
    onSave: saveAndClose,
    onDiscard: close,
    onClose: close,
  });

  const stock = React.useMemo<Record<string, number>>(() => {
    if (!open) return {};
    try { return (sigma.poolStock?.() as Record<string, number>) || {}; } catch { return {}; }
  }, [open]);
  const stockNames = React.useMemo(
    // C4: SIM rows are hidden from the pickable list (hidden, never deleted).
    () => pickableProducts(Object.keys(stock).filter(n => (stock[n] || 0) > 0)).sort((a, b) => a.localeCompare(b, 'he')),
    [stock],
  );
  /** The whole catalog the keyword search runs over — the pool first, the catalog behind it. */
  const catalog = React.useMemo(() => {
    let names: string[] = [];
    try { names = (sigma.productNames?.() as string[]) || []; } catch { names = []; }
    return pickableProducts([...stockNames, ...names.filter(n => !stockNames.includes(n))]);
  }, [stockNames, open]);

  /** name → catalog category, for the tile grid's headings (J2). */
  const categoryOf = React.useMemo(() => {
    const map: Record<string, string> = {};
    try {
      (sigma.products?.() || []).forEach((p: any) => {
        if (p && p.name) map[String(p.name)] = String(p.category || '').trim();
      });
    } catch { /* no catalog reachable — everything lands under אחר */ }
    return (name: string) => map[name] || '';
  }, [open]);
  const tileGroups = React.useMemo(
    () => productGroups(stockNames, categoryOf),
    [stockNames, categoryOf],
  );

  const qtyOf = (name: string) => (d.products || []).find(p => p.name === name)?.qty || 0;
  const setQty = (name: string, qty: number) => {
    const rest = (d.products || []).filter(p => p.name !== name);
    set({ products: qty > 0 ? [...rest, { name, qty }] : rest });
  };
  const toggleId = (key: 'emsTaskIds' | 'internalTaskIds', id: string) => {
    const cur = d[key] || [];
    set({ [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] } as Partial<ChapterDraft>);
  };

  const age = draftAge({ ...d, updated_at: resumedAt });
  const has = (k: string) => miss.includes(k);

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(v => { if (!v) guard.ask(); })}>
      <SheetContent
        side="bottom"
        data-testid="visit-chapters"
        data-sent={sentVisitId ? '1' : undefined}
        className="flex max-h-[94svh] flex-col overflow-hidden p-0 pt-2.5"
        {...guard.contentProps}
      >
        <SheetTitle className="px-4 text-[20px] font-extrabold tracking-[-.01em]">
          {sentVisitId ? 'תעודת משלוח · ' : 'סיכום ביקור · '}{kibbutz}
        </SheetTitle>
        <SheetDescription className="px-4 pb-2 pt-0.5 text-[12.5px] text-muted-foreground">
          {sentVisitId
            ? 'הסיכום נשמר. נשאר להפיק את התעודה ולשלוח אותה.'
            : age.label
              ? <span data-testid="vc-draft-chip">{age.label}{age.note ? ' · ' + age.note : ''}</span>
              : 'הכול כאן, בגלילה אחת. אפשר לשמור ולצאת בכל רגע.'}
        </SheetDescription>

        {/* C8 — at the TOP of the sheet, and only while there is still a summary to fill. */}
        {!sentVisitId && <VoiceIntake kibbutz={kibbutz} busy={sending} onFill={fillFromVoice} />}

        {/* Ruling 22.9 evening: one scrolling form. Every chapter is here, in §7p's order. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4" data-testid="vc-scroll">
          {sentVisitId ? (
            <Chapter id={4}>
              <div className="flex flex-col gap-3">
                <p className="text-[13.5px] leading-[1.6] text-muted-foreground">
                  {certNum
                    ? 'התעודה הופקה. אפשר לשלוח אותה לאיש הקשר או להוריד אותה.'
                    : 'השארת ציוד בקיבוץ. הפק תעודת משלוח כדי שתישאר רשומה.'}
                </p>
                {!!certNum && (
                  <div className="rounded-xl border border-border bg-muted px-3 py-2.5 text-[14px] font-bold" data-testid="vc-cert-ok">
                    ✅ תעודה <bdi>{certNum}</bdi> נופקה
                  </div>
                )}
                <button
                  type="button"
                  data-testid="vc-cert"
                  onClick={() => {
                    if (!sentVisitId) persist();
                    try {
                      sigma.openDeliveryCert?.({
                        kibbutz, date: d.date || today, contact: d.contact || '',
                        items: (d.products || []).map(p => ({ name: p.name, qty: p.qty })),
                        source: 'visit', refId: sentVisitId || draftId,
                        // C7: no printing — the certificate opens inside the app.
                        noPrint: true,
                      });
                    } catch (e) { console.warn('[visit-chapters] cert', e); }
                  }}
                  className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-foreground text-[15px] font-extrabold text-background"
                >
                  <Truck className="h-5 w-5" /> {certNum ? 'תעודה נוספת' : 'הפק תעודה'}
                </button>
                {!!certNum && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="vc-cert-send"
                      onClick={() => { try { (window as any).certSendForVisit?.(sentVisitId || draftId); } catch (e) { console.warn('[visit-chapters] send', e); } }}
                      className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-grad text-[14px] font-extrabold text-white"
                    >
                      <Send className="h-4 w-4" /> שלח במייל לאיש קשר
                    </button>
                    <button
                      type="button"
                      data-testid="vc-cert-download"
                      onClick={() => { try { (window as any).certDownloadForVisit?.(sentVisitId || draftId); } catch (e) { console.warn('[visit-chapters] download', e); } }}
                      className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted text-[14px] font-extrabold"
                    >
                      <Download className="h-4 w-4" /> הורד PDF
                    </button>
                  </div>
                )}
              </div>
            </Chapter>
          ) : (
            <>
              <Chapter id={1} name="summary" required miss={has('summary')}>
                <textarea
                  data-testid="vc-summary"
                  autoFocus
                  value={d.summary || ''}
                  onChange={e => set({ summary: e.target.value })}
                  placeholder="הוחלף המונה הראשי, נבדקה תקשורת…"
                  className={AREA}
                />
              </Chapter>

              <Chapter id={2}>
                <textarea
                  data-testid="vc-open-items"
                  value={d.openItems || ''}
                  onChange={e => set({ openItems: e.target.value })}
                  placeholder="חסר בקר לחלקה הדרומית, להביא בביקור הבא"
                  className={AREA}
                />
              </Chapter>

              <Chapter id={3}>
                <div className="flex flex-col gap-3">
                  {!stockNames.length && (
                    <p className="rounded-xl border border-border bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
                      אין כרגע מלאי זמין. אם השארת משהו, תחפש אותו למטה או תכתוב אותו.
                    </p>
                  )}
                  {!!tileGroups.length && (
                    <ProductTiles groups={tileGroups} stock={stock} qtyOf={qtyOf} setQty={setQty} />
                  )}

                  <ProductSearch
                    catalog={catalog}
                    onPick={name => setQty(name, Math.max(1, qtyOf(name) + 1))}
                    freeText={d.productsOther || ''}
                    onFreeText={v => set({ productsOther: v })}
                  />

                  <ReturnedItems rows={d.returned || []} onChange={rows => set({ returned: rows })} />
                </div>
              </Chapter>

              {/* 🚚 is here only when there is something to hand over (§7p). */}
              {deliver && (
                <Chapter id={4}>
                <div className="flex flex-col gap-3">
                  <p className="text-[13.5px] leading-[1.6] text-muted-foreground">
                    {certNum
                      ? 'התעודה הופקה. אפשר לשלוח אותה לאיש הקשר או להוריד אותה.'
                      : 'השארת ציוד בקיבוץ. הפק תעודת משלוח כדי שתישאר רשומה.'}
                  </p>
                  {!!certNum && (
                    <div className="rounded-xl border border-border bg-muted px-3 py-2.5 text-[14px] font-bold" data-testid="vc-cert-ok">
                      ✅ תעודה <bdi>{certNum}</bdi> נופקה
                    </div>
                  )}
                  <button
                    type="button"
                    data-testid="vc-cert"
                    onClick={() => {
                      if (!sentVisitId) persist();
                      try {
                        sigma.openDeliveryCert?.({
                          kibbutz, date: d.date || today, contact: d.contact || '',
                          items: (d.products || []).map(p => ({ name: p.name, qty: p.qty })),
                          source: 'visit', refId: sentVisitId || draftId,
                          // C7: no printing — the certificate opens inside the app.
                          noPrint: true,
                        });
                      } catch (e) { console.warn('[visit-chapters] cert', e); }
                    }}
                    className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-foreground text-[15px] font-extrabold text-background"
                  >
                    <Truck className="h-5 w-5" /> {certNum ? 'תעודה נוספת' : 'הפק תעודה'}
                  </button>
                  {!!certNum && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid="vc-cert-send"
                        onClick={() => { try { (window as any).certSendForVisit?.(sentVisitId || draftId); } catch (e) { console.warn('[visit-chapters] send', e); } }}
                        className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-grad text-[14px] font-extrabold text-white"
                      >
                        <Send className="h-4 w-4" /> שלח במייל לאיש קשר
                      </button>
                      <button
                        type="button"
                        data-testid="vc-cert-download"
                        onClick={() => { try { (window as any).certDownloadForVisit?.(sentVisitId || draftId); } catch (e) { console.warn('[visit-chapters] download', e); } }}
                        className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted text-[14px] font-extrabold"
                      >
                        <Download className="h-4 w-4" /> הורד PDF
                      </button>
                    </div>
                  )}
                </div>
                </Chapter>
              )}

              <Chapter id={5}>
                <div className="flex flex-col gap-3">
                  <Field2 label="כמה זמן היית שם" name="hours" required miss={has('hours')}>
                    <div className="flex flex-wrap gap-1.5">
                      {HOUR_CHIPS.map(h => {
                        const on = !d.workday && parseFloat(String(d.duration || '')) === h;
                        return (
                          <button
                            key={h}
                            type="button"
                            data-testid={'vc-hours-' + h}
                            onClick={() => set({ workday: false, duration: on ? '' : String(h) })}
                            className={'min-h-[40px] flex-none rounded-xl border px-3 text-[14px] font-bold ' + (on ? CHIP_ON : CHIP_OFF)}
                          >
                            <bdi>{h}</bdi> ש׳
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        data-testid="vc-workday"
                        onClick={() => set({ workday: !d.workday, duration: '' })}
                        className={'min-h-[40px] flex-none rounded-xl border px-3 text-[14px] font-bold ' + (d.workday ? CHIP_ON : CHIP_OFF)}
                      >
                        יום שלם
                      </button>
                      {/* C1: the manual box shows an EXAMPLE, not a label. */}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.25}
                        step={0.25}
                        data-testid="vc-hours-manual"
                        disabled={!!d.workday}
                        value={d.workday ? '' : (HOUR_CHIPS.includes(parseFloat(String(d.duration || ''))) ? '' : (d.duration || ''))}
                        onChange={e => set({ workday: false, duration: e.target.value })}
                        placeholder="1.5"
                        aria-label="שעות, הזנה ידנית"
                        className="h-[40px] w-[74px] flex-none rounded-xl border border-border bg-muted text-center text-[14px] outline-none disabled:opacity-45"
                      />
                    </div>
                  </Field2>

                  <Field2 label="תאריך הביקור" name="date" required miss={has('date')}>
                    <input
                      type="date"
                      data-testid="vc-date"
                      value={d.date || today}
                      onChange={e => set({ date: e.target.value })}
                      className={LINE}
                    />
                  </Field2>

                  <Field2 label="איש קשר מלווה" name="contact" required miss={has('contact')}>
                    <input
                      data-testid="vc-contact"
                      value={d.contact || ''}
                      onChange={e => set({ contact: e.target.value })}
                      placeholder="מי ליווה אותך בקיבוץ"
                      className={LINE}
                    />
                  </Field2>

                  {/* C6 — never preselected. */}
                  <div className="flex flex-col gap-1.5" data-testid="vc-tasks">
                    <span className="text-[12.5px] font-bold text-muted-foreground">לאיזו משימה זה שייך</span>
                    {!emsTasks.length && !internalTasks.length && (
                      <p className="rounded-xl border border-border bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                        אין כאן משימות פתוחות. תגיד למה הגעת.
                      </p>
                    )}
                    {emsTasks.map(t => (
                      <PickRow
                        key={String(t.id)}
                        testid={'vc-ems-' + t.id}
                        on={(d.emsTaskIds || []).includes(String(t.id))}
                        title={String(t.title)}
                        sub={'EMS · ' + statusLabel(t.status)}
                        onToggle={() => toggleId('emsTaskIds', String(t.id))}
                      />
                    ))}
                    {internalTasks.map(t => (
                      <PickRow
                        key={t.id}
                        testid={'vc-internal-' + t.id}
                        on={(d.internalTaskIds || []).includes(t.id)}
                        title={t.title}
                        sub={'🔒 פנימי' + (t.owner && t.owner !== me ? ' · ' + t.owner : '')}
                        onToggle={() => toggleId('internalTaskIds', t.id)}
                      />
                    ))}
                    {!!(d.emsTaskIds || []).length && (
                      <p className="text-[11.5px] text-muted-foreground">הסיכום ייכתב כתגובה לכל משימה שסימנת.</p>
                    )}
                  </div>

                  {/* … and when nothing was linked, the reason is required instead. */}
                  {needReason && (
                    <Field2 label="סיבת הביקור" name="reason" required miss={has('reason')}>
                      <div className="flex flex-col gap-1.5" data-testid="vc-reasons">
                        <div className="flex flex-wrap gap-1.5">
                          {VISIT_REASONS.map(r => {
                            const on = d.reasonId === r.id;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                data-testid={'vc-reason-' + r.id}
                                aria-pressed={on}
                                onClick={() => set({ reasonId: on ? '' : r.id })}
                                className={'min-h-[38px] flex-none rounded-xl border px-3 text-[13px] font-bold ' + (on ? CHIP_ON : CHIP_OFF)}
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                        {d.reasonId === 'other' && (
                          <input
                            data-testid="vc-reason-other-text"
                            value={d.reasonOther || ''}
                            onChange={e => set({ reasonOther: e.target.value })}
                            placeholder="אז למה הגעת?"
                            className={LINE}
                          />
                        )}
                      </div>
                    </Field2>
                  )}

                  {!verdict.ok && (
                    <p data-testid="vc-blocked" className="rounded-xl border-s-[3px] border-[color:var(--sigma-warn)] bg-[color:var(--sigma-warn)]/10 px-3 py-2 text-[13px] font-semibold">
                      {verdict.reason}
                    </p>
                  )}
                </div>
              </Chapter>
            </>
          )}
        </div>

        {/* Two buttons under the whole form: keep it for later, or file it now. */}
        <div className="flex gap-2 border-t border-border bg-background px-3 pb-5 pt-2.5">
          {sentVisitId ? (
            <button
              type="button"
              data-testid="vc-done"
              onClick={() => setOpen(false)}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted text-[15px] font-extrabold"
            >
              סיימתי
            </button>
          ) : (
            <>
              <button
                type="button"
                data-testid="vc-save-close"
                onClick={saveAndClose}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted text-[15px] font-extrabold"
              >
                <Save className="h-[18px] w-[18px]" /> שמור וסגור
              </button>
              <ShimmerButton
                onClick={() => void send()}
                data-testid="vc-send"
                disabled={sending}
                background="var(--brand-grad)"
                className="min-h-[52px] flex-1 rounded-xl text-[15px] font-extrabold text-white disabled:opacity-50"
              >
                <Send className="h-[18px] w-[18px]" /> {sending ? 'שולח…' : 'שלח'}
              </ShimmerButton>
            </>
          )}
        </div>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

/** Open the chapters sheet from anywhere in the app. False when it is not mounted. */
export function openVisitChapters(kibbutz: string, opts: VisitChaptersOpen = {}): boolean {
  const api = (window as any)[VISIT_CHAPTERS_API];
  if (!api?.open) return false;
  api.open(kibbutz, opts);
  return true;
}

// ───────────────────────────── the island ─────────────────────────────

type Mode = 'closed' | 'arrival' | 'briefing';

function FieldIsland() {
  const gate = useEmsGate();
  const qc = useQueryClient();
  const { name: me, role: sigmaRole } = useCurrentUser();
  const personRole = roleOf(me, sigmaRole);
  const today = todayISO();
  const reduce = useReducedMotion();

  const [mode, setMode] = React.useState<Mode>('closed');
  const [picked, setPicked] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  // The toggle callback needs the value BEFORE its own setState, and must not be re-created
  // on every tick (it would re-render 30 checklist rows), so `checked` is mirrored in a ref.
  const checkedRef = React.useRef(checked);
  checkedRef.current = checked;

  const kibbutzimQ = useQuery({
    queryKey: ['kibbutzim'],
    queryFn: fetchKibbutzNames,
    initialData: () => readJson<Array<{ name: string }>>('kibbutzim_v1') || undefined,
    initialDataUpdatedAt: 0,
    enabled: mode !== 'closed',
  });
  const checkinsQ = useQuery({
    queryKey: ['checkins', me, today],
    queryFn: () => fetchCheckins(me),
    enabled: !!me,
  });
  const planQ = useQuery({ queryKey: ['dayPlan', me, today], queryFn: () => fetchDayPlan(me, today), enabled: !!me });
  // A reorder in the calendar (§7f) is the same route this sheet offers — re-read it when
  // the calendar says it changed, instead of making him reload to see his own order.
  useSigmaEvent('dayplan-changed', () => { void planQ.refetch(); });
  const ordersQ = useQuery({ queryKey: ['openOrders'], queryFn: fetchOpenOrders, enabled: mode === 'briefing' });
  // 🔥 צריבות — only fetched while the briefing is open, and only for someone who may MARK
  // one: a read-only viewer has nothing to tick here (the chip and the strip already tell him).
  const burnAccess = useBurnAccess();
  const burnCanWrite = burnAccess.canWrite;
  const burnsQ = useBurns(burnCanWrite && mode === 'briefing');
  const burnRows = burnsQ.data;
  const notesQ = useMeetingNotes();

  const rows = (kibbutzimQ.data || []) as Array<{ name: string; display_name?: string | null }>;
  const names = React.useMemo(() => rows.map(r => String(r.name)).filter(Boolean), [rows]);
  const visits = useVisits();
  const myTasks = useMyTasksByKibbutz(names, me);
  const checkins = (checkinsQ.data || []) as CheckinRow[];
  const plan = (planQ.data || []) as string[];
  const draft = useVisitDraft(picked);

  const items = React.useMemo(() => {
    const all = arrivalOrder({ kibbutzim: rows, myTasks, visits, me, plan });
    const q = query.trim();
    return q ? all.filter(x => x.name.includes(q) || x.why.includes(q)) : all;
  }, [rows, myTasks, visits, me, plan, query]);

  // ---- writes ------------------------------------------------------------
  const checkin = useMutation({
    mutationFn: async (kibbutz: string): Promise<CheckinRow> => {
      const sb = await getSupabase();
      const row = await sbWrite<CheckinRow>(() =>
        sb.from('field_checkins').insert({ person: me, kibbutz }).select('*').single() as any);
      return (row || { id: 'local-' + Date.now(), person: me, kibbutz, checked_in_at: new Date().toISOString() }) as CheckinRow;
    },
    onSuccess: (row) => {
      writeJson(CHECKIN_KEY, { date: today, kibbutz: row.kibbutz });
      try { (window as any).sigmaEmit?.(CHECKIN_CREATED, { id: row.id, kibbutz: row.kibbutz, person: row.person }); } catch { /* no bus */ }
      void qc.invalidateQueries({ queryKey: ['checkins', me, today] });
    },
    onError: () => {
      // The briefing is worth reading even when the row did not land — he is standing there.
      writeJson(CHECKIN_KEY, { date: today, kibbutz: picked });
    },
  });

  const pick = (name: string) => {
    setPicked(name);
    setChecked({});
    setMode('briefing');
    track('field-checkin', name);
    checkin.mutate(name);
  };

  // ---- openers -----------------------------------------------------------
  const shouldPrompt = React.useCallback(() => fieldShouldPrompt({
    me,
    today,
    checkin: readJson<{ date: string; kibbutz: string }>(CHECKIN_KEY),
    dismissedDate: readStr(NO_FIELD_KEY),
    isViewer: sigmaRole === 'viewer',
  }), [me, today, sigmaRole]);

  /** The day the visit happened (item 3). Reset to today every time the sheet opens. */
  const [arrivalDate, setArrivalDate] = React.useState(today);
  const arrivalDateRef = React.useRef(arrivalDate);
  arrivalDateRef.current = arrivalDate;

  const openArrival = React.useCallback(() => {
    setQuery('');
    setArrivalDate(today);
    setMode('arrival');
    track('field-arrival-open');
  }, [today]);

  /**
   * The sheet may only ARRIVE UNINVITED once A DAY — `arrival_dismissed_<date>`, so a reload
   * does not ask him twice on the same morning and a phone that is never closed is still
   * asked tomorrow. `window._fieldPromptShown` stays as the override the Playwright harness
   * sets, the way it already does for the push and attendance prompts. Opening the sheet BY
   * HAND (the 📍 button, a stop in the "היום" strip) is never latched.
   */
  const autoOpenOnce = React.useCallback(() => {
    const w = window as any;
    if (w._fieldPromptShown) return;               // the harness / an explicit opt-out
    if (readStr(arrivalPromptKey(today)) === '1') return;
    if (!shouldPrompt()) return;
    try { localStorage.setItem(arrivalPromptKey(today), '1'); } catch { /* private mode */ }
    openArrival();
  }, [openArrival, shouldPrompt, today]);

  React.useEffect(() => {
    const api = {
      /** The raised 📍 with no check-in today opens the arrival sheet; otherwise the form. */
      maybeOpen(): boolean {
        if (!shouldPrompt()) return false;
        openArrival();
        return true;
      },
      /**
       * Round 3 · Package S: a MANUAL 📍 tap by any writer must reach the chapters sheet
       * (and its 🎙 panel) — `maybeOpen`/`shouldPrompt` is an AUTO-INVITE eligibility check
       * (`FIELD_PEOPLE` only, spec §5.1), never a gate on the person's own tap. Before this,
       * everyone outside FIELD_PEOPLE (עידן included) fell straight through to
       * `sigma.openVisitQuick()` — the legacy form, which never got a voice panel — because
       * Nav.tsx had nothing else to call. This opens the same arrival → briefing → chapters
       * route `pick()`/`openVisit()` already use, for anyone who is not a viewer.
       */
      openManual(): boolean {
        openArrival();
        return true;
      },
      openArrival,
      openBriefing(name: string) { setPicked(name); setChecked({}); setMode('briefing'); },
      /** "🙈 לא היום" from the notification (js/src/22-push.js deep link). */
      async dismiss(cid: string): Promise<void> {
        if (!cid) return;
        try {
          const sb = await getSupabase();
          await sbWrite(() => sb.from('field_checkins').update({ dismissed: true }).eq('id', cid).select('id').single() as any);
          void qc.invalidateQueries({ queryKey: ['checkins', me, today] });
          toast('בסדר, לא היום.');
        } catch { toast('בסדר, לא היום.'); }
      },
    };
    (window as any).sigmaField = api;
    return () => { if ((window as any).sigmaField === api) delete (window as any).sigmaField; };
  }, [openArrival, shouldPrompt, qc, me, today]);

  // The §7l landing hook: a field worker who lands on the cards with no check-in is asked
  // where he arrived — once, and never for anyone else.
  React.useEffect(() => {
    const prev = (sigma as any)?.onLanding;
    (sigma as any).onLanding = (target: { page: string }, role: string) => {
      try { prev?.(target, role); } catch { /* the previous hook is not ours to break */ }
      if (role === 'field' && target?.page === 'kibbutz') setTimeout(autoOpenOnce, 350);
    };
    // The landing may have run BEFORE this lazy chunk mounted (main.tsx calls it during boot),
    // and the latch above makes the two paths idempotent.
    if (personRole === 'field') setTimeout(autoOpenOnce, 400);
    return () => { (sigma as any).onLanding = prev; };
  }, [personRole, autoOpenOnce]);

  // ══════ ROUND 2 · PACKAGE G — today's briefing opens itself, once ══════
  // G6: the first time he opens the app on a day he has a route for, the briefing for the
  // first stop is what he sees. The latch is the DATE, so a reload at noon does not re-open
  // it and tomorrow morning it opens again.
  React.useEffect(() => {
    if (mode !== 'closed') return;
    if ((window as any)._fieldPromptShown) return;         // the harness / an explicit opt-out
    const kibbutz = briefingAutoOpen({
      today,
      stops: plan,
      lastShown: readStr(BRIEF_SHOWN_KEY),
      isViewer: sigmaRole === 'viewer' || personRole !== 'field',
    });
    if (!kibbutz) return;
    try { localStorage.setItem(BRIEF_SHOWN_KEY, today); } catch { /* private mode */ }
    setPicked(kibbutz);
    setChecked({});
    setMode('briefing');
    track('field-brief-auto', kibbutz);
  }, [mode, plan, today, sigmaRole, personRole]);
  // ══════ ROUND 2 · PACKAGE G (end of the auto-open block) ══════

  // ---- 🔥 צריבות rows (Task 23) --------------------------------------------
  // SNAPSHOT per briefing, on purpose: ticking one writes ✅ נצרב, the query invalidates and
  // `burnLeaveItems` stops returning that meter — the row would vanish from under his finger
  // in the middle of a 30-meter list. It is re-derived the next time he arrives somewhere.
  const burnSnap = React.useRef<{ key: string; items: LeaveItem[] }>({ key: '', items: [] });
  const burnItems = React.useMemo<LeaveItem[]>(() => {
    if (!picked || !burnCanWrite) return [];
    const stale = burnSnap.current.key !== picked || !burnSnap.current.items.length;
    if (stale) burnSnap.current = { key: picked, items: burnLeaveItems(burnRows, picked) as LeaveItem[] };
    return burnSnap.current.items;
  }, [picked, burnCanWrite, burnRows]);

  /**
   * One checklist row. Everything except a 🔥 row is local state (the unticked ones pre-fill
   * "מה נשאר לי פתוח"); a 🔥 row IS the meter's state, so ticking it marks the meter
   * נצרב in `meter_burns` — the card chip, the strip and the modal section all move with it.
   * The tick is optimistic and rolls back if the write is refused.
   */
  const toggleLeaveItem = React.useCallback((id: string) => {
    const item = (burnSnap.current.key === picked ? burnSnap.current.items : []).find(x => x.id === id);
    const meterId = (item as { meterId?: string } | undefined)?.meterId;
    setChecked(st => ({ ...st, [id]: !st[id] }));
    if (!meterId) return;
    const turningOn = !checkedRef.current[id];
    if (!turningOn) return;                        // un-ticking is only a UI undo, never an unburn
    track('burn-brief-marked', picked);
    markBurned([meterId], me)
      .then(() => toast.success('✅ נצרב'))
      .catch((e: Error) => {
        setChecked(st => ({ ...st, [id]: false }));
        toast.error(e?.message || 'לא נשמר. נסה שוב');
      });
  }, [picked, me]);

  // ---- the briefing's content -------------------------------------------
  const brief = React.useMemo(() => {
    if (!picked) return null;
    let raw: CardEmsTask[] = [];
    try { raw = (sigma?.emsCacheTasksForKibbutz?.(picked) as CardEmsTask[]) || []; } catch { raw = []; }
    // Round 2 · G4: EVERY open task of this kibbutz, whatever EMS says its due date is.
    const tasks = sortTasksForCard(briefingTasks(raw as unknown as FieldTask[]) as unknown as CardEmsTask[], me);
    // §5.1b clean: only bullets meant for the field (untagged = everyone), latest meeting first.
    const groups = notesForKibbutz((notesQ.data || []) as NoteRow[], picked);
    const notes = (groups[0]?.bullets || []).filter((n: NoteRow) => bulletForField((n as any).audience) && !n.done_at);
    let prevVisit: VisitRow | null = null;
    try { prevVisit = (sigma?.getLastVisit?.(picked) as VisitRow) || null; } catch { prevVisit = null; }
    const orders = (ordersQ.data || []) as OrderRow[];
    // 🔥 צריבות (Task 23): the pending meters of this kibbutz ride along as checklist rows
    // of kind `burn`, so the technician sees them at arrival — and ticking one MARKS the
    // meter ✅ נצרב rather than only crossing a line out (see `toggleLeaveItem`).
    const checklist = leaveChecklist({ tasks: tasks as unknown as FieldTask[], prevVisit, orders, me, kibbutz: picked, burns: burnItems });
    return {
      tasks, notes, prevVisit, checklist,
      canDeliver: hasSomethingToDeliver(picked, orders, draft as DraftRow | null),
      checkinAt: checkins.find(c => c.kibbutz === picked)?.checked_in_at || new Date().toISOString(),
    };
  }, [picked, me, notesQ.data, ordersQ.data, checkins, draft, burnItems]);

  /**
   * 📍 סיכום ביקור → the chapters sheet (§7p), resuming wherever he left off. The unticked
   * rows travel with him as chapter 2's starting text — and only while chapter 2 is still
   * empty, so they can never overwrite what he already wrote.
   *
   * The legacy `prefillOpenItems` bridge stays wired for the desk path (the card's 📍, which
   * still opens the full form), and the fallback below is what makes a browser with no
   * chapters island still land somewhere sensible.
   */
  const openVisit = () => {
    if (!brief) return;
    const text = openItemsPrefill(brief.checklist, checked);
    track('field-brief-visit', picked);
    setMode('closed');
    if (openVisitChapters(picked, { openItems: text, date: arrivalDateRef.current })) return;
    try { sigma.prefillOpenItems?.(picked, text); } catch (e) { console.warn('[field] prefill', e); }
    sigma.openVisitQuick(picked);
  };

  /** 🚚 — straight to chapter 4, where the certificate is issued against the draft's id. */
  const openCert = () => {
    track('field-brief-cert', picked);
    setMode('closed');
    if (openVisitChapters(picked, { chapter: 4, date: arrivalDateRef.current })) return;
    // Fallback: the legacy form first, the certificate once it is on screen, so the cert
    // links to the visit rather than to nothing.
    const once = () => {
      sigmaBus.removeEventListener('visit-form-open', once);
      clearTimeout(timer);
      try { sigma.certFromVisitForm(); } catch (e) { console.warn('[field] cert', e); }
    };
    const timer = setTimeout(() => sigmaBus.removeEventListener('visit-form-open', once), 120_000);
    sigmaBus.addEventListener('visit-form-open', once);
    sigma.openVisitQuick(picked);
  };

  const skipToday = () => {
    try { localStorage.setItem(NO_FIELD_KEY, today); } catch { /* private mode */ }
    track('field-arrival-skip');
    setMode('closed');
  };

  // §7p, wired for completeness: every checklist tick is written through the moment it is
  // made (`onToggle` above), and the open items travel to the visit form through the bridge,
  // so this sheet never holds an unsaved draft — the predicate is honestly false. The hook
  // stays so the first field that DOES hold one is covered the day it lands.
  const guard = useUnsavedGuard({ dirty: () => false, onClose: () => setMode('closed') });

  const dur = reduce ? 0 : 0.28;
  if (!isGateOpen(gate)) return null;          // §7n — nothing without a live sign-in

  return (
    <>
    {/* §7p — the visit summary itself. It lives beside the briefing rather than inside it,
        because it is opened from five other places too (the strip's nudge, gaps, the push
        deep link, the briefing's two CTAs) and must outlive the sheet that launched it. */}
    <VisitChapters me={me} today={today} />
    <Sheet open={mode !== 'closed'} onOpenChange={o => { if (!o) guard.ask(); }}>
      <SheetContent
        side="bottom"
        data-mode={mode}
        // ONE sheet for both states (§7k #1) — only its content swaps, so the panel itself
        // never unmounts and the morph reads as one screen changing its mind.
        className="max-h-[92svh] overflow-hidden p-0 pt-2.5"
      >
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'arrival' ? (
            <motion.div
              key="arrival"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: dur, ease: 'easeOut' }}
              className="max-h-[88svh] overflow-y-auto"
            >
              <Arrival
                items={items}
                loading={kibbutzimQ.isLoading}
                query={query}
                onQuery={setQuery}
                onPick={pick}
                onSkip={skipToday}
                date={arrivalDate}
                onDate={setArrivalDate}
                onStraightToVisit={() => { setMode('closed'); sigma.openVisitQuick(); }}
              />
            </motion.div>
          ) : mode === 'briefing' && brief ? (
            <motion.div
              key="briefing"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: dur, ease: 'easeOut' }}
              className="relative max-h-[92svh]"
            >
              <SheetTitle className="sr-only">{'בריפינג: ' + picked}</SheetTitle>
              <SheetDescription className="sr-only">כל מה שפתוח בקיבוץ הזה, ושני כפתורי הפעולה.</SheetDescription>
              <Briefing
                kibbutz={picked}
                checkinAt={brief.checkinAt}
                tasks={brief.tasks}
                notes={brief.notes}
                prevVisit={brief.prevVisit}
                checklist={brief.checklist}
                checked={checked}
                onToggle={toggleLeaveItem}
                canDeliver={brief.canDeliver}
                onVisit={openVisit}
                onCert={openCert}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        {guard.prompt}
      </SheetContent>
    </Sheet>
    </>
  );
}

// ───────────────────────── the "היום" strip (§7k #11 + #4) ─────────────────────────

function TodayIsland() {
  const gate = useEmsGate();
  const { name: me, role: sigmaRole } = useCurrentUser();
  const today = todayISO();
  const personRole = roleOf(me, sigmaRole);
  const [folded, setFolded] = React.useState(() => readStr(TODAY_FOLDED_KEY) === '1');
  const [, tick] = React.useState(0);

  const checkinsQ = useQuery({ queryKey: ['checkins', me, today], queryFn: () => fetchCheckins(me), enabled: !!me });
  const planQ = useQuery({ queryKey: ['dayPlan', me, today], queryFn: () => fetchDayPlan(me, today), enabled: !!me });
  useSigmaEvent('dayplan-changed', () => { void planQ.refetch(); });
  const visits = useVisits();
  const checkins = (checkinsQ.data || []) as CheckinRow[];

  // The banner is a clock, so it has to re-evaluate without a reload: once a minute is
  // plenty for a two-hour timer and costs nothing.
  React.useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(t); }, []);
  useSigmaEvent('visit-saved', () => tick(n => n + 1));

  const drafts: DraftRow[] = React.useMemo(() => {
    try {
      const d = sigma?.visitDraftFor?.(null, me, today) as DraftRow | null;
      return d ? [d] : [];
    } catch { return []; }
  }, [me, today, checkins.length]);

  const stops = React.useMemo(
    () => todayStops({ me, today, checkins, visits, plan: (planQ.data || []) as string[] }),
    [me, today, checkins, visits, planQ.data],
  );
  const nudges = React.useMemo(
    () => openNudges({ me, checkins, visits, drafts }),
    [me, checkins, visits, drafts],
  );

  // §7n: no sign-in, no content — but this strip sits ABOVE the cards, which already show
  // the sign-in card, so a closed gate here means "render nothing", not a second login box.
  if (!isGateOpen(gate) || personRole !== 'field' || (!stops.length && !nudges.length)) return null;

  const openCount = stops.filter(s => !s.done).length;

  return (
    <div data-testid="today-strip" className="mb-2.5 rounded-[14px] border border-border bg-card px-3 py-2.5">
      <button
        type="button"
        onClick={() => { const next = !folded; setFolded(next); try { localStorage.setItem(TODAY_FOLDED_KEY, next ? '1' : '0'); } catch { /* private mode */ } }}
        aria-expanded={!folded}
        className="flex w-full items-center gap-2 text-[14px] font-bold"
      >
        <Sun className="h-4 w-4 text-[color:var(--brand-1)]" />
        <span>היום</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold"><bdi>{dm(today)}</bdi></span>
        <span className="ms-auto text-[11px] font-semibold text-muted-foreground">
          {stops.length} עצירות{openCount ? ' · ' + openCount + ' פתוח' : ''}
        </span>
        <ChevronDown className={'h-4 w-4 text-muted-foreground transition-transform ' + (folded ? '' : 'rotate-180')} />
      </button>

      {!folded && (
        <>
          {/* ══════ ROUND 2 · PACKAGE G — today's briefing as a row (G6) ══════
              Same shape as the 🔥 burns strip: one line, one tap, always in the same place. */}
          {!!stops.length && (
            <button
              type="button"
              data-testid="today-brief-row"
              onClick={() => (window as any).sigmaField?.openBriefing?.(stops[0].name)}
              className="mt-2 flex w-full items-center gap-2 rounded-[10px] border border-border bg-muted px-2.5 py-2 text-[13px] font-semibold"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[color:var(--brand-1)]" />
              <span className="min-w-0 flex-1 text-start">הבריפינג של היום · <bdi>{stops[0].name}</bdi></span>
              <span className="text-[11px] font-bold text-muted-foreground">פתח</span>
            </button>
          )}
          {/* ══════ ROUND 2 · PACKAGE G (end) ══════ */}
          {!!stops.length && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {stops.map(s => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => (window as any).sigmaField?.openBriefing?.(s.name)}
                  className={'flex flex-none items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1.5 text-[12.5px] font-semibold ' +
                    (s.done ? 'opacity-55 line-through' : '')}
                >
                  <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-brand-grad text-[11px] text-white">{s.n}</span>
                  <span>{s.name}{s.note ? ' · ' + s.note : ''}</span>
                </button>
              ))}
            </div>
          )}
          {nudges.map(n => (
            <div
              key={n.checkinId}
              data-testid="today-nudge"
              className="mt-2 flex items-center gap-2 rounded-[10px] bg-[color:var(--sigma-warn)]/15 px-2.5 py-2 text-[13px]"
            >
              <AlarmClock className="h-4 w-4 shrink-0 text-[color:var(--sigma-warn-ink)]" />
              <span className="min-w-0 flex-1">{n.text}</span>
              <button
                type="button"
                onClick={() => {
                  track('field-nudge-visit', n.kibbutz);
                  // §7p: the nudge lands on the chapter he left, with the טיוטה chip on it.
                  if (!openVisitChapters(n.kibbutz)) sigma.openVisitQuick(n.kibbutz);
                }}
                className="min-h-8 flex-none rounded-lg bg-brand-grad px-2.5 text-[12px] font-bold text-white"
              >
                סיכום ביקור
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function Field() {
  return <SigmaProviders><FieldIsland /></SigmaProviders>;
}

export function Today() {
  return <SigmaProviders><TodayIsland /></SigmaProviders>;
}

/** Called from main.tsx's lazy import. Two roots, one chunk: they share the query cache. */
export function mountField(): boolean {
  const a = mount('sigma-field', Field);
  const b = mount('sigma-today', Today);
  return a || b;
}
