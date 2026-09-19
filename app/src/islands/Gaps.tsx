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
import { Bell, CheckCircle2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, sigmaBus, useCurrentUser } from '@/bridge';
import { ymd, type AttRow, type Holiday } from '@/lib/attendance';
import {
  defaultRange, gapsFor, gapsSummary, nudgeable, shiftDays,
  type Gap, type GapSources, type GapTask,
} from '@/lib/gaps';

export const GAPS_OPEN_EVENT = 'sigma-open-gaps';

/** Open 📋 הפערים שלי from anywhere (⋯ עוד, the settings panel, a push deep link). */
export function openGaps(): void {
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
    sb.from('day_plans').select('person,date,kibbutz').in('person', people)
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
      dayPlans: (plans.data || []) as GapSources['dayPlans'],
      visits,
      tasks,
      attendance: att,
      holidays,
    };
  }
  return out;
}

function GapRow({ gap, onAct }: { gap: Gap; onAct: (g: Gap) => void }) {
  return (
    <li className="flex items-center gap-2 border-b border-border py-2.5 last:border-b-0">
      <span className="flex-1 text-[13px] leading-snug text-foreground">{gap.text}</span>
      <button
        type="button"
        onClick={() => onAct(gap)}
        className="min-h-9 flex-none rounded-[10px] bg-brand-grad px-3 text-[12px] font-extrabold text-white"
      >
        {gap.actionLabel}
      </button>
    </li>
  );
}

/** The list for ONE person, with its own actions. Exported so the settings panel can embed it. */
export function GapsList({ person, onClose }: { person: string; onClose?: () => void }) {
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
      if (g.kind === 'visit' && g.kibbutz) sigma.openVisitQuick?.(g.kibbutz);
      else if (g.kind === 'attendance') sigma.showPage?.('attendance');
      else if (g.kind === 'task' && g.taskId) sigma.openKibbutzEmsTask?.(g.taskId);
    } catch { toast.error('לא הצלחתי לפתוח — נסה מהמסך הראשי'); }
  }, [onClose]);

  if (q.isLoading) return <div className="flex flex-col gap-2 py-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (q.isError) return <p className="py-4 text-[13px] text-muted-foreground">הרשימה לא נטענה — נסה שוב בעוד רגע.</p>;

  return (
    <div data-testid="gaps-list" data-count={gaps.length}>
      <p className="flex items-center gap-1.5 py-2 text-[13px] font-semibold text-foreground">
        {gaps.length === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {gapsSummary(gaps)}
      </p>
      <ul className="flex flex-col">
        {gaps.map(g => <GapRow key={g.id} gap={g} onAct={act} />)}
      </ul>
    </div>
  );
}

/** עמיחי / the viewer: one line per person, a count, and the 🔔. */
function EveryoneList() {
  const today = ymd(new Date());
  const range = React.useMemo(() => defaultRange(today), [today]);
  const people = React.useMemo(fieldPeople, []);
  const [sent, setSent] = React.useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ['gaps', 'all', range.from, range.today],
    queryFn: () => fetchSources(people, range.from, range.today),
  });

  const nag = async (person: string, count: number) => {
    track('gap-nudge', person);
    const ok = await sigma.gapNag?.(person, count);
    setSent(s => ({ ...s, [person]: true }));
    if (ok) toast.success('נשלחה תזכורת ל' + person);
  };

  if (q.isLoading) return <div className="flex flex-col gap-2 py-3">{people.map(p => <Skeleton key={p} className="h-12 w-full" />)}</div>;

  return (
    <ul className="flex flex-col" data-testid="gaps-everyone">
      {people.map(person => {
        const gaps = q.data ? gapsFor(person, q.data[person] || {}, range) : [];
        const worth = nudgeable(gaps, range.today).length;
        return (
          <li key={person} className="flex items-center gap-2 border-b border-border py-3 last:border-b-0" data-person={person}>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-foreground">{person}</div>
              <div className="text-[12px] text-muted-foreground">
                {gaps.length ? <><bdi>{gaps.length}</bdi> פריטים פתוחים</> : 'אין פערים פתוחים'}
              </div>
            </div>
            {worth > 0 && (
              <button
                type="button"
                data-testid={'gap-nudge-' + person}
                onClick={() => void nag(person, gaps.length)}
                disabled={!!sent[person]}
                title={'שלח תזכורת ל' + person}
                className="inline-flex min-h-9 flex-none items-center gap-1 rounded-[10px] border border-border bg-card px-3 text-[12px] font-extrabold text-foreground disabled:opacity-50"
              >
                <Bell className="h-4 w-4" /> תזכורת
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GapsIsland() {
  const [open, setOpen] = React.useState(false);
  const { name: user } = useCurrentUser();

  React.useEffect(() => {
    const on = () => { setOpen(true); track('gaps-open'); };
    window.addEventListener(GAPS_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(GAPS_OPEN_EVENT, on as EventListener);
  }, []);

  const everyone = seesEveryone(user);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" data-testid="gaps-sheet" className="max-h-[88svh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5" /> {everyone ? 'פערים פתוחים' : 'הפערים שלי'}
          </SheetTitle>
          <SheetDescription>
            {everyone ? 'שלושת השבועות האחרונים' : 'מה שנשאר לסגור מהשבועות האחרונים'}
          </SheetDescription>
        </SheetHeader>
        {everyone ? <EveryoneList /> : <GapsList person={user} onClose={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  );
}

export function Gaps() {
  return <SigmaProviders><GapsIsland /></SigmaProviders>;
}

export function mountGaps(): boolean {
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
