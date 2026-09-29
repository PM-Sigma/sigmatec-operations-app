// The ONE shared "latest visit per kibbutz" lookup for the home page. Built once in Home (a single
// pass over the already-loaded visits) and read by the cards through context — no per-card query.
import * as React from 'react';
import { sigma, useSigmaEvent } from '@/bridge';
import { latestVisitByKibbutz, type VisitRow } from '@/lib/kibbutzDetail';

const EMPTY = new Map<string, VisitRow>();
const Ctx = React.createContext<Map<string, VisitRow>>(EMPTY);

export function useLatestVisits(refreshKey: unknown): Map<string, VisitRow> {
  const read = React.useCallback(() => {
    try { return latestVisitByKibbutz(((sigma as any)?.loadAllVisitsCombined?.() || []) as VisitRow[]); }
    catch { return EMPTY; }
  }, []);
  const [map, setMap] = React.useState<Map<string, VisitRow>>(read);
  // re-read when the kibbutz list changes (the visit data arrives with it) and after a save
  React.useEffect(() => { setMap(read()); }, [read, refreshKey]);
  useSigmaEvent('visit-saved', () => setMap(read()));
  return map;
}

export const LastVisitsProvider = Ctx.Provider;
export const useLastVisit = (kibbutz: string): VisitRow | null => React.useContext(Ctx).get(kibbutz) ?? null;
