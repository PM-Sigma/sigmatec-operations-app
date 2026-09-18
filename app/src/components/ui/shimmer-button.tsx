// ShimmerButton — Magic UI (https://magicui.design/docs/components/shimmer-button), MIT.
// VENDORED, not installed: the project has no Magic UI dependency and this is the only
// component we take from it (spec §7c gives Magic UI the "primary CTA" role). Trimmed to the
// props we use, RTL-safe (no physical sides), and it respects `prefers-reduced-motion` —
// the spec's motion budget applies to a borrowed component too.
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerDuration?: string;
  background?: string;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ shimmerColor = 'rgba(255,255,255,.55)', shimmerDuration = '2.6s', background, className, children, style, ...props }, ref) => (
    <button
      ref={ref}
      style={{
        ...(style || {}),
        ['--shimmer-color' as any]: shimmerColor,
        ['--shimmer-duration' as any]: shimmerDuration,
        ...(background ? { background } : {}),
      }}
      className={cn(
        'group relative isolate overflow-hidden transition-transform active:scale-[.97]',
        // The sweep: one translucent band crossing the button. `motion-reduce:hidden` is the
        // whole accessibility story — the button itself never depends on it.
        'before:pointer-events-none before:absolute before:inset-y-0 before:-inset-x-full',
        'before:bg-[linear-gradient(100deg,transparent_35%,var(--shimmer-color)_50%,transparent_65%)]',
        'before:animate-[sigma-shimmer_var(--shimmer-duration)_linear_infinite] before:content-[""]',
        'motion-reduce:before:hidden',
        className,
      )}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  ),
);
ShimmerButton.displayName = 'ShimmerButton';
