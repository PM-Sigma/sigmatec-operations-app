// The per-kibbutz meeting timeline (M-R1/M-R2, M-U1/M-U2): one `SectionBlock` of small
// `ListRow`s, newest first, grouped under caption date headers — never a card inside a card.
// EMS rows get the one-click close bubbles (M-R8) when `canClose` is true.
import * as React from 'react';
import { CheckCircle2, ClipboardList, Lock, MapPin, NotebookPen, XCircle } from 'lucide-react';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/empty-state';
import { BubbleButton } from '@/components/ui/bubble-button';
import { fmtDay } from '@/lib/format';
import type { CloseStatus } from '@/lib/meetingClose';
import type { TimelineItem } from '@/lib/meetingTimeline';

const KIND_ICON: Record<TimelineItem['kind'], React.ReactNode> = {
  ems: <ClipboardList size={18} aria-hidden />,
  internal: <Lock size={18} aria-hidden />,
  note: <NotebookPen size={18} aria-hidden />,
  visit: <MapPin size={18} aria-hidden />,
};

/** Group items by their calendar day (`fmtDay` — היום / אתמול / יום ה׳ / d.m), preserving the
 *  newest-first order within and across groups. */
function groupByDay(items: TimelineItem[], now: Date): Array<{ label: string; rows: TimelineItem[] }> {
  const out: Array<{ label: string; rows: TimelineItem[] }> = [];
  for (const it of items) {
    const label = fmtDay(new Date(it.at), now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.rows.push(it);
    else out.push({ label, rows: [it] });
  }
  return out;
}

function CloseBubbles({
  item, onClose, queued, pendingStatus,
}: {
  item: TimelineItem;
  onClose: (taskId: string, status: CloseStatus) => void;
  queued: boolean;
  pendingStatus?: CloseStatus;
}) {
  if (!item.taskId) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <BubbleButton
        variant="tonal"
        size="sm"
        icon={<CheckCircle2 size={15} aria-hidden />}
        data-testid={`presenter-close-done-${item.taskId}`}
        aria-label="סמן כבוצע"
        aria-pressed={pendingStatus === 'done'}
        onClick={() => onClose(item.taskId!, 'done')}
      >
        בוצע
      </BubbleButton>
      <BubbleButton
        variant="neutral"
        size="sm"
        icon={<XCircle size={15} aria-hidden />}
        data-testid={`presenter-close-cancel-${item.taskId}`}
        aria-label="סמן כבוטל"
        aria-pressed={pendingStatus === 'cancelled'}
        onClick={() => onClose(item.taskId!, 'cancelled')}
      >
        בוטל
      </BubbleButton>
      {queued && (
        <span className="text-[12px] font-bold text-muted-foreground">יישלח כשתחזור הרשת</span>
      )}
    </div>
  );
}

export interface MeetingTimelineProps {
  items: TimelineItem[];
  olderOpen: TimelineItem[];
  now: Date;
  canClose: boolean;
  onClose?: (taskId: string, status: CloseStatus) => void;
  pendingTaskIds?: Record<string, CloseStatus>;
  queuedTaskIds?: Set<string>;
  onToggle30d?: () => void;
}

export function MeetingTimeline({
  items, olderOpen, now, canClose, onClose, pendingTaskIds, queuedTaskIds, onToggle30d,
}: MeetingTimelineProps) {
  const groups = React.useMemo(() => groupByDay(items, now), [items, now]);

  return (
    <>
      <SectionBlock title="מה קרה" count={items.length}>
        {items.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={<ClipboardList size={28} aria-hidden />}
              title="אין שינויים בחלון הזה"
              hint={onToggle30d ? 'אפשר לבדוק 30 יום אחורה' : undefined}
              action={onToggle30d ? { label: '30 יום', onClick: onToggle30d } : undefined}
            />
          </div>
        ) : (
          groups.map(g => (
            <React.Fragment key={g.label}>
              <div className="px-4 pb-1 pt-3 text-[12px] font-bold text-muted-foreground first:pt-0">
                {g.label}
              </div>
              {g.rows.map(item => (
                <ListRow
                  key={item.key}
                  data-testid={`presenter-timeline-${item.key}`}
                  leading={KIND_ICON[item.kind]}
                  trailing={null}
                  title={<bdi>{item.title}</bdi>}
                  meta={
                    <>
                      <bdi>{item.meta}</bdi>
                      {item.kind === 'ems' && canClose && (
                        <CloseBubbles
                          item={item}
                          onClose={(id, s) => onClose?.(id, s)}
                          queued={!!(item.taskId && queuedTaskIds?.has(item.taskId))}
                          pendingStatus={item.taskId ? pendingTaskIds?.[item.taskId] : undefined}
                        />
                      )}
                    </>
                  }
                />
              ))}
            </React.Fragment>
          ))
        )}
      </SectionBlock>

      {olderOpen.length > 0 && (
        <SectionBlock title="משימות פתוחות ותיקות" count={olderOpen.length} collapsible defaultOpen={false}>
          {olderOpen.map(item => (
            <ListRow
              key={item.key}
              data-testid={`presenter-timeline-${item.key}`}
              leading={KIND_ICON[item.kind]}
              trailing={null}
              title={<bdi>{item.title}</bdi>}
              meta={
                canClose && item.taskId ? (
                  <CloseBubbles
                    item={item}
                    onClose={(id, s) => onClose?.(id, s)}
                    queued={!!(item.taskId && queuedTaskIds?.has(item.taskId))}
                    pendingStatus={item.taskId ? pendingTaskIds?.[item.taskId] : undefined}
                  />
                ) : undefined
              }
            />
          ))}
        </SectionBlock>
      )}
    </>
  );
}
