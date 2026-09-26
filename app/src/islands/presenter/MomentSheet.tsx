// "סמן רגע" (M-R5, M-U2): the tap already marked the moment (`mark()` fires at once — the
// moment is the tap, not the save); this sheet only offers an optional one-line note attached
// afterward. Closing without text keeps the bare marker.
import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BubbleButton } from '@/components/ui/bubble-button';

export function MomentSheet({
  open, onOpenChange, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = React.useState('');
  React.useEffect(() => { if (open) setNote(''); }, [open]);

  function save() {
    const body = note.trim();
    if (body) onSave(body);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="presenter-moment-sheet" className="max-h-[60svh]">
        <SheetHeader className="text-start">
          <SheetTitle className="text-base">הרגע סומן</SheetTitle>
          <SheetDescription>אפשר להוסיף הערה קצרה, לא חובה</SheetDescription>
        </SheetHeader>
        <input
          data-testid="presenter-moment-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          autoFocus
          placeholder="הערה (לא חובה)"
          aria-label="הערה (לא חובה)"
          className="mt-3 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-[15px] text-foreground outline-none focus:border-[color:var(--brand-1)]"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        />
        <div className="mt-3">
          <BubbleButton variant="primary" size="lg" data-testid="presenter-moment-save" onClick={save}>
            שמירה
          </BubbleButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
