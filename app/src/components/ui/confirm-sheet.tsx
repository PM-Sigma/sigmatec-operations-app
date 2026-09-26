import * as React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { BubbleButton } from '@/components/ui/bubble-button';

/**
 * ConfirmSheet — design-system spec §2 "Components → ConfirmSheet": a Sheet at z-confirm (above
 * an ordinary sheet it was opened from — the delete-item flow opens it from inside the edit
 * sheet, styles.css/tokens.css `--s-z-confirm`), a title, an optional list of what goes, and a
 * footer with the confirm bubble (danger variant when `danger`) and a neutral "ביטול".
 *
 * The confirm button disables itself while `onConfirm` is in flight so a double tap (a fast
 * double click, or two fingers) can't fire it twice — design-review sign-off P1-6.
 */
export function ConfirmSheet({
  open,
  title,
  lines,
  confirmLabel,
  danger,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  lines?: string[];
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="z-[var(--s-z-confirm)] flex max-h-[85vh] flex-col gap-4">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {lines && lines.length > 0 && (
          <ul className="flex flex-col gap-1 text-[length:var(--fs-body-sm)] leading-[var(--lh-body-sm)] text-muted-foreground">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        <SheetFooter className="flex flex-col gap-2">
          <BubbleButton
            variant={danger ? 'danger' : 'primary'}
            size="lg"
            disabled={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </BubbleButton>
          <BubbleButton variant="neutral" size="lg" onClick={() => onOpenChange(false)}>
            ביטול
          </BubbleButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
