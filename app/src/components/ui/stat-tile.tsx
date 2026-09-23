import * as React from 'react';
import { cn } from '@/lib/utils';

const ROLE_DOT = {
  ok: 'bg-[var(--ok-ink)]', warn: 'bg-[var(--warn-ink)]', danger: 'bg-[var(--danger-ink)]',
  info: 'bg-[var(--info-ink)]', holiday: 'bg-[var(--holiday-ink)]', neutral: 'bg-[var(--neutral-ink)]',
} as const;
const ROLE_RING = {
  ok: 'ring-[var(--ok-ink)] bg-[var(--ok-fill)]', warn: 'ring-[var(--warn-ink)] bg-[var(--warn-fill)]',
  danger: 'ring-[var(--danger-ink)] bg-[var(--danger-fill)]', info: 'ring-[var(--info-ink)] bg-[var(--info-fill)]',
  holiday: 'ring-[var(--holiday-ink)] bg-[var(--holiday-fill)]', neutral: 'ring-[var(--neutral-ink)] bg-[var(--neutral-fill)]',
} as const;

/**
 * StatTile — design-system spec §2 "Components → StatTile". 2 per row at 390, 4 from 768 up
 * (the caller's grid decides that; this is one tile). The colored SIDE BORDERS the legacy
 * `.stat` used are retired — a filterable tile gets a 2px ring + fill tint instead, and a
 * non-filtering tile stays plain (no pointer, no hover).
 */
export function StatTile({
  value,
  label,
  role,
  selected,
  onClick,
  className,
}: {
  value: React.ReactNode;
  label: string;
  role?: keyof typeof ROLE_DOT;
  /** Omit `onClick` for a plain, non-filtering tile. */
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const filterable = !!onClick;
  // A non-filtering tile is a `div`, not a disabled button (sign-off P1-9): a screen reader
  // announces `disabled` as "unavailable", which is wrong for a tile that is simply not
  // interactive by design. The filter variant gets a real focus-visible ring, since it's the
  // one that's actually reachable by keyboard.
  const Comp = filterable ? 'button' : 'div';
  return (
    <Comp
      type={filterable ? 'button' : undefined}
      aria-pressed={filterable ? !!selected : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1 rounded-[var(--r-lg)] bg-card px-3 py-4',
        filterable && 'cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sigma-ink)] focus-visible:ring-offset-2',
        filterable && selected && role && ['ring-2', ROLE_RING[role]],
        !filterable && 'cursor-default',
        className,
      )}
      style={{ boxShadow: 'var(--e1)', transitionDuration: 'var(--s-motion-fast)' }}
    >
      <span className="flex items-center gap-1.5 tabular-nums text-[length:var(--fs-stat)] font-extrabold leading-[var(--lh-stat)]">
        {role && <span aria-hidden className={cn('h-2 w-2 rounded-full', ROLE_DOT[role])} />}
        <bdi>{value}</bdi>
      </span>
      <span className="truncate text-[length:var(--fs-body-sm)] text-muted-foreground">{label}</span>
    </Comp>
  );
}

/**
 * StatTileGrid — the container StatTile expects around it (design-review.md §2 "StatTile": "2
 * per row at 390, 4 from 768 up"; tools-and-motion.md §2.0: "StatTile goes 2 per row under
 * 480px, 3 at 480+, 4 at 640+"). Reacts to ITS OWN width via a native CSS container query
 * (`.s-stat-grid` in styles.css) — no plugin, no JS — not the viewport, so it holds inside a
 * narrower desktop panel too.
 */
export function StatTileGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('s-stat-grid', className)}>{children}</div>;
}
