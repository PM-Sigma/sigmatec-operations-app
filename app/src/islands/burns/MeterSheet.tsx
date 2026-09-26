// MeterSheet — the details sheet a burns row opens (G-U2). Warnings, the EMS link, the
// status, and "דיווח על בעיה" for a writer. No confirm() anywhere (G-R4): un-burn is
// immediate with an undo toast, shown by the caller.
import { AlertTriangle, ExternalLink, Flame, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Tag } from '@/components/ui/chip';
import { burnKindLabel, burnStateLabel, burnWarnings, type BurnRow, type GeneratorRow } from '@/lib/burns';

export function MeterSheet({
  row, gen, canWrite, open, onOpenChange, onBurn, onUnburn, onReportIssue, onResolveIssue, onAssign,
}: {
  row: BurnRow | null;
  gen: GeneratorRow | null;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBurn: () => void;
  onUnburn: () => void;
  onReportIssue: () => void;
  onResolveIssue: () => void;
  onAssign: () => void;
}) {
  if (!row) return null;
  const warnings = burnWarnings(row);
  const emsHref = (window as any).sigma?.emsMeterUrl?.(row.meter_id) as string | undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[85svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle><bdi>{row.serial}</bdi></SheetTitle>
          <SheetDescription>{[row.address, row.solar_names].filter(Boolean).join(' · ') || row.site}</SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Tag role="neutral">{burnKindLabel(row).replace(/^[^\s]+\s/, '')}</Tag>
          <Tag role={row.status === 'burned' ? 'ok' : row.status === 'issue' ? 'danger' : 'neutral'}>
            {burnStateLabel(row).replace(/^[^\s]+\s/, '')}
          </Tag>
          {gen && <Tag role="info">{gen.name}</Tag>}
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {warnings.map(w => (
              <div key={w} className="flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--warn-fill)] px-3 py-2 text-[13px] text-[var(--warn-ink)]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span>{w.replace(/^[^\s]+\s/, '')}</span>
              </div>
            ))}
          </div>
        )}

        {row.note && (
          <p className="mt-3 rounded-[var(--r-md)] bg-secondary px-3 py-2 text-[13px] text-foreground">{row.note}</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {emsHref && (
            <BubbleButton variant="neutral" size="md" icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(emsHref, '_blank', 'noopener')}>
              פתיחה ב-EMS
            </BubbleButton>
          )}
          {canWrite && (
            <>
              {row.status !== 'burned' ? (
                <BubbleButton variant="primary" size="md" icon={<Flame className="h-4 w-4" />} onClick={onBurn}>
                  סימון כנצרב
                </BubbleButton>
              ) : (
                <BubbleButton variant="neutral" size="md" icon={<RotateCcw className="h-4 w-4" />} onClick={onUnburn}>
                  ביטול צריבה
                </BubbleButton>
              )}
              <BubbleButton variant="tonal" size="md" onClick={onAssign}>
                שיבוץ לגנרטור
              </BubbleButton>
              {row.status === 'issue' ? (
                <BubbleButton variant="neutral" size="md" onClick={onResolveIssue}>
                  הבעיה נפתרה
                </BubbleButton>
              ) : (
                <BubbleButton variant="danger" size="md" onClick={onReportIssue}>
                  דיווח על בעיה
                </BubbleButton>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
