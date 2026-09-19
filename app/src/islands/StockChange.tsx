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
import { ArrowDownLeft, ArrowUpRight, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
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
      toast('סמן את ההזמנה כסופקה — הפריטים ייכנסו למלאי');
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
      toast.success(`נרשמה ספירה: ${product} — ${rc.counted}`);
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

  const Choice = ({ on, onClick, testId, children }: { on: boolean; onClick: () => void; testId: string; children: React.ReactNode }) => (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={'min-h-[48px] flex-1 rounded-xl border px-3 text-[14px] font-bold '
        + (on ? 'border-transparent bg-brand-grad text-white' : 'border-border bg-card text-foreground')}
    >
      {children}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={o => (o ? setOpen(true) : close())}>
      <SheetContent side="bottom" dir="rtl" data-testid="stock-change-sheet" className="max-h-[92vh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-[17px]">
            <Package className="h-5 w-5" /> דיווח שינוי במלאי
          </SheetTitle>
          <SheetDescription className="text-[13px]">מה קרה למלאי של {POOL}?</SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-4">
          <div>
            <label className="text-[13px] font-bold" htmlFor="scProduct">פריט</label>
            <select
              id="scProduct"
              data-testid="sc-product"
              value={product}
              onChange={e => setProduct(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-2 text-[15px]"
            >
              <option value="">— בחר —</option>
              {names.map(n => <option key={n} value={n}>{n}{pool[n] != null ? ` (${pool[n]})` : ''}</option>)}
            </select>
            {!!product && (
              <div className="mt-1 text-[13px] font-semibold text-muted-foreground">
                במאגר עכשיו: <bdi>{current}</bdi>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Choice testId="sc-dir-decrease" on={direction === 'decrease'} onClick={() => { setDirection('decrease'); setSource(''); }}>
              <ArrowDownLeft className="me-1 inline h-4 w-4" /> ירד
            </Choice>
            <Choice testId="sc-dir-increase" on={direction === 'increase'} onClick={() => { setDirection('increase'); setSource(''); }}>
              <ArrowUpRight className="me-1 inline h-4 w-4" /> עלה
            </Choice>
          </div>

          {direction === 'decrease' && (
            <div className="flex gap-2">
              <Choice testId="sc-src-visit" on={source === 'visit'} onClick={() => setSource('visit')}>📍 יצא בביקור</Choice>
              <Choice testId="sc-src-recount" on={source === 'recount'} onClick={() => setSource('recount')}>🔢 ספירה מחדש</Choice>
            </div>
          )}
          {direction === 'increase' && (
            <div className="flex gap-2">
              <Choice testId="sc-src-order" on={source === 'order'} onClick={() => setSource('order')}>🧾 הזמנה</Choice>
              <Choice testId="sc-src-recount" on={source === 'recount'} onClick={() => setSource('recount')}>🔢 ספירה מחדש</Choice>
            </div>
          )}

          {source === 'order' && (
            <div>
              <label className="text-[13px] font-bold" htmlFor="scOrder">איזו הזמנה הגיעה?</label>
              <select
                id="scOrder"
                data-testid="sc-order"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-2 text-[15px]"
              >
                <option value="">— בחר —</option>
                {orders.map(o => (
                  <option key={String(o.id)} value={String(o.id)}>
                    {(o.supplier || 'ספק') + ' · ' + (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ').slice(0, 60)}
                  </option>
                ))}
              </select>
              {orders.length === 0 && (
                <div className="mt-1 text-[13px] text-muted-foreground">
                  אין הזמנת ספק פתוחה — פתח הזמנה חדשה, או דווח ספירה מחדש.
                </div>
              )}
            </div>
          )}

          {source === 'recount' && (
            <>
              <div>
                <label className="text-[13px] font-bold" htmlFor="scCounted">כמה נספרו בפועל?</label>
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
                <textarea
                  id="scNote"
                  data-testid="sc-note"
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="מה הסביר את ההפרש?"
                  className="mt-1 w-full rounded-xl border border-border bg-card p-2 text-[15px]"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            data-testid="sc-submit"
            disabled={saving}
            className="min-h-[48px] w-full rounded-xl bg-brand-grad text-[15px] font-bold text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              : source === 'visit' ? 'פתח סיכום ביקור'
              : source === 'order' ? 'פתח את ההזמנה'
              : 'שמור'}
          </button>
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
    label: '🔢 דיווח שינוי במלאי',
    icon: 'Package',
    visible: () => canReportStock(sigma?.getCurrentUser?.() || '', !!sigma?.isViewer?.()),
    onSelect: () => openStockChange(''),
  });
  return ok;
}
