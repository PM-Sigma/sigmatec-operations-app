import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * BubbleButton — "every tappable is a bubble" (design-system spec §2 "Components → BubbleButton").
 * A thin skin over the existing shadcn `Button` (reused, not duplicated): pill shape, the
 * sm/md/lg sizing ladder with a 48px hit area even at `sm` (design-review.md's 360–430 update),
 * and the five spec variants mapped
 * onto Button's own variant prop plus token classes for the two Button has no equivalent for
 * (`tonal`, `icon`). RTL: the icon sits at the inline-start of the label by source order
 * (`.sigma-root` is `dir="rtl"`, so the first child is already the visual start) — callers pass
 * `icon` instead of composing children so this stays true without a manual flex-row-reverse.
 */
const SIZE_CLS = {
  sm: 'h-8 min-h-[48px] px-3 text-sm [--hit-slop:8px] before:absolute before:-inset-[var(--hit-slop)] before:content-[""]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 w-full px-5 text-base',
} as const;

const VARIANT_CLS = {
  primary: 'bg-brand-grad text-[var(--on-brand)] shadow-none hover:brightness-105',
  tonal: 'bg-[var(--sigma-ink)]/10 text-[var(--sigma-ink)] hover:bg-[var(--sigma-ink)]/15',
  neutral: 'bg-secondary text-foreground hover:bg-secondary/80',
  danger: 'bg-[var(--danger-fill)] text-[var(--danger-ink)] hover:brightness-95',
  icon: 'bg-secondary text-foreground rounded-full aspect-square px-0 hover:bg-secondary/80',
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
