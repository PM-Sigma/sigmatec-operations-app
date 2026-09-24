// AssignSheet — assign one or more selected meters (always one site) to a generator, or
// create a new one (G-U2). The serial field offers EMS search results as tappable rows —
// never a native <select>, never a confirm().
import * as React from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ListRow } from '@/components/ui/list-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import { generatorsForSite, type GeneratorRow } from '@/lib/burns';
import { assignGenerator, ensureGenerator, searchEmsMeters } from '@/lib/burnsData';

export function AssignSheet({
  site, meterIds, gens, user, open, onOpenChange, onSaved,
}: {
  site: string;
  meterIds: string[];
  gens: GeneratorRow[];
  user: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [serialQuery, setSerialQuery] = React.useState('');
  const [hits, setHits] = React.useState<Array<{ serial: string; label: string }>>([]);
  const [saving, setSaving] = React.useState(false);
  const list = React.useMemo(() => generatorsForSite(gens, site), [gens, site]);

  React.useEffect(() => { if (open) { setCreating(false); setName(''); setSerialQuery(''); setHits([]); } }, [open]);

  React.useEffect(() => {
    if (!serialQuery.trim()) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => { void searchEmsMeters(serialQuery.trim()).then(r => { if (live) setHits(r); }).catch(() => { if (live) setHits([]); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [serialQuery]);

  const pick = async (id: string | null) => {
    setSaving(true);
    try { await assignGenerator(meterIds, id); toast.success('השיבוץ נשמר'); onSaved(); onOpenChange(false); }
    catch (e: any) { toast.error(e?.message || 'השמירה נכשלה'); }
    finally { setSaving(false); }
  };

  const create = async () => {
    if (!name.trim()) { toast.error('צריך שם לגנרטור'); return; }
    setSaving(true);
    try {
      const g = await ensureGenerator(site, name.trim(), gens, user);
      await assignGenerator(meterIds, g.id);
      toast.success('הגנרטור נוצר והשיבוץ נשמר');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[85svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>שיבוץ לגנרטור</SheetTitle>
          <SheetDescription>{site} · {meterIds.length} מוני ייצור נבחרו</SheetDescription>
        </SheetHeader>

        {!creating ? (
          <>
            <div className="-mx-6 mt-2 divide-y divide-border">
              <ListRow title="ללא גנרטור" onClick={() => void pick(null)} className="px-6" />
              {list.map(g => (
                <ListRow key={g.id} title={g.name} meta={g.device_serial || undefined} onClick={() => void pick(g.id)} className="px-6" />
              ))}
            </div>
            <BubbleButton variant="tonal" size="md" icon={<Plus className="h-4 w-4" />} className="mt-3" onClick={() => setCreating(true)}>
              גנרטור חדש
            </BubbleButton>
          </>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-muted-foreground">שם הגנרטור</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-[14px] text-foreground"
                placeholder="גנרטור רפת"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-muted-foreground">חיפוש סריאל ב-EMS (לא חובה)</span>
              <input
                value={serialQuery}
                onChange={e => setSerialQuery(e.target.value)}
                className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-[14px] text-foreground"
                placeholder="מספר מונה"
              />
            </label>
            {hits.length > 0 && (
              <div className="-mx-6 divide-y divide-border">
                {hits.map(h => (
                  <ListRow key={h.serial} title={h.serial} meta={h.label} onClick={() => setSerialQuery(h.serial)} className="px-6" trailing={null} />
                ))}
              </div>
            )}
            <BubbleButton variant="primary" size="lg" disabled={saving} onClick={() => void create()}>
              יצירת הגנרטור ושיבוץ
            </BubbleButton>
            <BubbleButton variant="neutral" size="md" onClick={() => setCreating(false)}>
              חזרה לרשימה
            </BubbleButton>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
