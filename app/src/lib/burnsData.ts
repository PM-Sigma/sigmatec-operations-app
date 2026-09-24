// 🔥 צריבות data layer (G-L2) — queries, writes, undo and the EMS live refresh. Moved out of
// components/home/Burns.tsx (which now re-exports these) so the full table (G-U2) and any
// future surface can import plain data functions without pulling in a component file.
//
// Every write ends by invalidating the shared TanStack key + emitting `burns-changed`, which
// is what makes the chip, the modal section, the briefing, the strip and the full table agree
// without knowing about each other (docs/integration-map.md).
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { sigmaBus } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import { emsGateway } from '@/lib/ems/gateway';
import {
  burnedPatch, clearIssuePatch, emsHitLines, emsToBurnRows, generatorPatch, generatorsForSite,
  issuePatch, unburnedPatch, type BurnRow, type GeneratorRow,
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

export async function fetchGenerators(): Promise<GeneratorRow[]> {
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
  if (emsTaskId) patch.ems_task_id = emsTaskId;   // db/meter_burns_ems_task.sql — tolerates an older schema
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

/**
 * ↩ בטל צריבה, with a way back (G-R4: no confirm dialog — the caller shows a 5 s undo toast
 * instead). The undo restores the row's OWN prior status/burned_by/burned_at — review focus
 * #3: not "burned now by me", the exact patch that was overwritten.
 */
export async function unburnWithUndo(rows: BurnRow[]): Promise<{ undo: () => Promise<void> }> {
  const restore = rows.map(r => ({ id: r.meter_id, patch: { status: r.status, burned_by: r.burned_by ?? null, burned_at: r.burned_at ?? null } }));
  await patchMeters(rows.map(r => r.meter_id), unburnedPatch(nowISO()) as unknown as Record<string, unknown>);
  return {
    undo: async () => {
      for (const x of restore) await patchMeters([x.id], { ...x.patch, updated_at: nowISO() });
    },
  };
}

/** The generator's own meter/controller serial — saved on blur (G-U2 `GeneratorsSheet`). */
export async function saveGeneratorSerial(id: string, serial: string): Promise<void> {
  const sb = await getSupabase();
  const value = serial.trim() || null;
  await sbWrite(() => sb.from('generators').update({ device_serial: value }).eq('id', id).select('id') as any);
}

// ───────────────────────────── EMS live refresh (spec §7, review focus #2) ─────────────────────────────
//
// The seed is only the bootstrap: opening the burns page (per device, ≥12h apart) and a manual
// refresh pull the current generation meters straight from the EMS and upsert the EMS-owned
// columns by meter_id. Tracking columns (status/burned_*/generator_id/note) are never in the
// payload, so they survive; new meters arrive as 'pending'.
const SYNC_KEY = 'burn_ems_synced_v1';          // same key as the legacy page: no refresh burst on release day
const TWELVE_H = 12 * 3600e3;
const PAGE = 200;
const MAX_PAGES = 25;
const ROLES = [20, 21, 22, 23, 24];

/** Walk pages of up to `PAGE` items (`fetchPage(0)`, `fetchPage(1)`, …) until a short page or
 *  `MAX_PAGES`, exactly what the legacy `burnEmsAll` did for both `/meters` and `/solars`. */
async function pageAll(fetchPage: (page: number) => Promise<any[]>): Promise<any[]> {
  const out: any[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = await fetchPage(p);
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export async function refreshBurnsFromEms(
  { now = Date.now(), force = false }: { now?: number; force?: boolean } = {},
): Promise<{ ran: boolean; upserted: number; skipped: number }> {
  let last = 0;
  try { last = Number(localStorage.getItem(SYNC_KEY)) || 0; } catch { /* private mode */ }
  // `last` truthy = a real prior sync to throttle against; never-synced (0) always runs — the
  // legacy page relied on the same fact via a huge real-epoch gap, but a deterministic test
  // needs it explicit.
  if (!force && last && now - last < TWELVE_H) return { ran: false, upserted: 0, skipped: 0 };

  const gw = emsGateway();
  const [meters, solars] = await Promise.all([
    pageAll(p => gw.listMetersByRole(ROLES, p, PAGE)),
    pageAll(p => gw.listSolars(p, PAGE)),
  ]);
  const { rows, skipped } = emsToBurnRows(meters, solars);
  // Never stamp a sync (and never upsert) on an empty answer — an EMS hiccup that returns
  // nothing must not look like "0 meters left to burn", and must be retried on the next open
  // rather than waiting out the full 12 h (mirrors the legacy `burnRefreshFromEmsRun` throw).
  if (!rows.length) throw new Error('ה-EMS החזיר 0 מוני ייצור E360, לא עודכן דבר');
  const sb = await getSupabase();
  await sbWrite(() => sb.from('meter_burns').upsert(rows, { onConflict: 'meter_id' }).select('meter_id') as any);
  try { localStorage.setItem(SYNC_KEY, String(now)); } catch { /* ignore */ }
  emitBurnsChanged({ source: 'ems' });
  return { ran: true, upserted: rows.length, skipped };
}

/** EMS `/meters?search=` for the generator picker (`AssignSheet`, G-U2). */
export async function searchEmsMeters(q: string): Promise<Array<{ serial: string; label: string }>> {
  const hits = await emsGateway().searchMeters(q, 5);
  return emsHitLines(hits);
}
