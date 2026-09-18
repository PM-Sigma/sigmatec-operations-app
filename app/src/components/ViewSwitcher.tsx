// ONE view switcher and ONE breadcrumb trail for the whole app (spec §7k #14 — "unified
// view-switcher + breadcrumbs beyond one level").
//
// Built here, in Task 4, so Tasks 11 (dev board: לוח · עץ · לוח זמנים) and 13 (calendar:
// חודש · שבוע · רשימה) consume the same component instead of each inventing a chip strip.
// Both are presentation only: no state, no storage, no page knowledge.
import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ViewOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * A segmented control. The active pill slides (spec §6 micro-motion) via a CSS transition on
 * the moving background rather than a Motion layout animation — one element, no re-mounting,
 * and it degrades to an instant swap under prefers-reduced-motion.
 */
export function ViewSwitcher<T extends string>({
  value, options, onChange, ariaLabel = 'תצוגה', className,
}: {
  value: T;
  options: Array<ViewOption<T>>;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const at = Math.max(0, options.findIndex(o => o.value === value));
  const width = options.length ? 100 / options.length : 100;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative inline-flex rounded-xl border border-border bg-muted p-1', className)}
    >
      {/* the sliding pill. `inset-inline-start` (not `left`) so it slides the right way in RTL */}
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-lg bg-card shadow-sm transition-[inset-inline-start] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `calc(${width}% - 4px)`, insetInlineStart: `calc(${at * width}% + 2px)` }}
      />
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors',
              on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface Crumb {
  label: string;
  /** Omitted on the last crumb — the page you are already on is not a link. */
  onClick?: () => void;
}

/**
 * Breadcrumbs, shown only BEYOND one level (§7k #14): a single crumb is the page title, and
 * repeating it as a trail is noise, so one crumb renders nothing.
 * The chevron points to the INLINE START, which in RTL is visually rightwards — that is what
 * `ChevronLeft` inside an RTL container gives us, and it is why the trail is not mirrored by
 * hand anywhere.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const crumbs = (items || []).filter(c => c && c.label);
  if (crumbs.length < 2) return null;

  return (
    <nav aria-label="מסלול" className={cn('flex min-w-0 flex-wrap items-center gap-1 text-[12px]', className)}>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={c.label + i}>
            {i > 0 && <ChevronLeft aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {last || !c.onClick ? (
              <span aria-current={last ? 'page' : undefined} className="truncate font-semibold text-foreground">
                {c.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={c.onClick}
                className="truncate text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {c.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
