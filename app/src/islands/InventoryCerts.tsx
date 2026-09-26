// 🚚 תעודות משלוח tab (spec task U4, C16, C24-C25). The always-listening #sigma-cert island
// (InventoryCert.tsx) owns the sheet/signature/viewer/send screens — this tab is the registry:
// range chips, search, the list, and the ⋯ per-row actions that open those screens by dispatching
// the same event the legacy compat shims use (openCertEvent).
import * as React from 'react';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilterChip, Tag } from '@/components/ui/chip';
import { ListRow } from '@/components/ui/list-row';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { sigma, useCurrentUser } from '@/bridge';
import { certRange, certSearch, CERT_SOURCE_LABEL, type CertRow as CertRowType } from '@/lib/inventory';
import { fetchCerts, cancelCert, INV_KEYS, type CertRow } from '@/lib/inventoryApi';
import { openCertEvent } from './InventoryCert';

type RangeKey = 'all' | 'thisMonth' | 'lastMonth' | 'last7' | 'last30';
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'all', label: 'הכל' }, { key: 'thisMonth', label: 'חודש נוכחי' }, { key: 'lastMonth', label: 'חודש שעבר' },
  { key: 'last7', label: '7 ימים' }, { key: 'last30', label: '30 ימים' },
];

function todayYmd(): string { return new Date().toISOString().slice(0, 10); }

export function InventoryCertsTab() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const [range, setRange] = React.useState<RangeKey>('all');
  const monthDefault = React.useMemo(() => certRange('thisMonth', todayYmd()), []);
  const [from, setFrom] = React.useState(monthDefault.from);
  const [to, setTo] = React.useState(monthDefault.to);
  const [search, setSearch] = React.useState('');
  const [moreOpenId, setMoreOpenId] = React.useState<string | null>(null);
  const [pageMoreOpen, setPageMoreOpen] = React.useState(false);

  const certsQ = useQuery({ queryKey: INV_KEYS.certs(from, to), queryFn: () => fetchCerts(from, to) });
  const certs = (certsQ.data || []) as CertRow[];
  const filtered = React.useMemo(() => certSearch(certs as unknown as CertRowType[], search), [certs, search]);
  const activeCount = certs.filter(c => (c as any).status !== 'cancelled').length;

  function setRangeChip(r: RangeKey) {
    setRange(r);
    const { from: f, to: t } = certRange(r, todayYmd());
    setFrom(f); setTo(t);
  }
  function setManualFrom(v: string) { setFrom(v); setRange('all' as any); }
  function setManualTo(v: string) { setTo(v); setRange('all' as any); }

  function openNew() {
    openCertEvent({ kind: 'cert', pre: {} });
  }
  function openView(c: CertRow) { setMoreOpenId(null); openCertEvent({ kind: 'cert-view', row: c }); }
  function openSend(c: CertRow) { setMoreOpenId(null); openCertEvent({ kind: 'cert-send', row: c }); }
  function openReissue(c: CertRow) {
    setMoreOpenId(null);
    const anyc = c as any;
    openCertEvent({
      kind: 'cert', pre: {
        kibbutz: anyc.kibbutz, date: todayYmd(), customer: anyc.customer,
        items: (anyc.items || []).map((i: any) => ({ name: i.name, qty: i.qty })),
        notes: anyc.notes || '', source: anyc.source, refId: anyc.ref_id,
        reissueOf: { id: c.id, certNumber: anyc.cert_number },
      },
    });
  }
  async function doCancel(c: CertRow) {
    setMoreOpenId(null);
    try {
      await cancelCert(c.id);
      toast.success('התעודה בוטלה');
      void qc.invalidateQueries({ queryKey: INV_KEYS.all });
    } catch (e: any) {
      toast.error(e?.message || 'הביטול נכשל');
    }
  }

  const canExport = (() => { try { return !!sigma.canExportExcel?.(); } catch { return false; } })();

  return (
    <div className="flex flex-col gap-3">
      <PageActionRow
        title="תעודות משלוח"
        actions={
          <span className="flex items-center gap-1">
            {!user.isViewer && (
              <button type="button" data-testid="inv-new-cert" data-hit-slop onClick={openNew}
                className="s-hit min-h-[36px] rounded-full bg-[var(--sigma-ink)] px-3 text-[13px] font-bold text-[hsl(var(--card))]">
                + תעודה חדשה
              </button>
            )}
            <span className="relative">
              <button type="button" data-hit-slop onClick={() => setPageMoreOpen(o => !o)} aria-label="עוד"
                className="s-hit flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full">
                <MoreHorizontal className="h-5 w-5" aria-hidden />
              </button>
              {pageMoreOpen && (
                <div className="absolute inset-inline-end-0 top-full z-10 min-w-[160px] rounded-xl border border-border bg-card p-1 shadow-lg">
                  <button type="button" onClick={() => { setPageMoreOpen(false); try { (window as any).certRangeReportRange?.(from, to); } catch { /* legacy not up */ } }}
                    className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold">
                    סיכום תקופתי
                  </button>
                  {canExport && (
                    <button type="button" onClick={() => { setPageMoreOpen(false); try { sigma.xlExportCerts?.(from, to); } catch { /* legacy not up */ } }}
                      className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold">
                      Excel
                    </button>
                  )}
                  <button type="button" onClick={() => { setPageMoreOpen(false); void qc.invalidateQueries({ queryKey: INV_KEYS.certs(from, to) }); }}
                    className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold">
                    רענון
                  </button>
                </div>
              )}
            </span>
          </span>
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {RANGES.map(r => (
          <span key={r.key} data-testid={`inv-certs-range-${r.key}`}>
            <FilterChip selected={range === r.key} onClick={() => setRangeChip(r.key)}>{r.label}</FilterChip>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input data-testid="inv-certs-from" aria-label="מתאריך" type="date" value={from} onChange={e => setManualFrom(e.target.value)}
          className="min-h-[48px] flex-1 rounded-xl border border-border bg-card px-2 text-[13px]" />
        <input data-testid="inv-certs-to" aria-label="עד תאריך" type="date" value={to} onChange={e => setManualTo(e.target.value)}
          className="min-h-[48px] flex-1 rounded-xl border border-border bg-card px-2 text-[13px]" />
      </div>
      <input data-testid="inv-certs-search" placeholder="חיפוש לפי קיבוץ / לקוח / מספר" value={search}
        onChange={e => setSearch(e.target.value)}
        className="min-h-[48px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />

      <SectionBlock title="תעודות" count={filtered.length}>
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">לא נמצאו תעודות בטווח הזה</div>
        )}
        {filtered.map(c => {
          const anyc = c as any;
          const cancelled = anyc.status === 'cancelled';
          return (
            <div key={c.id} data-testid={`inv-cert-row-${anyc.cert_number}`}>
              <ListRow
                onClick={() => openView(c)}
                title={
                  <span className={cancelled ? 'line-through text-muted-foreground' : ''}>
                    {anyc.cert_number}
                  </span>
                }
                meta={
                  <span className="flex flex-col gap-1">
                    <span>{(anyc.cert_date || '').slice(0, 10)} · {anyc.customer?.name || anyc.kibbutz} · {(anyc.items || []).length} פריטים · {anyc.created_by}</span>
                    {/* Designer C-round I fix: "1042 1043 → בוטלה" read as a garbled arrow chain,
                        not a status. A cancelled cert is a Tag like every other status; the
                        replacement number (if any) is its own plain-language line. */}
                    <span className="flex flex-wrap gap-1">
                      <Tag role="info">{CERT_SOURCE_LABEL[anyc.source] || anyc.source}</Tag>
                      {anyc.signature && <Tag role="ok">נחתם</Tag>}
                      {cancelled && <Tag role="danger">בוטלה</Tag>}
                    </span>
                    {cancelled && anyc.replaced_by && (
                      <span>הוחלפה ב־<bdi>{anyc.replaced_by}</bdi></span>
                    )}
                  </span>
                }
                trailing={
                  <span className="relative">
                    <button type="button" data-testid={`inv-cert-more-${anyc.cert_number}`}
                      onClick={e => { e.stopPropagation(); setMoreOpenId(id => (id === c.id ? null : c.id)); }}
                      aria-label="עוד" className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full">
                      <MoreHorizontal className="h-5 w-5" aria-hidden />
                    </button>
                    {moreOpenId === c.id && (
                      <div onClick={e => e.stopPropagation()} className="absolute inset-inline-end-0 top-full z-10 min-w-[140px] rounded-xl border border-border bg-card p-1 shadow-lg">
                        <button type="button" data-testid={`inv-cert-view-${anyc.cert_number}`} onClick={() => openView(c)}
                          className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold">הצגה</button>
                        {!user.isViewer && (
                          <>
                            <button type="button" data-testid={`inv-cert-send-${anyc.cert_number}`} onClick={() => openSend(c)}
                              className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold">שליחה</button>
                            {/* הפקה מתוקנת stays offered even on a cancelled cert (the correction path
                                a cancel usually exists FOR); only ביטול itself is one-shot. */}
                            <button type="button" data-testid={`inv-cert-reissue-${anyc.cert_number}`} onClick={() => openReissue(c)}
                              className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold">הפקה מתוקנת</button>
                            {!cancelled && (
                              <button type="button" data-testid={`inv-cert-cancel-${anyc.cert_number}`} onClick={() => void doCancel(c)}
                                className="block w-full rounded-lg px-2 py-2 text-start text-[13px] font-semibold text-[var(--danger-ink)]">ביטול</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </span>
                }
              />
            </div>
          );
        })}
      </SectionBlock>
      <div className="px-1 text-[13px] font-bold text-muted-foreground">
        <bdi>{certs.length}</bdi> תעודות · <bdi>{activeCount}</bdi> פעילות
      </div>
    </div>
  );
}
