// #sigma-home — the redesigned card page (spec §2 + §7b + §7c).
//
// This island OWNS the card list. When it mounts it sets `body.sigma-home-ready`, which
// (a) stops js/src/24-kibbutzim.js from rendering its own cards and (b) hides the legacy
// grids + filter chips via css/app.css. If the island never loads, the legacy renderer is
// still there and paints the same cards — that is the offline / broken-bundle fallback.
//
// Legacy decorators (EMS task widget, last visit, customer code, notes) keep running against
// the React cards through `sigma.decorateCards()`, which is why KibbutzCard preserves the
// `.kibbutz[data-name]` + `.kibbutz-name-row` DOM contract.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterChips } from '@/components/home/FilterChips';
import { Section } from '@/components/home/Section';
import { KibbutzSheet } from '@/components/home/KibbutzSheet';
import { mount } from '@/islands';
import { searchMissTarget, track } from '@/lib/track';
import { SigmaProviders } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import {
  canManageKibbutzim, countRows, filterRows, groupBySection,
  type CardFilter, type KibbutzRow,
} from '@/lib/kibbutzim';

const CACHE_KEY = 'kibbutzim_v1';   // shared with the legacy renderer's first paint

async function fetchKibbutzim(): Promise<KibbutzRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('kibbutzim').select('*').is('archived_at', null);
  if (error) throw error;
  return (data || []) as KibbutzRow[];
}

/** Keep the legacy world in sync: window.KIBBUTZIM + the localStorage cache both feed legacy code. */
function publishToLegacy(rows: KibbutzRow[]) {
  (window as any).KIBBUTZIM = rows;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* private mode */ }
}

function HomeIsland() {
  const qc = useQueryClient();
  const { name: user, role } = useCurrentUser();
  const [filter, setFilter] = React.useState<CardFilter>('all');
  const [query, setQuery] = React.useState('');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<KibbutzRow | null>(null);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [prefillName, setPrefillName] = React.useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['kibbutzim'],
    queryFn: fetchKibbutzim,
    // The legacy cache paints instantly; `initialDataUpdatedAt: 0` marks it as already stale
    // so the network answer is fetched right away instead of being suppressed by staleTime.
    initialData: () => {
      try { const raw = localStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) as KibbutzRow[]) : undefined; }
      catch { return undefined; }
    },
    initialDataUpdatedAt: 0,
  });

  const rows = React.useMemo(
    () => (data || []).filter(r => r && r.name && !r.archived_at),
    [data],
  );
  React.useEffect(() => { if (data) publishToLegacy(data as KibbutzRow[]); }, [data]);

  const counts = React.useMemo(() => countRows(rows), [rows]);
  const visible = React.useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const groups = React.useMemo(() => groupBySection(visible), [visible]);
  const shown = { new: groups.new.reduce((n, g) => n + g.rows.length, 0), active: groups.active.reduce((n, g) => n + g.rows.length, 0) };

  const canManage = canManageKibbutzim(user, role === 'viewer');

  // ---- legacy decorators -------------------------------------------------
  // Every re-render replaces cards, so the legacy passes have to re-attach. Debounced to
  // one run per animation frame batch — the passes are idempotent but not free.
  const decorate = React.useCallback(() => {
    const t = setTimeout(() => { try { sigma.decorateCards?.(); } catch (e) { console.warn('[home] decorateCards', e); } }, 60);
    return () => clearTimeout(t);
  }, []);
  React.useEffect(decorate, [visible, decorate]);
  useSigmaEvent('ems-cache-synced', () => { decorate(); });

  // The legacy renderer must not fight us for the grids.
  React.useEffect(() => {
    document.body.classList.add('sigma-home-ready');
    return () => { document.body.classList.remove('sigma-home-ready'); };
  }, []);

  const openCreate = React.useCallback(() => { setEditRow(null); setPrefillName(''); setSheetOpen(true); }, []);
  const openEdit = React.useCallback((r: KibbutzRow) => { setEditRow(r); setPrefillName(''); setSheetOpen(true); }, []);

  // "➕ קיבוץ" in the ⋯ עוד sheet — the phone has no room for a header button.
  React.useEffect(() => {
    if (!canManage) return;
    registerMoreItem({ id: 'new-kibbutz', label: 'קיבוץ חדש', icon: 'Home', group: 'admin', roles: ['idan', 'team'], onSelect: openCreate });
  }, [canManage, openCreate]);

  // `window.sigmaHome` is this island's OWN surface for other islands and for legacy code:
  // openSheet(name) edits that card if it exists and otherwise opens create mode with the
  // name filled in — which is exactly what the import preview's "צור קיבוץ" needs for a
  // kibbutz that appeared in a summary but has no card (docs/integration-map.md).
  React.useEffect(() => {
    if (!canManage) return;
    const api = {
      openSheet(name?: string) {
        const existing = rows.find(r => r.name === name) || null;
        setEditRow(existing);
        setPrefillName(existing ? '' : (name || ''));
        setSheetOpen(true);
      },
    };
    (window as any).sigmaHome = api;
    return () => { if ((window as any).sigmaHome === api) delete (window as any).sigmaHome; };
  }, [canManage, rows]);

  const afterWrite = React.useCallback((name: string | null) => {
    void qc.invalidateQueries({ queryKey: ['kibbutzim'] });
    if (name) { setHighlight(name); setTimeout(() => setHighlight(null), 1200); }
  }, [qc]);

  // ---- 📈 שימוש — the two DEAD-END signals (spec §7j) ---------------------
  // A search that finds nothing, and a sheet opened and abandoned, are the earliest evidence
  // that a UI decision (not motivation) is losing people — adoption §5.2 says check them daily
  // in week 1. Both are deliberately cheap: one event each, never a keystroke log.
  React.useEffect(() => {
    const q = query.trim();
    if (!q || !rows.length || visible.length) return;
    // Debounced: the miss is only interesting once the person STOPPED typing, otherwise every
    // prefix of a real name ("ג", "גב", "גבת") would be logged as a failure.
    // The QUERY IS NEVER SENT (review fix round 1) — only "it found nothing" and its length.
    const t = setTimeout(() => track('search-no-results', searchMissTarget(q)), 900);
    return () => clearTimeout(t);
  }, [query, visible.length, rows.length]);

  // `saved` is a ref, not state: it must survive the same render that closes the sheet.
  const savedRef = React.useRef(false);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (sheetOpen) { savedRef.current = false; wasOpen.current = true; return; }
    if (wasOpen.current && !savedRef.current) track('sheet-dismissed', 'kibbutz-sheet');
    wasOpen.current = false;
  }, [sheetOpen]);

  if (isLoading && !rows.length) {
    return (
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="pb-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <FilterChips filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} counts={counts} />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="hidden min-h-[44px] shrink-0 items-center gap-1.5 self-start rounded-xl bg-brand-grad px-3 text-sm font-bold text-white sm:flex"
          >
            <Plus className="h-4 w-4" /> קיבוץ חדש
          </button>
        )}
      </div>

      {isError && !rows.length && (
        <p className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
          לא ניתן לטעון את רשימת הקיבוצים — בדוק חיבור.
        </p>
      )}

      <Section title="🆕 לקוחות חדשים" groups={groups.new} count={shown.new}
               role={role} canEdit={canManage} highlight={highlight} onEdit={openEdit} />
      <Section title="✅ לקוחות פעילים" groups={groups.active} count={shown.active}
               role={role} canEdit={canManage} highlight={highlight} onEdit={openEdit} />

      {!visible.length && !!rows.length && (
        <p className="p-4 text-center text-sm text-muted-foreground">אין קיבוץ שמתאים לסינון.</p>
      )}

      {canManage && (
        <KibbutzSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          row={editRow}
          prefillName={prefillName}
          allRows={rows}
          user={user}
          onSaved={r => {
            savedRef.current = true;
            if (!editRow && r?.name) track('kibbutz-created', r.name);
            afterWrite(r?.name || null);
          }}
          onArchived={n => {
            savedRef.current = true;   // archiving is a decision, not an abandoned sheet
            afterWrite(null);
            toast.info('הכרטיס הוסר מהעמוד: ' + n);
          }}
        />
      )}
    </div>
  );
}

export function Home() {
  return (
    <SigmaProviders>
      <HomeIsland />
    </SigmaProviders>
  );
}

/** Called from main.tsx's lazy import once #sigma-home is on the page. */
export function mountHome(): boolean {
  return mount('sigma-home', Home);
}
