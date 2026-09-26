// 💻 לוח פיתוח — #sigma-dev-board (D-U1, round 5 package D). React rewrite of the legacy
// `18-dev-tasks.js` board (1033 lines, deleted in D-U3) on the design system: grouped by GitHub
// parent domain → priority (D-L2 `devMeeting.ts`) with a תחומים/שלבים toggle, filters, a "חדש
// השבוע" block, a flow strip and the card detail sheet. Every write still goes through the
// EXISTING `github` Edge Function modes (`lib/devBoard.ts`) — this task adds no new write.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ListTodo, MoreHorizontal, RefreshCw, Rocket, SlidersHorizontal } from 'lucide-react';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ListRow } from '@/components/ui/list-row';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { mount } from '@/islands';
import { SigmaProviders, hasPersistedData, showSkeleton } from '@/lib/query';
import { goBack } from '@/lib/navigate';
import { sigma, useCurrentUser } from '@/bridge';
import { track } from '@/lib/track';
import {
  DEV_BOARD_QUERY_KEY, canDragOrMove, canSeeDevBoard, fetchDevBoard, releaseReview,
} from '@/lib/devBoard';
import { applyDevFilters, groupByDomain, newThisWeek, type DevFilters } from '@/lib/devMeeting';
import { devFlowSegments } from '@/lib/devFlow';
import { fetchStatusLog, logStatuses, type StatusLog } from '@/lib/devStatusLog';
import type { DevCard, DevStage } from '@/lib/sprintPrep';
import { FlowStrip } from '@/islands/dev/FlowStrip';
import { GroupedList } from '@/islands/dev/GroupedList';
import { StageList } from '@/islands/dev/StageList';
import { FiltersSheet, activeFilterCount } from '@/islands/dev/FiltersSheet';
import { CardSheet } from '@/islands/dev/CardSheet';

const VIEW_KEY = 'dev_view_v2';
type ViewMode = 'domains' | 'stages';

function loadView(): ViewMode {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'stages' ? 'stages' : 'domains'; }
  catch { return 'domains'; }
}
function saveView(v: ViewMode): void {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
}

const ymd = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ⋯ — "עלתה גרסה" (review → Committed) and "רענון". A local sheet, not the global ⋯ עוד menu. */
function MoreSheet({ open, onOpenChange, onRefresh, onRelease, canRelease }: {
  open: boolean; onOpenChange: (v: boolean) => void; onRefresh: () => void; onRelease: () => void; canRelease: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="dev-more-sheet">
        <SheetHeader className="text-start"><SheetTitle>עוד</SheetTitle></SheetHeader>
        <div className="-mx-4 flex flex-col divide-y divide-border">
          <ListRow
            leading={<RefreshCw className="h-5 w-5" aria-hidden />}
            title="רענון"
            onClick={() => { onOpenChange(false); onRefresh(); }}
          />
          {canRelease && (
            <ListRow
              leading={<Rocket className="h-5 w-5" aria-hidden />}
              title="עלתה גרסה"
              meta="כל הכרטיסים בשלבי בדיקות עוברים לעלה לאוויר"
              onClick={() => { onOpenChange(false); onRelease(); }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DevBoardPage() {
  const { name: user, isViewer } = useCurrentUser();
  const qc = useQueryClient();
  const allowed = canSeeDevBoard();
  const canMove = canDragOrMove(user) && !isViewer;

  const board = useQuery({
    queryKey: DEV_BOARD_QUERY_KEY('open'),
    queryFn: () => fetchDevBoard('open'),
    enabled: allowed,
    retry: false,
  });
  const cards = React.useMemo(() => board.data || [], [board.data]);
  const numbers = React.useMemo(() => cards.map(c => c.number), [cards]);

  const log = useQuery({
    queryKey: ['gh', 'statusLog', numbers.length],
    queryFn: () => fetchStatusLog(numbers),
    enabled: allowed && numbers.length > 0,
    staleTime: 60_000,
  });
  const statusLog: StatusLog = log.data || {};

  // "logStatuses(cards, today) runs once per session after a successful load" — a ref-gated
  // effect, not a query-fired side effect, so it survives a background refetch without re-firing.
  const logged = React.useRef(false);
  React.useEffect(() => {
    if (logged.current || !cards.length) return;
    logged.current = true;
    void logStatuses(cards, ymd());
  }, [cards]);

  const [view, setView] = React.useState<ViewMode>(loadView);
  const changeView = (v: ViewMode) => { setView(v); saveView(v); };

  const [filters, setFilters] = React.useState<DevFilters>({});
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [openCard, setOpenCard] = React.useState<DevCard | null>(null);
  const [releasing, setReleasing] = React.useState(false);

  const now = Date.now();
  const filtered = React.useMemo(() => applyDevFilters(cards, filters, now), [cards, filters, now]); // eslint-disable-line react-hooks/exhaustive-deps
  // groupByDomain resolves each card's domain by looking its `parent` number up in the list it
  // is given — so it needs the FULL board (parents included) to resolve anything, never the
  // already-filtered rows (which have every Main Fields parent stripped out already). The
  // filter is applied AFTER grouping instead: keep only the qualifying issue numbers inside
  // each tier, then drop tiers/domains left with nothing in them.
  const groups = React.useMemo(() => {
    const keep = new Set(filtered.map(c => c.number));
    return groupByDomain(cards)
      .map(g => ({
        ...g,
        tiers: g.tiers
          .map(t => ({ ...t, cards: t.cards.filter(c => keep.has(c.number)) }))
          .filter(t => t.cards.length > 0),
      }))
      .filter(g => g.tiers.length > 0)
      .map(g => ({ ...g, count: g.tiers.reduce((n, t) => n + t.cards.length, 0) }));
  }, [cards, filtered]);
  const week = React.useMemo(() => newThisWeek(cards, now), [cards, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const segments = React.useMemo(() => devFlowSegments(cards), [cards]);
  const assignees = React.useMemo(
    () => Array.from(new Set(cards.map(c => c.assignee).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'he')),
    [cards],
  );

  const refresh = React.useCallback(() => {
    track('dev-board-refresh');
    void board.refetch();
  }, [board]);

  const stageClick = (stage: DevStage) => {
    setFilters(f => ({ ...f, stage: f.stage === stage ? undefined : stage }));
    if (view !== 'stages') changeView('stages');
  };

  const openCardSheet = (c: DevCard) => { setOpenCard(c); track('dev-board-open-card'); };

  const toggleSelect = (n: number) => {
    setSelected(s => { const next = new Set(s); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  };

  const moveSelectionToSprint = async () => {
    const { setStatus, STAGE_TARGET } = await import('@/lib/devBoard');
    try {
      await setStatus(Array.from(selected), STAGE_TARGET.ready);
      toast.success('הכרטיסים הועברו לספרינט הקרוב');
      setSelected(new Set());
      setSelectMode(false);
      void board.refetch();
    } catch (e: any) { toast.error(e?.message || 'לא הצלחתי להעביר'); }
  };

  const doRelease = async () => {
    setReleasing(true);
    try {
      const { updated } = await releaseReview(cards);
      if (updated.length) toast.success(updated.length + ' כרטיסים עלו לאוויר');
      else toast.info('אין כרטיסים בשלבי בדיקות');
      void board.refetch();
    } catch (e: any) { toast.error(e?.message || 'לא הצלחתי לעדכן'); }
    finally { setReleasing(false); }
  };

  if (!allowed) return <p className="p-4 text-[14px] text-muted-foreground">העמוד הזה לא זמין למשתמש הזה.</p>;

  const cached = hasPersistedData(DEV_BOARD_QUERY_KEY('open'));
  if (board.isLoading && showSkeleton(cards.length > 0, cached)) {
    return (
      <div className="flex flex-col gap-3 px-[var(--page-gutter)] py-4">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-[var(--r-lg)]" />)}
      </div>
    );
  }

  const showErrorOverCache = board.isError;
  const filterCount = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-3 px-[var(--page-gutter)] pb-6" data-testid="dev-board-page">
      <PageActionRow
        title="פיתוח"
        onBack={goBack}
        actions={
          <>
            <span className="relative inline-flex">
              <BubbleButton
                variant="icon"
                icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
                aria-label={'סינון' + (filterCount ? ' · ' + filterCount + ' פעילים' : '')}
                data-testid="dev-filters-open"
                onClick={() => setFiltersOpen(true)}
              />
              {filterCount > 0 && (
                <span
                  data-testid="dev-filters-badge"
                  className="pointer-events-none absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sigma-ink)] px-1 text-[10px] font-bold text-[hsl(var(--card))]"
                >
                  <bdi>{filterCount}</bdi>
                </span>
              )}
            </span>
            <BubbleButton
              variant="icon"
              icon={<MoreHorizontal className="h-5 w-5" aria-hidden />}
              aria-label="עוד"
              data-testid="dev-more-open"
              onClick={() => setMoreOpen(true)}
            />
          </>
        }
      />

      <SegmentedControl
        options={[{ value: 'domains', label: 'תחומים' }, { value: 'stages', label: 'שלבים' }]}
        value={view}
        onChange={changeView}
      />

      {segments.length > 0 && <FlowStrip segments={segments} activeStage={filters.stage} onStageClick={stageClick} />}

      {showErrorOverCache && (
        <div data-testid="dev-board-error" className="rounded-[var(--r-lg)] border border-border bg-card p-3 text-[14px]">
          <p className="mb-2 font-semibold text-foreground">לא הצלחנו לטעון את לוח הפיתוח.</p>
          <BubbleButton variant="tonal" size="sm" onClick={refresh}>ניסיון נוסף</BubbleButton>
        </div>
      )}

      {canMove && (
        <div className="flex items-center gap-2">
          <BubbleButton
            variant={selectMode ? 'primary' : 'neutral'}
            size="sm"
            data-testid="dev-select-toggle"
            onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
          >
            בחירה
          </BubbleButton>
        </div>
      )}

      {!filtered.length && !week.length ? (
        <EmptyState
          icon={<ListTodo />}
          title={filterCount ? 'אין כרטיסים שתואמים לסינון.' : 'אין כרטיסים פתוחים.'}
          hint={filterCount ? undefined : 'כרטיס חדש יופיע כאן.'}
          action={filterCount ? { label: 'ניקוי סינון', onClick: () => setFilters({}) } : undefined}
        />
      ) : view === 'domains' ? (
        <GroupedList
          groups={groups}
          newThisWeek={filterCount ? [] : week}
          onOpen={openCardSheet}
          selectMode={selectMode}
          selected={selected}
          onToggle={toggleSelect}
        />
      ) : (
        <StageList cards={filtered} onOpen={openCardSheet} selectMode={selectMode} selected={selected} onToggle={toggleSelect} />
      )}

      {selectMode && selected.size > 0 && (
        <footer className="sticky bottom-2 z-10 flex items-center justify-between gap-2 rounded-[var(--r-lg)] border border-border bg-card p-3" style={{ boxShadow: 'var(--e1)' }}>
          <span className="text-[13px] font-semibold text-muted-foreground"><bdi>{selected.size} נבחרו</bdi></span>
          <BubbleButton variant="primary" size="sm" data-testid="dev-selection-move" onClick={() => void moveSelectionToSprint()}>
            העברה לספרינט ({selected.size})
          </BubbleButton>
        </footer>
      )}

      <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} assignees={assignees} onApply={setFilters} />
      <MoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        onRefresh={refresh}
        onRelease={() => void doRelease()}
        canRelease={canMove && !releasing}
      />
      <CardSheet
        card={openCard}
        statusLog={statusLog}
        canMove={canMove}
        onOpenChange={v => { if (!v) setOpenCard(null); }}
        onChanged={() => { void qc.invalidateQueries({ queryKey: DEV_BOARD_QUERY_KEY('open') }); }}
      />
    </div>
  );
}

export function DevBoard() {
  return <SigmaProviders><DevBoardPage /></SigmaProviders>;
}

export function mountDevBoard(): boolean {
  // D-U3: one-time cleanup of the retired 18-dev-tasks.js's own keys — dead weight now that
  // nothing reads them, and `dev_view` (a bare 'columns'/'domains' string) would otherwise be
  // mistaken for this page's own `dev_view_v2` (an object) by anything scanning old keys.
  try { localStorage.removeItem('dev_tasks_cache_v1'); localStorage.removeItem('dev_view'); } catch { /* private mode */ }
  return mount('sigma-dev-board', DevBoard);
}
