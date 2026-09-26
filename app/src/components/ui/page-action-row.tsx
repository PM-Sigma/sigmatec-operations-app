import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * PageActionRow — 48px, scrolls with the page (design-system spec §2 "Components →
 * PageActionRow"). [optional back chevron, 2nd-level pages only] [title, 1 line, ellipsis]
 * [0–2 bubbles, then ⋯]. Never wraps — page-level controls (month switcher, view segmented
 * control) go in the row BELOW this one, not squeezed in here (spec: "It never wraps").
 */
export function PageActionRow({
  title,
  onBack,
  actions,
  titleLines = 1,
  className,
}: {
  title: React.ReactNode;
  /** 2nd-level pages only. Mirrored: a forward chevron in RTL is a BACK affordance visually. */
  onBack?: () => void;
  /** At most 2 bubbles; a 3rd+ belongs behind ⋯ at the caller. */
  actions?: React.ReactNode;
  /**
   * 1 (default) truncates at a single line, as every other page uses it. `2` clamps at two
   * lines instead and lets the row grow past 48px — the one asked-for exception is the burns
   * page's full sentence title (round 5 G-R1), which does not fit on one line at 360px.
   */
  titleLines?: 1 | 2;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full items-center gap-2', titleLines === 2 ? 'min-h-12 py-1' : 'h-12', className)}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          // data-hit-slop: 40px visual, `.s-hit` grows the real hit area to 48 (see chip.tsx's
          // FilterChip for why the overlap sweep needs the attribute too).
          data-hit-slop
          className="s-hit flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full hover:bg-secondary active:scale-[.97]"
        >
          {/* ChevronRight, unmirrored: dir="rtl" means "back" already points right. */}
          <ChevronRight aria-hidden className="h-5 w-5" />
        </button>
      )}
      <h1
        className={cn(
          'min-w-0 flex-1 text-[length:var(--fs-title)] font-bold leading-[var(--lh-title)]',
          titleLines === 2 ? 'line-clamp-2' : 'truncate',
        )}
      >
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-1 self-start">{actions}</div>}
    </div>
  );
}
