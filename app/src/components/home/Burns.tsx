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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
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
  burnChip, burnIssueTask, burnKindLabel, burnStateLabel, burnCounts, burnProgress, burnStripText, burnVisual,
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
export async function markIssue(meterId: string, note: string, emsTaskId?: string): Promise<void> {
  const patch = (note ? issuePatch(note, nowISO()) : clearIssuePatch(nowISO())) as unknown as Record<string, unknown>;
  if (emsTaskId) patch.ems_task_id = emsTaskId;   // db/meter_burns_ems_task.sql — the caller tolerates an older schema
  await patchMeters([meterId], patch);
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
  return <span className={'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ' + tone}>{burnStateLabel(row)}</span>;
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
  // A tap on the row opens its details (עידן 22.9, I1) — the same facts the table page shows.
  const [open, setOpen] = React.useState(false);
  return (
    <div data-testid="burn-row" data-meter={row.meter_id}
         className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-2 last:border-b-0">
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
        {burnKindLabel(row)}
      </span>
      <span role="button" tabIndex={0} aria-expanded={open} onClick={() => setOpen(o => !o)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
            className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[14px] font-bold"><bdi>{row.serial}</bdi>{row.address ? <span className="ms-1.5 text-[12.5px] font-medium text-muted-foreground">{row.address}</span> : null}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {row.solar_names ? '☀️ ' + row.solar_names : 'ללא מערכת מקושרת'}
          {gen ? ' · ⚡ ' + gen.name : ''}
          {row.note ? ' · 📝 ' + row.note : ''}
        </span>
        {!!warn.length && <span className="block text-[11.5px] font-semibold text-destructive">{warn.join(' · ')}</span>}
      </span>
      <StateTag row={row} />
      {open && (
        <dl className="mt-1 grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-muted px-2.5 py-2 text-[12px] [&>dt]:font-bold [&>dt]:text-muted-foreground">
          <dt>סוג</dt><dd>{burnKindLabel(row)} · {row.meter_type}</dd>
          <dt>כתובת</dt><dd>{row.address || '—'}</dd>
          <dt>מערכות</dt><dd>{row.solar_names || '—'}</dd>
          <dt>גנרטור</dt><dd>{gen ? gen.name + (gen.device_serial ? ' (' + gen.device_serial + ')' : '') : 'לא שובץ'}</dd>
          <dt>מונה אב</dt><dd><bdi>{row.parent_serial || '—'}</bdi></dd>
          {row.burned_at && <><dt>נצרב</dt><dd>{new Date(row.burned_at).toLocaleDateString('he-IL')}{row.burned_by ? ' · ' + row.burned_by : ''}</dd></>}
          {row.note && <><dt>הערה</dt><dd>{row.note}</dd></>}
          <dt>EMS</dt><dd><a className="underline" href={'https://sigmatec-ems.com/admin/meters/' + row.meter_id} target="_blank" rel="noopener">פתח ב-EMS ↗</a></dd>
        </dl>
      )}
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
  // A reported problem opens the problem sheet (עידן 22.9, I3), which can also open an EMS
  // fault task with the meter's details on it. Declared with the other hooks — before the
  // early returns below.
  const [issueFor, setIssueFor] = React.useState<BurnRow | null>(null);

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

  const issueOne = (r: BurnRow) => setIssueFor(r);

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

  // Collapsed by default (עידן 22.9, D1): the summary row is what the card shows; the meter
  // list opens on a tap.
  return (
    <Collapsible className="mb-3" data-testid="burns-panel">
      <CollapsibleTrigger asChild>
        <button type="button" data-testid="burns-panel-toggle" className="group mb-1.5 flex w-full items-center gap-1.5 text-start">
          <h4 className="flex-1 text-[14px] font-bold">
            <Flame className="me-1 inline h-3.5 w-3.5 text-[color:var(--sigma-warn-ink)]" />
            צריבות
          </h4>
          <span data-testid="burns-panel-count" className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {counts.pending + counts.issue ? `נותרו ${counts.pending + counts.issue}/${counts.total}` : `הושלם · ${counts.total}`}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>

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
      </CollapsibleContent>
      {issueFor && (
        <BurnIssueSheet
          row={issueFor}
          gen={issueFor.generator_id ? genById.get(issueFor.generator_id) : undefined}
          onClose={() => setIssueFor(null)}
          onSave={async (note, openEms) => {
            const r = issueFor;
            setIssueFor(null);
            await run(async () => {
              await markIssue(r.meter_id, note);
              if (!openEms || !note) return;
              const res = (await sigma.createTask(burnIssueTask(r, note, r.generator_id ? genById.get(r.generator_id) : undefined))) as any;
              if (res && res.error) throw new Error('הבעיה נרשמה, אבל המשימה ב-EMS לא נפתחה: ' + res.error);
              const tid = res && (res.id || res.data?.id);
              if (tid) { try { await markIssue(r.meter_id, note, String(tid)); } catch { /* older schema */ } }
            }, note ? (openEms ? 'הבעיה נרשמה ונפתחה תקלה ב-EMS' : 'הבעיה נרשמה') : 'הבעיה נוקתה');
          }}
        />
      )}
    </Collapsible>
  );
}

/**
 * The problem sheet (22.9, I3): what is wrong, and whether to open an EMS fault task with the
 * meter, its address, its system and its generator already written in.
 */
function BurnIssueSheet({ row, gen, onClose, onSave }: {
  row: BurnRow; gen?: GeneratorRow; onClose: () => void; onSave: (note: string, openEms: boolean) => Promise<void>;
}) {
  const [note, setNote] = React.useState(row.note || '');
  const connected = (() => { try { return !!sigma.isEmsConnected?.(); } catch { return false; } })();
  const [openEms, setOpenEms] = React.useState(connected);
  const [busy, setBusy] = React.useState(false);
  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto p-4 pb-7" data-testid="burn-issue-sheet">
        <SheetHeader className="text-start">
          <SheetTitle className="text-[18px] font-extrabold">בעיה במונה <bdi>{row.serial}</bdi></SheetTitle>
          <SheetDescription>{[burnKindLabel(row), row.address, row.solar_names].filter(Boolean).join(' · ')}</SheetDescription>
        </SheetHeader>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="מה הבעיה?"
          rows={3}
          className="mt-3 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-base outline-none focus:border-[color:var(--brand-1)]"
        />
        <label className="mt-3 flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={openEms} disabled={!connected} onChange={e => setOpenEms(e.target.checked)} />
          לפתוח תקלה ב-EMS{connected ? '' : ' · דורש חיבור ל-EMS'}
        </label>
        {openEms && connected && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            המשימה תכלול את המונה, הכתובת, המערכת{gen ? ' והגנרטור ' + gen.name : ''}.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(note.trim(), openEms && connected); } finally { setBusy(false); } }}
                  className="min-h-[48px] flex-1 rounded-2xl bg-brand-grad text-[15px] font-bold text-white disabled:opacity-60">
            {note.trim() ? 'שמור בעיה' : (row.status === 'issue' ? 'נקה את הבעיה' : 'שמור')}
          </button>
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-2xl border border-border px-4 text-[15px] font-semibold">ביטול</button>
        </div>
      </SheetContent>
    </Sheet>
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
