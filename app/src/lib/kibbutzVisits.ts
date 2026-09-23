import * as React from 'react';
import { sigma, sigmaBus } from '@/bridge';
import type { VisitRow } from '@/lib/kibbutzDetail';

export function visitsForKibbutz(all: VisitRow[], kibbutz: string): VisitRow[] {
  return (all || []).filter(v => v && v.kibbutz === kibbutz && v.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** A kibbutz's visits, newest first. Re-reads on `visit-saved` (emitted by saveVisitFromData). */
export function useKibbutzVisits(kibbutz: string): VisitRow[] {
  const read = React.useCallback(
    () => visitsForKibbutz(((sigma as any)?.loadAllVisitsCombined?.() || []) as VisitRow[], kibbutz), [kibbutz]);
  const [rows, setRows] = React.useState<VisitRow[]>(read);
  React.useEffect(() => {
    setRows(read());
    const on = () => setRows(read());
    const bus = (window as any).sigmaBus || sigmaBus;
    bus?.addEventListener?.('visit-saved', on);
    return () => bus?.removeEventListener?.('visit-saved', on);
  }, [read]);
  return rows;
}
