// 📦 פריטים tab (spec task U6, P1-P18): the products list + product sheet + ruled delete.
// The rules live in app/src/lib/inventory.ts + productLabel.ts; the writes in
// app/src/lib/inventoryApi.ts. This file is the shell.
import * as React from 'react';
import { Package } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { Tag } from '@/components/ui/chip';
import { useCurrentUser } from '@/bridge';
import { useInventory } from '@/lib/inventoryApi';
import { sortByCategoryThenNameFixed, productCategoryMap, type ProductRow } from '@/lib/inventory';
import { reportWiringOk, reportPreview } from '@/lib/productLabel';
import { ProductSheet } from './InventoryProductSheet';

function productMeta(p: ProductRow): string {
  const status = p.active !== false ? 'פעיל' : 'מושבת';
  const parts = [p.category || 'אחר', status, `בדוח: ${reportPreview(p)}`];
  return parts.join(' · ');
}

export function InventoryProductsTab() {
  const user = useCurrentUser();
  const invQ = useInventory();
  const data = invQ.data;
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProductRow | null>(null);

  const products = data?.products || [];
  const catMap = React.useMemo(() => productCategoryMap(products), [products]);
  const sortedNames = React.useMemo(
    () => sortByCategoryThenNameFixed(products.map(p => p.name), catMap),
    [products, catMap],
  );
  const byName = React.useMemo(() => {
    const m: Record<string, ProductRow> = {};
    for (const p of products) if (p.name) m[p.name] = p;
    return m;
  }, [products]);

  const wiringOk = reportWiringOk(products);
  const hasMovementsFor = React.useCallback(
    (name: string) => (data?.movements || []).some(m => m.product === name),
    [data],
  );

  const openNew = () => { setEditing(null); setSheetOpen(true); };
  const openProduct = (p: ProductRow) => { setEditing(p); setSheetOpen(true); };

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow
        title="פריטים"
        actions={
          !user.isViewer && (
            <button
              type="button"
              data-testid="inv-new-product"
              onClick={openNew}
              className="s-hit min-h-[36px] rounded-full s-brand px-3 text-[13px] font-bold"
            >
              פריט חדש
            </button>
          )
        }
      />

      {products.length > 0 && (
        <div>
          <Tag role={wiringOk ? 'ok' : 'warn'}>
            {wiringOk ? 'מחובר למחולל הדוחות' : 'יש פריטים פעילים בלי שם לדוחות'}
          </Tag>
        </div>
      )}

      <SectionBlock title="פריטים" count={sortedNames.length}>
        {sortedNames.length === 0 ? (
          <EmptyState icon={<Package />} title="עדיין אין פריטים בקטלוג." hint="פריט חדש נפתח מהכפתור למעלה." />
        ) : (
          sortedNames.map(name => {
            const p = byName[name];
            if (!p) return null;
            return (
              <div key={p.id || name} data-testid={`inv-product-row-${p.id || name}`} onClick={() => openProduct(p)} className="cursor-pointer">
                <ListRow title={p.name} meta={productMeta(p)} trailing={null} />
              </div>
            );
          })
        )}
      </SectionBlock>

      <ProductSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        product={editing}
        hasMovements={editing ? hasMovementsFor(editing.name) : false}
        onSaved={() => invQ.refetch()}
        onDeleted={() => { setSheetOpen(false); invQ.refetch(); }}
      />
    </div>
  );
}
