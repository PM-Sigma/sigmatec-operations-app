// "היום שלי" — the strip at the top of פעולות שטח (spec 2026-09-29-field-ops-hub-design.md §1).
// Read-only glance: today's route/visits, a סיכום ביקור quick entry, and my tasks due today or
// overdue. Staff only (hubSections never lists it for the viewer). Every decision is pure, in
// lib/fieldHubToday.ts.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, ClipboardList, MapPin, NotebookPen } from 'lucide-react';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Tag } from '@/components/ui/chip';
import { useInternalTasks } from '@/components/home/InternalTasks';
import { readPlan } from '@/lib/calendarData';
import { ymd, type VisitRow } from '@/lib/calendar';
import type { ListTask } from '@/lib/taskList';
import { myDueTasks, nextStop, todayStops, type TodayTask } from '@/lib/fieldHubToday';
import { HUB_SECTION_ID } from '@/lib/fieldHub';

function read<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }

/** No day-navigation API exists for the calendar except its `sigmaCalendarOpenDay` hook (set once the
 *  calendar island is mounted), so: open the page, then jump to today if the hook is there. */
function openCalendarToday(today: string) {
  sigma.showPage('calendar');
  window.setTimeout(() => { try { (window as any).sigmaCalendarOpenDay?.(today); } catch { /* not mounted yet */ } }, 300);
}

function openVisit(kibbutz?: string) {
  if (kibbutz) {
    const opened = read(() => (sigma as any).openVisitEditor?.({ kibbutz, mode: 'new' }), false);
    if (!opened) (window as any).sigmaVisitChapters?.open?.(kibbutz);
    return;
  }
  sigma.openVisitQuick?.();
}

function openTask(t: TodayTask) {
  if (t.kind === 'ems') { read(() => sigma.openKibbutzEmsTask?.(t.id), undefined); return; }
  if (t.kibbutz) { read(() => sigma.openKibbutzModal?.(t.kibbutz), undefined); return; }
  (window as any).sigmaOpenMyTasks?.();
}

function TodayInner() {
  const { name: me } = useCurrentUser();
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('ems-cache-synced', () => setTick(t => t + 1));
  useSigmaEvent('dayplan-changed', () => setTick(t => t + 1));
  const now = new Date();
  const today = ymd(now);

  const plan = useQuery({ queryKey: ['fieldhub', 'plan', me, today], queryFn: () => readPlan(me, today), enabled: !!me });
  const internal = useInternalTasks();

  const stops = React.useMemo(
    () => todayStops(plan.data, read(() => (sigma.loadAllVisitsCombined?.() || []) as VisitRow[], []), me, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.data, me, today, tick],
  );
  const due = React.useMemo(
    () => myDueTasks(read(() => (sigma.emsCacheData?.()?.tasks || []) as ListTask[], []), internal.data, me, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internal.data, me, tick],
  );

  return (
    <SectionBlock title="היום שלי">
      <div className="flex flex-col gap-1">
        {stops.length ? stops.map(s => (
          <ListRow
            key={s.kibbutz}
            data-testid="fieldhub-today-stop"
            leading={s.done ? <CheckCircle2 aria-hidden className="h-5 w-5" /> : <MapPin aria-hidden className="h-5 w-5" />}
            title={<bdi>{s.kibbutz}</bdi>}
            meta={s.done ? 'סוכם' : 'מתוכנן להיום'}
            onClick={() => openCalendarToday(today)}
          />
        )) : (
          <ListRow leading={<CalendarDays aria-hidden className="h-5 w-5" />} title="אין ביקורים היום" data-testid="fieldhub-today-none" />
        )}
        <div className="px-4 py-1">
          <BubbleButton variant="tonal" size="sm" icon={<NotebookPen aria-hidden className="h-4 w-4" />} data-testid="fieldhub-today-visit" onClick={() => openVisit(nextStop(stops))}>
            סיכום ביקור
          </BubbleButton>
        </div>
        {due.rows.length ? (
          <>
            {due.rows.map(t => (
              <ListRow
                key={t.kind + t.id}
                data-testid="fieldhub-today-task"
                leading={<ClipboardList aria-hidden className="h-5 w-5" />}
                title={<bdi>{t.title}</bdi>}
                meta={<>{t.kibbutz ? <bdi>{t.kibbutz}</bdi> : 'כללי'}{' '}{t.late ? <Tag role="danger">באיחור</Tag> : <Tag role="neutral">להיום</Tag>}</>}
                onClick={() => openTask(t)}
              />
            ))}
            {due.more > 0 && (
              <ListRow data-testid="fieldhub-today-more" title={`עוד ${due.more}`} onClick={() => (window as any).sigmaOpenMyTasks?.()} />
            )}
          </>
        ) : (
          <ListRow leading={<ClipboardList aria-hidden className="h-5 w-5" />} title="אין משימות להיום" data-testid="fieldhub-today-notasks" />
        )}
      </div>
    </SectionBlock>
  );
}

function FieldHubToday() {
  const page = useCurrentPage();
  const { isViewer } = useCurrentUser();
  if (page !== 'fieldops' || isViewer) return null;
  return <SigmaProviders><TodayInner /></SigmaProviders>;
}

export function mountFieldHubToday(): boolean {
  return mount(HUB_SECTION_ID.today, FieldHubToday);
}
