// A page section (🆕 לקוחות חדשים / ✅ לקוחות פעילים) — header with an animated count,
// then the region groups. The count ticker is a 12-line local component instead of vendoring
// Magic UI's NumberTicker (one dependency for one number was not worth the boot budget).
import * as React from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { RegionLabel } from '@/components/home/RegionLabel';
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
  const showRegions = groups.length > 1;      // a single region needs no sub-header
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
        {/* AnimatePresence only tracks its DIRECT children, so the region labels and the
            cards are flattened into ONE keyed list — wrapping each group in a Fragment
            hid the cards from it and left exited cards stranded in the DOM. */}
        <AnimatePresence initial={false}>
          {groups.flatMap(g => {
            const out: React.ReactNode[] = [];
            if (showRegions) out.push(<RegionLabel key={'region:' + (g.region || '—')} region={g.region} />);
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
