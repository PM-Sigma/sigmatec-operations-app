// Visit summary <-> EMS task link (עידן 11.10): the save guard and the post-save status update.
// Pure logic, testable without the bridge (deps are injected).
import { EMS_STATUS_LABEL } from './emsTasks';

export const KEEP_STATUS = 'keep';

/** Dialog before saving: no EMS task chosen, the kibbutz has open ones, and he did not already opt out. */
export function needsEmsLinkWarning(a: {
  emsTaskIds?: ReadonlyArray<string> | null; openTaskCount: number; skipped?: boolean;
}): boolean {
  return !(a.emsTaskIds || []).length && a.openTaskCount > 0 && !a.skipped;
}

/** The statuses the app already knows (the legacy EMS_STATUS map), `keep` first. */
export function statusChoices(label: (s: string) => string = s => EMS_STATUS_LABEL[s] || s): Array<{ value: string; label: string }> {
  return [{ value: KEEP_STATUS, label: 'להשאיר את הסטטוס' },
    ...Object.keys(EMS_STATUS_LABEL).map(value => ({ value, label: label(value) }))];
}

/** Only real changes: not `keep`, not empty, not the status the task already has. */
export function plannedStatusChanges(
  picks: Record<string, string>, current: Record<string, string>,
): Array<{ id: string; status: string }> {
  return Object.entries(picks)
    .filter(([id, s]) => s && s !== KEEP_STATUS && s !== current[id])
    .map(([id, status]) => ({ id, status }));
}

/** Multi-EMS (עידן 12.10): toggle one id in the selection, keeping order. */
export function toggleTaskId(ids: ReadonlyArray<string>, id: string): string[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

/** "בחר הכול": every open task's id, in list order. */
export function allTaskIds(tasks: ReadonlyArray<{ id: string | number }>): string[] {
  return tasks.map(t => String(t.id));
}

/** The pre-save dialog's "שייך ושמור" needs at least one picked task. */
export function canLinkAndSave(picked: ReadonlyArray<string>): boolean {
  return picked.length > 0;
}

/**
 * A visit's linked EMS tasks. `ems_task_ids` when it has any; otherwise the single `ems_task_id`
 * (db/visits_ems_task_ids.sql not applied yet, or a visit filed before it).
 */
export function linkedTaskIds(v: { emsTaskIds?: ReadonlyArray<string> | null; emsTaskId?: string | null } | null | undefined): string[] {
  const many = (v?.emsTaskIds || []).map(String).filter(Boolean);
  if (many.length) return [...new Set(many)];
  return v?.emsTaskId ? [String(v.emsTaskId)] : [];
}

/** One summary toast for the status updates, plus one line per failed task, naming it. */
export function statusUpdateToasts(
  r: { done: number; failed: Array<{ id: string; error: unknown }> },
  titleOf: (id: string) => string,
  message: (error: unknown) => string,
): { ok: string; errors: string[] } {
  return {
    ok: r.done ? 'עודכנו ' + r.done + ' משימות' : '',
    errors: r.failed.map(f => 'הביקור נשמר, אך עדכון "' + titleOf(f.id) + '" נכשל · ' + message(f.error)),
  };
}

/**
 * Runs AFTER the visit is saved. Never throws: an EMS failure is returned, the visit stays.
 * `setStatus` is sigma.emsSetStatus (the legacy changeEmsStatus: queue-aware, same PATCH).
 */
export async function applyStatusChanges(
  changes: Array<{ id: string; status: string }>,
  setStatus: (id: string, status: string) => Promise<unknown> | unknown,
): Promise<{ done: number; failed: Array<{ id: string; error: unknown }> }> {
  let done = 0;
  const failed: Array<{ id: string; error: unknown }> = [];
  for (const c of changes) {
    try { await setStatus(c.id, c.status); done++; } catch (error) { failed.push({ id: c.id, error }); }
  }
  return { done, failed };
}
