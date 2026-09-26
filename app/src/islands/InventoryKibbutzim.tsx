// 🏘️ מלאי בקיבוצים tab (spec task U3, S13, S15, S19). Phone: a collapsible SectionBlock per
// kibbutz (kibbutzCards). Desktop (560px container query): a matrix Grid (kibbutzMatrix) with a
// sticky first column. The rules live in app/src/lib/inventory.ts.
import * as React from 'react';
import { MoreHorizontal, Warehouse } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { sigma } from '@/bridge';
import { useInventory } from '@/lib/inventoryApi';
import { stockByLocation, kibbutzCards, kibbutzMatrix, kibbutzCsvRows, csvText } from '@/lib/inventory';

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

export function InventoryKibbutzimTab() {
  const invQ = useInventory();
  const data = invQ.data;
  const [moreOpen, setMoreOpen] = React.useState(false);

  const stock = React.useMemo(() => stockByLocation(data?.movements || []), [data]);
  const cards = React.useMemo(() => kibbutzCards(stock), [stock]);
  const matrix = React.useMemo(() => kibbutzMatrix(stock), [stock]);

  const canExport = (() => { try { return !!sigma.canExportExcel?.(); } catch { return false; } })();
  const empty = matrix.kibbutzim.length === 0 || matrix.products.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow
        title="מלאי בקיבוצים"
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
                  onClick={() => { setMoreOpen(false); downloadCsv('inventory_by_kibbutz.csv', csvText(kibbutzCsvRows(stock))); }}
                  className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold"
                >
                  ייצוא CSV
                </button>
                {canExport && (
                  <button
                    type="button"
                    data-testid="inv-export-xlsx"
                    onClick={() => { setMoreOpen(false); try { sigma.xlExportKibbutz?.(); } catch { /* legacy not up */ } }}
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

      {empty ? (
        <EmptyState icon={<Warehouse />} title="עדיין לא סופקו פריטים לקיבוצים." />
      ) : (
        <div className="s-kib-view" style={{ containerType: 'inline-size' }}>
          {/* phone: an accordion per kibbutz, hidden from 560px up */}
          <div className="s-kib-cards flex flex-col gap-2">
            {cards.map(c => (
              <div key={c.kibbutz} data-testid={`inv-kib-card-${c.kibbutz}`}>
                <SectionBlock
                  title={c.kibbutz}
                  count={c.items.length}
                  collapsible
                  // Designer C-round I fix: a single kibbutz collapsed by default showed an
                  // empty-looking screen with no hint anything was inside — with only one card
                  // there is no "scan the list" reason to start collapsed, so it opens.
                  defaultOpen={cards.length === 1}
                >
                  {c.items.map(([name, q]) => (
                    <div key={name} data-testid={`inv-kib-cell-${c.kibbutz}-${name}`} className="flex items-center justify-between px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-[length:var(--fs-body)]">{name}</span>
                      <bdi className="tabular-nums font-semibold">{q}</bdi>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 text-[13px] font-bold text-muted-foreground">
                    <span>סה״כ</span>
                    <bdi className="tabular-nums">{c.totalUnits}</bdi>
                  </div>
                </SectionBlock>
              </div>
            ))}
          </div>

          {/* desktop: a matrix, sticky first column */}
          <div className="s-kib-matrix hidden overflow-x-auto rounded-[var(--r-lg)] bg-card" style={{ boxShadow: 'var(--e1)' }}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="sticky inset-inline-start-0 z-10 min-w-[120px] bg-card px-3 py-2 text-start font-bold">קיבוץ</th>
                  {matrix.products.map(p => (
                    <th key={p} data-truncate className="max-w-[96px] truncate px-3 py-2 text-start font-bold">{p}</th>
                  ))}
                  <th className="px-3 py-2 text-start font-bold">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {matrix.kibbutzim.map((k, ri) => (
                  <tr key={k} className="border-t border-border">
                    <td className="sticky inset-inline-start-0 z-10 bg-card px-3 py-2 font-semibold">{k}</td>
                    {matrix.products.map((p, ci) => (
                      <td
                        key={p}
                        data-testid={`inv-kib-cell-${k}-${p}`}
                        className={matrix.cells[ri][ci] === 0 ? 'px-3 py-2 tabular-nums text-[length:var(--fs-body-sm)] text-muted-foreground' : 'px-3 py-2 tabular-nums'}
                      >
                        <bdi>{matrix.cells[ri][ci]}</bdi>
                      </td>
                    ))}
                    <td className="px-3 py-2 tabular-nums font-bold"><bdi>{matrix.totals[ri]}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
