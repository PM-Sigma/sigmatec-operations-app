// IssueSheet — report or resolve a burns problem (G-U2). "גם משימה ב-EMS" is a Switch, never
// a confirm() (G-R4); saving writes `ems_task_id` back onto the row when the task is created.
import * as React from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { BubbleButton } from '@/components/ui/bubble-button';
import { sigma } from '@/bridge';
import { burnIssueTask, type BurnRow, type GeneratorRow } from '@/lib/burns';
import { markIssue } from '@/lib/burnsData';

export function IssueSheet({
  row, gen, open, onOpenChange, onSaved,
}: {
  row: BurnRow | null;
  gen: GeneratorRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [note, setNote] = React.useState('');
  const [alsoTask, setAlsoTask] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) { setNote(row?.note || ''); setAlsoTask(true); } }, [open, row?.meter_id]);

  if (!row) return null;

  const save = async () => {
    if (!note.trim()) { toast.error('צריך לכתוב מה הבעיה'); return; }
    setSaving(true);
    try {
      let taskId: string | undefined;
      if (alsoTask) {
        try {
          const created = await sigma.createTask(burnIssueTask(row, note.trim(), gen));
          taskId = (created as { id?: string } | undefined)?.id;
        } catch { toast.error('המשימה ב-EMS לא נוצרה, הבעיה נשמרה בכל זאת'); }
      }
      await markIssue(row.meter_id, note.trim(), taskId);
      toast.success('הבעיה נשמרה');
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
          <SheetTitle>דיווח על בעיה</SheetTitle>
          <SheetDescription><bdi>{row.serial}</bdi>{row.address ? ' · ' + row.address : ''}</SheetDescription>
        </SheetHeader>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="מה הבעיה במונה הזה"
          className="mt-3 min-h-[96px]"
          aria-label="תיאור הבעיה"
        />
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[var(--r-md)] bg-secondary px-3 py-2.5">
          <span className="text-[13px] font-semibold text-foreground">גם משימה ב-EMS</span>
          <Switch checked={alsoTask} onCheckedChange={setAlsoTask} aria-label="גם משימה ב-EMS" />
        </div>
        <BubbleButton variant="primary" size="lg" className="mt-4" disabled={saving} onClick={() => void save()}>
          שמירת הדיווח
        </BubbleButton>
      </SheetContent>
    </Sheet>
  );
}
