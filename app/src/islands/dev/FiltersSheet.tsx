// D-U1 — "סינון": text search, assignee / stage / priority tier, "עודכנו השבוע", "הסתר בוצעו".
// Pure composition over `applyDevFilters` (D-L2); this file only owns the sheet's own state,
// applied on "החלה" so the list doesn't reshuffle key-by-key while typing.
import * as React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { FilterChip } from '@/components/ui/chip';
import { BubbleButton } from '@/components/ui/bubble-button';
import { PRIO_LABEL, type DevFilters, type PrioTier } from '@/lib/devMeeting';
import { STAGE_LABEL, type DevStage } from '@/lib/sprintPrep';

const TIERS: PrioTier[] = ['crit', 'high', 'med', 'low', 'none'];
const STAGES: DevStage[] = ['backlog', 'scope', 'ready', 'prog', 'review', 'committed'];

export function FiltersSheet({ open, onOpenChange, filters, assignees, onApply }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: DevFilters;
  assignees: string[];
  onApply: (f: DevFilters) => void;
}) {
  const [draft, setDraft] = React.useState<DevFilters>(filters);
  React.useEffect(() => { if (open) setDraft(filters); }, [open, filters]);

  const clear = () => { setDraft({}); onApply({}); onOpenChange(false); };
  const apply = () => { onApply(draft); onOpenChange(false); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="dev-filters-sheet" className="max-h-[88svh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle>סינון</SheetTitle>
          <SheetDescription>לפי עדיפות, שלב, אחראי ותאריך עדכון</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 py-3">
          <input
            type="search"
            aria-label="חיפוש"
            placeholder="חיפוש לפי כותרת, מספר או אחראי"
            value={draft.q || ''}
            onChange={e => setDraft(d => ({ ...d, q: e.target.value || undefined }))}
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-[color:var(--brand-1)]"
          />

          <section>
            <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">עדיפות</p>
            <div className="flex flex-wrap gap-1.5">
              {TIERS.map(t => (
                <FilterChip key={t} selected={draft.tier === t} onClick={() => setDraft(d => ({ ...d, tier: d.tier === t ? undefined : t }))}>
                  {PRIO_LABEL[t]}
                </FilterChip>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">שלב</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map(s => (
                <FilterChip key={s} selected={draft.stage === s} onClick={() => setDraft(d => ({ ...d, stage: d.stage === s ? undefined : s }))}>
                  {STAGE_LABEL[s]}
                </FilterChip>
              ))}
            </div>
          </section>

          {assignees.length > 0 && (
            <section>
              <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">אחראי</p>
              <div className="flex flex-wrap gap-1.5">
                {assignees.map(a => (
                  <FilterChip key={a} selected={draft.assignee === a} onClick={() => setDraft(d => ({ ...d, assignee: d.assignee === a ? undefined : a }))}>
                    <bdi>{a}</bdi>
                  </FilterChip>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-wrap gap-1.5">
            <FilterChip selected={!!draft.updatedThisWeek} onClick={() => setDraft(d => ({ ...d, updatedThisWeek: !d.updatedThisWeek || undefined }))}>
              עודכנו השבוע
            </FilterChip>
            <FilterChip selected={!!draft.hideDone} onClick={() => setDraft(d => ({ ...d, hideDone: !d.hideDone || undefined }))}>
              הסתר בוצעו
            </FilterChip>
          </section>
        </div>

        <div className="flex gap-2 border-t border-border pt-3">
          <BubbleButton variant="neutral" className="flex-1" onClick={clear} data-testid="dev-filters-clear">ניקוי סינון</BubbleButton>
          <BubbleButton variant="primary" className="flex-1" onClick={apply} data-testid="dev-filters-apply">החלה</BubbleButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** How many of the sheet's filters are currently on — the badge on "סינון" in the header. */
export function activeFilterCount(f: DevFilters): number {
  return ['q', 'assignee', 'stage', 'tier', 'updatedThisWeek', 'hideDone']
    .filter(k => (f as any)[k] !== undefined && (f as any)[k] !== '').length;
}
