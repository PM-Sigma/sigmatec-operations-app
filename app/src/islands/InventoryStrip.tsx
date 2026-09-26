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
import {
  CircleCheck, Hourglass, Link as LinkIcon, Loader2, Minus, PackageCheck, Plus,
  SlidersHorizontal, Truck, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { Tag } from '@/components/ui/chip';
import { BubbleButton } from '@/components/ui/bubble-button';
import { fmtUnit } from '@/lib/format';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import { canSetMinQty, orderStripRows, STRIP_STAGES, type OrderLike, type StripRow } from '@/lib/orderStrip';

/** note.icon (round 5 L1, lucide names) → the actual component the row's Tag draws. */
const NOTE_ICON = { TriangleAlert, CircleCheck, PackageCheck, Truck, Link: LinkIcon, Hourglass } as const;

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

/** The 4-stage progress bar (dataviz mark spec: 2px surface gaps, current stage labelled). Plain
    SVG/CSS, not a chart lib — this is a status mark, not data to explore. */
function StageBar({ row }: { row: StripRow }) {
  if (row.dropShip) return <Tag role="neutral">ספק ישיר</Tag>;
  const n = STRIP_STAGES.length;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex flex-1 gap-0.5" role="img" aria-label={`שלב ${row.stage + 1} מתוך ${n}`}>
        {STRIP_STAGES.map((s, i) => (
          <span
            key={s}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: i <= row.stage ? 'var(--brand-2)' : 'var(--border)' }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{STRIP_STAGES[row.stage]}</span>
    </div>
  );
}

function OrderRow({ row }: { row: StripRow }) {
  const Icon = NOTE_ICON[row.note.icon];
  return (
    <ListRow
      data-order-row={row.id}
      onClick={() => { track('order-strip-open', row.id); try { sigma.openOrder?.(row.id); } catch { /* legacy not up */ } }}
      title={<>{row.title} <span className="font-normal text-muted-foreground"><bdi>{fmtUnit(row.qty, 'פריטים')}</bdi></span></>}
      meta={
        <>
          <Tag role={row.note.role} className="gap-1"><Icon className="h-3 w-3" aria-hidden />{row.note.text}</Tag>
          <StageBar row={row} />
        </>
      }
    />
  );
}

function OrdersStrip() {
  const [tick, setTick] = React.useState(0);
  useSigmaEvent('stock-changed', () => setTick(t => t + 1));
  const rows = React.useMemo(() => orderStripRows(ordersNow(), today(), catalogNow()), [tick]);
  if (!rows.length) return null;
  return (
    <div data-testid="order-strip">
      <SectionBlock title="הזמנות פתוחות" count={rows.length} className="mb-3">
        {rows.map(row => <OrderRow key={row.id} row={row} />)}
      </SectionBlock>
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

function MinQtyRow({ p, mayEdit, saving, onSave }: {
  p: ProductRow; mayEdit: boolean; saving: boolean; onSave: (raw: string) => void;
}) {
  const [val, setVal] = React.useState(String(p.min_qty ?? ''));
  React.useEffect(() => { setVal(String(p.min_qty ?? '')); }, [p.min_qty]);
  const step = (delta: number) => {
    const next = Math.max(0, (Number(val) || 0) + delta);
    setVal(String(next));
    onSave(String(next));
  };
  return (
    <ListRow
      title={<span className="break-all">{p.name}</span>}
      trailing={
        mayEdit ? (
          <span className="flex shrink-0 items-center gap-0.5">
            {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
            <BubbleButton
              variant="icon" size="sm" aria-label={`הפחתת מינימום ${p.name}`}
              onClick={() => step(-1)}
            >
              <Minus className="size-3.5" aria-hidden />
            </BubbleButton>
            <input
              type="number" min={0} inputMode="numeric" data-minqty={p.name} aria-label={`מינימום מלאי ${p.name}`} data-hit-slop
              value={val}
              onChange={e => setVal(e.target.value)}
              onBlur={e => onSave(e.currentTarget.value)}
              className="h-12 w-10 rounded-[10px] border border-border bg-card px-0.5 text-center text-[13px] tabular-nums text-foreground"
              dir="ltr"
            />
            <BubbleButton
              variant="icon" size="sm" aria-label={`הוספת מינימום ${p.name}`}
              onClick={() => step(1)}
            >
              <Plus className="size-3.5" aria-hidden />
            </BubbleButton>
          </span>
        ) : (
          <span className="tabular-nums text-muted-foreground"><bdi>{p.min_qty ?? '—'}</bdi></span>
        )
      }
    />
  );
}

function MinQtySheet({ open, onOpenChange, mayEdit }: { open: boolean; onOpenChange: (v: boolean) => void; mayEdit: boolean }) {
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

  // §7p, wired for completeness: each minimum saves on blur/step (`save` above), so this sheet
  // never holds a draft and the predicate is honestly false.
  const guard = useUnsavedGuard({ dirty: () => false, onClose: () => onOpenChange(false) });

  // modal={false} below: Radix's scroll-lock (padding-right compensation for the removed
  // scrollbar) reflows the legacy `.inv-tabs`/`.side-panel` markup underneath just enough to
  // expose their own pre-existing ~8px horizontal overflow (not this sheet's own content —
  // package I owns that legacy inventory page). A non-modal sheet skips the lock; the
  // backdrop still closes it on an outside tap.
  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(onOpenChange)} modal={false}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader>
          <SheetTitle>מינימום מלאי</SheetTitle>
          <SheetDescription>כמה יחידות במלאי החברה מצדיקות התראה</SheetDescription>
        </SheetHeader>
        <div className="-mx-4 mt-1 divide-y divide-border" data-testid="minqty-list">
          {(q.data ?? []).map(p => (
            <MinQtyRow key={p.name} p={p} mayEdit={mayEdit} saving={saving === p.name} onSave={raw => void save(p, raw)} />
          ))}
        </div>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

/** The strip's own markup, no mount/provider wrapping — package I's React inventory page
    renders this wherever it wants once it retires the legacy מלאי page (round 5 U9). */
export function InventoryStripPanel() {
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
        <BubbleButton
          variant="tonal" size="sm" className="mb-2" data-testid="minqty-open"
          icon={<SlidersHorizontal className="size-4" aria-hidden />}
          onClick={() => { track('minqty-open'); setMinOpen(true); }}
        >
          מינימום מלאי
        </BubbleButton>
      )}
      <MinQtySheet open={minOpen} onOpenChange={setMinOpen} mayEdit={mayEdit} />
    </div>
  );
}

export function InventoryStrip() {
  return (
    <SigmaProviders>
      <InventoryStripPanel />
    </SigmaProviders>
  );
}

export function mountInventoryStrip(): boolean {
  return mount('sigma-inventory-strip', InventoryStrip);
}
