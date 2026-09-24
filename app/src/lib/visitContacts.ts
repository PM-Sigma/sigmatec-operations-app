// Round 5, package V: the kibbutz's contacts as data for the visit sheet's "איש קשר מלווה" chips
// (V3, QA קיבוצים 8). The writer stays js/src/09-visits.js `visitContactEnsure(kibbutz, name)` —
// this file only reads `site_contacts`, the same query the legacy form's chip list already used
// (`09-visits.js:90-100`), and decides which chip (if any) a typed name matches.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/** `site_contacts` for one kibbutz, active only, deduped and trimmed. Empty on any read error — the
 *  sheet falls back to the free-text input, exactly like the legacy form's chip list did. */
export function useKibbutzContacts(kibbutz: string): { names: string[]; isLoading: boolean } {
  const key = React.useMemo(() => ['siteContacts', kibbutz] as const, [kibbutz]);
  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<string[]> => {
      const sb = await getSupabase();
      const { data, error } = await sb.from('site_contacts').select('name').eq('kibbutz', kibbutz).eq('active', true);
      if (error) return [];
      const out: string[] = [];
      for (const r of data || []) {
        const n = String((r as { name?: string })?.name || '').trim();
        if (n && !out.includes(n)) out.push(n);
      }
      return out;
    },
    enabled: !!kibbutz,
    staleTime: 5 * 60_000,
  });
  return { names: q.data || [], isLoading: q.isLoading };
}

export interface ContactChoices { chips: string[]; isNew: boolean }

/** The chip row + whether the currently typed text is a name none of the chips already cover. */
export function contactChoices(names: ReadonlyArray<string>, typed: string): ContactChoices {
  const chips: string[] = [];
  for (const n of names || []) { const t = String(n || '').trim(); if (t && !chips.includes(t)) chips.push(t); }
  const t = String(typed || '').trim();
  return { chips, isNew: !!t && !chips.includes(t) };
}
