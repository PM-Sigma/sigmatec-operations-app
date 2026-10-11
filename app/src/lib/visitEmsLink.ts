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
