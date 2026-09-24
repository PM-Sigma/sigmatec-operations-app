// Round 5, package V (V-U2): the ✏️/🚚 pair a history row (and K's last-visit section, if the
// designer later asks for it) ends with — both open the ONE visit sheet (sigma.openVisitEditor).
// 🚚 only shows when the visit actually left equipment behind (spec V5).
import * as React from 'react';
import { Pencil, Truck } from 'lucide-react';
import { IconBubble } from '@/components/ui/icon-bubble';
import { sigma } from '@/bridge';

export function VisitRowActions({ kibbutz, visitId, hasProducts }: {
  kibbutz: string; visitId: string; hasProducts: boolean;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <IconBubble
        icon={<Pencil className="h-4 w-4" />}
        label="עריכת הסיכום"
        size={32}
        onClick={() => sigma?.openVisitEditor?.({ kibbutz, visitId, mode: 'edit' })}
      />
      {hasProducts && (
        <IconBubble
          icon={<Truck className="h-4 w-4" />}
          label="תעודת משלוח"
          size={32}
          onClick={() => sigma?.openVisitEditor?.({ kibbutz, visitId, mode: 'cert' })}
        />
      )}
    </span>
  );
}
