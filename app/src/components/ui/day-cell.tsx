import { cn } from '@/lib/utils';

/** The one fill a cell can carry as its own background (design-review.md §2 "DayCell"). Not
    `eve` or `missing` — those are DOT markers on top of whatever fill (or none) applies, and
    not `selected` — that overrides fill entirely (ink fill + surface text) at the call site. */
export type DayCellFill = 'none' | 'holiday' | 'field' | 'office' | 'away';

const FILL_CLS: Record<DayCellFill, string> = {
  none: 'bg-transparent',
  holiday: 'bg-[var(--holiday-fill)] text-[var(--holiday-ink)]',
  field: 'bg-[var(--ok-fill)] text-[var(--ok-ink)]',
  office: 'bg-[var(--info-fill)] text-[var(--info-ink)]',
  away: 'bg-[var(--neutral-fill)] text-[var(--neutral-ink)]',
};

/**
 * DayCell — design-system spec §2 "Components → DayCell". Square, min 44px, number 14/600 at
 * the top-start.
 *
 * `fill` / `today` / `selected` are independent (sign-off P1-8): a single `state` enum couldn't
 * express "today AND field" or "selected AND holiday" at once, which a real month needs (today
 * can land on any state, and tapping a holiday still selects it). `today` is a ring, `selected`
 * is an ink fill that overrides `fill`, and either can combine with any `fill`.
 *
 * "missing" is PAST WORKDAYS ONLY for people who must file, and round-5's ruling (2026-09-23
 * design-system-design.md, "עידן's rulings") narrows it further: only אביאם/ניתאי ever get the
 * red missing-dot — everyone else (עידן included) sees field-green and holiday-purple only.
 * That gate is the CALLER's job (Attendance/Calendar decide who is a daily filer); this
 * component just draws whatever it's handed — never a red BORDER (spec: "No red border"), a dot
 * plus the day number itself in danger-ink instead.
 */
export function DayCell({
  day,
  fill = 'none',
  today,
  selected,
  eve,
  missing,
  eventCount,
  outside,
  label,
  onClick,
  className,
}: {
  day: number;
  fill?: DayCellFill;
  today?: boolean;
  selected?: boolean;
  /** A holiday ink dot, no fill — the day before a holiday, still a work day. */
  eve?: boolean;
  /** Dot + the day number in danger-ink (spec: "6px danger dot + danger ink number"). */
  missing?: boolean;
  /** Shown as "•N" (spec §2 DayCell: "dots with a count at 390"). */
  eventCount?: number;
  outside?: boolean;
  /** Required — a DayCell has no other accessible name (sign-off P1-8), e.g. "יום שלישי,
      1 בספטמבר · לא דווחה נוכחות". */
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected || undefined}
      data-fill={fill}
      data-today={today ? '' : undefined}
      // The one named exception to the 48×48 floor (design-review.md 360-430 update): seven
      // columns only fit 45px cells at the 360 width floor.
      data-min-tap="44"
      className={cn(
        'relative flex aspect-square min-h-11 w-full flex-col items-start justify-start rounded-[var(--r-sm)] p-1',
        selected ? 'bg-[var(--sigma-ink)] text-[hsl(var(--card))]' : FILL_CLS[fill],
        // A plain opacity reduction (the previous approach) dims the day NUMBER along with the
        // cell, and CSS opacity multiplies straight through whatever contrast the text color
        // already had against the card — at 40% that failed axe's color-contrast check (Opus
        // audit round 4). `text-muted-foreground` instead: a color chosen to read as de-
        // emphasized while still clearing 4.5:1 on its own (test-design-tokens.mjs's sibling
        // math: muted-foreground on card is 6.3:1 light / 7.8:1 dark).
        outside && !selected && 'text-muted-foreground',
        today && 'ring-2 ring-[var(--sigma-ink)]',
        className,
      )}
    >
      {/* The dot sits INLINE right after the number, in the same flex row — not absolute at the
          cell's own top-inline-end corner (designer confirm round, N2). At a 2px grid gap that
          corner sits close enough to the NEXT cell's top-start number that the dot read as
          belonging to the next day, not this one. */}
      <span className="flex items-center gap-1">
        <span className={cn('text-sm font-semibold tabular-nums', missing && !selected && 'text-[var(--danger-ink)]')}>
          <bdi>{day}</bdi>
        </span>
        {eve && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--holiday-ink)]" />}
        {missing && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--danger-ink)]" />}
      </span>
      {!!eventCount && (
        <span className="mt-auto self-end text-[length:var(--fs-caption)] tabular-nums text-muted-foreground">
          •<bdi>{eventCount}</bdi>
        </span>
      )}
    </button>
  );
}
