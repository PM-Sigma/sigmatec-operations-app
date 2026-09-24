// 🧾 הזמנות פתוחות + 🎚 מינימום מלאי — #sigma-inventory-strip (inventory spec §4a, §5).
//
// Two small things that belong on the מלאי page and nowhere else:
//
//   · the ORDERS STRIP (§4a): one row per open order, four decisive dots, and the single note
//     that is true about it right now — computed from the data, never typed. Tapping a row
//     opens the existing order modal; the full order flow is unchanged and still lives on the
//     הזמנות tab. Closed orders are not here: this page is about what is still coming.
//
//   · the MIN_QTY editor (§5, decision I3): the red line per product. Until עידן or עמיחי sets
//     one, a product has no red line and can never raise a low-stock alert — which is exactly
//     why this editor had to ship WITH the alerts, or the alerts would be silent forever.
//
// The rules are pure (app/src/lib/orderStrip.ts, goldens in orderStrip.test.ts). This file is
// the shell.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { canSetMinQty, orderStripRows, STRIP_STAGES, type OrderLike, type StripRow } from '@/lib/orderStrip';

export const MINQTY_OPEN_EVENT = 'sigma-open-min-qty';

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function ordersNow(): OrderLike[] {
  try { return (sigma.orders?.() || []) as OrderLike[]; } catch { return []; }
}
function catalogNow(): string[] {
  try { return (sigma.products?.() || []).map(p => String(p?.name || '')).filter(Boolean); } catch { return []; }
}

// ───────────────────────────── the strip ─────────────────────────────

function Stages({ row }: { row: StripRow }) {
  if (row.dropShip) {
    return <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold text-muted-foreground">ספק ישיר</span>;
  }
  return (
    <span className="flex flex-none items-center gap-1" aria-label={STRIP_STAGES[row.stage]}>
      {STRIP_STAGES.map((s, i) => (
        <span
          key={s}
          title={s}
          className={`size-2 rounded-full ${i <= row.stage ? 'bg-[var(--brand-2)]' : 'bg-[var(--border)]'}`}
        />
      ))}
    </span>
  );
}

const LEVEL_CLASS: Record<string, string> = {
  late: 'text-[var(--priority)]',
  action: 'text-[var(--warning)]',
  waiting: 'text-muted-foreground',
  transit: 'text-muted-foreground',
  done: 'text-muted-foreground',
};

function OrdersStrip() {
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('stock-changed', () => setTick(t => t + 1));
  const rows = React.useMemo(() => orderStripRows(ordersNow(), today(), catalogNow()), [tick]);
  if (!rows.length) return null;
  return (
    <div className="mb-3" data-testid="order-strip">
      <h4 className="mb-1.5 text-[13px] font-extrabold text-foreground">🧾 הזמנות פתוחות</h4>
      <ul className="rounded-[12px] border border-border bg-card">
        {rows.map(row => (
          <li key={row.id} className="border-b border-border last:border-b-0">
            <button
              type="button"
              data-order-row={row.id}
              onClick={() => { track('order-strip-open', row.id); try { sigma.openOrder?.(row.id); } catch { /* legacy not up */ } }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-start"
            >
              <Stages row={row} />
              <span className="flex-1 text-[13px] font-bold text-foreground">
                {row.title} <span className="text-[12px] font-normal text-muted-foreground"><bdi>{row.qty}</bdi> פריטים</span>
              </span>
              <span className={`text-[12px] ${LEVEL_CLASS[row.note.level] ?? ''}`}>
                {/* row.note.icon is now a lucide icon NAME (round 5, L1), not a glyph to print;
                    the icon itself is rendered in U9, once InventoryStrip is on the design system. */}
                {row.note.text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────────── 🎚 the red lines ─────────────────────────────

interface ProductRow { id?: string; name: string; min_qty: number | null; active?: boolean }

async function fetchProducts(): Promise<ProductRow[]> {
  const sb = await getSupabase();
  const { data } = await sb.from('products').select('id,name,min_qty,active').order('name');
  return ((data ?? []) as ProductRow[]).filter(p => p.active !== false);
}

function MinQtySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['productMinQty'], queryFn: fetchProducts, enabled: open });
  const [saving, setSaving] = React.useState('');

  const save = async (p: ProductRow, raw: string) => {
    const txt = raw.trim();
    const next = txt === '' ? null : Number(txt);
    if (next !== null && (!Number.isFinite(next) || next < 0)) { toast.error('מספר לא תקין'); return; }
    if ((p.min_qty ?? null) === next) return;
    setSaving(p.name);
    try {
      await sbWrite(sb => sb.from('products').update({ min_qty: next }).eq('name', p.name).select());
      qc.setQueryData(['productMinQty'], (old: ProductRow[] | undefined) =>
        (old ?? []).map(r => (r.name === p.name ? { ...r, min_qty: next } : r)));
      toast.success(next === null ? `${p.name}: בלי מינימום` : `${p.name}: מינימום ${next}`);
    } catch {
      toast.error('לא נשמר');
    } finally { setSaving(''); }
  };

  // §7p, wired for completeness: each minimum saves on blur (`save` above), so this sheet
  // never holds a draft and the predicate is honestly false.
  const guard = useUnsavedGuard({ dirty: () => false, onClose: () => onOpenChange(false) });

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(onOpenChange)}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader>
          <SheetTitle>🎚 מינימום מלאי</SheetTitle>
          <SheetDescription>כמה יחידות במלאי החברה מצדיקות התראה</SheetDescription>
        </SheetHeader>
        <ul className="mt-1" data-testid="minqty-list">
          {(q.data ?? []).map(p => (
            <li key={p.name} className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
              <span className="flex-1 text-[13px] text-foreground">{p.name}</span>
              {saving === p.name && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <input
                type="number"
                min={0}
                inputMode="numeric"
                data-minqty={p.name}
                defaultValue={p.min_qty ?? ''}
                onBlur={e => save(p, e.currentTarget.value)}
                className="h-9 w-20 rounded-[10px] border border-border bg-card px-2 text-center text-[13px] text-foreground"
                dir="ltr"
              />
            </li>
          ))}
        </ul>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

function InventoryStripIsland() {
  const { name: user, isViewer } = useCurrentUser();
  const [minOpen, setMinOpen] = React.useState(false);
  const mayEdit = canSetMinQty(user, isViewer);

  React.useEffect(() => {
    const onOpen = () => setMinOpen(true);
    window.addEventListener(MINQTY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MINQTY_OPEN_EVENT, onOpen);
  }, []);

  return (
    <div>
      <OrdersStrip />
      {mayEdit && (
        <button
          type="button"
          data-testid="minqty-open"
          onClick={() => { track('minqty-open'); setMinOpen(true); }}
          className="mb-2 inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold text-foreground"
        >
          <SlidersHorizontal className="size-4" /> מינימום מלאי
        </button>
      )}
      {mayEdit && <MinQtySheet open={minOpen} onOpenChange={setMinOpen} />}
    </div>
  );
}

export function InventoryStrip() {
  return (
    <SigmaProviders>
      <InventoryStripIsland />
    </SigmaProviders>
  );
}

export function mountInventoryStrip(): boolean {
  return mount('sigma-inventory-strip', InventoryStrip);
}
