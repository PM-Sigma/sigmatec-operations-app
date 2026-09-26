// 📦 מלאי — the page island (spec docs/superpowers/specs/2026-09-23-r5-I-inventory.md). The
// legacy #inventoryLegacy tabbed UI and the INV_REACT flag were deleted in U10 — this island
// owns the page unconditionally now: the ruled tab order (spec §1, DELTAS.S19) and a lazy
// child per tab.
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageActionRow } from '@/components/ui/page-action-row';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { useInventory, INV_KEYS } from '@/lib/inventoryApi';

export const INV_OPEN_EVENT = 'sigma-inv-open';
export const INV_REFRESH_EVENT = 'sigma-inventory-refresh';

export interface InvTabDef { id: string; label: string }
export const INV_TABS: InvTabDef[] = [
  { id: 'orders', label: 'הזמנות' },
  { id: 'stock', label: 'מלאי חברה' },
  { id: 'certs', label: 'תעודות משלוח' },
  { id: 'kibbutz', label: 'מלאי בקיבוצים' },
  { id: 'returns', label: 'החזרות' },
  { id: 'products', label: 'פריטים' },
];
const INV_TAB_IDS = INV_TABS.map(t => t.id);
const DEFAULT_TAB = 'orders';

function normalizeTab(tab: unknown): string {
  const t = String(tab || '');
  return INV_TAB_IDS.includes(t) ? t : DEFAULT_TAB;
}

/** Drains window.__sigmaInvQueue: any `invReactOpen()` call fired before this island mounted
 * (the legacy button is clicked, then the chunk loads) is not lost. */
function drainQueue(): { kind: string; tab?: string } | null {
  try {
    const q = (window as any).__sigmaInvQueue as Array<any> | undefined;
    if (q && q.length) { (window as any).__sigmaInvQueue = []; return q[q.length - 1]; }
  } catch { /* no queue */ }
  return null;
}

const OrdersTab = React.lazy(() => import('./InventoryOrders').then(m => ({ default: m.InventoryOrdersTab })));
const StockTab = React.lazy(() => import('./InventoryStock').then(m => ({ default: m.InventoryStockTab })));
const KibbutzTab = React.lazy(() => import('./InventoryKibbutzim').then(m => ({ default: m.InventoryKibbutzimTab })));
const ReturnsTab = React.lazy(() => import('./InventoryReturns').then(m => ({ default: m.InventoryReturnsTab })));
const CertsTab = React.lazy(() => import('./InventoryCerts').then(m => ({ default: m.InventoryCertsTab })));
const ProductsTab = React.lazy(() => import('./InventoryProducts').then(m => ({ default: m.InventoryProductsTab })));

// Tabs U3–U6 build (stock/kibbutz/certs/returns/products): until each task ships its own lazy
// child, its tab renders an empty, testid'd placeholder — never the acceptance shape, but enough
// for the tab strip itself (U1's job) to be testable on its own.
function Placeholder({ id }: { id: string }) {
  // A non-empty min-height, not a bare empty div: a zero-size element never counts as "visible"
  // to Playwright's actionability check, which broke `openTab()` waits for every not-yet-built
  // tab (products, until U6) once other tabs stopped being empty placeholders themselves.
  return <div data-testid={`inv-panel-${id}-placeholder`} className="min-h-[1px]" />;
}
const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  orders: OrdersTab,
  stock: StockTab,
  certs: CertsTab,
  kibbutz: KibbutzTab,
  returns: ReturnsTab,
  products: ProductsTab,
};

function InventoryPage() {
  const qc = useQueryClient();
  const queuedRaw = drainQueue();
  const queued = queuedRaw?.kind === 'nudges' ? null : queuedRaw;
  const [tab, setTab] = React.useState<string>(() => normalizeTab(queued?.tab ?? DEFAULT_TAB));
  const tabsListRef = React.useRef<HTMLDivElement>(null);
  useInventory(); // warms the one cache entry every tab reads

  // invOpen() (js/src/00-consts.js) dispatches this on `window`, not sigmaBus — it fires from
  // invShowTab() / the legacy trigger points before this chunk is guaranteed loaded, and window
  // is the one channel a plain <script> bundle and a lazy ESM chunk both always have.
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      // 'nudges' (task U7) only asks InventoryNudges.tsx to re-check its Sheets.
      if (detail.kind === 'nudges') return;
      if (detail.kind === 'tab') setTab(normalizeTab(detail.tab));
      // O34-O38 (task U7): the bell/strip deep links and quick-status all target a specific
      // order, which only ever lives on the orders tab.
      if (['order', 'approve', 'status'].includes(detail.kind)) setTab('orders');
    };
    window.addEventListener(INV_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(INV_OPEN_EVENT, onOpen);
  }, []);

  React.useEffect(() => {
    const onRefresh = () => qc.invalidateQueries({ queryKey: INV_KEYS.all });
    window.addEventListener(INV_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INV_REFRESH_EVENT, onRefresh);
  }, [qc]);

  // The selected tab's trigger scrolls into view — the strip starts scrolled to the right (the
  // first, RTL-leading tab, הזמנות) and follows whichever tab a deep link or the queue opened.
  React.useEffect(() => {
    const el = tabsListRef.current?.querySelector<HTMLElement>(`[data-testid="inv-tab-${tab}"]`);
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  const ActiveTab = TAB_COMPONENTS[tab] || TAB_COMPONENTS[DEFAULT_TAB];

  return (
    <div dir="rtl" className="flex min-w-0 flex-col gap-2">
      <PageActionRow title="מלאי" />
      <Tabs value={tab} onValueChange={v => setTab(normalizeTab(v))}>
        <div ref={tabsListRef} className="-mx-1 overflow-x-auto px-1">
          <TabsList
            data-hit-slop
            className="inline-flex h-auto w-max gap-1 bg-transparent p-0"
          >
            {INV_TABS.map(t => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                data-testid={`inv-tab-${t.id}`}
                // data-hit-slop + s-hit: the 36px visual pill is deliberate (a scrollable tab
                // strip that fit six labels at 32px≈16px labels), `.s-hit` grows the real hit
                // area to 48 (see chip.tsx's FilterChip for why the overlap sweep needs the
                // attribute too).
                data-hit-slop
                className="s-hit whitespace-nowrap rounded-full border border-transparent px-3 py-2 text-[13px] font-bold data-[state=active]:border-[var(--border)] data-[state=active]:bg-[var(--surface-2)]"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {INV_TABS.map(t => (
          <TabsContent key={t.id} value={t.id} data-testid={`inv-panel-${t.id}`}>
            <React.Suspense fallback={<Placeholder id={t.id} />}>
              {tab === t.id ? <ActiveTab /> : null}
            </React.Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export function Inventory() {
  return (
    <SigmaProviders>
      <InventoryPage />
    </SigmaProviders>
  );
}

export function mountInventory(): boolean {
  return mount('sigma-inventory', Inventory);
}
