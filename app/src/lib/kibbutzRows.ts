// The one reader of the `kibbutzim` table. islands/Home and islands/Presenter each carried an
// identical private copy (task 31 audit D, F14 ⑫) — two places to remember the day the archive
// rule or the column list changes, which is one too many for a four-line read.
//
// It lives here rather than in lib/kibbutzim.ts on purpose: that file is deliberately pure
// (no React, no DOM, no network) so its whole surface stays vitest-golden-able.
import { getSupabase } from '@/lib/supabase';

/** Every live (non-archived) kibbutz row. The caller names the row shape it expects. */
export async function fetchKibbutzRows<T>(): Promise<T[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('kibbutzim').select('*').is('archived_at', null);
  if (error) throw error;
  return (data || []) as T[];
}
