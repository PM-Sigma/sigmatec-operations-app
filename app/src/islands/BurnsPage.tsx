// 🔥 צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק — #sigma-burns-page (G-U2).
//
// The full table the legacy `24-meter-burns.js` used to own, rebuilt on the design system:
// tiles, search, filters, per-site sections grouped by generator, multi-select, sheets for
// every write, an Excel export and the background EMS refresh. Read-only for the viewer,
// nothing at all for anyone `canSeeBurns` refuses (מתניה/אליה, or the flag off).
import * as React from 'react';
import { toast } from 'sonner';
import { Cpu, FileSpreadsheet, Flame, Repeat, Search, Zap } from 'lucide-react';
import { PageActionRow } from '@/components/ui/page-action-row';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { FilterChip, Tag } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders, hasPersistedData, showSkeleton } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { sigma, useCurrentUser } from '@/bridge';
import { track } from '@/lib/track';
import {
  burnCounts, burnKindLabel, burnStateLabel, burnXlsxSpec, canSeeBurns, canWriteBurns,
  filterBurnRows, groupBurnsByGenerator, groupBurnsBySite, isCT,
  type BurnFilter, type BurnRow, type GeneratorRow,
} from '@/lib/burns';
import { markBurned, refreshBurnsFromEms, unburnWithUndo, useBurnGenerators, useBurns } from '@/lib/burnsData';
import { MeterSheet } from '@/islands/burns/MeterSheet';
import { IssueSheet } from '@/islands/burns/IssueSheet';
import { AssignSheet } from '@/islands/burns/AssignSheet';
import { GeneratorsSheet } from '@/islands/burns/GeneratorsSheet';

const TITLE = 'צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק';
const FILTER_KEY = 'burn_filter_v1';
const GEN_MANAGERS = ['עידן', 'עמיחי'];

function readFilter(): BurnFilter {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') || {}; } catch { return {}; }
}
function writeFilter(f: BurnFilter): void {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* private mode */ }
}

function BurnsPageInner() {
  const { name: user, isViewer } = useCurrentUser();
  const canSee = canSeeBurns(user, isViewer);
  const canWrite = canWriteBurns(user, isViewer);
  const canManageGens = canWrite && GEN_MANAGERS.includes(String(user ?? '').trim());

  const burnsQ = useBurns(canSee);
  const gensQ = useBurnGenerators(canSee);
  const rows = burnsQ.data || [];
  const gens = gensQ.data || [];

  const [filter, setFilter] = React.useState<BurnFilter>(readFilter);
  const [q, setQ] = React.useState(filter.q || '');
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [meterSheetId, setMeterSheetId] = React.useState<string | null>(null);
  const [issueId, setIssueId] = React.useState<string | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [gensOpen, setGensOpen] = React.useState(false);
  const [siteSheetOpen, setSiteSheetOpen] = React.useState(false);

  React.useEffect(() => { writeFilter({ ...filter, q }); }, [filter, q]);

  // Background EMS refresh on mount — a writer only, never awaited by the render (review focus #2).
  React.useEffect(() => { if (canWrite) void refreshBurnsFromEms().catch(() => { /* silent: throttled or offline */ }); }, [canWrite]);

  const sites = React.useMemo(() => Array.from(new Set(rows.map(r => r.site).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')), [rows]);
  const effFilter: BurnFilter = { ...filter, q };
  const filtered = filterBurnRows(rows, effFilter, gens);
  const counts = burnCounts(filtered);
  const bySite = groupBurnsBySite(filtered);
  const byId = React.useMemo(() => { const m = new Map<string, BurnRow>(); for (const r of rows) m.set(r.meter_id, r); return m; }, [rows]);
  const genById = React.useMemo(() => { const m = new Map<string, GeneratorRow>(); for (const g of gens) m.set(g.id, g); return m; }, [gens]);

  const meterRow = meterSheetId ? byId.get(meterSheetId) || null : null;
  const issueRow = issueId ? byId.get(issueId) || null : null;
  const meterGen = meterRow?.generator_id ? genById.get(meterRow.generator_id) || null : null;

  const toggleStatus = (s: 'pending' | 'burned' | 'issue') => {
    setFilter(f => ({ ...f, status: f.status === s ? 'all' : s }));
  };
  const toggleKind = (k: 'CT' | 'PP') => {
    setFilter(f => ({ ...f, kind: f.kind === k ? 'all' : k }));
  };
  const clearFilters = () => { setFilter({}); setQ(''); };

  const onSearchEnter = () => {
    if (filtered.length !== 1) return;
    const id = filtered[0].meter_id;
    // Deferred a tick: opening the sheet in the SAME keydown that still has the search input
    // focused raced radix's own focus-trap/outside-interaction setup on mount, which read the
    // still-focused external input as an immediate "outside" interaction and closed the sheet
    // the instant it opened. A macrotask lets the keydown finish first.
    setTimeout(() => setMeterSheetId(id), 0);
  };

  const toggleSelected = (id: string) => {
    setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const selectedRows = filtered.filter(r => selected.has(r.meter_id));
  const selectedSites = new Set(selectedRows.map(r => r.site));
  const assignEligible = selectedRows.length > 0 && selectedSites.size === 1;

  const bulkBurn = async () => {
    try { await markBurned(selectedRows.map(r => r.meter_id), user); toast.success('סומן כנצרב'); exitSelect(); }
    catch (e: any) { toast.error(e?.message || 'השמירה נכשלה'); }
  };

  const doUnburn = async (targets: BurnRow[]) => {
    const { undo } = await unburnWithUndo(targets);
    toast('הסימון בוטל', {
      duration: 5000,
      action: { label: 'ביטול', onClick: () => void undo() },
    });
  };

  const exportXlsx = () => {
    const fn = (window as any).xlDownload;
    if (typeof fn !== 'function') { toast.error('ייצוא אקסל לא זמין כאן'); return; }
    track('burns-export', 'xlsx');
    void fn(burnXlsxSpec(filtered, gens), 'צריבות');
  };

  const canExport = (() => { try { return !!sigma.canExportExcel?.(); } catch { return false; } })();

  if (!canSee) return null;

  const isLoading = burnsQ.isLoading;
  if (isLoading && showSkeleton(rows.length > 0, hasPersistedData(['meterBurns']))) {
    return (
      <div className="flex flex-col gap-3 p-2">
        <PageActionRow title={TITLE} titleLines={2} onBack={() => (window as any).pageBack?.()} />
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (burnsQ.isError) {
    return (
      <div className="p-2">
        <PageActionRow title={TITLE} titleLines={2} onBack={() => (window as any).pageBack?.()} />
        <EmptyState
          icon={<Flame />}
          title="לא הצלחנו לטעון את הצריבות."
          action={{ label: 'ניסיון נוסף', onClick: () => void burnsQ.refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2 pb-24" data-testid="burns-page">
      <PageActionRow
        title={TITLE}
        titleLines={2}
        onBack={() => (window as any).pageBack?.()}
        actions={
          <>
            {canExport && (
              <BubbleButton variant="icon" size="sm" aria-label="ייצוא לאקסל" onClick={exportXlsx}>
                <FileSpreadsheet className="h-4 w-4" />
              </BubbleButton>
            )}
            {canManageGens && (
              <BubbleButton variant="icon" size="sm" aria-label="גנרטורים" onClick={() => setGensOpen(true)}>
                <Cpu className="h-4 w-4" />
              </BubbleButton>
            )}
          </>
        }
      />

      <StatTileGrid>
        <StatTile value={counts.total} label="סה״כ" />
        <StatTile value={counts.pending} label="נותרו" role="warn" selected={filter.status === 'pending'} onClick={() => toggleStatus('pending')} />
        <StatTile value={counts.burned} label="נצרבו" role="ok" selected={filter.status === 'burned'} onClick={() => toggleStatus('burned')} />
        <StatTile value={counts.issue} label="בעיות" role="danger" selected={filter.status === 'issue'} onClick={() => toggleStatus('issue')} />
      </StatTileGrid>

      <label className="relative block">
        <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSearchEnter(); }}
          placeholder="חיפוש לפי מספר מונה, כתובת או גנרטור"
          aria-label="חיפוש"
          className="min-h-[44px] w-full rounded-xl border border-border bg-card py-2 pe-9 ps-3 text-[14px] text-foreground"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip selected={!filter.kind || filter.kind === 'all'} onClick={() => setFilter(f => ({ ...f, kind: 'all' }))}>הכול</FilterChip>
        <FilterChip selected={filter.kind === 'CT'} onClick={() => toggleKind('CT')}>משנה זרם</FilterChip>
        <FilterChip selected={filter.kind === 'PP'} onClick={() => toggleKind('PP')}>תלת-פאזי</FilterChip>
        <FilterChip selected={!!filter.site} onClick={() => setSiteSheetOpen(true)}>{filter.site || 'קיבוץ'}</FilterChip>
        {canWrite && (
          <FilterChip selected={selectMode} onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
            בחירה
          </FilterChip>
        )}
      </div>

      {bySite.length === 0 ? (
        <EmptyState icon={<Flame />} title="אין מונים שתואמים לסינון." action={{ label: 'ניקוי סינון', onClick: clearFilters }} />
      ) : (
        bySite.map(site => {
          const pct = site.total ? Math.round((100 * site.burned) / site.total) : 0;
          const groups = groupBurnsByGenerator(site.rows, gens);
          return (
            <SectionBlock key={site.site || '—'} title={site.site || 'ללא קיבוץ'} collapsible defaultOpen count={site.total - site.burned}>
              <div className="px-4 pb-2 pt-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full s-brand" style={{ width: pct + '%' }} />
                </div>
              </div>
              {groups.map((g, gi) => (
                <React.Fragment key={g.gen?.id || 'none-' + gi}>
                  {g.gen && (
                    <div className="px-4 py-1.5 text-[12px] font-semibold text-muted-foreground">{g.gen.name}</div>
                  )}
                  {g.rows.map(r => {
                    const isSel = selected.has(r.meter_id);
                    return (
                      <ListRow
                        key={r.meter_id}
                        leading={
                          selectMode
                            ? (
                              <input
                                type="checkbox"
                                checked={isSel}
                                onChange={() => toggleSelected(r.meter_id)}
                                aria-label={'בחירת מונה ' + r.serial}
                                className="h-5 w-5"
                              />
                            )
                            : isCT(r) ? <Repeat className="h-5 w-5 text-muted-foreground" aria-hidden /> : <Zap className="h-5 w-5 text-muted-foreground" aria-hidden />
                        }
                        title={<bdi>{r.serial}</bdi>}
                        meta={[r.address, burnKindLabel(r).replace(/^[^\s]+\s/, ''), burnStateLabel(r).replace(/^[^\s]+\s/, '')].filter(Boolean).join(' · ')}
                        trailing={
                          canWrite && !selectMode
                            ? (
                              // A <span role="button">, not a nested <button>: the whole ListRow
                              // is itself a <button> (it opens MeterSheet on tap), and a <button>
                              // inside a <button> is invalid HTML that some browsers mis-handle.
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label={r.status === 'burned' ? 'ביטול צריבה' : 'סימון כנצרב'}
                                data-hit-slop
                                className="s-hit flex h-8 w-8 items-center justify-center rounded-full border border-border"
                                onClick={ev => {
                                  ev.stopPropagation();
                                  if (r.status === 'burned') void doUnburn([r]);
                                  else void markBurned([r.meter_id], user).catch((e: any) => toast.error(e?.message || 'השמירה נכשלה'));
                                }}
                                onKeyDown={ev => {
                                  if (ev.key !== 'Enter' && ev.key !== ' ') return;
                                  ev.preventDefault(); ev.stopPropagation();
                                  if (r.status === 'burned') void doUnburn([r]);
                                  else void markBurned([r.meter_id], user).catch((e: any) => toast.error(e?.message || 'השמירה נכשלה'));
                                }}
                              >
                                <Flame className={'h-4 w-4 ' + (r.status === 'burned' ? 'text-[var(--ok-ink)]' : 'text-muted-foreground')} aria-hidden />
                              </span>
                            )
                            : undefined
                        }
                        onClick={() => {
                          if (selectMode) { toggleSelected(r.meter_id); return; }
                          setMeterSheetId(r.meter_id);
                        }}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </SectionBlock>
          );
        })
      )}

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-background px-4 py-3" style={{ boxShadow: 'var(--e2)' }}>
          <span className="text-[13px] font-semibold text-foreground">{selected.size} נבחרו</span>
          <div className="flex gap-2">
            <BubbleButton variant="tonal" size="sm" disabled={!assignEligible} onClick={() => setAssignOpen(true)}>שיבוץ לגנרטור</BubbleButton>
            <BubbleButton variant="primary" size="sm" onClick={() => void bulkBurn()}>סימון כנצרב</BubbleButton>
            <BubbleButton variant="neutral" size="sm" onClick={exitSelect}>ביטול</BubbleButton>
          </div>
        </div>
      )}

      <MeterSheet
        row={meterRow}
        gen={meterGen}
        canWrite={canWrite}
        open={!!meterSheetId}
        onOpenChange={v => { if (!v) setMeterSheetId(null); }}
        onBurn={() => { if (meterRow) void markBurned([meterRow.meter_id], user).then(() => setMeterSheetId(null)).catch((e: any) => toast.error(e?.message || 'השמירה נכשלה')); }}
        onUnburn={() => { if (meterRow) { void doUnburn([meterRow]); setMeterSheetId(null); } }}
        onReportIssue={() => { if (meterRow) { setIssueId(meterRow.meter_id); setMeterSheetId(null); } }}
        onResolveIssue={() => { if (meterRow) void (async () => {
          const { markIssue } = await import('@/lib/burnsData');
          await markIssue(meterRow.meter_id, '');
          setMeterSheetId(null);
        })().catch((e: any) => toast.error(e?.message || 'השמירה נכשלה')); }}
        onAssign={() => { if (meterRow) { setSelected(new Set([meterRow.meter_id])); setMeterSheetId(null); setAssignOpen(true); } }}
      />

      <IssueSheet
        row={issueRow}
        gen={issueRow?.generator_id ? genById.get(issueRow.generator_id) || null : null}
        open={!!issueId}
        onOpenChange={v => { if (!v) setIssueId(null); }}
        onSaved={() => setIssueId(null)}
      />

      {assignEligible && (
        <AssignSheet
          site={selectedRows[0].site}
          meterIds={selectedRows.map(r => r.meter_id)}
          gens={gens}
          user={user}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          onSaved={exitSelect}
        />
      )}

      {canManageGens && <GeneratorsSheet gens={gens} rows={rows} open={gensOpen} onOpenChange={setGensOpen} />}

      <Sheet open={siteSheetOpen} onOpenChange={setSiteSheetOpen}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[80svh] overflow-y-auto">
          <SheetHeader><SheetTitle>קיבוץ</SheetTitle></SheetHeader>
          <div className="-mx-6 mt-2 divide-y divide-border">
            <ListRow title="כל הקיבוצים" onClick={() => { setFilter(f => ({ ...f, site: undefined })); setSiteSheetOpen(false); }} className="px-6" trailing={!filter.site ? <Tag role="neutral">✓</Tag> : null} />
            {sites.map(s => (
              <ListRow key={s} title={s} onClick={() => { setFilter(f => ({ ...f, site: s })); setSiteSheetOpen(false); }} className="px-6" trailing={filter.site === s ? <Tag role="neutral">✓</Tag> : null} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function BurnsPage() {
  return (
    <SigmaProviders>
      <EmsGate>
        <BurnsPageInner />
      </EmsGate>
    </SigmaProviders>
  );
}

export function mountBurnsPage(): boolean {
  return mount('sigma-burns-page', BurnsPage);
}
