import { cn } from '@/lib/utils';

export type DayCellState =
  | 'default' | 'today' | 'selected' | 'holiday' | 'eve'
  | 'field' | 'office' | 'away' | 'missing' | 'outside';

const FILL: Partial<Record<DayCellState, string>> = {
  holiday: 'bg-[var(--holiday-fill)] text-[var(--holiday-ink)]',
  eve: 'bg-[var(--holiday-fill)] text-[var(--holiday-ink)]',
  field: 'bg-[var(--ok-fill)] text-[var(--ok-ink)]',
  office: 'bg-[var(--info-fill)] text-[var(--info-ink)]',
  away: 'bg-[var(--neutral-fill)] text-[var(--neutral-ink)]',
  selected: 'bg-[var(--sigma-ink)] text-[hsl(var(--card))]',
};

/**
 * DayCell — design-system spec §2 "Components → DayCell". Square, min 44px, number top-start.
 *
 * "missing" is PAST WORKDAYS ONLY for people who must file, and round-5's ruling (2026-09-23
 * design-system-design.md, "עידן's rulings") narrows it further: only אביאם/ניתאי ever get the
 * red missing-dot — everyone else (עידן included) sees field-green and holiday-purple only.
 * That gate is the CALLER's job (Attendance/Calendar decide who is a daily filer); this
 * component just draws whatever `state` it's handed — never a red border (spec: "No red border").
 */
export function DayCell({
  day,
  state = 'default',
  eventCount,
  onClick,
  className,
}: {
  day: number;
  state?: DayCellState;
  /** Shown as "•N" (spec §2 DayCell: "dots with a count at 390"). */
  eventCount?: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={state}
      // The one named exception to the 48×48 floor (design-review.md 360-430 update): seven
      // columns only fit 45px cells at the 360 width floor.
      data-min-tap="44"
      className={cn(
        'relative flex aspect-square min-h-11 w-full flex-col items-start justify-start rounded-[var(--r-sm)] p-1',
        FILL[state] ?? 'bg-transparent',
        state === 'outside' && 'opacity-40',
        state === 'today' && 'ring-2 ring-[var(--sigma-ink)]',
        className,
      )}
    >
      <span className="text-[length:var(--fs-caption)] font-semibold tabular-nums"><bdi>{day}</bdi></span>
      {state === 'eve' && (
        <span aria-hidden className="absolute h-1.5 w-1.5 rounded-full bg-[var(--holiday-ink)]" style={{ insetBlockStart: 4, insetInlineEnd: 4 }} />
      )}
      {state === 'missing' && (
        <span aria-hidden className="absolute h-1.5 w-1.5 rounded-full bg-[var(--danger-ink)]" style={{ insetBlockStart: 4, insetInlineEnd: 4 }} />
      )}
      {!!eventCount && (
        <span className="mt-auto self-end text-[length:var(--fs-caption)] tabular-nums text-muted-foreground">
          •<bdi>{eventCount}</bdi>
        </span>
      )}
    </button>
  );
}
