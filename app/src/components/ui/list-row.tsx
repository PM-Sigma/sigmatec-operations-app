import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ListRow — the one row primitive SectionBlock children use instead of a card-in-a-card
 * (design-system spec §2 "Components → ListRow"; audit §1.8 "cards sit inside cards"). Never
 * wraps: title clamps at 2 lines, the meta line at 2, everything gets `min-width:0` so a long
 * name ellipses instead of pushing the trailing chevron off the 358px content width (spec §3
 * rule 1 "every child of a Row gets min-width:0").
 */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  onClick,
  className,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** A chevron by default when `onClick` is set; pass an icon bubble to override, or `null` for none. */
  trailing?: React.ReactNode | null;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full min-h-14 items-center gap-3 px-4 py-3 text-start',
        onClick && 'transition-colors duration-[var(--s-motion-fast)] hover:bg-secondary/60 active:bg-secondary',
        className,
      )}
      style={onClick ? { transitionTimingFunction: 'var(--s-ease-standard)' } : undefined}
    >
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[length:var(--fs-body)] font-semibold leading-[var(--lh-body)]">
          {title}
        </span>
        {meta && (
          <span className="line-clamp-2 mt-0.5 block text-[length:var(--fs-body-sm)] leading-[var(--lh-body-sm)] text-muted-foreground">
            {meta}
          </span>
        )}
      </span>
      {trailing !== null && (
        <span className="flex shrink-0 items-center text-muted-foreground">
          {/* ChevronLeft, unmirrored: dir="rtl" means "into the row" already points left. */}
          {trailing ?? (onClick && <ChevronLeft aria-hidden className="h-5 w-5" />)}
        </span>
      )}
    </Comp>
  );
}
