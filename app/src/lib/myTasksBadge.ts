// The count on the המשימות שלי button in the header (round 4, Package X).
//
// The header island carries no TanStack provider and must never wait for one: the badge is a
// number the person glances at, and a badge that appears a second late is a badge nobody
// trusts (the same reasoning the bell next to it is built on). So this is a plain read of the
// two sources the sheet itself uses, re-asked whenever either of them announces a change.
//
// The counting RULE lives in lib/myTasks.ts and is golden-tested there; this module only
// fetches.
import * as React from 'react';
import { sigma, sigmaBus } from '@/bridge';
import { getSupabase } from '@/lib/supabase';
import { myTasksCount } from '@/lib/myTasks';
import type { ListTask } from '@/lib/taskList';
import type { InternalTaskRow } from '@/lib/internalTasks';

async function readInternal(): Promise<InternalTaskRow[]> {
  try {
    const sb = await getSupabase();
    const { data } = await sb.from('internal_tasks').select('id,title,kibbutz,done,owner,due_date').eq('done', false);
    return (data || []) as InternalTaskRow[];
  } catch { return []; }
}

function readEms(): ListTask[] {
  try { return (sigma.emsCacheData?.()?.tasks || []) as ListTask[]; } catch { return []; }
}

/**
 * How many things are open on this person right now. Starts at 0 and never throws: a header
 * that cannot count is a header with no badge, not a header that crashes.
 */
export function useMyTasksCount(me: string): number {
  const [rows, setRows] = React.useState<InternalTaskRow[] | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    const load = () => { void readInternal().then(r => { if (alive) setRows(r); }); };
    load();
    const bump = () => setTick(t => t + 1);
    sigmaBus?.addEventListener('internal-tasks-changed', load);
    sigmaBus?.addEventListener('ems-cache-synced', bump);
    return () => {
      alive = false;
      sigmaBus?.removeEventListener('internal-tasks-changed', load);
      sigmaBus?.removeEventListener('ems-cache-synced', bump);
    };
  }, [me]);

  return React.useMemo(
    () => (me ? myTasksCount(readEms(), rows, me) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, me, tick],
  );
}
