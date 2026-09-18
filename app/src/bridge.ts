// Typed access to the legacy app (window.sigma, defined in js/src/00-bridge.js).
// React NEVER touches any other global — every legacy call goes through here.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type SigmaRole = 'idan' | 'team' | 'viewer' | '';
export type SigmaPage =
  | 'kibbutz' | 'inventory' | 'attendance' | 'ems' | 'mytasks' | 'calendar' | 'staff' | 'dev' | 'pushlog';

export interface EmsTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  type?: string;
  site?: { id: string; name: string } | null;
  expectedCompletionDate?: string;
  linkCount?: number;
}

export interface Sigma {
  getCurrentUser(): string;
  getRole(): SigmaRole;
  isViewer(): boolean;
  isIdan(): boolean;
  isAdmin(): boolean;
  changeUser(): void;
  readonly ATT_PEOPLE: string[];

  showPage(page: SigmaPage): void;
  canShowPage(page: SigmaPage): boolean;

  emsApi(path: string, options?: RequestInit): Promise<any>;
  isEmsConnected(): boolean;
  emsCacheData(): { tasks: EmsTask[]; syncedAt?: string; syncedBy?: string };
  emsSiteIdForKibbutz(name: string): Promise<string>;
  getEmsSites(): Promise<Array<{ id: string; name: string }>>;
  kibbutzHasSite(name: string): Promise<boolean>;
  openKibbutzEmsTask(id: string): void;
  /** Open the legacy kibbutz modal for a card, optionally on a given tab ('meetings' | 'visit'). */
  openKibbutzModal(name: string, tab?: string): void;
  /** Re-run the legacy card-decorating passes after React re-rendered the cards. */
  decorateCards?(): void;

  /** The EMS-minted Supabase write pass as it stands now (no minting), or null. */
  sbPass?(): { token: string; exp: number } | null;
  /** Mint / re-mint that pass (force = discard the current one first). */
  sbAuthPass?(force?: boolean): Promise<{ token: string; exp: number } | null>;
  createTask(item: Record<string, unknown>): Promise<unknown>;

  openVisitQuick(kibbutz?: string): void;
  getLastVisit(kibbutz: string): any;
  loadAllVisitsCombined(): any[];
  openDeliveryCert(pre?: Record<string, unknown>): void;
  certFromVisitForm(): void;
  certFromVisit(visitId: string): void;

  toast(msg: string, opts?: Record<string, unknown>): void;
}

export const sigma = (globalThis as any).sigma as Sigma;
export const sigmaBus: EventTarget = (globalThis as any).sigmaBus;

export type SigmaEvent =
  | 'user-changed' | 'ems-cache-synced' | 'visit-saved' | 'theme-changed'
  // fired by switchTab('visit') — the moment the legacy visit form is on screen, which is
  // what the 🚚 quick action waits for before asking for a delivery certificate.
  | 'visit-form-open'
  // a meeting note was imported / linked to an EMS task / marked done — every surface that
  // shows bullets refetches ['meetingNotes'] (docs/integration-map.md)
  | 'notes-changed';

/** Subscribe to a legacy → React event for the lifetime of the component. */
export function useSigmaEvent(name: SigmaEvent, handler: (e: CustomEvent) => void): void {
  // The handler is kept in a ref so callers can pass an inline arrow: the listener is
  // attached once per event name, not detached and re-attached on every render.
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!sigmaBus) return;
    const fn = (e: Event) => ref.current(e as CustomEvent);
    sigmaBus.addEventListener(name, fn);
    return () => sigmaBus.removeEventListener(name, fn);
  }, [name]);
}

function subscribeUser(cb: () => void) {
  sigmaBus?.addEventListener('user-changed', cb);
  return () => sigmaBus?.removeEventListener('user-changed', cb);
}

/** Current user + role, re-rendered whenever legacy announces 'user-changed'. */
export function useCurrentUser(): { name: string; role: SigmaRole; isViewer: boolean } {
  const name = useSyncExternalStore(subscribeUser, () => sigma?.getCurrentUser() ?? '', () => '');
  const role = useSyncExternalStore(subscribeUser, () => sigma?.getRole() ?? '', () => '' as SigmaRole);
  return { name, role, isViewer: role === 'viewer' };
}

/** EMS connection state, refreshed on every cache sync (the only moment it can flip mid-session). */
export function useEmsConnected(): boolean {
  const [on, setOn] = useState(() => !!sigma?.isEmsConnected());
  useSigmaEvent('ems-cache-synced', () => setOn(!!sigma?.isEmsConnected()));
  useSigmaEvent('user-changed', () => setOn(!!sigma?.isEmsConnected()));
  return on;
}
