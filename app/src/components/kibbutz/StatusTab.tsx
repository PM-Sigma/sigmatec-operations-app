// StatusTab — the מצב הקיבוץ tab of KibbutzDetail (round 5, package K-U2). The five sections
// of OPEN_CARD_SECTIONS, in order (QA קיבוצים 4), each a SectionBlock with a generic title and
// its own EmptyState. Burns are never rendered here (ruling "Burns").
import * as React from 'react';
import { ClipboardList, MapPin, CalendarDays, Pencil, Truck } from 'lucide-react';
import { SectionBlock } from '@/components/ui/section-block';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBubble } from '@/components/ui/icon-bubble';
import { BubbleButton } from '@/components/ui/bubble-button';
import { sigma } from '@/bridge';
import { OPEN_CARD_SECTIONS, latestVisitFor, lastVisitReport } from '@/lib/kibbutzDetail';
import { useKibbutzVisits } from '@/lib/kibbutzVisits';
import { isUnlinked, type KibbutzRow } from '@/lib/kibbutzim';
import { EmsTasks } from '@/components/home/EmsTasks';
import { InternalTasksPanel } from '@/components/home/InternalTasks';
import { MeetingTimeline, useMeetingNotes } from '@/components/home/MeetingNotes';
import { HealthStrip } from '@/components/home/HealthStrip';
import { OnboardingProgress } from '@/components/home/OnboardingProgress';

function emsCount(kibbutz: string): number {
  try { return (sigma?.emsCacheTasksForKibbutz?.(kibbutz) || []).length; } catch { return 0; }
}

function EmsSection({ kibbutz, canAct, row }: { kibbutz: string; canAct: boolean; row: KibbutzRow }) {
  const count = emsCount(kibbutz);
  return (
    <SectionBlock title="משימות EMS" count={count || undefined}>
      {isUnlinked(row) && (
        <p className="mb-2 px-4 text-[12.5px] font-semibold text-[color:var(--warn-ink)]">לא מקושר ל-EMS</p>
      )}
      {canAct && (
        <div className="mb-2 px-4">
          <BubbleButton
            variant="tonal" size="sm" data-adder="ems"
            onClick={() => { void sigma.createEmsTaskFor?.(kibbutz); }}
          >
            משימה חדשה
          </BubbleButton>
        </div>
      )}
      {count > 0
        ? <EmsTasks kibbutz={kibbutz} variant="full" />
        : <EmptyState icon={<ClipboardList />} title="אין משימות פתוחות לקיבוץ הזה." />}
    </SectionBlock>
  );
}

function InternalSection({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  return (
    <SectionBlock title="משימות פנימיות">
      <InternalTasksPanel kibbutz={kibbutz} canAct={canAct} />
    </SectionBlock>
  );
}

function LastVisitSection({ kibbutz, now }: { kibbutz: string; now: Date }) {
  const visits = useKibbutzVisits(kibbutz);
  const visit = latestVisitFor(visits, kibbutz);
  if (!visit) {
    return (
      <SectionBlock title="דוח ביקור אחרון">
        <EmptyState icon={<MapPin />} title="עוד אין סיכום ביקור לקיבוץ הזה." />
      </SectionBlock>
    );
  }
  const r = lastVisitReport(visit, now);
  const hasProducts = r.products.length > 0;
  const editVisit = () => sigma?.openVisitEditor?.({ kibbutz, visitId: visit.id, mode: 'edit' });
  const certVisit = () => sigma?.openVisitEditor?.({ kibbutz, visitId: visit.id, mode: 'cert' });
  return (
    <SectionBlock title="דוח ביקור אחרון">
      <div className="flex flex-col gap-1.5 px-4 text-[13.5px] leading-[1.6]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold"><bdi>{r.date}</bdi> · {r.hours} · {r.visitors}</span>
          <span className="flex shrink-0 gap-1">
            <IconBubble icon={<Pencil className="h-4 w-4" />} label="עריכת הסיכום" size={32} onClick={editVisit} />
            {hasProducts && (
              <IconBubble icon={<Truck className="h-4 w-4" />} label="תעודת משלוח" size={32} onClick={certVisit} />
            )}
          </span>
        </div>
        {r.contact && <p className="text-muted-foreground">איש קשר: {r.contact}</p>}
        {hasProducts && <p>{r.products.join(', ')}</p>}
        {r.productsOther && <p className="text-muted-foreground">{r.productsOther}</p>}
        {r.summary && <p className="whitespace-pre-line">{r.summary}</p>}
        {r.openItems && <p className="text-[color:var(--warn-ink)]">נשאר פתוח: {r.openItems}</p>}
      </div>
    </SectionBlock>
  );
}

function MeetingsSection({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const { data, isLoading } = useMeetingNotes();
  const hasAny = !isLoading && !!data?.length;
  return (
    <SectionBlock title="סיכומי ישיבות">
      {hasAny
        ? <MeetingTimeline rows={data} kibbutz={kibbutz} canAct={canAct} expandAll />
        : <EmptyState icon={<CalendarDays />} title="עוד לא נרשמו ישיבות לקיבוץ הזה." />}
    </SectionBlock>
  );
}

function StatusSection({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  return (
    <SectionBlock title="מצב הקיבוץ">
      <div className="flex flex-col gap-2 px-4">
        <HealthStrip kibbutz={kibbutz} />
        <OnboardingProgress kibbutz={kibbutz} canAct={canAct} />
      </div>
    </SectionBlock>
  );
}

const SECTION_BY_KEY: Record<string, (p: { kibbutz: string; canAct: boolean; row: KibbutzRow; now: Date }) => React.ReactElement> = {
  ems: p => <EmsSection kibbutz={p.kibbutz} canAct={p.canAct} row={p.row} />,
  internal: p => <InternalSection kibbutz={p.kibbutz} canAct={p.canAct} />,
  lastVisitReport: p => <LastVisitSection kibbutz={p.kibbutz} now={p.now} />,
  meetings: p => <MeetingsSection kibbutz={p.kibbutz} canAct={p.canAct} />,
  status: p => <StatusSection kibbutz={p.kibbutz} canAct={p.canAct} />,
};

export function StatusTab({ kibbutz, row, canAct }: { kibbutz: string; row: KibbutzRow; canAct: boolean; role: string }) {
  const now = React.useMemo(() => new Date(), []);
  return (
    <div className="flex flex-col gap-3">
      {OPEN_CARD_SECTIONS.map(key => (
        <div key={key} data-section={key}>
          {SECTION_BY_KEY[key]({ kibbutz, canAct, row, now })}
        </div>
      ))}
    </div>
  );
}
