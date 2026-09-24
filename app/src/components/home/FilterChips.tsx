// Filter chips + search (spec §2: "Filter chips: הכל · חדשים · פעילים · 🤝 שיווקי").
// The chips are a shadcn ToggleGroup so the selected pill is a single controlled value;
// counts are wrapped in <bdi> so a Hebrew label can never flip the digits (RTL gate, §6).
import { Search } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { CardFilter, Counts } from '@/lib/kibbutzim';

const CHIPS: Array<{ value: CardFilter; label: string; key: keyof Counts }> = [
  { value: 'all', label: 'הכל', key: 'all' },
  { value: 'new', label: '🆕 חדשים', key: 'new' },
  { value: 'active', label: '✅ פעילים', key: 'active' },
  { value: 'marketing', label: '🤝 שיווקי', key: 'marketing' },
];

export function FilterChips({
  filter, onFilter, query, onQuery, counts,
}: {
  filter: CardFilter;
  onFilter: (f: CardFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  counts: Counts;
}) {
  // No `-mx-1` here: a negative margin on a full-width block adds 8 px to the DOCUMENT width,
  // and at 390 px that is a sideways scroll the moment any Radix sheet locks the body and the
  // scrollbar gutter stops hiding it (audit A · A6). The bleed is not worth a broken viewport.
  return (
    <div className="sticky top-0 z-[3] bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
      <label className="mb-2 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="חיפוש קיבוץ · איזור"
          aria-label="חיפוש קיבוץ"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={v => onFilter((v || 'all') as CardFilter)}
        className="flex flex-nowrap justify-start gap-1"
      >
        {CHIPS.map(c => (
          <ToggleGroupItem
            key={c.value}
            value={c.value}
            // The accessible name must CONTAIN the visible text (a11y gate
            // label-content-name-mismatch): the chip SHOWS "הכל 12", so a bare label that omits
            // the count made voice control ask for a name nobody can see.
            aria-label={c.label + ' ' + counts[c.key]}
            className="h-auto min-w-0 flex-1 justify-center whitespace-nowrap rounded-full border border-border bg-card px-1.5 py-1 text-[12px] font-semibold text-muted-foreground data-[state=on]:border-transparent data-[state=on]:bg-foreground data-[state=on]:text-background"
          >
            {/* no `opacity-70`: it composited --muted-foreground down to 3.07:1 (a11y gate). */}
            {c.label} <bdi>{counts[c.key]}</bdi>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
