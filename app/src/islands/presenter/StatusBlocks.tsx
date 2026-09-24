// Status blocks for meeting mode (M-R7, M-U1): burns and onboarding used to live on the
// kibbutz card; here they get their own small tiles instead — plain surface-2, `sm` radius,
// no card-in-card. Pure layout over `meetingStatus.ts`'s `StatusBlocks`.
import * as React from 'react';
import type { StatusBlocks as StatusBlocksData } from '@/lib/meetingStatus';

function Tile({ label, value, testid }: { label: string; value: React.ReactNode; testid: string }) {
  return (
    <div
      data-testid={testid}
      className="flex min-w-0 flex-col gap-0.5 rounded-[var(--r-sm)] bg-secondary px-3 py-2"
    >
      <span className="truncate text-[length:var(--fs-body-sm)] text-muted-foreground">{label}</span>
      <span className="line-clamp-2 text-[length:var(--fs-body)] font-bold text-foreground"><bdi>{value}</bdi></span>
    </div>
  );
}

export function StatusBlocksRow({ blocks }: { blocks: StatusBlocksData }) {
  return (
    // `grid-cols-2` (not a flex row): at 360px four flex-1 tiles squeezed to fit one line and
    // truncated their own numbers — a grid gives each tile a real half-width column and wraps
    // to a second row instead of clipping "נותרו 2 מתוך 3" to "נותרו 2 …".
    <div data-testid="presenter-status-blocks" className="grid grid-cols-2 gap-2">
      <Tile label="EMS פתוחות" value={blocks.emsOpen} testid="presenter-status-ems" />
      <Tile label="פנימיות פתוחות" value={blocks.internalOpen} testid="presenter-status-internal" />
      {blocks.burns && (
        <Tile label="צריבות" value={blocks.burns.text} testid="presenter-status-burns" />
      )}
      {blocks.onboarding && (
        <Tile
          label="קליטה"
          value={
            blocks.onboarding.done
              ? blocks.onboarding.label
              : blocks.onboarding.next
                ? `${blocks.onboarding.label} · ${blocks.onboarding.next}${blocks.onboarding.waitingDays != null ? ` · ממתין ${blocks.onboarding.waitingDays} ימים` : ''}`
                : blocks.onboarding.label
          }
          testid="presenter-status-onboarding"
        />
      )}
    </div>
  );
}
