// 🧾 הזמנות tab (spec task U2, O1-O29, §7): list + the order sheet. The rules live in
// app/src/lib/inventory.ts (filterOrders/quickAction/canApproveThisOrder/…) and the writes in
// app/src/lib/inventoryApi.ts (saveOrder/approveOrder/setOrderStatus) — this file is the shell.
import * as React from 'react';
import { toast } from 'sonner';
import { FilterChip, Tag } from '@/components/ui/chip';
import { ListRow } from '@/components/ui/list-row';
import { SectionBlock } from '@/components/ui/section-block';
import { PageActionRow } from '@/components/ui/page-action-row';
import { useCurrentUser } from '@/bridge';
import { useInventory, setOrderStatus, type InvData } from '@/lib/inventoryApi';
import {
  filterOrders, quickAction, canApproveThisOrder, canMarkStuck, approvalWaitingMsg,
  orderType, orderKibbutz, orderTotalQty, type OrderLike,
} from '@/lib/inventory';
import { OrderSheet } from './InventoryOrderSheet';

const INV_OPEN_EVENT = 'sigma-inv-open';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'פתוחות' },
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתין להזמנה' },
  { key: 'in_transit', label: 'בדרך' },
  { key: 'stuck', label: 'תקוע' },
  { key: 'at_port', label: 'בנמל' },
  { key: 'arrived', label: 'הגיעה' },
  { key: 'delivered', label: 'סופקה' },
];

function orderMeta(o: OrderLike, data: InvData): string {
  const date = ((o as any).expectedDate || (o as any).createdAt || '').slice(0, 10);
  const kib = orderType(o as any) === 'customer' ? orderKibbutz(o as any, data.requirements) : o.supplier;
  const parts = [kib, date, (o as any).createdBy].filter(Boolean);
  return parts.join(' · ');
}

export function InventoryOrdersTab() {
  const user = useCurrentUser();
  const invQ = useInventory();
  const data = invQ.data;
  const [filter, setFilter] = React.useState('');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrderLike | null>(null);
  const [sheetInitialStep, setSheetInitialStep] = React.useState<'form' | 'approve-confirm'>('form');
  const [newType, setNewType] = React.useState<'supplier' | 'customer'>('supplier');
  const [moreOpenId, setMoreOpenId] = React.useState<string | null>(null);

  const orders = data?.orders || [];
  const filtered = React.useMemo(() => filterOrders(orders as any, filter), [orders, filter]);

  const openNew = () => { setEditing(null); setNewType('supplier'); setSheetInitialStep('form'); setSheetOpen(true); };
  const openOrder = (o: OrderLike, initialStep: 'form' | 'approve-confirm' = 'form') => {
    setEditing(o); setSheetInitialStep(initialStep); setSheetOpen(true);
  };

  async function doQuick(o: OrderLike) {
    if (!data) return;
    const qa = quickAction(o as any);
    if (!qa) return;
    try {
      await setOrderStatus(String(o.id), qa.next, data, user.name);
      toast.success('הסטטוס עודכן');
    } catch (e: any) {
      toast.error((e?.message || 'הפעולה נכשלה') + ' — נסה שוב');
    }
  }
  async function doStuck(o: OrderLike) {
    if (!data) return;
    try {
      await setOrderStatus(String(o.id), 'stuck', data, user.name);
      toast.success('הסטטוס עודכן');
    } catch (e: any) {
      toast.error((e?.message || 'הפעולה נכשלה') + ' — נסה שוב');
    }
  }

  // O34-O38 (task U7): the bell/strip/nudge deep links land here — 'order'/'approve' open the
  // sheet on that order (its own approve-confirm step handles 'approve'), 'status' runs the
  // write directly, exactly like the legacy quickOrderStatus(). `pendingDetail` covers a real
  // race: the push deep link's own readiness check (js/src/22-push.js `ready()`) only waits for
  // the legacy SHEET_DATA + a logged-in user, not this island's own React Query fetch — a detail
  // that arrives before `orders` has loaded would otherwise find no matching order and be
  // dropped silently. Held and retried once `orders` actually has something in it, instead.
  const pendingDetail = React.useRef<any>(null);
  const handleOpenDetail = React.useCallback((detail: any) => {
    if (!['order', 'approve', 'status'].includes(detail?.kind)) return;
    const o = orders.find(x => String(x.id) === String(detail.id));
    if (!o) { if (orders.length === 0) pendingDetail.current = detail; return; }
    pendingDetail.current = null;
    if (detail.kind === 'status') {
      if (!data) return;
      setOrderStatus(String(o.id), detail.status, data, user.name)
        .then(() => toast.success('הסטטוס עודכן'))
        .catch((e: any) => toast.error((e?.message || 'הפעולה נכשלה') + ' — נסה שוב'));
      return;
    }
    // O34-O38: {kind:'approve'} opens straight to the confirm step — but only when this user
    // can actually approve it (canApproveThisOrder); otherwise it's the same plain edit sheet
    // 'order' gets, so a stale/misdirected deep link never dead-ends on a step with no button.
    const step: 'form' | 'approve-confirm' =
      detail.kind === 'approve' && canApproveThisOrder(o as any, user.name) ? 'approve-confirm' : 'form';
    openOrder(o, step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, data, user.name]);

  React.useEffect(() => {
    const onOpen = (e: Event) => handleOpenDetail((e as CustomEvent)?.detail || {});
    window.addEventListener(INV_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(INV_OPEN_EVENT, onOpen);
  }, [handleOpenDetail]);

  // Retry the held detail once orders finishes loading (or changes) — covers both "arrived
  // before the fetch resolved" and "arrived for an order that only shows up after a refetch".
  React.useEffect(() => {
    if (pendingDetail.current && orders.length > 0) handleOpenDetail(pendingDetail.current);
  }, [orders, handleOpenDetail]);

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow
        title="הזמנות"
        actions={
          !user.isViewer && (
            <button
              type="button"
              data-testid="inv-new-order"
              data-hit-slop
              onClick={openNew}
              className="s-hit min-h-[36px] rounded-full bg-[var(--sigma-ink)] px-3 text-[13px] font-bold text-[hsl(var(--card))]"
            >
              + הזמנה חדשה
            </button>
          )
        }
      />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map(f => (
          <span key={f.key || 'open'} data-testid={`inv-orders-filter-${f.key || 'open'}`}>
            <FilterChip
              selected={filter === f.key}
              count={filterOrders(orders as any, f.key).length}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </FilterChip>
          </span>
        ))}
      </div>

      <SectionBlock title="הזמנות" count={filtered.length}>
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">אין הזמנות בסינון הזה</div>
        )}
        {filtered.map(o => {
          const canApprove = data ? canApproveThisOrder(o as any, user.name) : false;
          const qa = quickAction(o as any);
          const stuckAllowed = canMarkStuck(o as any);
          return (
            <div key={String(o.id)} data-testid={`inv-order-row-${o.id}`}>
            <ListRow
              onClick={() => openOrder(o)}
              leading={<Tag role="info">{orderType(o as any) === 'customer' ? 'לקוח' : 'ספק'}</Tag>}
              title={orderType(o as any) === 'customer' ? orderKibbutz(o as any, data?.requirements || []) : (o.supplier || 'ספק')}
              meta={
                <span className="flex flex-col gap-1">
                  <span>{data ? orderMeta(o, data) : ''} · <bdi>{orderTotalQty(o as any)}</bdi> פריטים</span>
                  <span className="flex flex-wrap gap-1">
                    {canApprove ? (
                      <button
                        type="button"
                        data-testid={`inv-order-approve-${o.id}`}
                        onClick={e => { e.stopPropagation(); openOrder(o); }}
                        className="rounded-full bg-[var(--ok-fill)] px-2 py-0.5 text-[11px] font-bold text-[var(--ok-ink)]"
                      >
                        אישור
                      </button>
                    ) : (
                      <Tag role="neutral">{approvalWaitingMsg(o as any)}</Tag>
                    )}
                    {qa && (
                      <button
                        type="button"
                        data-testid={`inv-order-quick-${o.id}`}
                        onClick={e => { e.stopPropagation(); void doQuick(o); }}
                        className="rounded-full bg-[var(--info-fill)] px-2 py-0.5 text-[11px] font-bold text-[var(--info-ink)]"
                      >
                        {qa.label}
                      </button>
                    )}
                  </span>
                </span>
              }
              trailing={
                <span className="relative">
                  <button
                    type="button"
                    data-testid={`inv-order-more-${o.id}`}
                    onClick={e => { e.stopPropagation(); setMoreOpenId(id => (id === String(o.id) ? null : String(o.id))); }}
                    aria-label="עוד"
                    className="min-h-[40px] min-w-[40px] rounded-full text-[18px]"
                  >
                    ⋯
                  </button>
                  {moreOpenId === String(o.id) && (
                    <div className="absolute inset-inline-end-0 top-full z-10 min-w-[140px] rounded-xl border border-border bg-card p-1 shadow-lg">
                      <button
                        type="button"
                        data-testid={`inv-order-stuck-${o.id}`}
                        disabled={!stuckAllowed}
                        onClick={e => { e.stopPropagation(); setMoreOpenId(null); if (stuckAllowed) void doStuck(o); }}
                        className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold disabled:opacity-40"
                      >
                        סימון כתקוע
                      </button>
                    </div>
                  )}
                </span>
              }
            />
            </div>
          );
        })}
      </SectionBlock>

      <OrderSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        order={editing}
        defaultType={newType}
        initialStep={sheetInitialStep}
        onSaved={() => { /* useInventory() is invalidated inside saveOrder/approveOrder (afterWrite) */ }}
      />
    </div>
  );
}
