// 🔢 דיווח שינוי במלאי — #sigma-stock-change (inventory spec §4b).
//
// The screen that replaced both the transfer form and the free "הוספה/הפחתה" card. It never
// lets a person type a delta into the ledger: he says what happened, and the sheet either
// ROUTES him into the flow that owns that change (a visit, a supplier order) or, for a
// recount, asks for the quantity he actually counted and writes the delta plus its evidence.
//
// All of the rules are in app/src/lib/stockChange.ts (`stockChangePlan`, goldens in §4b). This
// file is the shell: pick a product, pick a direction, pick a source, and do what the plan says.
//
// Copy rules (master spec §6): nothing here explains the app's mechanics. It asks what happened.
import * as React from 'react';
import { ChevronDown, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import { BubbleButton } from '@/components/ui/bubble-button';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser } from '@/bridge';
import { POOL, receivableOrders, type OrderLike } from '@/lib/inventory';
import { stockChangePlan, type StockDirection, type StockSource } from '@/lib/stockChange';

export const STOCK_CHANGE_OPEN_EVENT = 'sigma-open-stock-change';

// The open latch (the Task 18b fix, same as every lazy island): `mount()` only SCHEDULES the
// first render, so an open event dispatched in that gap would reach nobody. This listener is
// attached when the CHUNK evaluates, strictly before the first render, and only raises a flag
// the component drains synchronously in its `useState` initializer.
let pendingOpen: { open: boolean; product: string } = { open: false, product: '' };
try {
  window.addEventListener(STOCK_CHANGE_OPEN_EVENT, (e: Event) => {
    pendingOpen = { open: true, product: String((e as CustomEvent)?.detail?.product || '') };
  });
  // The legacy button (js/src/08-inventory.js) checks this before telling the person the
  // screen is still loading.
  (window as any).__sigmaStockChangeMounted = true;
} catch { /* no DOM */ }

/** Open 🔢 דיווח שינוי במלאי from anywhere (the מלאי page button, a product row's ⋯, ⋯ עוד). */
export function openStockChange(product = ''): void {
  pendingOpen = { open: true, product };
  try { window.dispatchEvent(new CustomEvent(STOCK_CHANGE_OPEN_EVENT, { detail: { product } })); }
  catch { /* no DOM */ }
}

/** Every inventory actor may report a recount (§4b). The viewer reads reports and nothing else. */
export function canReportStock(user: string, isViewer: boolean): boolean {
  if (isViewer) return false;
  return ['עידן', 'עמיחי', 'אביאם', 'ניתאי'].includes(String(user ?? '').trim());
}

function poolNow(): Record<string, number> {
  try { return (sigma.poolStock?.() || {}) as Record<string, number>; } catch { return {}; }
}
function productNames(): string[] {
  try {
    const names = (sigma.products?.() || []).map((p: any) => String(p?.name || '')).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'he'));
  } catch { return []; }
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ───────────────────────────── the sheet ─────────────────────────────

/**
 * A minimal listbox picker, not `components/ui/select.tsx` (round 5, N4): that component's
 * `SelectContent` portals to `document.body` with no `.sigma-root` wrapper (unlike
 * `sheet.tsx`'s own `SheetPortal`, which explicitly re-adds one — see its comment), and
 * Tailwind's `important: '.sigma-root'` means a portalled node outside that ancestor gets NONE
 * of its utility classes applied. Nested one level inside this sheet, the options render
 * unstyled and unpositioned, sitting under the sheet's own overlay. Flagged to the
 * designer/DS owner; until it's fixed, this sheet renders its own tiny listbox INLINE (no
 * portal, so it inherits the sheet's `.sigma-root` scope for free) with the same
 * button+listbox+option ARIA shape a real `ui/select` would have.
 */
function InlinePicker<T extends string>({ value, placeholder, options, onChange, testId }: {
  value?: T; placeholder: string; options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void; testId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const current = options.find(o => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button" data-testid={testId} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="mt-1 flex h-12 w-full items-center justify-between gap-1 rounded-xl border border-border bg-card px-3 text-[15px]"
      >
        <span className={'min-w-0 truncate ' + (current ? '' : 'text-muted-foreground')}>{current ? current.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>
      {open && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-card p-1 text-[14px] shadow-md">
          {options.map(o => (
            <li
              key={o.value} role="option" aria-selected={o.value === value}
              className="cursor-default rounded-lg px-2.5 py-1.5 hover:bg-secondary"
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StockChangeSheet() {
  const first = React.useRef(pendingOpen);
  const [open, setOpen] = React.useState(() => { const o = first.current.open; pendingOpen = { open: false, product: '' }; return o; });
  const [product, setProduct] = React.useState(() => first.current.product);
  const [direction, setDirection] = React.useState<StockDirection | ''>('');
  const [source, setSource] = React.useState<StockSource | ''>('');
  const [counted, setCounted] = React.useState('');
  const [note, setNote] = React.useState('');
  const [orderId, setOrderId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const user = useCurrentUser();

  const [pool, setPool] = React.useState<Record<string, number>>({});
  const [names, setNames] = React.useState<string[]>([]);
  const [orders, setOrders] = React.useState<OrderLike[]>([]);

  // The legacy snapshot refreshes on its own; read it on every open rather than caching.
  const refreshSources = React.useCallback(() => {
    setPool(poolNow());
    setNames(productNames());
    try { setOrders(receivableOrders((sigma.orders?.() || []) as OrderLike[])); } catch { setOrders([]); }
  }, []);

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const p = String((e as CustomEvent)?.detail?.product || '');
      pendingOpen = { open: false, product: '' };
      if (p) setProduct(p);
      refreshSources();
      setOpen(true);
    };
    window.addEventListener(STOCK_CHANGE_OPEN_EVENT, onOpen);
    if (first.current.open) { refreshSources(); }
    return () => window.removeEventListener(STOCK_CHANGE_OPEN_EVENT, onOpen);
  }, [refreshSources]);

  const current = pool[product] ?? 0;

  const reset = () => {
    setDirection(''); setSource(''); setCounted(''); setNote(''); setOrderId('');
  };
  const close = () => { setOpen(false); reset(); };

  async function submit() {
    const plan = stockChangePlan({
      product, pool: current, direction: direction || undefined, source: source || undefined,
      counted: source === 'recount' ? counted : undefined,
      orderId, note, actor: user.name, recountId: uid('rc'),
    });
    if (plan.errors.length) { toast.error(plan.errors[0]); return; }

    // ── routed flows: this sheet writes nothing ──────────────────────────────
    if (plan.requires === 'visit') {
      close();
      track('stock-report', product, 'inventory');
      try { sigma.openVisitQuick?.(''); } catch { /* legacy not up */ }
      toast('בחר קיבוץ וסמן את הפריט בסיכום הביקור');
      return;
    }
    if (plan.requires === 'order') {
      close();
      track('stock-report', product, 'inventory');
      try { sigma.openOrder?.(orderId); } catch { /* legacy not up */ }
      toast('סמן את ההזמנה כסופקה, הפריטים ייכנסו למלאי');
      return;
    }

    // ── 🔢 the recount: the one path that writes ────────────────────────────
    setSaving(true);
    try {
      const rc = plan.recount!;
      await sbWrite(sb => sb.from('stock_recounts').insert({
        id: rc.id, product: rc.product, counted: rc.counted, before: rc.before,
        delta: rc.delta, note: rc.note, actor: rc.actor,
      }).select('id').single());
      await sbWrite(sb => sb.from('movements').insert(plan.movements.map(m => ({
        id: uid('mov'), date: new Date().toISOString(), product: m.product,
        from_location: m.fromLocation, to_location: m.toLocation, quantity: m.quantity,
        reason: m.reason, ref_id: m.refId, created_by: m.createdBy,
      }))).select('id'));
      track('stock-report', product, 'inventory');
      try { (window as any).sigmaEmit?.('stock-changed', { source: 'recount', product }); } catch { /* no bus */ }
      try { sigma.refreshData?.(); } catch { /* legacy not up */ }
      toast.success(`נרשמה ספירה: ${product}: ${rc.counted}`);
      close();
    } catch (e: any) {
      toast.error(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  // §7p: a half-filled stock report (direction, source, count, note) survives a stray tap.
  const guard = useUnsavedGuard({
    dirty: () => !!direction || !!source || counted.trim() !== '' || note.trim() !== '',
    onDiscard: close,
    onClose: close,
  });

  const decreaseSources = [{ value: 'visit' as const, label: 'סיכום ביקור' }, { value: 'recount' as const, label: 'ספירה מחדש' }];
  const increaseSources = [{ value: 'order' as const, label: 'הזמנת ספק' }, { value: 'recount' as const, label: 'ספירה מחדש' }];

  return (
    <Sheet open={open} onOpenChange={o => (o ? setOpen(true) : close())}>
      <SheetContent side="bottom" dir="rtl" data-testid="stock-change-sheet" className="max-h-[92vh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-[17px]">
            <Package className="h-5 w-5" aria-hidden /> דיווח שינוי במלאי
          </SheetTitle>
          <SheetDescription className="text-[13px]">מה קרה למלאי של {POOL}?</SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-4">
          <div>
            <label className="text-[13px] font-bold">פריט</label>
            <InlinePicker
              testId="sc-product"
              placeholder="בחירת פריט"
              value={product || undefined}
              options={names.map(n => ({ value: n, label: n + (pool[n] != null ? ` (${pool[n]})` : '') }))}
              onChange={setProduct}
            />
            {!!product && (
              <div className="mt-1 text-[13px] font-semibold text-muted-foreground">
                במאגר עכשיו: <bdi>{current}</bdi>
              </div>
            )}
          </div>

          <SegmentedControl
            ariaLabel="כיוון השינוי"
            options={[{ value: 'decrease', label: 'ירד' }, { value: 'increase', label: 'עלה' }] as const}
            value={direction || 'decrease'}
            onChange={v => { setDirection(v as StockDirection); setSource(''); }}
          />

          {direction === 'decrease' && (
            <SegmentedControl ariaLabel="מקור השינוי" options={decreaseSources} value={(source || 'visit') as 'visit' | 'recount'} onChange={v => setSource(v as StockSource)} />
          )}
          {direction === 'increase' && (
            <SegmentedControl ariaLabel="מקור השינוי" options={increaseSources} value={(source || 'order') as 'order' | 'recount'} onChange={v => setSource(v as StockSource)} />
          )}

          {source === 'order' && (
            <div>
              <label className="text-[13px] font-bold">איזו הזמנה הגיעה</label>
              <InlinePicker
                testId="sc-order"
                placeholder="בחירת הזמנה"
                value={orderId || undefined}
                options={orders.map(o => ({
                  value: String(o.id),
                  label: (o.supplier || 'ספק') + ' · ' + (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ').slice(0, 60),
                }))}
                onChange={setOrderId}
              />
              {orders.length === 0 && (
                <div className="mt-1 text-[13px] text-muted-foreground">
                  אין הזמנת ספק פתוחה. אפשר לפתוח הזמנה חדשה, או לדווח ספירה מחדש.
                </div>
              )}
            </div>
          )}

          {source === 'recount' && (
            <>
              <div>
                <label className="text-[13px] font-bold" htmlFor="scCounted">כמה נספרו בפועל</label>
                <input
                  id="scCounted"
                  data-testid="sc-counted"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={counted}
                  onChange={e => setCounted(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]"
                />
              </div>
              <div>
                <label className="text-[13px] font-bold" htmlFor="scNote">הערה</label>
                <Textarea
                  id="scNote"
                  data-testid="sc-note"
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="מה הסביר את ההפרש"
                />
              </div>
            </>
          )}

          <BubbleButton
            type="button" variant="primary" size="lg"
            onClick={() => void submit()}
            data-testid="sc-submit"
            disabled={saving}
            aria-busy={saving || undefined}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : source === 'visit' ? 'פתיחת סיכום ביקור'
              : source === 'order' ? 'פתיחת ההזמנה'
              : 'שמירה'}
          </BubbleButton>
        </div>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

export function StockChange() {
  return (
    <SigmaProviders>
      <StockChangeSheet />
    </SigmaProviders>
  );
}

/** Mounted from main.tsx. Registers its own ⋯ עוד entry for the inventory actors. */
export function mountStockChange(): boolean {
  const ok = mount('sigma-stock-change', StockChange);
  if (!ok) return false;
  registerMoreItem({
    id: 'stock-change',
    label: 'דיווח שינוי במלאי',
    icon: 'Package',
    visible: () => canReportStock(sigma?.getCurrentUser?.() || '', !!sigma?.isViewer?.()),
    onSelect: () => openStockChange(''),
  });
  return ok;
}
