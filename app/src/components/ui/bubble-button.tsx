import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * BubbleButton — "every tappable is a bubble" (design-system spec §2 "Components → BubbleButton").
 * A thin skin over the existing shadcn `Button` (reused, not duplicated): pill shape, the
 * sm/md/lg sizing ladder (sm's true VISUAL size is 32 — `.s-hit` expands the tap target to 48
 * without growing the box, design-review.md's 360–430 update: "at least 48×48, using hit-slop
 * if the visual is 32"), and the five spec variants mapped onto Button's own variant prop plus
 * token classes for the two Button has no equivalent for (`tonal`, `icon`). RTL: the icon sits
 * at the inline-start of the label by source order (`.sigma-root` is `dir="rtl"`, so the first
 * child is already the visual start) — callers pass `icon` instead of composing children so
 * this stays true without a manual flex-row-reverse.
 *
 * Every variant below sets its own `hover:text-*`, even where it repeats the rest-state color:
 * Button's `ghost` base (the transparent/bordless canvas this is built on) carries
 * `hover:text-accent-foreground`, and a variant that leaves hover:text unset would silently
 * inherit THAT color on a real :hover device instead of its own (sign-off P1-2). Android's
 * "sticky hover after a tap" is the separate half of that fix — `future.hoverOnlyWhenSupported`
 * in tailwind.config.ts scopes every `hover:` utility app-wide to `@media (hover: hover)`.
 */
const SIZE_CLS = {
  sm: 'h-8 px-3 text-sm s-hit',
  md: 'h-10 px-4 text-sm s-hit',
  lg: 'h-12 w-full px-5 text-base',
} as const;

const VARIANT_CLS = {
  primary: 's-brand shadow-none hover:brightness-105 hover:text-[var(--s-on-brand)]',
  tonal: 'bg-[var(--sigma-ink)]/10 text-[var(--sigma-ink)] hover:bg-[var(--sigma-ink)]/15 hover:text-[var(--sigma-ink)]',
  neutral: 'bg-secondary text-foreground hover:bg-secondary/80 hover:text-foreground',
  danger: 'bg-[var(--danger-fill)] text-[var(--danger-ink)] hover:brightness-95 hover:text-[var(--danger-ink)]',
  icon: 'bg-secondary text-foreground rounded-full aspect-square px-0 hover:bg-secondary/80 hover:text-foreground',
} as const;

export interface BubbleButtonProps extends Omit<ButtonProps, 'variant' | 'size'> {
  variant?: keyof typeof VARIANT_CLS;
  size?: keyof typeof SIZE_CLS;
  icon?: React.ReactNode;
}

export const BubbleButton = React.forwardRef<HTMLButtonElement, BubbleButtonProps>(
  ({ variant = 'neutral', size = 'md', icon, children, className, ...props }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      // data-hit-slop: sm/md carry `.s-hit` (32/40px visual, 48px real hit area via an invisible
      // ::before) — see chip.tsx's FilterChip for why the sweep needs the attribute too.
      data-hit-slop={size !== 'lg' || undefined}
      className={cn(
        'relative rounded-[var(--r-pill)] font-bold transition-[transform,filter] active:scale-[.97]',
        'focus-visible:ring-[var(--sigma-ink)]',
        SIZE_CLS[size],
        VARIANT_CLS[variant],
        className,
      )}
      style={{ transitionDuration: 'var(--s-motion-fast)', transitionTimingFunction: 'var(--s-ease-standard)' }}
      {...props}
    >
      {icon}
      {children != null && <span className="min-w-0 truncate">{children}</span>}
    </Button>
  ),
);
BubbleButton.displayName = 'BubbleButton';
