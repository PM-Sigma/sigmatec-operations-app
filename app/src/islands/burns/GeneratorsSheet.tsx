// GeneratorsSheet — the full generators list (עידן / עמיחי only, G-U2): every generator, how
// many meters point at it, and its own controller serial saved on blur — no native input
// stepper, just a plain text field.
import * as React from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { burnGenSummary, type BurnRow, type GeneratorRow } from '@/lib/burns';
import { saveGeneratorSerial } from '@/lib/burnsData';

export function GeneratorsSheet({
  gens, rows, open, onOpenChange,
}: {
  gens: GeneratorRow[];
  rows: BurnRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const summary = React.useMemo(() => burnGenSummary(gens, rows), [gens, rows]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const save = async (id: string, value: string) => {
    try { await saveGeneratorSerial(id, value); }
    catch (e: any) { toast.error(e?.message || 'השמירה נכשלה'); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[85svh] overflow-y-auto">
        <SheetHeader><SheetTitle>גנרטורים</SheetTitle></SheetHeader>
        <div className="mt-2 flex flex-col gap-2">
          {summary.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">אין עדיין גנרטורים</p>}
          {summary.map(g => (
            <div key={g.id} className="flex items-center gap-3 rounded-[var(--r-md)] bg-secondary px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-foreground">{g.name}</div>
                <div className="truncate text-[12px] text-muted-foreground">{g.site} · <bdi>{g.count}</bdi> מוני ייצור</div>
              </div>
              <input
                value={drafts[g.id] ?? g.device_serial}
                onChange={e => setDrafts(d => ({ ...d, [g.id]: e.target.value }))}
                onBlur={e => void save(g.id, e.target.value)}
                placeholder="סריאל בקר"
                aria-label={'סריאל של ' + g.name}
                className="w-28 shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-[13px]"
              />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
