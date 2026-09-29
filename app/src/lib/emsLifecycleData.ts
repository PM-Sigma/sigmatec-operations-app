// EMS task lifecycle — data layer for the stats page (H5). Reads `ems_task_state` (RLS: עידן and
// עמיחי only, see db/ems_task_lifecycle.sql) and reduces it to the small LifecycleStats object
// INSIDE the query function, so the persisted query cache holds a few hundred bytes, not the rows.
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { buildLifecycleStats, type LifecycleStats, type StateRow } from '@/lib/emsLifecycle';

export const EMS_STATS_KEY = ['emsLifecycleStats'] as const;
const PAGE = 1000;                    // PostgREST's default max rows per response
const MAX_PAGES = 30;                 // 30k tasks: far past reality, a runaway guard

const COLS = 'task_id,site_name,status,due_date,opened_at,closed_at,closed_src,assigned_at,assigned_src,gone_at';

/** Pages through the table (a plain select is capped at 1000 rows and would silently truncate the stats). */
export async function fetchStateRows(): Promise<StateRow[]> {
  const sb = await getSupabase();
  const rows: StateRow[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await sb.from('ems_task_state').select(COLS).order('task_id').range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as StateRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function fetchLifecycleStats(): Promise<LifecycleStats> {
  return buildLifecycleStats(await fetchStateRows(), Date.now());
}

export function useLifecycleStats(enabled: boolean) {
  return useQuery({ queryKey: EMS_STATS_KEY, queryFn: fetchLifecycleStats, enabled });
}
