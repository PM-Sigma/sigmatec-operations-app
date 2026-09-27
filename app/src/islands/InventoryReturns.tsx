// ↩️ החזרות tab (spec task U5, S18). The rule lives in app/src/lib/inventory.ts (restockPlan);
// the writes in app/src/lib/inventoryApi.ts (restockReturn/markDefective). This file is the shell.
import * as React from 'react';
import { toast } from 'sonner';
import { PackageOpen } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { Tag } from '@/components/ui/chip';
import { useCurrentUser } from '@/bridge';
import { useInventory, restockReturn, markDefective, type ReturnRow } from '@/lib/inventoryApi';

const STATUS_TAG: Record<string, { label: string; role: 'neutral' | 'ok' | 'danger' }> = {
  open: { label: 'ממתין', role: 'neutral' },
  restocked: { label: 'הוחזר למלאי', role: 'ok' },
  defective: { label: 'תקול', role: 'danger' },
};

function returnMeta(r: ReturnRow): string {
  const date = (r.date || '').slice(0, 10);
  const parts = [r.kibbutz, date, r.visitor].filter(Boolean);
  return parts.join(' · ');
}

type ConfirmKind = 'restock' | 'defective';

export function InventoryReturnsTab() {
  const user = useCurrentUser();
  const invQ = useInventory();
  const data = invQ.data;
  const [confirm, setConfirm] = React.useState<{ kind: ConfirmKind; r: ReturnRow } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const returns = data?.returns || [];
  const sorted = React.useMemo(
    () => [...returns].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [returns],
  );
  const pendingCount = returns.filter(r => (r.status || 'open') === 'open').length;

  async function doRestock(r: ReturnRow) {
    if (!data) return;
    setBusy(true);
    try {
      await restockReturn(r.id, data, user.name);
      toast.success('הפריט הוחזר למלאי');
    } catch (e: any) {
      toast.error(e?.message || 'הפעולה נכשלה');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  async function doDefective(r: ReturnRow) {
    setBusy(true);
    try {
      await markDefective(r.id);
      toast.success('הפריט סומן כתקול');
    } catch (e: any) {
      toast.error(e?.message || 'הפעולה נכשלה');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow title="החזרות" />

      {returns.length > 0 && (
        <div>
          <Tag role={pendingCount ? 'warn' : 'neutral'}>ממתינים להחלטה: <bdi>{pendingCount}</bdi> פריטים</Tag>
        </div>
      )}

      <SectionBlock title="החזרות" count={sorted.length}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<PackageOpen />}
            title="עדיין אין ציוד שהוחזר במעקב."
            hint="ציוד שנרשם בסיכום ביקור תחת ציוד שהוחזר מופיע כאן."
          />
        ) : (
          sorted.map(r => {
            const st = STATUS_TAG[r.status || 'open'] || STATUS_TAG.open;
            const open = (r.status || 'open') === 'open';
            return (
              <div key={r.id} data-testid={`inv-return-row-${r.id}`}>
                <ListRow
                  title={r.product}
                  trailing={null}
                  meta={
                    <span className="flex flex-col gap-1">
                      <span>{returnMeta(r)} · <bdi>{r.qty}</bdi> יח׳</span>
                      <span className="flex flex-wrap items-center gap-1">
                        <Tag role={st.role}>{st.label}</Tag>
                        {open && !user.isViewer && (
                          <>
                            <button
                              type="button"
                              data-testid={`inv-return-restock-${r.id}`}
                              onClick={() => setConfirm({ kind: 'restock', r })}
                              className="rounded-full bg-[var(--ok-fill)] px-2 py-0.5 text-[11px] font-bold text-[var(--ok-ink)]"
                            >
                              החזרה למלאי
                            </button>
                            <button
                              type="button"
                              data-testid={`inv-return-defective-${r.id}`}
                              onClick={() => setConfirm({ kind: 'defective', r })}
                              className="rounded-full bg-[var(--danger-fill)] px-2 py-0.5 text-[11px] font-bold text-[var(--danger-ink)]"
                            >
                              סימון כתקול
                            </button>
                          </>
                        )}
                      </span>
                    </span>
                  }
                />
              </div>
            );
          })
        )}
      </SectionBlock>

      {confirm && (
        <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40" data-testid="return-confirm-sheet">
          <div className="w-full max-w-md rounded-t-2xl bg-card p-4">
            <div className="mb-3 whitespace-pre-line text-[15px]">
              {confirm.kind === 'restock'
                ? `להחזיר את ${confirm.r.product} (×${confirm.r.qty}) למלאי החברה?`
                : 'הפריט יישאר מחוץ למלאי הזמין'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="confirm-yes"
                disabled={busy}
                onClick={() => void (confirm.kind === 'restock' ? doRestock(confirm.r) : doDefective(confirm.r))}
                className="min-h-[44px] flex-1 rounded-xl s-brand font-bold disabled:opacity-40"
              >
                כן
              </button>
              <button
                type="button"
                data-testid="confirm-no"
                onClick={() => setConfirm(null)}
                className="min-h-[44px] flex-1 rounded-xl border border-border font-bold"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
