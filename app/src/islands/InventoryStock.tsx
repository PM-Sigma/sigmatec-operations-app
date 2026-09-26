// 📦 מלאי חברה tab (spec task U3, S1-S12, S17, S19-S20). The rules live in
// app/src/lib/inventory.ts (poolStock/productCategoryMap/lowStockReport/poolView/poolCsvRows) —
// this file is the shell: a StatTileGrid over poolView()'s three KPIs, the existing
// InventoryStrip embedded unchanged, and a SectionBlock per category of ListRows.
import * as React from 'react';
import { Boxes, MoreHorizontal } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { Tag } from '@/components/ui/chip';
import { sigma, useCurrentUser } from '@/bridge';
import { useInventory } from '@/lib/inventoryApi';
import { poolStock, productCategoryMap, lowStockReport, poolView, poolCsvRows, csvText } from '@/lib/inventory';
import { STOCK_CHANGE_OPEN_EVENT } from './StockChange';
import { InventoryStrip } from './InventoryStrip';

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  // 1 s used to be plenty, but Playwright's own createReadStream() occasionally lost the
  // race under a loaded CI machine (F11, qa/playwright/tests/inventory/stock.spec.ts) —
  // the click had fired and the download started, but the blob was gone by the time the
  // read actually happened. 30 s costs nothing (one Blob, freed on the next export or tab
  // change anyway) and leaves the read all the room it needs.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function InventoryStockTab() {
  const user = useCurrentUser();
  const invQ = useInventory();
  const data = invQ.data;
  const [filter, setFilter] = React.useState<'' | 'low'>('');
  const [moreOpen, setMoreOpen] = React.useState(false);

  const pool = React.useMemo(() => poolStock(data?.movements || []), [data]);
  const catMap = React.useMemo(() => productCategoryMap(data?.products || []), [data]);
  const report = React.useMemo(() => lowStockReport(pool), [pool]);
  const view = React.useMemo(() => poolView(pool, catMap, report, filter), [pool, catMap, report, filter]);

  const canExport = (() => { try { return !!sigma.canExportExcel?.(); } catch { return false; } })();

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow
        title="מלאי חברה"
        actions={
          <span className="relative">
            <button
              type="button"
              data-hit-slop
              onClick={() => setMoreOpen(o => !o)}
              aria-label="עוד"
              className="s-hit flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>
            {moreOpen && (
              <div className="absolute inset-inline-end-0 top-full z-10 min-w-[160px] rounded-xl border border-border bg-card p-1 shadow-lg">
                <button
                  type="button"
                  data-testid="inv-export-csv"
                  onClick={() => { setMoreOpen(false); downloadCsv('inventory_pool.csv', csvText(poolCsvRows(pool))); }}
                  className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold"
                >
                  ייצוא CSV
                </button>
                {canExport && (
                  <button
                    type="button"
                    data-testid="inv-export-xlsx"
                    onClick={() => { setMoreOpen(false); try { sigma.xlExportStock?.(); } catch { /* legacy not up */ } }}
                    className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold"
                  >
                    Excel
                  </button>
                )}
              </div>
            )}
          </span>
        }
      />

      <StatTileGrid>
        <span data-testid="inv-kpi-items">
          <StatTile
            value={view.productCount}
            label="פריטים במאגר"
            role="info"
            selected={filter === ''}
            onClick={() => setFilter('')}
          />
        </span>
        <span data-testid="inv-kpi-units">
          <StatTile value={view.totalUnits} label="יחידות" />
        </span>
        <span data-testid="inv-kpi-low">
          <StatTile
            value={view.lowCount}
            label="מלאי נמוך"
            role="danger"
            selected={filter === 'low'}
            onClick={() => setFilter(f => (f === 'low' ? '' : 'low'))}
          />
        </span>
      </StatTileGrid>

      {/* the orders strip + מינימום מלאי editor — unchanged (owned by R), embedded here directly
          (the legacy #inventoryLegacy page and its own #sigma-inventory-strip mount are gone,
          U10; this was always the one real render). */}
      <InventoryStrip />

      {!user.isViewer && (
        <button
          type="button"
          data-testid="inv-report-change"
          data-hit-slop
          onClick={() => window.dispatchEvent(new CustomEvent(STOCK_CHANGE_OPEN_EVENT, { detail: { product: '' } }))}
          className="s-hit min-h-[40px] self-start rounded-full bg-[var(--sigma-ink)] px-3 text-[13px] font-bold text-[hsl(var(--card))]"
        >
          דיווח שינוי
        </button>
      )}

      {view.groups.length === 0 ? (
        <EmptyState
          icon={<Boxes />}
          title={filter === 'low' ? 'אין פריטים מתחת לקו האדום.' : 'אין מלאי במאגר החברה.'}
        />
      ) : (
        view.groups.map(g => (
          <SectionBlock key={g.category} title={g.category} count={g.rows.length}>
            {g.rows.map(row => (
              <div key={row.name} data-testid={`inv-pool-row-${row.name}`}>
                <ListRow
                  title={row.name}
                  trailing={
                    <span className="flex items-center gap-1.5">
                      {row.low && <Tag role="danger">נמוך</Tag>}
                      <span className={row.negative ? 'tabular-nums font-bold text-[var(--danger-ink)]' : 'tabular-nums font-bold'}>
                        <bdi>{row.qty}</bdi>
                      </span>
                    </span>
                  }
                />
              </div>
            ))}
          </SectionBlock>
        ))
      )}
    </div>
  );
}
