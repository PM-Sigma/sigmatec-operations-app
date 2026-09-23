import { useSyncExternalStore } from 'react';

export const OFFLINE_TEXT = 'אין חיבור. השינויים יישמרו במכשיר.';

export const isOnline = (): boolean => {
  try { return navigator.onLine !== false; } catch { return true; }
};

export function subscribeOnline(fn: () => void): () => void {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); };
}

export const useOnline = (): boolean => useSyncExternalStore(subscribeOnline, isOnline, () => true);
