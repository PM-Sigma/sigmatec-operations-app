// A page section (🆕 לקוחות חדשים / ✅ לקוחות פעילים) — header with an animated count,
// then the region groups. The count ticker is a 12-line local component instead of vendoring
// Magic UI's NumberTicker (one dependency for one number was not worth the boot budget).
import * as React from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { KibbutzCard } from '@/components/home/KibbutzCard';
import type { KibbutzRow, RegionGroup } from '@/lib/kibbutzim';

/** Animates from the previous value to `value` over ~350 ms (step-wise, reduced-motion safe). */
export function NumberTicker({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(value);
  const ref = React.useRef(value);
  React.useEffect(() => {
    if (reduce || ref.current === value) { ref.current = value; setShown(value); return; }
    const from = ref.current;
    ref.current = value;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 350);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // rAF is throttled (or stopped) in a hidden tab, which would freeze the count
    // mid-animation and show a number that is simply wrong. The timer lands on the real
    // value no matter what the frame loop did.
    const settle = setTimeout(() => setShown(value), 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [value, reduce]);
  return <bdi>{shown}</bdi>;
}

export function Section({
  title, groups, count, role, canEdit, highlight, onEdit,
}: {
  title: string;
  groups: RegionGroup[];
  count: number;
  role: string;
  canEdit: boolean;
  highlight: string | null;
  onEdit: (row: KibbutzRow) => void;
}) {
  if (!count) return null;
  return (
    <section className="mb-1">
      <header className="mb-1.5 mt-3 flex items-center gap-2 px-0.5">
        <h3 className="text-sm font-bold text-muted-foreground">{title}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          <NumberTicker value={count} />
        </span>
        <span className="h-px flex-1 bg-border" />
      </header>
      <div className="grid items-start gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {/* One flat keyed list. AnimatePresence only tracks its DIRECT children, so wrapping
            each group in a Fragment hid the cards from it and left exited cards stranded.
            There are no region rows any more (עידן 20.9 #1: "the label rows between the
            cards are noise") — the groups still order the list, and each card carries its
            own region chip, so the grouping is legible without a row spent on it. */}
        <AnimatePresence initial={false}>
          {groups.flatMap(g => {
            const out: React.ReactNode[] = [];
            g.rows.forEach((row, i) => out.push(
              <KibbutzCard
                key={row.name}
                row={row}
                role={role}
                canEdit={canEdit}
                onEdit={onEdit}
                highlight={highlight === row.name}
                index={i}
              />,
            ));
            return out;
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
