// D-L4 — status-log day-stamps (`dev_status_log`, forward-tracking; db/dev_status_log.sql).
// Port of devLoadStatusLog / devLogStatuses / devStamps (18-dev-tasks.js). The table's `status`
// column holds the STAGE KEY (fields/backlog/.../committed), one row per (issue, stage) the card
// has ever sat in — anon read, authenticated insert.
import { getSupabase, sbWrite } from './supabase';
import { stageOf, type DevCard, type DevStage } from './sprintPrep';
import { DEV_STAGE_ORDER } from './devFlow';

export type StatusLog = Record<number, Partial<Record<DevStage, string>>>;

/** The log rows for these issues: `{ issue: { stage: 'YYYY-MM-DD' } }`. Graceful: a failure is `{}`. */
export async function fetchStatusLog(numbers: number[]): Promise<StatusLog> {
  const ns = (numbers || []).map(Number).filter(Number.isFinite);
  if (!ns.length) return {};
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('dev_status_log').select('issue,status,day').in('issue', ns);
    if (error || !data) return {};
    const out: StatusLog = {};
    for (const row of data as any[]) {
      const n = Number(row.issue);
      (out[n] = out[n] || {})[row.status as DevStage] = row.day;
    }
    return out;
  } catch { return {}; }
}

/**
 * Record today's date for each card's CURRENT stage. One upsert, `ignoreDuplicates` — the
 * (issue, status) pair is unique, so a card already stamped for its stage is a silent no-op
 * rather than a client-side pre-check. Needs the auth pass (RLS); graceful on failure — the
 * stamps are an enrichment, never a blocker for the board.
 */
export async function logStatuses(cards: DevCard[], today: string): Promise<void> {
  const rows = (cards || [])
    .filter(c => c && Number.isFinite(Number(c.number)))
    .map(c => ({ issue: Number(c.number), status: stageOf(c), day: today }));
  if (!rows.length) return;
  try {
    await sbWrite(sb => sb.from('dev_status_log').upsert(rows, { onConflict: 'issue,status', ignoreDuplicates: true }));
  } catch { /* graceful */ }
}

/** One card's stamps, pipeline order, missing stages skipped — what the detail sheet prints. */
export function stampsFor(log: StatusLog, number: number): Array<{ stage: DevStage; day: string }> {
  const row = log[number];
  if (!row) return [];
  return DEV_STAGE_ORDER.filter(s => row[s]).map(s => ({ stage: s, day: row[s]! }));
}
