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
  return (
    <div className="sticky top-0 z-[3] -mx-1 bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
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
        className="flex justify-start gap-1.5 overflow-x-auto"
      >
        {CHIPS.map(c => (
          <ToggleGroupItem
            key={c.value}
            value={c.value}
            aria-label={c.label}
            className="h-auto shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-muted-foreground data-[state=on]:border-transparent data-[state=on]:bg-foreground data-[state=on]:text-background"
          >
            {c.label} <bdi className="opacity-70">{counts[c.key]}</bdi>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
