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
  const [newType, setNewType] = React.useState<'supplier' | 'customer'>('supplier');
  const [moreOpenId, setMoreOpenId] = React.useState<string | null>(null);

  const orders = data?.orders || [];
  const filtered = React.useMemo(() => filterOrders(orders as any, filter), [orders, filter]);

  const openNew = () => { setEditing(null); setNewType('supplier'); setSheetOpen(true); };
  const openOrder = (o: OrderLike) => { setEditing(o); setSheetOpen(true); };

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

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow
        title="הזמנות"
        actions={<button type="button" data-testid="inv-new-order" onClick={openNew} className="min-h-[36px] rounded-full bg-[var(--sigma-ink)] px-3 text-[13px] font-bold text-[hsl(var(--card))]">+ הזמנה חדשה</button>}
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
        onSaved={() => { /* useInventory() is invalidated inside saveOrder/approveOrder (afterWrite) */ }}
      />
    </div>
  );
}
