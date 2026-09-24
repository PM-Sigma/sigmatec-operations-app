// StatusTab — the מצב הקיבוץ tab of KibbutzDetail (round 5, package K). K-U1 stubs the five
// sections so the sheet has real content the moment it lands; K-U2 replaces each stub's body
// with the real panel (EmsTasks, InternalTasksPanel, the last-visit report, MeetingTimeline,
// HealthStrip/OnboardingProgress) on OPEN_CARD_SECTIONS order.
import * as React from 'react';
import { SectionBlock } from '@/components/ui/section-block';
import { EmptyState } from '@/components/ui/empty-state';
import { OPEN_CARD_SECTIONS } from '@/lib/kibbutzDetail';
import type { KibbutzRow } from '@/lib/kibbutzim';

const TITLE: Record<string, string> = {
  ems: 'משימות EMS',
  internal: 'משימות פנימיות',
  lastVisitReport: 'דוח ביקור אחרון',
  meetings: 'סיכומי ישיבות',
  status: 'מצב הקיבוץ',
};

export function StatusTab({ kibbutz }: { kibbutz: string; row: KibbutzRow; canAct: boolean; role: string }) {
  return (
    <div className="flex flex-col gap-3">
      {OPEN_CARD_SECTIONS.map(key => (
        <div key={key} data-section={key}>
          <SectionBlock title={TITLE[key]}>
            <EmptyState icon={<span />} title="בקרוב." />
          </SectionBlock>
        </div>
      ))}
    </div>
  );
}
