// 🗓️ יומן — the calendar's reads and writes (round 5 · C). The decisions live in calendar.ts;
// this file only moves them to Supabase / EMS. Every write goes through `CalendarIo`, so the
// order and the failure handling are tested with a fake (calendarData.test.ts) and never need
// a browser. Supabase and the bridge are imported lazily: importing this file has no effects.
import {
  canPlanDay, canPlanFor, stopsOrder, stopsPayload,
  type BlockPick, type CalendarAbilities, type InternalDuePatch, type TaskPatch,
} from './calendar';

export interface CalendarIo {
  upsertPlan(person: string, date: string, stops: string[], due: Record<string, string[]>): Promise<void>;
  patchEms(patches: TaskPatch[]): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }>;
  patchInternal(patches: InternalDuePatch[]): Promise<{ failed: string[] }>;
}

/**
 * What `applyBlockPick`/`undoBlockPick` need to check the write for themselves (audit fix —
 * the UI already checks `canPlanFor`/`canPlanDay` before offering the button, but this is the
 * actual write boundary and must never trust a caller that skipped, or got, that check wrong).
 */
export interface PlanGuard { me: string; today: string; can: CalendarAbilities }

function assertCanPlan(person: string, date: string, guard: PlanGuard): void {
  if (!canPlanFor(guard.me, person, guard.can) || !canPlanDay(date, guard.today)) {
    throw new Error('אין הרשאה לתכנן את היום הזה');
  }
}

export async function readPlan(person: string, date: string): Promise<string[]> {
  if (!person || !date) return [];
  try {
    const { getSupabase } = await import('./supabase');
    const sb = await getSupabase();
    const { data } = await sb.from('day_plans').select('stops').eq('person', person).eq('date', date).maybeSingle();
    return stopsOrder((data as any)?.stops);
  } catch { return []; }
}

export const defaultIo: CalendarIo = {
  async upsertPlan(person, date, stops, due) {
    const { sbWrite } = await import('./supabase');
    await sbWrite(sb => sb.from('day_plans')
      .upsert({ person, date, stops: stopsPayload(stops, due), updated_at: new Date().toISOString() },
        { onConflict: 'person,date' })
      .select('stops').maybeSingle());
    // The arrival sheet reads the same row (spec §5.1) — tell it without a reload.
    try { (window as any).sigmaEmit?.('dayplan-changed', { person, date }); } catch { /* no bus */ }
  },
  async patchEms(patches) {
    if (!patches.length) return { ok: 0, failed: [] };
    const { sigma } = await import('@/bridge');
    if (!sigma.emsPatchTasks) return { ok: 0, failed: patches.map(p => ({ id: p.id, error: 'EMS לא מחובר' })) };
    return sigma.emsPatchTasks(patches);
  },
  async patchInternal(patches) {
    const failed: string[] = [];
    if (!patches.length) return { failed };
    const { sbWrite } = await import('./supabase');
    for (const p of patches) {
      try {
        await sbWrite(sb => sb.from('internal_tasks').update({ due_date: p.due_date }).eq('id', p.id).select('id').single());
      } catch { failed.push(p.id); }
    }
    return { failed };
  },
};

/** The day's `task_ids` snapshot, with the tasks this pick just put there. */
function withPicked(due: Record<string, string[]>, pick: BlockPick): Record<string, string[]> {
  const out: Record<string, string[]> = { ...due };
  const list = (out[pick.kibbutz] || []).slice();
  for (const id of pick.emsTaskIds) if (list.indexOf(id) === -1) list.push(id);
  out[pick.kibbutz] = list;
  return out;
}

/**
 * Stop first (cheap, and the thing he asked for even if EMS is down), then EMS, then the
 * internal rows. A failure never rolls the stop back: the kibbutz is still his plan for the
 * day. The caller shows `failed.length` in the toast.
 *
 * Audit fix: the plan write ALSO fires when the stop already existed but new tasks were
 * ticked into it — otherwise their ids never reached the day's `task_ids` snapshot at all
 * (the EMS due date changed, but the route's own record of what's on it silently didn't).
 */
export async function applyBlockPick(
  pick: BlockPick, person: string, date: string, due: Record<string, string[]>,
  guard: PlanGuard, io: CalendarIo = defaultIo,
): Promise<{ failed: string[] }> {
  assertCanPlan(person, date, guard);
  if (pick.addedStop || pick.emsTaskIds.length) await io.upsertPlan(person, date, pick.stops, withPicked(due, pick));
  const ems = await io.patchEms(pick.ems.patches);
  const internal = await io.patchInternal(pick.internal.patches);
  return { failed: ems.failed.map(f => f.id).concat(internal.failed) };
}

export async function undoBlockPick(
  pick: BlockPick, person: string, date: string, due: Record<string, string[]>,
  guard: PlanGuard, io: CalendarIo = defaultIo,
): Promise<{ failed: string[] }> {
  assertCanPlan(person, date, guard);
  if (pick.addedStop || pick.emsTaskIds.length) await io.upsertPlan(person, date, pick.stopsBefore, due);
  const ems = await io.patchEms(pick.ems.undo);
  const internal = await io.patchInternal(pick.internal.undo);
  return { failed: ems.failed.map(f => f.id).concat(internal.failed) };
}
