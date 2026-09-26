import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * SegmentedControl — 2–4 views of the SAME data (חודש/שבוע/רשימה, מצב הקיבוץ/ביקורים), design-
 * system spec §2 "Components → Tabs / SegmentedControl". A 40px surface-2 track with a sliding
 * surface+e1 thumb. For >4 items use a scrollable Tabs row instead (not this component).
 *
 * `role="radiogroup"` + `role="radio"`/`aria-checked` (sign-off P1-10), not `tablist`/`tab`: a
 * tablist without tabpanels is an incomplete ARIA pattern, and this control picks ONE value from
 * a set — exactly what radiogroup means. Roving tabindex + arrow keys are part of that pattern,
 * not optional: only the checked segment is in the tab order, and ←/→ (RTL: reversed) moves
 * both focus and the value together, the way a native radio group behaves.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  /** Names the radiogroup for a caller whose visible label sits outside this control (e.g. a
   *  `ControlRow`'s own heading) — optional, since a self-describing control (its options
   *  already say what they are) needs none. */
  ariaLabel?: string;
  className?: string;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));

  // rtl-ok (the whole thumbBox mechanism): measured from the selected button's real, rendered
  // `offsetLeft`/`offsetWidth` (designer confirm round, N3) — not a `calc()` formula guessing the
  // padding and gap math, which drifted 2px per step because it never accounted for the 2px gap
  // between segments. `offsetLeft` is a PHYSICAL pixel value regardless of `dir` (browsers report
  // it in LTR terms even inside an RTL container), so positioning the thumb with a physical
  // `left` needs no RTL sign-flip either — genuinely physical by design, not a missed logical
  // property.
  const [thumbBox, setThumbBox] = React.useState<{ left: number; width: number } | null>(null); // rtl-ok
  React.useLayoutEffect(() => {
    const measure = () => {
      const btn = refs.current[selectedIndex];
      if (btn) setThumbBox({ left: btn.offsetLeft, width: btn.offsetWidth }); // rtl-ok
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, options.length]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    // RTL: the visual "next" (toward the end of the reading direction) is ArrowLeft, not
    // ArrowRight — this container is always dir="rtl" (.sigma-root).
    if (e.key === 'ArrowLeft') { move(i, 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { move(i, -1); e.preventDefault(); }
    else if (e.key === 'Home') { onChange(options[0].value); refs.current[0]?.focus(); e.preventDefault(); }
    else if (e.key === 'End') { onChange(options[options.length - 1].value); refs.current[options.length - 1]?.focus(); e.preventDefault(); }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      // `flex w-full`, not `inline-flex` (designer confirm round, N3): shrink-to-fit sized the
      // whole control to its OWN content, so "רשימה" (the longest label) truncated even in a
      // section with plenty of spare width — the container itself never used that width. `w-full`
      // fills the section, then `flex-1` on each segment (already there) distributes it evenly.
      className={cn('relative flex h-10 w-full items-center gap-0.5 rounded-[var(--r-md)] bg-secondary p-0.5', className)}
    >
      {/* The sliding thumb — one element, `left`/`width` at `base`/`ease-standard` (spec
          §2.2.6), measured from the selected button's real offsetLeft/offsetWidth rather than a
          calc() formula (N3: the old `translateX(i * -100%)` ignored the 2px gaps between
          segments and drifted 2px further off with every step). `offsetLeft` is a PHYSICAL
          value regardless of `dir`, so a physical `left` needs no RTL sign-flip either. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[calc(var(--r-md)-2px)] bg-card transition-[left,width]"
        style={{
          left: thumbBox ? `${thumbBox.left}px` : '2px', // rtl-ok (offsetLeft is physical, see the comment above)
          width: thumbBox ? `${thumbBox.width}px` : `calc((100% - 4px) / ${options.length})`,
          transitionDuration: 'var(--s-motion-base)',
          transitionTimingFunction: 'var(--s-ease-standard)',
          boxShadow: 'var(--e1)',
        }}
      />
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === selectedIndex ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={e => onKeyDown(e, i)}
            // data-hit-slop: the track is 40px tall minus padding; `.s-hit` grows the real hit
            // area (see chip.tsx's FilterChip for why the overlap sweep needs the attribute too).
            data-hit-slop
            className={cn(
              's-hit relative z-10 h-full min-w-0 flex-1 rounded-[calc(var(--r-md)-2px)] px-3 text-sm font-semibold transition-colors',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            style={{ transitionDuration: 'var(--s-motion-base)', transitionTimingFunction: 'var(--s-ease-standard)' }}
          >
            {/* data-truncate: CSS ellipsis clips visually but scrollWidth still reports the
                full intrinsic text width — the sweep's escape hatch for exactly that (_overlap.ts
                rule 2), same as every other truncating label in the app. */}
            <span className="block truncate" data-truncate>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
