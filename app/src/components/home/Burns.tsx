// 🔥 צריבות inside 2.00 (Task 23) — the three React surfaces of the temporary meter-burn
// project, all reading the SAME `meter_burns` table through one TanStack key:
//
//   1. <BurnChip>     the kibbutz card's `🔥 נותרו X/Y`, gone the moment X hits 0
//   2. <BurnsPanel>   the card modal's "🔥 צריבות" section — the per-site list with
//                     ✅ נצרב / ⚠ בעיה / ⚡ גנרטור and multi-select
//   3. <BurnsStrip>   the landing strip — work for the field team, progress for everyone else
//
// The briefing's "לפני שיוצאים" rows (surface 4) are built by lib/burns.ts and rendered by
// islands/Field.tsx, which calls `markBurned` from here when one is ticked.
//
// Every write goes through `sbWrite` (so a lapsed pass is re-minted once) and ends by
// invalidating the shared key + emitting `burns-changed`, which is what makes the chip, the
// modal section, the briefing and the strip agree without knowing about each other
// (docs/integration-map.md). The full table (js/src/24-meter-burns.js) listens too.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Flame } from 'lucide-react';
import { sigma, sigmaBus, useCurrentUser } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import { roleOf } from '@/lib/landing';
import { track } from '@/lib/track';
import {
  BURN_VISUAL_LABEL, burnChip, burnCounts, burnProgress, burnStripText, burnVisual,
  burnWarnings, burnedPatch, burnsForSite, burnSitesWithPending, canSeeBurns, canWriteBurns,
  clearIssuePatch, generatorPatch, generatorsForSite, issuePatch, unburnedPatch,
  type BurnRow, type GeneratorRow,
} from '@/lib/burns';

export const BURNS_QUERY_KEY = ['meterBurns'] as const;
export const GENERATORS_QUERY_KEY = ['burnGenerators'] as const;
/** The bus event every burns write emits (docs/integration-map.md). */
export const BURNS_CHANGED = 'burns-changed' as const;

export async function fetchBurns(): Promise<BurnRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('meter_burns').select('*').order('site').order('serial');
  if (error) throw error;
  return (data || []) as BurnRow[];
}

async function fetchGenerators(): Promise<GeneratorRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('generators').select('*').order('site').order('name');
  if (error) throw error;
  return (data || []) as GeneratorRow[];
}

// One listener per PAGE, at module scope — a listener per component would mean one per card.
let listening = false;
function listenForBurnChanges(): void {
  if (listening || !sigmaBus) return;
  listening = true;
  sigmaBus.addEventListener(BURNS_CHANGED, () => {
    void queryClient.invalidateQueries({ queryKey: BURNS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: GENERATORS_QUERY_KEY });
  });
}

export function emitBurnsChanged(detail?: Record<string, unknown>): void {
  try { sigmaBus?.dispatchEvent(new CustomEvent(BURNS_CHANGED, { detail })); } catch { /* no bus */ }
}

/**
 * The rows, shared by every surface. `enabled` is the gate: someone who may not see the
 * project never issues the query at all, so the temporary table costs a dev phone nothing.
 */
export function useBurns(enabled = true) {
  React.useEffect(listenForBurnChanges, []);
  return useQuery({ queryKey: BURNS_QUERY_KEY, queryFn: fetchBurns, enabled });
}

export function useBurnGenerators(enabled = true) {
  return useQuery({ queryKey: GENERATORS_QUERY_KEY, queryFn: fetchGenerators, enabled });
}

/** "May I see / write צריבות?" — the one place the components ask. */
export function useBurnAccess(): { user: string; canSee: boolean; canWrite: boolean; role: string } {
  const { name: user, role, isViewer } = useCurrentUser();
  return {
    user,
    role: roleOf(user, role),
    canSee: canSeeBurns(user, isViewer),
    canWrite: canWriteBurns(user, isViewer),
  };
}

// ───────────────────────────── writes ─────────────────────────────

async function patchMeters(ids: string[], patch: Record<string, unknown>): Promise<void> {
  if (!ids.length) return;
  const sb = await getSupabase();
  await sbWrite(() => sb.from('meter_burns').update(patch).in('meter_id', ids).select('meter_id') as any);
  emitBurnsChanged({ meters: ids.length });
}

const nowISO = () => new Date().toISOString();

/** ✅ נצרב — also the write the briefing's checklist row performs when it is ticked. */
export async function markBurned(meterIds: string[], user: string): Promise<void> {
  await patchMeters(meterIds, burnedPatch(user, nowISO()) as unknown as Record<string, unknown>);
}
export async function markUnburned(meterIds: string[]): Promise<void> {
  await patchMeters(meterIds, unburnedPatch(nowISO()) as unknown as Record<string, unknown>);
}
export async function markIssue(meterId: string, note: string): Promise<void> {
  await patchMeters([meterId], (note ? issuePatch(note, nowISO()) : clearIssuePatch(nowISO())) as unknown as Record<string, unknown>);
}
export async function assignGenerator(meterIds: string[], generatorId: string | null): Promise<void> {
  await patchMeters(meterIds, generatorPatch(generatorId, nowISO()) as unknown as Record<string, unknown>);
}

/** Pick an existing generator of this kibbutz by name, or create it. Never crosses a site. */
export async function ensureGenerator(site: string, name: string, gens: GeneratorRow[], user: string): Promise<GeneratorRow> {
  const hit = generatorsForSite(gens, site).find(g => g.name === name);
  if (hit) return hit;
  const sb = await getSupabase();
  const row = await sbWrite<GeneratorRow>(() =>
    sb.from('generators').upsert({ site, name, created_by: user }, { onConflict: 'site,name' }).select('*').single() as any);
  emitBurnsChanged({ generator: name });
  return (row || { id: '', site, name }) as GeneratorRow;
}

// ───────────────────── 1. the card chip ─────────────────────

/**
 * `🔥 נותרו X/Y` on the kibbutz card. Rendered only while X > 0 — a temporary project must
 * disappear from a card it has finished with, not leave a stale "0/30" behind (plan point 1).
 * Tapping it opens the card modal's צריבות section, which is where the meters are.
 */
export function BurnChip({ kibbutz }: { kibbutz: string }) {
  const { canSee } = useBurnAccess();
  const { data } = useBurns(canSee);
  const chip = canSee ? burnChip(data, kibbutz) : null;
  if (!chip) return null;
  return (
    <button
      type="button"
      data-testid="burn-chip"
      data-burn-remaining={chip.remaining}
      title="צריבות שנותרו בקיבוץ הזה"
      onClick={e => { e.stopPropagation(); track('burn-chip-open', kibbutz); openBurnsFor(kibbutz); }}
      className="tag-burn rounded-full bg-[color:var(--sigma-warn)]/15 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--sigma-warn-ink)]"
    >
      {chip.text}
    </button>
  );
}

/** Open the kibbutz modal on the card whose צריבות someone wants to see. */
function openBurnsFor(kibbutz: string): void {
  try { sigma.openKibbutzModal?.(kibbutz, 'meetings'); } catch { /* the legacy modal is not there */ }
}

// ───────────────────── 2. the card-modal section ─────────────────────

function StateTag({ row }: { row: BurnRow }) {
  const v = burnVisual(row);
  const tone = v === 'burned' ? 'bg-[color:var(--brand-2)]/15 text-foreground'
    : v === 'burned-ct' ? 'bg-primary/15 text-foreground'
    : v === 'issue' ? 'bg-destructive/15 text-destructive'
    : 'bg-muted text-muted-foreground';
  return <span className={'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ' + tone}>{BURN_VISUAL_LABEL[v]}</span>;
}

function MeterRow({
  row, gen, selected, canWrite, onSelect, onToggleBurn, onIssue,
}: {
  row: BurnRow;
  gen?: GeneratorRow;
  selected: boolean;
  canWrite: boolean;
  onSelect: (on: boolean) => void;
  onToggleBurn: () => void;
  onIssue: () => void;
}) {
  const warn = burnWarnings(row);
  const burned = row.status === 'burned';
  return (
    <div data-testid="burn-row" data-meter={row.meter_id}
         className="flex items-center gap-2 border-b border-border px-2 py-2 last:border-b-0">
      {canWrite && (
        <input
          type="checkbox"
          aria-label={'בחר מונה ' + row.serial}
          checked={selected}
          onChange={e => onSelect(e.currentTarget.checked)}
          className="h-[22px] w-[22px] shrink-0 accent-[color:var(--brand-2)]"
        />
      )}
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
        {row.meter_type === 'E360CT'
          ? '🧲 CT' + (row.ct_ratio && Number(row.ct_ratio) !== 1 ? ' ×' + Number(row.ct_ratio) : '')
          : '🔌 ' + String(row.meter_type || '').replace('E360', '')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold"><bdi>{row.serial}</bdi>{row.address ? <span className="ms-1.5 text-[12.5px] font-medium text-muted-foreground">{row.address}</span> : null}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {row.solar_names ? '☀️ ' + row.solar_names : 'ללא מערכת מקושרת'}
          {gen ? ' · ⚡ ' + gen.name : ''}
          {row.note ? ' · 📝 ' + row.note : ''}
        </span>
        {!!warn.length && <span className="block text-[11.5px] font-semibold text-destructive">{warn.join(' · ')}</span>}
      </span>
      <StateTag row={row} />
      {canWrite && (
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            data-testid="burn-toggle"
            onClick={onToggleBurn}
            className={'min-h-[40px] rounded-lg px-2.5 text-[12px] font-bold ' +
              (burned ? 'border border-border text-muted-foreground' : 'bg-brand-grad text-white')}
          >
            {burned ? '↩ בטל' : '✅ נצרב'}
          </button>
          <button
            type="button"
            title="דווח בעיה"
            onClick={onIssue}
            className="min-h-[40px] rounded-lg border border-border px-2 text-[12px] font-bold"
          >
            ⚠
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * The kibbutz modal's "🔥 צריבות" section (plan point 2): this kibbutz's meters, re-skinned
 * with the 2.00 card components, with multi-select for the 10–30 meters a field day covers.
 * Read-only for the viewer — the buttons are simply not rendered.
 */
export function BurnsPanel({ kibbutz }: { kibbutz: string }) {
  const { user, canSee, canWrite } = useBurnAccess();
  const { data, isLoading } = useBurns(canSee);
  const { data: gens } = useBurnGenerators(canSee);
  const [sel, setSel] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);

  const rows = React.useMemo(() => burnsForSite(data, kibbutz), [data, kibbutz]);
  const counts = React.useMemo(() => burnCounts(rows), [rows]);
  const genById = React.useMemo(() => new Map((gens || []).map(g => [g.id, g])), [gens]);
  React.useEffect(() => { setSel({}); }, [kibbutz]);

  if (!canSee || !kibbutz) return null;
  if (isLoading && !rows.length) return null;
  if (!rows.length) return null;                       // no meters here — no section at all

  const selectedIds = Object.keys(sel).filter(id => sel[id]);
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setSel({}); }
    catch (e) { toast.error((e as Error)?.message || 'השמירה נכשלה'); }
    setBusy(false);
  };

  const toggleOne = (r: BurnRow) => {
    if (r.status === 'burned') {
      if (!confirm('לבטל את סימון הצריבה של מונה ' + r.serial + '?')) return;
      void run(() => markUnburned([r.meter_id]), 'הסימון בוטל');
      return;
    }
    track('burn-marked', kibbutz);
    void run(() => markBurned([r.meter_id], user), '✅ ' + r.serial + ' סומן כנצרב');
  };

  const issueOne = (r: BurnRow) => {
    const note = prompt('מה הבעיה במונה ' + r.serial + '?', r.note || '');
    if (note === null) return;
    void run(() => markIssue(r.meter_id, note.trim()), note.trim() ? 'הבעיה נרשמה' : 'הבעיה נוקתה');
  };

  const burnSelected = () => {
    if (!selectedIds.length) return;
    if (!confirm('לסמן ' + selectedIds.length + ' מונים ב' + kibbutz + ' כנצרבו?')) return;
    track('burn-marked-bulk', kibbutz);
    void run(() => markBurned(selectedIds, user), '✅ ' + selectedIds.length + ' מונים סומנו כנצרבו');
  };

  const assignSelected = () => {
    if (!selectedIds.length) return;
    const name = prompt('שם הגנרטור ב' + kibbutz + ' (ריק = הסרת שיבוץ):',
      generatorsForSite(gens, kibbutz)[0]?.name || '');
    if (name === null) return;
    const trimmed = name.trim();
    void run(async () => {
      const g = trimmed ? await ensureGenerator(kibbutz, trimmed, gens || [], user) : null;
      await assignGenerator(selectedIds, g?.id || null);
    }, trimmed ? '⚡ שובצו תחת ' + trimmed : 'השיבוץ הוסר');
  };

  return (
    <div className="mb-3" data-testid="burns-panel">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <h4 className="flex-1 text-[14px] font-bold">
          <Flame className="me-1 inline h-3.5 w-3.5 text-[color:var(--sigma-warn-ink)]" />
          צריבות · {kibbutz}
        </h4>
        <span data-testid="burns-panel-count" className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {counts.pending + counts.issue ? `נותרו ${counts.pending + counts.issue}/${counts.total}` : `הושלם · ${counts.total}`}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">פרויקט זמני</span>
      </div>

      {canWrite && !!selectedIds.length && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted px-2.5 py-1.5 text-[12px] font-semibold">
          <span className="flex-1">{selectedIds.length} נבחרו</span>
          <button type="button" disabled={busy} onClick={burnSelected}
                  className="min-h-[36px] rounded-lg bg-brand-grad px-2.5 text-[12px] font-bold text-white">✅ סמן כנצרבו</button>
          <button type="button" disabled={busy} onClick={assignSelected}
                  className="min-h-[36px] rounded-lg border border-border px-2.5 text-[12px] font-bold">⚡ שבץ לגנרטור</button>
          <button type="button" onClick={() => setSel({})}
                  className="min-h-[36px] rounded-lg px-2 text-[12px] font-bold text-muted-foreground">✖</button>
        </div>
      )}

      <div className="rounded-[14px] border border-border bg-card">
        {rows.map(r => (
          <MeterRow
            key={r.meter_id}
            row={r}
            gen={r.generator_id ? genById.get(r.generator_id) : undefined}
            selected={!!sel[r.meter_id]}
            canWrite={canWrite && !busy}
            onSelect={on => setSel(s => ({ ...s, [r.meter_id]: on }))}
            onToggleBurn={() => toggleOne(r)}
            onIssue={() => issueOne(r)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => openBurnsTable()}
        className="mt-1.5 text-[12px] font-bold text-muted-foreground underline underline-offset-2"
      >
        כל הצריבות, הדוח והגנרטורים ›
      </button>
    </div>
  );
}

/** The one screen the whole project's table, Excel and generators helper live on. */
export function openBurnsTable(): void {
  track('burn-table-open');
  try { sigma.showPage('burns'); } catch { /* the page is not in this build */ }
}

// ───────────────────── 3. the landing strip ─────────────────────

/**
 * `🔥 צריבות — נותרו N ב-M קיבוצים` above the cards for the field team, and the same strip
 * as a PROGRESS summary for everyone else (עידן 18.9 21:50 — it is not only a field surface).
 * Hidden at N = 0, hidden for anyone outside the project's audience, and hidden entirely
 * when the project flag is off.
 *
 * Tapping it filters the cards to the kibbutzim that still have pending burns; tapping the
 * ⋯ link opens the full table.
 */
export function BurnsStrip() {
  const { canSee, role } = useBurnAccess();
  const { data } = useBurns(canSee);
  const [filtered, setFiltered] = React.useState(false);
  const progress = React.useMemo(() => burnProgress(data), [data]);
  const text = canSee ? burnStripText(progress, role === 'field' ? 'field' : 'other') : '';

  // The filter is applied to the LEGACY card DOM (which React owns but legacy decorates), the
  // same way the home island's own chips hide cards: a `data-burn-filter` attribute on <body>
  // plus a class on the cards that are out of scope. Undone on unmount and on a second tap,
  // so nobody can get stuck looking at four cards.
  const apply = React.useCallback((on: boolean) => {
    const names = new Set(burnSitesWithPending(data));
    document.querySelectorAll<HTMLElement>('.kibbutz[data-name]').forEach(card => {
      const off = on && !names.has(String(card.dataset.name || '').trim());
      card.classList.toggle('burn-filtered-out', off);
    });
    document.body.classList.toggle('burn-filter-on', on);
  }, [data]);

  React.useEffect(() => { if (filtered) apply(true); }, [filtered, apply]);
  React.useEffect(() => () => apply(false), [apply]);

  if (!text) return null;

  return (
    <div data-testid="burns-strip" className="mb-2.5 flex items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2.5">
      <button
        type="button"
        data-testid="burns-strip-filter"
        aria-pressed={filtered}
        onClick={() => { const next = !filtered; setFiltered(next); apply(next); track(next ? 'burn-filter-on' : 'burn-filter-off'); }}
        className="flex min-h-[40px] flex-1 items-center gap-2 text-start text-[14px] font-bold"
      >
        <Flame className="h-4 w-4 shrink-0 text-[color:var(--sigma-warn-ink)]" />
        <span className="flex-1">{text.replace(/^🔥\s*/, '')}</span>
        {filtered && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">מסונן</span>}
      </button>
      <span aria-hidden className="h-6 w-px bg-border" />
      <div className="flex-none">
        <div className="h-1.5 w-[72px] overflow-hidden rounded-full bg-muted">
          <i data-testid="burns-strip-bar" style={{ width: progress.pct + '%' }} className="block h-full bg-brand-grad" />
        </div>
        <button type="button" onClick={openBurnsTable}
                className="mt-1 block w-full text-[11px] font-bold text-muted-foreground underline underline-offset-2">
          הכול ›
        </button>
      </div>
    </div>
  );
}
