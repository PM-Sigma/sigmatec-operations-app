// Status blocks for meeting mode (M-R7, M-U1): burns and onboarding used to live on the
// kibbutz card; here they get their own small tiles instead — plain surface-2, `sm` radius,
// no card-in-card. Pure layout over `meetingStatus.ts`'s `StatusBlocks`.
import * as React from 'react';
import type { StatusBlocks as StatusBlocksData } from '@/lib/meetingStatus';

function Tile({
  label, value, testid, full,
}: { label: string; value: React.ReactNode; testid: string; full?: boolean }) {
  return (
    <div
      data-testid={testid}
      className={
        'flex min-w-0 flex-col gap-0.5 rounded-[var(--r-sm)] bg-secondary px-3 py-2' + (full ? ' col-span-2' : '')
      }
    >
      {/* No `truncate` on the label (designer round-5: "פנימיות פת…" clipped mid-word at
          360px) — short labels fit on one line as-is, and the rare long one just wraps. */}
      <span className="text-[length:var(--fs-body-sm)] text-muted-foreground">{label}</span>
      <span className="line-clamp-2 text-[length:var(--fs-body)] font-bold text-foreground"><bdi>{value}</bdi></span>
    </div>
  );
}

export function StatusBlocksRow({ blocks }: { blocks: StatusBlocksData }) {
  return (
    // `grid-cols-2` (not a flex row): at 360px four flex-1 tiles squeezed to fit one line and
    // truncated their own numbers — a grid gives each tile a real half-width column and wraps
    // to a second row. Burns/onboarding get the FULL row (`full`): their values are naturally
    // longer ("נותרו 2 מתוך 3", "5/9 · חיבור מונים ל-EMS · ממתין 6 ימים") and still clipped at
    // half-width even with `line-clamp-2` (designer round-5 items 3).
    <div data-testid="presenter-status-blocks" className="grid grid-cols-2 gap-2">
      <Tile label="EMS פתוחות" value={blocks.emsOpen} testid="presenter-status-ems" />
      <Tile label="פנימיות פתוחות" value={blocks.internalOpen} testid="presenter-status-internal" />
      {blocks.burns && (
        <Tile label="צריבות" value={blocks.burns.text} testid="presenter-status-burns" full />
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
          full
        />
      )}
    </div>
  );
}
