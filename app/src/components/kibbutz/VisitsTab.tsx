// ביקורים tab (round 5, package V-U2) — replaces K-U1's stub. History rows newest first (✏️/🚚,
// both open the ONE visit sheet), a draft row when one is open, "סיכום ביקור" to start a new one,
// and an EmptyState when there is nothing at all yet (spec V5, QA קיבוצים 7/9).
import * as React from 'react';
import { MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import { IconBubble } from '@/components/ui/icon-bubble';
import { VisitRowActions } from '@/components/kibbutz/VisitRowActions';
import { sigma } from '@/bridge';
import { fmtDay, lastVisitReport, visitsForKibbutz } from '@/lib/kibbutzDetail';
import { useKibbutzVisits } from '@/lib/kibbutzVisits';
import { useVisitDraft, draftTimeLabel } from '@/lib/visitDrafts';

function openNew(kibbutz: string) {
  const s = (window as any).sigma;
  const opened = s?.openVisitEditor?.({ kibbutz, mode: 'new' });
  if (!opened) (window as any).sigmaVisitChapters?.open?.(kibbutz);
}

function DraftRow({ kibbutz }: { kibbutz: string }) {
  const draft = useVisitDraft(kibbutz);
  if (!draft) return null;
  const time = draftTimeLabel(draft.updated_at);
  const discard = () => {
    void sigma?.visitDraftDiscard?.(draft.id);
    toast('הטיוטה נמחקה', {
      action: { label: 'ביטול', onClick: () => { void sigma?.visitDraftPut?.(draft); } },
      duration: 5_000,
    });
  };
  return (
    <ListRow
      data-testid="visit-draft-row"
      title={<span className="line-clamp-2">{'טיוטה פתוחה' + (time ? ' · ' + time : '')}</span>}
      onClick={() => openNew(kibbutz)}
      trailing={<IconBubble icon={<Trash2 className="h-4 w-4" />} label="מחיקת טיוטה" size={32} onClick={discard} />}
    />
  );
}

function HistoryRow({ visit, now, canAct }: { visit: ReturnType<typeof visitsForKibbutz>[number]; now: Date; canAct: boolean }) {
  const r = lastVisitReport(visit, now);
  const hasProducts = r.products.length > 0;
  return (
    <div className="border-b border-border last:border-0">
      <ListRow
        data-testid="visit-row"
        title={<span className="line-clamp-2"><bdi>{r.date}</bdi> · {r.visitors}</span>}
        meta={<span className="line-clamp-1">{r.hours}{hasProducts ? ` · ${r.products.length} פריטים` : ''}</span>}
        trailing={canAct ? <VisitRowActions kibbutz={visit.kibbutz} visitId={visit.id} hasProducts={hasProducts} /> : null}
        className="border-0"
      />
      {r.summary && <p className="line-clamp-2 px-4 pb-3 -mt-1 text-[13px] text-muted-foreground">{r.summary}</p>}
    </div>
  );
}

export function VisitsTab({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const visits = useKibbutzVisits(kibbutz);
  const rows = React.useMemo(() => visitsForKibbutz(visits, kibbutz), [visits, kibbutz]);
  const now = React.useMemo(() => new Date(), []);

  if (!rows.length) {
    return (
      <>
        <DraftRow kibbutz={kibbutz} />
        <EmptyState
          icon={<MapPin />}
          title="עוד אין סיכומי ביקור לקיבוץ הזה."
          action={canAct ? { label: 'סיכום ביקור', onClick: () => openNew(kibbutz) } : undefined}
        />
      </>
    );
  }

  return (
    <SectionBlock
      title="ביקורים"
      action={canAct ? { label: 'סיכום ביקור', onClick: () => openNew(kibbutz) } : undefined}
    >
      <DraftRow kibbutz={kibbutz} />
      {rows.map(v => <HistoryRow key={v.id} visit={v} now={now} canAct={canAct} />)}
    </SectionBlock>
  );
}
