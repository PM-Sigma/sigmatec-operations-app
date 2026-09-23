import * as React from 'react';
import { sigma, useSigmaEvent } from '@/bridge';
import { visitsForKibbutz } from '@/lib/kibbutzDetail';
import type { VisitRow } from '@/lib/kibbutzDetail';

export { visitsForKibbutz };

/** A kibbutz's visits, newest first. Re-reads on `visit-saved` (emitted by saveVisitFromData). */
export function useKibbutzVisits(kibbutz: string): VisitRow[] {
  const read = React.useCallback(
    () => visitsForKibbutz(((sigma as any)?.loadAllVisitsCombined?.() || []) as VisitRow[], kibbutz), [kibbutz]);
  const [rows, setRows] = React.useState<VisitRow[]>(read);
  React.useEffect(() => { setRows(read()); }, [read]);
  useSigmaEvent('visit-saved', () => setRows(read()));
  return rows;
}
