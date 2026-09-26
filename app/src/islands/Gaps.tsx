// 📋 הפערים שלי — #sigma-gaps (spec §7h).
//
// One panel, two audiences:
//   · a field worker sees HIS list, and every row has the one button that closes it;
//   · עמיחי and the viewer see the same list per person, with a 🔔 instead of the buttons —
//     they cannot write a summary for somebody else, and pretending otherwise would put a
//     half-true visit in the record.
//
// Copy rules (§7h): nothing here explains the app's own mechanics, and nothing tells a person
// who else can see his list. The admin view is its own screen; the employee view has no
// mirror text about it.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, CheckCircle2, ClipboardList, ExternalLink, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBlock } from '@/components/ui/section-block';
import { SectionError } from '@/components/ui/section-error';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, sigmaBus, useCurrentUser } from '@/bridge';
import { ymd, type AttRow, type Holiday } from '@/lib/attendance';
import {
  defaultRange, flattenDayPlans, gapsFor, gapsSummary, nudgeable, shiftDays,
  type DayPlanRow, type Gap, type GapKind, type GapSources, type GapTask,
} from '@/lib/gaps';

/** gap.actionIcon (lucide names, round 5 L1) → the actual component the row's bubble draws. */
const ACTION_ICON = { MapPin, CalendarDays, ExternalLink } as const;

/** The three SectionBlocks a triage list groups into (round 5 U2). */
const KIND_TITLE: Record<GapKind, string> = { visit: 'סיכומי ביקור', attendance: 'נוכחות', task: 'משימות' };
const KIND_ORDER: GapKind[] = ['visit', 'attendance', 'task'];

export const GAPS_OPEN_EVENT = 'sigma-open-gaps';

// Cold-open flag (FIX ROUND 1, task-15 review §Important): `main.tsx`'s deferred loader wants
// the very FIRST open of this panel to show the sheet the instant it mounts, but the sheet's
// own `sigma-open-gaps` listener only attaches inside a `useEffect`, which React flushes
// asynchronously — a re-dispatched event fired right after `mountGaps()` returns can beat the
// effect and be lost (the "first tap does nothing" bug). `pendingOpen` is read synchronously
// by `GapsIsland`'s `useState` initializer, which runs during the SAME synchronous render pass
// `mount()` triggers, so it can never race the effect.
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
try { window.addEventListener(GAPS_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

/** Open 📋 הפערים שלי from anywhere (⋯ עוד, the settings panel, a push deep link). */
export function openGaps(): void {
  pendingOpen = true;   // cleared by the listener, or drained by the island's first effect
  try { window.dispatchEvent(new CustomEvent(GAPS_OPEN_EVENT)); } catch { /* no DOM */ }
}

/** The two field people. The admin list is about their days, and nobody else has any. */
function fieldPeople(): string[] {
  try { return (sigma.ATT_PEOPLE || []).slice(); } catch { return ['אביאם', 'ניתאי']; }
}

/** May this person see OTHER people's lists? עמיחי and the viewer, per §7h. */
function seesEveryone(user: string): boolean {
  try { return !!sigma.isViewer?.() || user === 'עמיחי' || !!sigma.isIdan?.(); } catch { return user === 'עמיחי'; }
}

// ───────────────────────────── the sources ─────────────────────────────
// Read once for everybody the panel is about, then handed to the pure `gapsFor` per person.
// One fetch, not one per person: the admin view is two people and the round trips are the
// expensive part.
async function fetchSources(people: string[], from: string, today: string): Promise<Record<string, GapSources>> {
  const sb = await getSupabase();
  const [checkins, plans] = await Promise.all([
    sb.from('field_checkins').select('person,kibbutz,checked_in_at,dismissed')
      .in('person', people).gte('checked_in_at', from).limit(500),
    // `day_plans` has no `kibbutz` column — the route is `stops: [{ kibbutz, task_ids }, …]`
    // per (person, date) row (db/day_plans.sql). Asking for `kibbutz` directly silently came
    // back `undefined` on every row, so every planned stop was invisible to the gaps list.
    sb.from('day_plans').select('person,date,stops').in('person', people)
      .gte('date', from).lt('date', today).limit(500),
  ]);

  // The visits the legacy bundle already merged for this session — the same rows the visit
  // report reads, so a summary that exists there can never look missing here.
  let visits: Array<{ visitor?: string; kibbutz?: string; date?: string }> = [];
  try { visits = (sigma.loadAllVisitsCombined?.() || []) as typeof visits; } catch { /* legacy not up */ }

  let tasks: GapTask[] = [];
  try { tasks = (sigma.emsCacheData?.().tasks || []) as unknown as GapTask[]; } catch { /* EMS not connected */ }

  let holidays: Holiday[] = [];
  try { holidays = (sigma.attHolidays?.() || []) as Holiday[]; } catch { /* none loaded */ }

  const dayPlans = flattenDayPlans((plans.data || []) as DayPlanRow[]);

  const out: Record<string, GapSources> = {};
  for (const person of people) {
    // Attendance is per person and per month, and the window straddles two of them.
    const att: AttRow[] = [];
    for (const ym of new Set([from.slice(0, 7), today.slice(0, 7)])) {
      const [y, m] = ym.split('-').map(Number);
      try { att.push(...((sigma.attRows?.(person, y, m) || []) as AttRow[])); } catch { /* no report */ }
    }
    out[person] = {
      checkins: (checkins.data || []) as GapSources['checkins'],
      dayPlans,
      visits,
      tasks,
      attendance: att,
      holidays,
    };
  }
  return out;
}

/** One gap, as a ListRow whose meta line carries a tonal action bubble (round 5 U2: this is a
    TRIAGE list — the row itself isn't the tap target, the bubble under it is). */
function GapRow({ gap, onAct }: { gap: Gap; onAct: (g: Gap) => void }) {
  const Icon = ACTION_ICON[gap.actionIcon];
  return (
    <ListRow
      title={gap.text}
      meta={
        <BubbleButton variant="tonal" size="sm" className="mt-1.5" icon={<Icon aria-hidden className="h-3.5 w-3.5" />} onClick={() => onAct(gap)}>
          {gap.actionLabel}
        </BubbleButton>
      }
    />
  );
}

/** The list for ONE person, grouped into a SectionBlock per kind. Exported so the settings
    panel can embed it. `nudge` renders an admin's "שליחת תזכורת" IconBubble on the block
    header when supplied — hidden for the field worker's own list and for the viewer. */
export function GapsList({ person, onClose, nudge }: {
  person: string; onClose?: () => void; nudge?: React.ReactNode;
}) {
  const today = ymd(new Date());
  const range = React.useMemo(() => defaultRange(today), [today]);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['gaps', person, range.from, range.today],
    queryFn: () => fetchSources([person], range.from, range.today),
    enabled: !!person,
  });

  // A visit saved anywhere in the app closes a gap here — the list must not keep asking for
  // something that is already filed.
  React.useEffect(() => {
    const on = () => void qc.invalidateQueries({ queryKey: ['gaps'] });
    sigmaBus?.addEventListener('visit-saved', on);
    return () => sigmaBus?.removeEventListener('visit-saved', on);
  }, [qc]);

  const gaps = React.useMemo(
    () => (q.data ? gapsFor(person, q.data[person] || {}, range) : []),
    [q.data, person, range],
  );

  const act = React.useCallback((g: Gap) => {
    track('gap-act', g.kind);
    onClose?.();
    try {
      // §7p: a visit gap lands in the chapters sheet, on the chapter he left off at.
      if (g.kind === 'visit' && g.kibbutz) {
        const chapters = (window as any).sigmaVisitChapters;
        if (chapters?.open) chapters.open(g.kibbutz);
        else sigma.openVisitQuick?.(g.kibbutz);
      }
      else if (g.kind === 'attendance') sigma.showPage?.('attendance');
      else if (g.kind === 'task' && g.taskId) sigma.openKibbutzEmsTask?.(g.taskId);
    } catch { toast.error('לא הצלחתי לפתוח. נסה מהמסך הראשי'); }
  }, [onClose]);

  if (q.isLoading) return <div className="flex flex-col gap-2 py-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (q.isError) return <SectionError text="לא הצלחנו לטעון את הפערים." onRetry={() => void qc.invalidateQueries({ queryKey: ['gaps'] })} />;

  if (!gaps.length) {
    return <EmptyState icon={<CheckCircle2 />} title="אין פערים פתוחים." />;
  }

  return (
    <div data-testid="gaps-list" data-count={gaps.length} className="flex flex-col gap-3">
      {nudge && <div className="flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold text-muted-foreground">{gapsSummary(gaps)}</span>
        {nudge}
      </div>}
      {KIND_ORDER.map(kind => {
        const inKind = gaps.filter(g => g.kind === kind);
        if (!inKind.length) return null;
        return (
          <SectionBlock key={kind} title={KIND_TITLE[kind]} count={inKind.length}>
            {inKind.map(g => <GapRow key={g.id} gap={g} onAct={act} />)}
          </SectionBlock>
        );
      })}
    </div>
  );
}

/** עמיחי / עידן / הצפייה: a per-person picker (≤4 field people, so SegmentedControl fits),
    then the same GapsList kind-blocks for whoever is selected — with an admin-only nudge
    IconBubble on the block header (round 5 U2). The viewer never nudges (§7h: he only reads). */
function EveryoneList({ isViewer }: { isViewer: boolean }) {
  const today = ymd(new Date());
  const range = React.useMemo(() => defaultRange(today), [today]);
  const people = React.useMemo(fieldPeople, []);
  const [person, setPerson] = React.useState(() => people[0] || '');
  const [sent, setSent] = React.useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ['gaps', 'all', range.from, range.today],
    queryFn: () => fetchSources(people, range.from, range.today),
  });

  const gapsByPerson = React.useMemo(() => {
    const out: Record<string, Gap[]> = {};
    for (const p of people) out[p] = q.data ? gapsFor(p, q.data[p] || {}, range) : [];
    return out;
  }, [q.data, people, range]);

  const nag = async (p: string, count: number) => {
    track('gap-nudge', p);
    const ok = await sigma.gapNag?.(p, count);
    setSent(s => ({ ...s, [p]: true }));
    if (ok) toast.success('נשלחה תזכורת ל' + p);
  };

  if (q.isLoading) return <div className="flex flex-col gap-2 py-3">{people.map(p => <Skeleton key={p} className="h-12 w-full" />)}</div>;

  const worth = nudgeable(gapsByPerson[person] || [], range.today).length;

  return (
    <div data-testid="gaps-everyone" className="flex flex-col gap-3">
      {people.length > 1 && (
        <SegmentedControl
          ariaLabel="בחירת עובד"
          options={people.map(p => ({ value: p, label: p }))}
          value={person}
          onChange={setPerson}
        />
      )}
      <GapsList
        person={person}
        nudge={!isViewer && worth > 0 ? (
          <BubbleButton
            data-testid={'gap-nudge-' + person}
            variant="icon"
            aria-label={'שליחת תזכורת ל' + person}
            disabled={!!sent[person]}
            onClick={() => void nag(person, gapsByPerson[person].length)}
          >
            <Bell aria-hidden className="h-4 w-4" />
          </BubbleButton>
        ) : undefined}
      />
    </div>
  );
}

function GapsIsland() {
  // Initializer runs synchronously during this render — the same tick `mount()` calls
  // `createRoot(...).render(...)` in, well before any `useEffect` flushes. Consuming
  // `pendingOpen` here (instead of via a re-dispatched event) is what makes the cold-load
  // open land instead of racing the listener below into existence.
  const [open, setOpen] = React.useState(() => {
    if (pendingOpen) { pendingOpen = false; return true; }
    return false;
  });
  const { name: user, isViewer } = useCurrentUser();

  React.useEffect(() => {
    if (open) track('gaps-open'); // covers the cold-open path (state already true on mount)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
  // The cold-load open is already handled: `openX()` raises `pendingOpen` before it dispatches,
  // and the `useState` initializer above drains it during the very render `mount()` schedules —
  // strictly before this effect commits. So this effect only has to carry the WARM path (the
  // island is mounted, somebody dispatches the event). A second `pendingOpen` drain here would
  // be dead code: the initializer has always cleared it by the time we get here.
    const on = () => { pendingOpen = false; setOpen(true); track('gaps-open'); };
    window.addEventListener(GAPS_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(GAPS_OPEN_EVENT, on as EventListener);
  }, []);

  const everyone = seesEveryone(user);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" data-testid="gaps-sheet" className="max-h-[88svh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ClipboardList aria-hidden className="h-5 w-5" /> פערים
          </SheetTitle>
          <SheetDescription>
            {everyone ? 'שלושת השבועות האחרונים, לפי עובד' : 'מה שנשאר לסגור מהשבועות האחרונים'}
          </SheetDescription>
        </SheetHeader>
        {everyone ? <EveryoneList isViewer={isViewer} /> : <GapsList person={user} onClose={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  );
}

export function Gaps() {
  return <SigmaProviders><GapsIsland /></SigmaProviders>;
}

export function mountGaps(opts?: { open?: boolean }): boolean {
  if (opts?.open) pendingOpen = true;
  const ok = mount('sigma-gaps', Gaps);
  if (!ok) return false;
  // Exposed for the push deep link (?pushact=gaps), which runs in the legacy bundle.
  (window as any).sigmaOpenGaps = openGaps;
  registerMoreItem({
    id: 'gaps',
    label: 'פערים',
    icon: 'ClipboardList',
    group: 'app',
    visible: () => {
      try {
        const me = sigma.getCurrentUser?.() || '';
        return seesEveryone(me) || fieldPeople().includes(me);
      } catch { return false; }
    },
    onSelect: openGaps,
  });
  return true;
}

/** The window the panel asks about, exported so the settings summary agrees with it. */
export const GAPS_FROM = (today: string) => shiftDays(today, -21);
