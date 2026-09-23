import { useSyncExternalStore } from 'react';
import { fmtDay, fmtTime } from '@/lib/format';

export function freshnessLine(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `עודכן ${fmtDay(d, now)} ${fmtTime(d)}`;
}

const read = (): string | null => ((window as any).__sigmaLastUpdated as string | null) ?? null;
const subscribe = (fn: () => void) => {
  window.addEventListener('sigma-last-updated', fn);
  return () => window.removeEventListener('sigma-last-updated', fn);
};

export function useFreshness(): string | null {
  return freshnessLine(useSyncExternalStore(subscribe, read, () => null));
}
