import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tag } from '@/components/ui/chip';

const TITLE_INK = {
  default: 'text-[var(--sigma-ink)]',
  danger: 'text-[var(--danger-ink)]',
  holiday: 'text-[var(--holiday-ink)]',
} as const;

/**
 * SectionBlock — the one full-width, edge-aligned block every screen composes from (design-system
 * spec §2 "Components → SectionBlock"). Replaces the ad-hoc "card inside a card inside a card"
 * nesting audit §1.8 flagged: children are `ListRow`s with dividers, not more cards.
 */
export function SectionBlock({
  title,
  titleRole = 'default',
  count,
  action,
  collapsible,
  defaultOpen = true,
  children,
  className,
}: {
  title: React.ReactNode;
  titleRole?: keyof typeof TITLE_INK;
  count?: number;
  /** The optional trailing "הכול ›" link. */
  action?: { label: string; onClick: () => void };
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const showBody = !collapsible || open;
  return (
    <section
      className={cn(
        'w-full rounded-[var(--r-lg)] bg-card p-4',
        className,
      )}
      style={{ boxShadow: 'var(--e1)' }}
    >
      <header className="mb-2 flex items-center gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-start"
          >
            <span className={cn('min-w-0 flex-1 truncate text-[length:var(--fs-title-sm)] font-bold', TITLE_INK[titleRole])}>
              {title}
            </span>
            {count != null && <Tag role="neutral"><bdi>{count}</bdi></Tag>}
            <ChevronDown
              aria-hidden
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-[var(--s-motion-base)]"
              style={{ transform: open ? 'rotate(180deg)' : undefined, transitionTimingFunction: 'var(--s-ease-standard)' }}
            />
          </button>
        ) : (
          <>
            <h2 className={cn('min-w-0 flex-1 truncate text-[length:var(--fs-title-sm)] font-bold', TITLE_INK[titleRole])}>
              {title}
            </h2>
            {count != null && <Tag role="neutral"><bdi>{count}</bdi></Tag>}
          </>
        )}
        {action && (
          <button type="button" onClick={action.onClick} className="shrink-0 text-sm font-semibold text-[var(--sigma-ink)]">
            {action.label} ›
          </button>
        )}
      </header>
      {showBody && <div className="-mx-4 divide-y divide-border">{children}</div>}
    </section>
  );
}
