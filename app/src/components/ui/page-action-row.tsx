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
  className,
}: {
  title: React.ReactNode;
  /** 2nd-level pages only. Mirrored: a forward chevron in RTL is a BACK affordance visually. */
  onBack?: () => void;
  /** At most 2 bubbles; a 3rd+ belongs behind ⋯ at the caller. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-12 w-full items-center gap-2', className)}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-secondary active:scale-[.97]"
        >
          {/* ChevronRight, unmirrored: dir="rtl" means "back" already points right. */}
          <ChevronRight aria-hidden className="h-5 w-5" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[length:var(--fs-title)] font-bold leading-[var(--lh-title)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
