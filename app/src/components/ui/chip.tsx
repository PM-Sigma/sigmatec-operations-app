import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The fixed status vocabulary (design-system spec §2 "Chip / Tag"). Extend here, not per-call. */
const TAG_ROLE = {
  info: 'bg-[var(--info-fill)] text-[var(--info-ink)]',
  danger: 'bg-[var(--danger-fill)] text-[var(--danger-ink)]',
  warn: 'bg-[var(--warn-fill)] text-[var(--warn-ink)]',
  ok: 'bg-[var(--ok-fill)] text-[var(--ok-ink)]',
  holiday: 'bg-[var(--holiday-fill)] text-[var(--holiday-ink)]',
  neutral: 'bg-[var(--neutral-fill)] text-[var(--neutral-ink)]',
} as const;

/**
 * Tag — status, never tappable (spec: "חדשה = info, דחופה/באיחור = danger, ללא אחראי = warn,
 * בטיפול = info, ממתין ללקוח = neutral"). A 6px dot instead of an emoji when `dot` is set —
 * the icon-policy fix for audit §1.7 ("emoji are used as icons on almost every chip").
 */
export function Tag({ role, dot, children, className }: {
  role: keyof typeof TAG_ROLE;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-[var(--r-sm)] px-2 text-xs font-semibold leading-none',
        TAG_ROLE[role],
        className,
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** FilterChip — tappable, carries its own count ("פעילים 5"); selected = ink fill + ✓. */
export function FilterChip({ selected, count, children, onClick, className }: {
  selected?: boolean;
  count?: number;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={!!selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--r-pill)] px-3 text-sm font-semibold s-hit',
        'transition-colors duration-[var(--s-motion-fast)] active:scale-[.97]',
        selected
          ? 'bg-[var(--sigma-ink)] text-[hsl(var(--card))]'
          : 'bg-secondary text-foreground hover:bg-secondary/80',
        className,
      )}
      style={{ transitionTimingFunction: 'var(--s-ease-standard)' }}
    >
      {selected && <Check aria-hidden className="h-3.5 w-3.5" />}
      <span className="min-w-0 truncate">{children}</span>
      {count != null && <span className="tabular-nums opacity-80"><bdi>{count}</bdi></span>}
    </button>
  );
}
