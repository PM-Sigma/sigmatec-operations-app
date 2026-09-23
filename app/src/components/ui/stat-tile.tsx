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
  return (
    <button
      type="button"
      disabled={!filterable}
      aria-pressed={filterable ? !!selected : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1 rounded-[var(--r-lg)] bg-card px-3 py-4',
        filterable && 'cursor-pointer transition-colors',
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
    </button>
  );
}
