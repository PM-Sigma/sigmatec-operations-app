import * as React from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
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
 *
 * `container-type: inline-size` (tools-and-motion.md §2.0: "Component layout reacts to its
 * container, not the viewport... Page, SectionBlock and Sheet set container-type: inline-size")
 * — a SectionBlock inside a narrower desktop panel gets to lay its own children out by ITS
 * width, not the viewport's, once a later package adds container-query rules for that content.
 *
 * Title is 16/700 (`--fs-body`, bold) — NOT `--fs-title-sm` (18, sign-off P1-11): the type
 * steps are page title 20 → section title 16/700 → row title 16/600, and title-sm belongs to
 * the sheet header only.
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
  /** The optional trailing "הכול" link (a lucide ChevronLeft, not a "›" glyph — same as ListRow). */
  action?: { label: string; onClick: () => void };
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section
      className={cn(
        'w-full rounded-[var(--r-lg)] bg-card p-4',
        className,
      )}
      style={{ boxShadow: 'var(--e1)', containerType: 'inline-size' }}
    >
      <header className="mb-2 flex items-center gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            // data-hit-slop: the row's own height is well under 48 (text-body line height);
            // `.s-hit` grows the real hit area (see chip.tsx's FilterChip for why the overlap
            // sweep needs the attribute too).
            data-hit-slop
            className="s-hit flex min-w-0 flex-1 items-center gap-2 text-start"
          >
            <span className={cn('min-w-0 flex-1 truncate text-[length:var(--fs-body)] font-bold', TITLE_INK[titleRole])}>
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
            <h2 className={cn('min-w-0 flex-1 truncate text-[length:var(--fs-body)] font-bold', TITLE_INK[titleRole])}>
              {title}
            </h2>
            {count != null && <Tag role="neutral"><bdi>{count}</bdi></Tag>}
          </>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            // data-hit-slop: content-sized, well under 48 either axis; `.s-hit` grows the real
            // hit area (see chip.tsx's FilterChip for why the overlap sweep needs the attribute
            // too).
            data-hit-slop
            className="s-hit flex shrink-0 items-center gap-0.5 text-sm font-semibold text-[var(--sigma-ink)]"
          >
            {action.label}
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </button>
        )}
      </header>
      {/* grid-template-rows 0fr→1fr at `base` (sign-off P1-11) — the standard CSS-only
          collapse animation: the row track itself grows/shrinks, so content never needs a
          measured pixel height, and `overflow:hidden` clips the collapsed state. Non-collapsible
          sections render the same grid at a fixed 1fr, so this is the only body markup either way. */}
      <div
        className="grid transition-[grid-template-rows]"
        style={{
          gridTemplateRows: !collapsible || open ? '1fr' : '0fr',
          transitionDuration: 'var(--s-motion-base)',
          transitionTimingFunction: 'var(--s-ease-standard)',
        }}
      >
        <div className="overflow-hidden">
          <div className="-mx-4 divide-y divide-border">{children}</div>
        </div>
      </div>
    </section>
  );
}
