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
  AlarmClock, CalendarDays, Check, ChevronDown, ClipboardList, MapPin, Search, Sun, Truck,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
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
  arrivalGroups, arrivalOrder, bulletForField, dm, fieldShouldPrompt, hasSomethingToDeliver,
  hm, leaveChecklist, openItemsPrefill, openNudges, todayStops,
  type ArrivalItem, type CheckinRow, type DraftRow, type FieldTask, type LeaveItem, type OrderRow,
  type VisitRow,
} from '@/lib/field';

// ───────────────────────────── keys & storage ─────────────────────────────

/** The bus event a new check-in announces (docs/integration-map.md). */
export const CHECKIN_CREATED = 'checkin-created';
/** The device's memory of today's arrival — what stops the sheet asking twice. */
export const CHECKIN_KEY = 'checkin_today';
/** The day he said he is not out in the field. */
export const NO_FIELD_KEY = 'field_no_visit_v1';
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
  items, loading, query, onQuery, onPick, onSkip, onStraightToVisit,
}: {
  items: ArrivalItem[];
  loading: boolean;
  query: string;
  onQuery: (q: string) => void;
  onPick: (name: string) => void;
  onSkip: () => void;
  onStraightToVisit: () => void;
}) {
  const groups = React.useMemo(() => arrivalGroups(items), [items]);
  return (
    <div className="px-4 pb-6">
      <SheetTitle className="text-[22px] font-extrabold tracking-[-.01em]">לאיזה קיבוץ הגעת?</SheetTitle>
      <SheetDescription className="mb-3 mt-1 text-[13px] text-muted-foreground">
        נכין לך את כל מה שקורה שם — משימות, סיכום הישיבה וביקור קודם.
      </SheetDescription>

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
              {checklist.map(item => {
                const on = !!checked[item.id];
                return (
                  <button
                    key={item.id}
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
              })}
            </div>
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
            אין כאן שום דבר פתוח — יום נקי. תכתוב מה עשית וזהו.
          </p>
        )}
      </div>

      {/* the two CTAs, always reachable — the whole point of the one-screen decision */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex gap-2 bg-gradient-to-t from-background from-70% to-transparent px-3 pb-5 pt-2.5">
        <ShimmerButton
          onClick={onVisit}
          data-testid="brief-visit"
          background="linear-gradient(135deg,#00B4C6,#0FBF5F)"
          className="pointer-events-auto min-h-[58px] flex-1 rounded-xl text-[16px] font-extrabold text-white shadow-[0_10px_24px_rgba(6,194,203,.45)]"
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

  const openArrival = React.useCallback(() => { setQuery(''); setMode('arrival'); track('field-arrival-open'); }, []);

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
        toast.error(e?.message || 'לא נשמר — נסה שוב');
      });
  }, [picked, me]);

  // ---- the briefing's content -------------------------------------------
  const brief = React.useMemo(() => {
    if (!picked) return null;
    let raw: CardEmsTask[] = [];
    try { raw = (sigma?.emsCacheTasksForKibbutz?.(picked) as CardEmsTask[]) || []; } catch { raw = []; }
    const tasks = sortTasksForCard(raw, me);
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
   * 📍 סיכום ביקור. The unticked rows travel with him: they are parked on the draft the visit
   * form is about to pick up, so "מה נשאר לי פתוח" is already written when he gets there.
   */
  const openVisit = () => {
    if (!brief) return;
    // The unticked rows travel through the BRIDGE, never by touching the legacy form's DOM
    // from here: `prefillOpenItems` waits for `visit-form-open` and writes the field once,
    // only while it is still empty, so it can never overwrite what he already typed.
    const text = openItemsPrefill(brief.checklist, checked);
    try { sigma.prefillOpenItems?.(picked, text); } catch (e) { console.warn('[field] prefill', e); }
    track('field-brief-visit', picked);
    setMode('closed');
    sigma.openVisitQuick(picked);
  };

  /** 🚚 — the form first, the certificate once it is on screen, so the cert links to the visit. */
  const openCert = () => {
    const once = () => {
      sigmaBus.removeEventListener('visit-form-open', once);
      clearTimeout(timer);
      try { sigma.certFromVisitForm(); } catch (e) { console.warn('[field] cert', e); }
    };
    const timer = setTimeout(() => sigmaBus.removeEventListener('visit-form-open', once), 120_000);
    sigmaBus.addEventListener('visit-form-open', once);
    track('field-brief-cert', picked);
    setMode('closed');
    sigma.openVisitQuick(picked);
  };

  const skipToday = () => {
    try { localStorage.setItem(NO_FIELD_KEY, today); } catch { /* private mode */ }
    track('field-arrival-skip');
    setMode('closed');
  };

  const dur = reduce ? 0 : 0.28;
  if (!isGateOpen(gate)) return null;          // §7n — nothing without a live sign-in

  return (
    <Sheet open={mode !== 'closed'} onOpenChange={o => { if (!o) setMode('closed'); }}>
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
              <SheetTitle className="sr-only">{'בריפינג — ' + picked}</SheetTitle>
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
      </SheetContent>
    </Sheet>
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
                onClick={() => { track('field-nudge-visit', n.kibbutz); sigma.openVisitQuick(n.kibbutz); }}
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
