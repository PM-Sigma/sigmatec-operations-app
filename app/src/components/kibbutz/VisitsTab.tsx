// OWNED BY PACKAGE V from the merge of K-U1 (see r5-V-visit.md V-U2). This is a stub only:
// K-U1 creates it so the ביקורים tab exists and has somewhere to send "סיכום ביקור"; V-U2
// replaces the body with the real visits list.
import * as React from 'react';
import { MapPin } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function VisitsTab({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const openVisit = () => {
    const s = (window as any).sigma;
    const opened = s?.openVisitEditor?.({ kibbutz, mode: 'new' });
    if (!opened) (window as any).sigmaVisitChapters?.open?.(kibbutz);
  };
  return (
    <EmptyState
      icon={<MapPin />}
      title="הביקורים יוצגו כאן."
      action={canAct ? { label: 'סיכום ביקור', onClick: openVisit } : undefined}
    />
  );
}
