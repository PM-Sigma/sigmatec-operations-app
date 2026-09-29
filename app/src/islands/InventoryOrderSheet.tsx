// 🧾 OrderSheet — the new/edit order sheet (spec task U2, O16-O29, §7). One Sheet, phone bottom /
// dialog from 768 up, with the AI-parse questions pushed IN as a step (a back chevron), never a
// second modal. Writes go through app/src/lib/inventoryApi.ts (saveOrder/approveOrder), plans
// from app/src/lib/inventory.ts (orderSavePlan/approvalPlan) — this file is only the shell.
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useCurrentUser } from '@/bridge';
import { useInventory, saveOrder, approveOrder, parseOrderText, type InvData } from '@/lib/inventoryApi';
import {
  orderFormFields, newItemRow, editStatusOptions, canApproveThisOrder, approvalPlan, poolStock,
  ORDER_STATUS_LABEL, type DraftItem, type OrderDraft, type OrderLike, type Ctx,
} from '@/lib/inventory';
import { accessoryQuestions, accessoryPlan, ambiguousSatecQuestion, type Question } from '@/lib/orderParse';
import { toastFailure } from '@/lib/pending';

export interface OrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderLike | null;        // null = new
  defaultType?: 'supplier' | 'customer';
  onSaved: () => void;
  /** O34-O38: the `{kind:'approve'}` push/bell/strip deep link opens straight to the confirm step
   * instead of the plain edit form — the caller only sets this when the order is actually
   * approvable (canApproveThisOrder), so it's never offered to someone who couldn't confirm it. */
  initialStep?: 'form' | 'approve-confirm';
}

type Step = 'form' | 'questions' | 'approve-confirm';

function draftFromOrder(o: OrderLike | null, defaultType: 'supplier' | 'customer'): OrderDraft {
  if (!o) {
    return {
      orderType: defaultType, supplier: '', kibbutz: '', assignee: '', expectedDate: '', notes: '',
      raw: '', createdBy: '', items: [], status: undefined, origStatus: undefined,
    };
  }
  return {
    id: String(o.id), orderType: (o as any).orderType === 'customer' ? 'customer' : 'supplier',
    supplier: o.supplier || '', kibbutz: (o as any).kibbutz || '', assignee: (o as any).assignee || '',
    expectedDate: (o as any).expectedDate || '', notes: (o as any).notes || '', raw: '',
    createdBy: (o as any).createdBy || '', items: (o.items || []).map(it => ({ name: it.name || '', qty: Number(it.qty) || 0 })),
    status: o.status, origStatus: o.status,
  };
}

export function OrderSheet({ open, onOpenChange, order, defaultType = 'supplier', onSaved, initialStep }: OrderSheetProps) {
  const user = useCurrentUser();
  const invQ = useInventory();
  const data = invQ.data;
  const isNew = !order;
  const [draft, setDraft] = React.useState<OrderDraft>(() => draftFromOrder(order, defaultType));
  const [step, setStep] = React.useState<Step>('form');
  const [saving, setSaving] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [questions, setQuestions] = React.useState<Question[]>([]);

  React.useEffect(() => {
    if (open) { setDraft(draftFromOrder(order, defaultType)); setStep(initialStep || 'form'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, defaultType]);

  const catalog = React.useMemo(
    () => (data?.products || []).filter(p => p.active).map(p => p.name).sort((a, b) => a.localeCompare(b, 'he')),
    [data],
  );

  // A new order opens with ONE empty item row already there (ItemRow + הוספת שורה — the row is
  // the unit the editor works in, so it starts with one rather than an empty list).
  React.useEffect(() => {
    if (open && !order && catalog.length) {
      setDraft(d => (d.items.length === 0 ? { ...d, items: [newItemRow(catalog)] } : d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, catalog.length]);

  const fields = orderFormFields(draft.orderType, draft.assignee, user.name, isNew);
  const unknownNames = React.useMemo(
    () => [...new Set(draft.items.filter(it => it.name && !catalog.includes(it.name)).map(it => it.name))],
    [draft.items, catalog],
  );

  const setItem = (i: number, patch: Partial<DraftItem>) =>
    setDraft(d => ({ ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const removeItem = (i: number) => setDraft(d => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  const addRow = () => setDraft(d => ({ ...d, items: [...d.items, newItemRow(catalog)] }));
  const removeUnknown = () => setDraft(d => ({ ...d, items: d.items.filter(it => !it.name || catalog.includes(it.name)) }));

  // The parse pipeline runs in two ORDERED phases (F03: "ambiguous-Satec question, THEN
  // accessory questions") — the satec question resolves the base meter LINE first (its answer
  // changes which item name accessoryPlan sees), so accessory questions are only ever computed
  // from the ALREADY-resolved item list, never the raw parse output. `satecItems` holds that
  // in-flight list between doParse() and answerQuestion() resolving it.
  const [satecQuestion, setSatecQuestion] = React.useState<Question | null>(null);
  const [satecItems, setSatecItems] = React.useState<DraftItem[]>([]);

  function finishAccessoryPhase(items: DraftItem[]) {
    const pool = poolStock(data?.movements || []);
    const plan = accessoryPlan(items);
    // Antenna: one per controller, always silent (askChoice never fires for it — legacy
    // finalizeCustomerAccessories auto-adds it, it just never asks which one).
    const withAntenna = plan.totalControllers > 0 && catalog.includes('אנטנה')
      ? [...items, { name: 'אנטנה', qty: plan.antennaQty, auto: true } as DraftItem]
      : items;
    setDraft(d => ({ ...d, items: [...d.items, ...withAntenna] }));
    const qs = accessoryQuestions(items, catalog, pool);
    if (qs.length) { setQuestions(qs); setStep('questions'); } else { setStep('form'); }
  }

  async function doParse() {
    const raw = draft.raw?.trim();
    if (!raw) return;
    setParsing(true);
    try {
      const res = await parseOrderText(raw, draft.orderType, catalog);
      const newItems: DraftItem[] = res.items.map(it => ({ name: it.name, qty: it.qty }));
      toast(res.source === 'local' ? 'נותח מקומית, בלי AI' : 'נותח ע״י AI');

      const pool = poolStock(data?.movements || []);
      const satecQ = ambiguousSatecQuestion(raw, newItems, catalog, pool);
      if (satecQ) {
        setSatecQuestion(satecQ);
        setSatecItems(newItems);
        setQuestions([satecQ]);
        setStep('questions');
      } else {
        finishAccessoryPhase(newItems);
      }
    } catch (e: any) {
      toastFailure(e, undefined, 'הניתוח נכשל');
    } finally {
      setParsing(false);
    }
  }

  function answerQuestion(q: Question, opt: { label: string; value: string; hint: string }) {
    if (q === satecQuestion) {
      // Resolve the ambiguous base line, THEN move to the accessory phase over the resolved list.
      const resolved = satecItems.map(it => (/satec|em133|pm135/i.test(it.name) ? { ...it, name: opt.value } : it));
      setSatecQuestion(null);
      setSatecItems([]);
      finishAccessoryPhase(resolved);
      return;
    }
    setDraft(d => ({ ...d, items: [...d.items, { name: opt.value, qty: q.qty, auto: true }] }));
    setQuestions(qs => {
      const next = qs.filter(x => x !== q);
      if (next.length === 0) setStep('form');
      return next;
    });
  }

  async function submit() {
    if (!data) return;
    setSaving(true);
    try {
      const me = user.name;
      const finalDraft: OrderDraft = { ...draft, createdBy: draft.createdBy || me };
      await saveOrder(finalDraft, data as InvData, me);
      toast.success('ההזמנה נשמרה');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error((e?.message || 'השמירה נכשלה') + ' — נסה שוב');
    } finally {
      setSaving(false);
    }
  }

  const ctx: Ctx | null = data ? { me: user.name, movements: data.movements, requirements: data.requirements } : null;
  const canApprove = !!order && !!ctx && canApproveThisOrder(order as any, user.name);
  const plan = order && ctx ? approvalPlan(order as any, ctx) : null;

  async function doApprove() {
    if (!order || !data) return;
    setSaving(true);
    try {
      const res = await approveOrder(String(order.id), data as InvData, user.name);
      const msg = res.kind === 'dropship' ? 'אספקה ישירה מהספק אושרה'
        : res.kind === 'customer' ? (res.queued ? 'סופק ללקוח, משימת EMS תיפתח בהתחברות הבאה' : 'סופק ללקוח, נפתחה משימת EMS')
        : 'הזמנת הספק אושרה';
      toast.success(msg);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error((e?.message || 'האישור נכשל') + ' — נסה שוב');
    } finally {
      setSaving(false);
      setStep('form');
    }
  }

  const guard = useUnsavedGuard({
    dirty: () => open && step === 'form' && JSON.stringify(draft) !== JSON.stringify(draftFromOrder(order, defaultType)),
    onDiscard: () => onOpenChange(false),
    onClose: () => onOpenChange(false),
  });

  const statusOptions = order ? editStatusOptions(order as any) : [];

  return (
    <Sheet open={open} onOpenChange={o => (o ? onOpenChange(true) : onOpenChange(false))}>
      <SheetContent side="bottom" dir="rtl" data-testid="order-sheet" className="max-h-[92vh] overflow-y-auto" {...guard.contentProps}>
        {step === 'questions' ? (
          <>
            <SheetHeader>
              <button type="button" data-testid="os-back" onClick={() => setStep('form')} className="text-[13px] font-semibold text-muted-foreground">→ חזרה</button>
              <SheetTitle className="text-[17px]">כמה שאלות על ההזמנה</SheetTitle>
              <SheetDescription className="text-[13px]">אי אפשר לדעת בוודאות איזה סוג — תבחר:</SheetDescription>
            </SheetHeader>
            <div className="mt-2 space-y-4">
              {questions.map((q, qi) => (
                <div key={q.title + qi}>
                  <div className="mb-1 text-[13px] font-bold">{q.title}</div>
                  <div className="mb-2 text-[13px] text-muted-foreground">{q.text}</div>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt, n) => (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`os-q-option-${n}`}
                        onClick={() => answerQuestion(q, opt)}
                        title={opt.hint}
                        className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-[14px] font-semibold"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {questions.length === 0 && (
                <button type="button" onClick={() => setStep('form')} className="min-h-[48px] w-full rounded-xl s-brand text-[15px] font-bold">
                  חזרה לטופס
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-[17px]">{isNew ? 'הזמנה חדשה' : 'עריכת הזמנה'}</SheetTitle>
            </SheetHeader>
            <div className="mt-2 space-y-4">
              {isNew && (
                <div className="flex gap-2">
                  {(['supplier', 'customer'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      data-testid={`os-type-${t}`}
                      onClick={() => setDraft(d => ({ ...d, orderType: t }))}
                      className={'min-h-[44px] flex-1 rounded-xl border px-3 text-[14px] font-bold '
                        + (draft.orderType === t ? 'border-transparent s-brand' : 'border-border bg-card')}
                    >
                      {t === 'supplier' ? 'הזמנת ספק' : 'הזמנת לקוח'}
                    </button>
                  ))}
                </div>
              )}

              {fields.supplier && (
                <div>
                  <label className="text-[13px] font-bold" htmlFor="osSupplier">ספק</label>
                  <input id="osSupplier" data-testid="os-supplier" value={draft.supplier || ''}
                         onChange={e => setDraft(d => ({ ...d, supplier: e.target.value }))}
                         className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
                </div>
              )}
              {fields.kibbutz && (
                <div>
                  <label className="text-[13px] font-bold" htmlFor="osKibbutz">קיבוץ</label>
                  <input id="osKibbutz" data-testid="os-kibbutz" value={draft.kibbutz || ''}
                         onChange={e => setDraft(d => ({ ...d, kibbutz: e.target.value }))}
                         className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
                </div>
              )}
              {fields.assignee && (
                <div>
                  <label className="text-[13px] font-bold" htmlFor="osAssignee">אחראי</label>
                  <input id="osAssignee" data-testid="os-assignee" value={draft.assignee || ''}
                         onChange={e => setDraft(d => ({ ...d, assignee: e.target.value }))}
                         className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
                </div>
              )}
              <div>
                <label className="text-[13px] font-bold" htmlFor="osDate">תאריך יעד</label>
                <input id="osDate" data-testid="os-date" type="date" value={draft.expectedDate || ''}
                       onChange={e => setDraft(d => ({ ...d, expectedDate: e.target.value }))}
                       className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>

              {fields.raw && (
                <div>
                  <label className="text-[13px] font-bold" htmlFor="osRaw">טקסט חופשי (דרישת לקוח)</label>
                  <textarea id="osRaw" data-testid="os-raw" rows={3} value={draft.raw || ''}
                            onChange={e => setDraft(d => ({ ...d, raw: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-[15px]" />
                  <button type="button" data-testid="os-parse" onClick={() => void doParse()} disabled={parsing}
                          className="mt-2 min-h-[40px] rounded-xl border border-border bg-card px-3 text-[13px] font-bold disabled:opacity-40">
                    {parsing ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'ניתוח לפריטים'}
                  </button>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-baseline gap-1 text-[13px] font-bold">
                  <span>פריטים</span>
                  <span className="font-normal text-muted-foreground">(סה״כ <bdi>{draft.items.reduce((s, it) => s + (Number(it.qty) || 0), 0)}</bdi> יחידות)</span>
                </div>
                {draft.items.map((it, i) => {
                  const unknown = !!it.name && !catalog.includes(it.name);
                  return (
                    <div key={i} className="mb-2 flex items-center gap-2">
                      <select data-testid={`os-item-${i}-name`} value={it.name}
                              onChange={e => setItem(i, { name: e.target.value })}
                              className="min-h-[40px] flex-1 rounded-xl border border-border bg-card px-2 text-[14px]">
                        <option value="">— בחר —</option>
                        {catalog.map(n => <option key={n} value={n}>{n}</option>)}
                        {unknown && <option value={it.name}>{it.name} (לא בקטלוג)</option>}
                      </select>
                      <input data-testid={`os-item-${i}-qty`} type="number" min={0} value={it.qty}
                             onChange={e => setItem(i, { qty: Number(e.target.value) || 0 })}
                             className="min-h-[40px] w-20 rounded-xl border border-border bg-card px-2 text-[14px]" />
                      <button type="button" onClick={() => removeItem(i)} aria-label="הסר" className="min-h-[40px] min-w-[40px] rounded-xl border border-border">✕</button>
                    </div>
                  );
                })}
                <button type="button" data-testid="os-add-row" onClick={addRow} className="min-h-[40px] rounded-xl border border-border bg-card px-3 text-[13px] font-bold">
                  + הוספת שורה
                </button>
                {unknownNames.length > 0 && (
                  <div className="mt-2 rounded-xl bg-[var(--danger-fill)] p-2 text-[13px] text-[var(--danger-ink)]">
                    פריטים שלא בקטלוג: {unknownNames.join(', ')}.
                    <button type="button" data-testid="os-remove-unknown" onClick={removeUnknown} className="ms-2 font-bold underline">הסרת השורות</button>
                  </div>
                )}
              </div>

              {!isNew && statusOptions.length > 0 && draft.origStatus !== 'pending_approval' && (
                <div>
                  <label className="text-[13px] font-bold" htmlFor="osStatus">סטטוס</label>
                  <select id="osStatus" data-testid="os-status" value={draft.status || draft.origStatus || ''}
                          onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                          className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-2 text-[15px]">
                    {statusOptions.map(s => <option key={s} value={s}>{ORDER_STATUS_LABEL[s] || s}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[13px] font-bold" htmlFor="osNotes">הערות</label>
                <textarea id="osNotes" data-testid="os-notes" rows={2} value={draft.notes || ''}
                          onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-[15px]" />
              </div>
              <div>
                <label className="text-[13px] font-bold" htmlFor="osCreatedBy">נוצר ע״י</label>
                <input id="osCreatedBy" data-testid="os-created-by" value={draft.createdBy || ''}
                       onChange={e => setDraft(d => ({ ...d, createdBy: e.target.value }))}
                       className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>

              <div className="flex gap-2">
                {!user.isViewer && (<button type="button" data-testid="os-save" onClick={() => void submit()} disabled={saving}
                        className="min-h-[48px] flex-1 rounded-xl s-brand text-[15px] font-bold disabled:opacity-40">
                  {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'שמירה'}
                </button>)}
                {canApprove && !user.isViewer && plan && !plan.error && (
                  <button type="button" data-testid="os-approve" onClick={() => setStep('approve-confirm')} disabled={saving}
                          className="min-h-[48px] flex-1 rounded-xl border border-border bg-card text-[15px] font-bold disabled:opacity-40">
                    {plan.kind === 'dropship' ? 'אישור ואספקה' : 'אישור'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {guard.prompt}
        {step === 'approve-confirm' && plan && (
          <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40" data-testid="approve-confirm-sheet">
            <div className="w-full max-w-md rounded-t-2xl bg-card p-4">
              <div className="mb-3 whitespace-pre-line text-[15px]">{plan.confirm}</div>
              <div className="flex gap-2">
                <button type="button" data-testid="confirm-yes" onClick={() => void doApprove()} className="min-h-[44px] flex-1 rounded-xl s-brand font-bold">כן</button>
                <button type="button" data-testid="confirm-no" onClick={() => setStep('form')} className="min-h-[44px] flex-1 rounded-xl border border-border font-bold">ביטול</button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
