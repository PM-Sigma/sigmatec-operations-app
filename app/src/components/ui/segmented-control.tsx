import { cn } from '@/lib/utils';

/**
 * SegmentedControl — 2–4 views of the SAME data (חודש/שבוע/רשימה, מצב הקיבוץ/ביקורים), design-
 * system spec §2 "Components → Tabs / SegmentedControl". A 40px surface-2 track with a sliding
 * surface+e1 thumb. For >4 items use a scrollable Tabs row instead (not this component).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex h-10 items-center gap-0.5 rounded-[var(--r-md)] bg-[var(--neutral-fill)] p-0.5', className)}
    >
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-full min-w-0 flex-1 rounded-[calc(var(--r-md)-2px)] px-3 text-sm font-semibold transition-colors',
              selected ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            style={{ transitionDuration: 'var(--s-motion-base)', transitionTimingFunction: 'var(--s-ease-standard)', boxShadow: selected ? 'var(--e1)' : undefined }}
          >
            <span className="block truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
