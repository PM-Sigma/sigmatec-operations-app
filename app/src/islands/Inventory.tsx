// 📦 מלאי — the package I page island (spec docs/superpowers/specs/2026-09-23-r5-I-inventory.md,
// task U1). Behind INV_REACT (js/src/00-consts.js invReact()): flag off, this renders nothing
// useful and the legacy #inventoryLegacy markup keeps working exactly as before. Flag on
// (or localStorage 'sigma-inv-react'='1'), it hides the legacy markup and owns the page: the
// ruled tab order (spec §1, DELTAS.S19), the flag, and a lazy child per tab. Each tab's own
// screen lands in its own task (U2 orders, U3 stock/kibbutz, U4 certs, U5 returns, U6 products);
// until then a tab renders an empty panel with its testid so the tab strip itself is testable.
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

// Tabs U3–U6 build (stock/kibbutz/certs/returns/products): until each task ships its own lazy
// child, its tab renders an empty, testid'd placeholder — never the acceptance shape, but enough
// for the tab strip itself (U1's job) to be testable on its own.
function Placeholder({ id }: { id: string }) {
  return <div data-testid={`inv-panel-${id}-placeholder`} />;
}
function placeholderTab(id: string): React.ComponentType {
  return () => <Placeholder id={id} />;
}

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  orders: OrdersTab,
  stock: StockTab,
  certs: placeholderTab('certs'),
  kibbutz: KibbutzTab,
  returns: ReturnsTab,
  products: placeholderTab('products'),
};

function invReactNow(): boolean {
  try { return !!(window as any).invReact?.(); } catch { return false; }
}

function InventoryPage() {
  const qc = useQueryClient();
  const queued = drainQueue();
  // Flag off (the default): render nothing and leave #inventoryLegacy exactly as it was — the
  // U1 acceptance rule ("with the flag off nothing changes"). A queued open (invReactOpen only
  // ever fires when invReact() was already true at call time) also counts as active, so a tap
  // that raced the chunk load still lands on the react page instead of a blank one.
  const [active, setActive] = React.useState<boolean>(() => invReactNow() || !!queued);
  const [tab, setTab] = React.useState<string>(() => normalizeTab(queued?.tab ?? DEFAULT_TAB));
  const tabsListRef = React.useRef<HTMLDivElement>(null);
  useInventory(); // warms the one cache entry every tab reads

  React.useEffect(() => {
    const legacy = document.getElementById('inventoryLegacy');
    if (legacy) legacy.style.display = active ? 'none' : '';
  }, [active]);

  // invReactOpen() (js/src/00-consts.js) dispatches this on `window`, not sigmaBus — it fires
  // from invShowTab() before this chunk is guaranteed loaded, and window is the one channel a
  // plain <script> bundle and a lazy ESM chunk both always have.
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      setActive(true);
      if (detail.kind === 'tab') setTab(normalizeTab(detail.tab));
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

  if (!active) return null;

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
