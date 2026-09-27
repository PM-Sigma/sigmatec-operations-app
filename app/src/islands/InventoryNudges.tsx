// 🔔 Inventory nudges (spec task U7, O14/O15/O34-O38): the עמיחי approval reminder + the
// approved-orders notice for the field/CEO group. The rules (who, which orders, the once-per-
// session + localStorage "seen" latch) are amichaiPending/freshApprovedOrders in
// app/src/lib/inventory.ts; this file is only the two Sheets + the deep-link routing.
import * as React from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { useCurrentUser } from '@/bridge';
import { useInventory } from '@/lib/inventoryApi';
import { amichaiPending, freshApprovedOrders, orderType, orderKibbutz, orderTotalQty, type OrderLike } from '@/lib/inventory';

const INV_OPEN_EVENT = 'sigma-inv-open';
const ORDER_NOTIF_GROUP = ['אביאם', 'ניתאי', 'עמיחי'];

function notifKey(me: string) { return 'orders_notif_seen_' + (me || ''); }
function readSeen(me: string): string[] | null {
  try { return JSON.parse(localStorage.getItem(notifKey(me)) || 'null'); } catch { return null; }
}
function markSeen(me: string, ids: string[]) {
  const cur = readSeen(me) || [];
  ids.forEach(id => { if (id && cur.indexOf(id) === -1) cur.push(id); });
  try { localStorage.setItem(notifKey(me), JSON.stringify(cur.slice(-800))); } catch { /* storage may be unavailable */ }
}

function invOpen(detail: Record<string, unknown>) {
  try { window.dispatchEvent(new CustomEvent(INV_OPEN_EVENT, { detail })); } catch { /* no-op */ }
}

export function InventoryNudges() {
  const user = useCurrentUser();
  const invQ = useInventory();
  const orders = (invQ.data?.orders || []) as OrderLike[];

  const [amichaiOpen, setAmichaiOpen] = React.useState(false);
  const [amichaiRows, setAmichaiRows] = React.useState<OrderLike[]>([]);
  const [approvedOpen, setApprovedOpen] = React.useState(false);
  const [approvedRows, setApprovedRows] = React.useState<OrderLike[]>([]);

  const checkAmichai = React.useCallback(() => {
    if ((window as any)._amichaiApprovalShown) return;
    if (user.name !== 'עמיחי') return;
    const pend = amichaiPending(orders as any, user.name);
    if (!pend.length) return;
    setAmichaiRows(pend);
    setAmichaiOpen(true);
    (window as any)._amichaiApprovalShown = true;
  }, [orders, user.name]);

  const checkApproved = React.useCallback(() => {
    if ((window as any)._orderNotifShown) return;
    if (ORDER_NOTIF_GROUP.indexOf(user.name) === -1) return;
    const seen = readSeen(user.name);
    const { seed, fresh } = freshApprovedOrders(orders as any, seen, user.name);
    if (seed.length) { markSeen(user.name, seed); return; } // first run → seed, never flood
    if (!fresh.length) return;
    (window as any)._orderNotifShown = true;
    setApprovedRows(fresh);
    setApprovedOpen(true);
    markSeen(user.name, fresh.map(o => String(o.id)));
  }, [orders, user.name]);

  // Runs once data is ready (mirrors the legacy calls made right after refreshData()), and again
  // whenever 06-inventory.js's compat shim asks for it (invOpen({kind:'nudges'})).
  React.useEffect(() => {
    if (!invQ.data) return;
    checkAmichai();
    checkApproved();
  }, [invQ.data, checkAmichai, checkApproved]);

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || ({} as any);
      if (detail.kind === 'nudges') { checkAmichai(); checkApproved(); }
    };
    window.addEventListener(INV_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(INV_OPEN_EVENT, onOpen);
  }, [checkAmichai, checkApproved]);

  const goToPending = () => {
    setAmichaiOpen(false);
    invOpen({ kind: 'tab', tab: 'orders' });
    // the pending filter lives in the orders tab's own state — a direct filter jump isn't wired
    // yet, so the sheet lands on the orders tab with everything still open (== the default filter).
  };

  const goToOrders = () => {
    setApprovedOpen(false);
    invOpen({ kind: 'tab', tab: 'orders' });
  };

  return (
    <>
      <Sheet open={amichaiOpen} onOpenChange={setAmichaiOpen}>
        <SheetContent side="bottom" data-testid="nudge-amichai">
          <SheetHeader>
            <SheetTitle>הזמנות לאישורך</SheetTitle>
            <SheetDescription>{amichaiRows.length} הזמנות ספק ממתינות לאישור עמיחי</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-2">
            {amichaiRows.map(o => (
              <div key={String(o.id)} className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[13px] font-semibold text-[var(--text)]">
                📦 <bdi>{orderTotalQty(o)}</bdi> פריטים{o.supplier ? ' · ' + o.supplier : ''}{(o as any).createdBy ? ' · ' + (o as any).createdBy : ''}
              </div>
            ))}
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              data-testid="nudge-go"
              onClick={goToPending}
              className="min-h-[44px] flex-1 rounded-full bg-[var(--sigma-ink)] text-[14px] font-bold text-[hsl(var(--card))]"
            >
              לאישור
            </button>
            <button
              type="button"
              data-testid="nudge-later"
              onClick={() => setAmichaiOpen(false)}
              className="min-h-[44px] rounded-full bg-[var(--surface-2)] px-4 text-[14px] font-bold text-[var(--text)]"
            >
              אחר כך
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={approvedOpen} onOpenChange={setApprovedOpen}>
        <SheetContent side="bottom" data-testid="nudge-approved">
          <SheetHeader>
            <SheetTitle>{approvedRows.length === 1 ? 'הזמנה חדשה אושרה' : `${approvedRows.length} הזמנות חדשות אושרו`}</SheetTitle>
            <SheetDescription>יש הזמנות חדשות לטיפול</SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[230px] flex-col gap-1 overflow-auto px-4 pb-2">
            {approvedRows.slice(0, 10).map(o => {
              const cust = orderType(o as any) === 'customer';
              const where = cust ? 'לקיבוץ ' + (orderKibbutz(o as any, []) || '—') : 'מספק' + (o.supplier ? ' ' + o.supplier : '');
              return (
                <div key={String(o.id)} className="rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text)]">
                  {cust ? '🧑‍🌾 לקוח' : '🏭 ספק'} · {where} · <bdi>{orderTotalQty(o)}</bdi> פריטים
                </div>
              );
            })}
            {approvedRows.length > 10 && (
              <div className="text-[12px] text-muted-foreground">+ עוד {approvedRows.length - 10}</div>
            )}
          </div>
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={goToOrders}
              className="min-h-[44px] w-full rounded-full bg-[var(--sigma-ink)] text-[14px] font-bold text-[hsl(var(--card))]"
            >
              📦 הצג הזמנות
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function InventoryNudgesRoot() {
  return (
    <SigmaProviders>
      <InventoryNudges />
    </SigmaProviders>
  );
}

export function mountInventoryNudges(): boolean {
  return mount('sigma-inventory-nudges', InventoryNudgesRoot);
}
