import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * IconBubble — the 40px ghost-icon circle the AppHeader cluster is built from (🔔 · ✅ · ⚙️),
 * with a badge that CANNOT collide with a neighbour bubble's badge (design-system spec §2
 * "Components → AppHeader"): the badge sits `position:absolute` but scoped to ITS OWN bubble
 * box (one of the three places absolute is allowed, spec §3 rule 2), anchored to the
 * logical inline-end corner with a 4px overhang, and the header cluster's `gap:8px` between
 * bubbles means two badges are always ≥4px apart — the collision audit §1.3 called out
 * ("2" and "3" collide on `home-aviam--header`, both using the physical `-left-1.5`).
 */
export function IconBubble({
  icon,
  badge,
  size = 40,
  label,
  className,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  /** A count (capped at "9+") or a plain dot when `true`. Omit for no badge. */
  badge?: number | boolean;
  size?: 32 | 40 | 48;
  /** Hebrew accessible name — every icon bubble ships one (spec §4 "Hebrew labels"). */
  label: string;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const badgeText = typeof badge === 'number' ? (badge > 9 ? '9+' : String(badge)) : null;
  const showDot = badge === true;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-active={active ? '' : undefined}
      // data-hit-slop: below 48 the box is genuinely smaller than its `.s-hit`-grown real hit
      // area (see chip.tsx's FilterChip for why the overlap sweep needs the attribute too).
      data-hit-slop={size < 48 || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full',
        'text-foreground/80 transition-colors duration-[var(--s-motion-fast)]',
        'hover:bg-secondary active:scale-[.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sigma-ink)] focus-visible:ring-offset-2',
        'data-[active]:bg-secondary data-[active]:text-foreground',
        size < 48 && 's-hit',
        className,
      )}
      style={{ width: size, height: size, transitionTimingFunction: 'var(--s-ease-standard)' }}
    >
      {icon}
      {(badgeText || showDot) && (
        <span
          aria-hidden="true"
          // Fixed #B91C1C in BOTH themes, not var(--danger-ink) (sign-off P1-4): the dark-mode
          // ink (#F87171) is tuned as TEXT on a dark surface, and white-on-it is only 2.77:1 —
          // the same "ink vs fill" mistake styles.css's own --primary/--accent comment documents.
          // 20px pill, 12px/700 text (was 18px / 10px), same 4px overhang.
          className={cn(
            'absolute inline-flex items-center justify-center rounded-full bg-[#B91C1C] font-bold text-white',
            showDot ? 'h-2.5 w-2.5' : 'h-5 min-w-5 px-1 text-xs leading-none',
          )}
          style={{ insetBlockStart: -4, insetInlineEnd: -4 }}
        >
          <bdi>{badgeText}</bdi>
        </span>
      )}
    </button>
  );
}
