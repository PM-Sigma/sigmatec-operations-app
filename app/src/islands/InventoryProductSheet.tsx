// 📦 ProductSheet — the new/edit product sheet + ruled delete (spec task U6, P1-P18, §7).
// The rules live in app/src/lib/inventory.ts + productLabel.ts (reportWiringOk/reportPreview/
// canEditDisplayName/deleteSummaryLines); the writes in app/src/lib/inventoryApi.ts
// (saveProduct/setProductActive/deletePreview/deleteProduct). This file is the shell.
import * as React from 'react';
import { toast } from 'sonner';
import { Loader2, MoreHorizontal } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useCurrentUser } from '@/bridge';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { saveProduct, setProductActive, deletePreview, deleteProduct, type ProductDraft } from '@/lib/inventoryApi';
import { canEditDisplayName } from '@/lib/productLabel';
import { deleteSummaryLines, STOCK_CATEGORY_ORDER, type ProductRow, type DeletePreview } from '@/lib/inventory';

// The category <option> spelling (P15 fix): gershayim (״), the one spelling this picker offers —
// see STOCK_CATEGORY_ORDER's comment for why the legacy ASCII-quote spelling is a bug, not a choice.
const CATEGORY_OPTIONS = [...STOCK_CATEGORY_ORDER, 'אחר'];

export interface ProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
  hasMovements: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}

type Step = 'form' | 'delete-confirm';

function draftFromProduct(p: ProductRow | null): ProductDraft {
  if (!p) return { name: '', category: CATEGORY_OPTIONS[0], active: true, displayName: '' };
  return {
    id: p.id, name: p.name, category: p.category || CATEGORY_OPTIONS[0],
    active: p.active !== false, displayName: p.display_name || '',
  };
}

export function ProductSheet({ open, onOpenChange, product, hasMovements, onSaved, onDeleted }: ProductSheetProps) {
  const user = useCurrentUser();
  const isIdan = user.role === 'idan';
  const isNew = !product;
  const [draft, setDraft] = React.useState<ProductDraft>(() => draftFromProduct(product));
  const [saving, setSaving] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>('form');
  const [preview, setPreview] = React.useState<DeletePreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (open) { setDraft(draftFromProduct(product)); setStep('form'); setMoreOpen(false); setPreview(null); }
  }, [open, product]);

  React.useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const original = React.useMemo(() => draftFromProduct(product), [product]);
  const guard = useUnsavedGuard({
    // No draft on close (spec ruling): closing the sheet — whether the guard fires or not —
    // never calls saveProduct. dirty() only decides whether the "discard changes?" prompt
    // shows; it is never wired to a write.
    dirty: () => open && step === 'form' && JSON.stringify(draft) !== JSON.stringify(original),
    onDiscard: () => onOpenChange(false),
    onClose: () => onOpenChange(false),
  });

  const renameWarning = !isNew && product && draft.name.trim() && draft.name.trim() !== product.name && hasMovements;

  async function submit() {
    if (!draft.name.trim()) { toast.error('שם הפריט חובה'); return; }
    setSaving(true);
    try {
      await saveProduct({ ...draft, name: draft.name.trim() }, isIdan);
      toast.success('הפריט נשמר');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!product?.id) return;
    setMoreOpen(false);
    const next = !(draft.active !== false);
    try {
      await setProductActive(product.id, next);
      setDraft(d => ({ ...d, active: next }));
      toast.success(next ? 'הפריט הופעל' : 'הפריט הושבת');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'הפעולה נכשלה');
    }
  }

  async function openDeletePreview() {
    if (!product) return;
    setMoreOpen(false);
    setPreviewLoading(true);
    try {
      const p = await deletePreview(product.name);
      setPreview(p);
      setStep('delete-confirm');
    } catch (e: any) {
      toast.error(e?.message || 'טעינת התצוגה המקדימה נכשלה');
    } finally {
      setPreviewLoading(false);
    }
  }

  function confirmDelete() {
    if (!product || !preview) return;
    const name = product.name;
    const fp = preview.fingerprint;
    onOpenChange(false);
    const id = toast(`הפריט ${name} נמחק`, {
      duration: 5000,
      action: {
        label: 'ביטול',
        onClick: () => { if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null; } },
      },
    });
    undoTimer.current = setTimeout(async () => {
      undoTimer.current = null;
      try {
        await deleteProduct(name, fp);
        onDeleted();
      } catch (e: any) {
        if (String(e?.message || '').includes('inventory_changed')) {
          toast.error('הנתונים השתנו מאז התצוגה. לפתוח שוב את המחיקה', { id });
          openDeletePreview();
        } else {
          toast.error(e?.message || 'המחיקה נכשלה', { id });
        }
      }
    }, 5000);
  }

  const lines = preview ? deleteSummaryLines(preview) : [];

  return (
    <>
      <Sheet open={open && step === 'form'} onOpenChange={o => (o ? onOpenChange(true) : onOpenChange(false))}>
        <SheetContent side="bottom" dir="rtl" data-testid="product-sheet" className="max-h-[92vh] overflow-y-auto" {...guard.contentProps}>
          <SheetHeader>
            <SheetTitle className="text-[17px]">{isNew ? 'פריט חדש' : 'עריכת פריט'}</SheetTitle>
          </SheetHeader>
          <div className="mt-2 space-y-4">
            <div>
              <label className="text-[13px] font-bold" htmlFor="psName">שם הפריט</label>
              <input id="psName" data-testid="ps-name" value={draft.name}
                     onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                     className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              {renameWarning && (
                <div className="mt-1 text-[13px] text-[var(--warn-ink)]">
                  לפריט הזה כבר יש תנועות מלאי — שינוי השם לא ישנה רשומות קיימות.
                </div>
              )}
            </div>
            <div>
              <label className="text-[13px] font-bold" htmlFor="psCategory">קטגוריה</label>
              <select id="psCategory" data-testid="ps-category" value={draft.category || CATEGORY_OPTIONS[0]}
                      onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-2 text-[15px]">
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-bold" htmlFor="psActive">פעיל</label>
              <input id="psActive" data-testid="ps-active" type="checkbox" checked={draft.active !== false}
                     onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
                     className="h-5 w-5" />
            </div>
            <div>
              <label className="text-[13px] font-bold" htmlFor="psDisplay">שם לדוחות</label>
              <input id="psDisplay" data-testid="ps-display" value={draft.displayName || ''}
                     disabled={!canEditDisplayName(isIdan)}
                     onChange={e => setDraft(d => ({ ...d, displayName: e.target.value }))}
                     className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px] disabled:opacity-50" />
              {!canEditDisplayName(isIdan) && (
                <div className="mt-1 text-[13px] text-muted-foreground">עריכת שם לדוחות זמינה לעידן בלבד</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" data-testid="ps-save" onClick={() => void submit()} disabled={saving}
                      className="min-h-[48px] flex-1 rounded-xl s-brand text-[15px] font-bold disabled:opacity-40">
                {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'שמירה'}
              </button>
              {!isNew && (
                <div className="relative">
                  <button type="button" data-testid="ps-more" aria-label="עוד" onClick={() => setMoreOpen(v => !v)}
                          className="s-hit min-h-[48px] min-w-[48px] rounded-xl border border-border bg-card">
                    <MoreHorizontal className="mx-auto h-5 w-5" />
                  </button>
                  {moreOpen && (
                    <div className="absolute inset-inline-end-0 z-10 mt-1 w-44 rounded-xl border border-border bg-card p-1 shadow-lg">
                      <button type="button" data-testid="ps-toggle" onClick={() => void toggleActive()}
                              className="block w-full rounded-lg px-3 py-2 text-start text-[14px] font-semibold hover:bg-secondary">
                        {draft.active !== false ? 'השבתה' : 'הפעלה'}
                      </button>
                      {isIdan && (
                        <button type="button" data-testid="ps-delete" disabled={previewLoading} onClick={() => void openDeletePreview()}
                                className="block w-full rounded-lg px-3 py-2 text-start text-[14px] font-semibold text-[var(--danger-ink)] hover:bg-secondary disabled:opacity-40">
                          מחיקה
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {guard.prompt}
        </SheetContent>
      </Sheet>

      {step === 'delete-confirm' && preview && product && (
        <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40" data-testid="delete-confirm-sheet">
          <div className="w-full max-w-md rounded-t-2xl bg-card p-4">
            <div className="mb-2 text-[17px] font-bold">מחיקת {product.name}</div>
            <div className="mb-3 flex flex-col gap-1 text-[14px]">
              {lines.map((l, i) => (
                <div key={i} data-testid={`del-line-${i}`} className={l.danger ? 'font-bold text-[var(--danger-ink)]' : 'text-foreground'}>
                  {l.text}
                </div>
              ))}
              {lines.length === 0 && <div className="text-muted-foreground">אין תנועות או שימושים קשורים לפריט זה.</div>}
            </div>
            <div className="flex gap-2">
              <button type="button" data-testid="del-confirm" onClick={confirmDelete}
                      className="min-h-[44px] flex-1 rounded-xl bg-[var(--danger-fill)] font-bold text-[var(--danger-ink)]">
                מחיקה סופית
              </button>
              <button type="button" data-testid="del-cancel" onClick={() => { setStep('form'); onOpenChange(true); }}
                      className="min-h-[44px] flex-1 rounded-xl border border-border font-bold">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
