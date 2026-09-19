// The ONE query cache for every island (spec §7c + §7k #10: stale-while-revalidate).
// Islands opt in by wrapping their tree in <SigmaProviders>; because the client and the
// persister are module singletons, two islands mounted by two different tasks share one
// cache instead of racing two PersistQueryClientProviders.
//
// Nothing in this module is imported by the nav/toaster islands — keeping TanStack out of
// the boot path is why ui/sigma.js stays small until the first data island lands.
//
// ── THE POLICY (§7k #10, Task 20) ─────────────────────────────────────────────────────
// עידן's ruling: "every screen paints the last known state INSTANTLY, then refreshes
// silently; skeletons only when there is no cache at all". That is four settings, and each
// one is load-bearing:
//
//   staleTime 60 s          a screen re-opened inside a minute is not re-fetched by every
//                           focus event. It is the throttle for the background refresh, NOT
//                           a gate on the first paint — the cache paints regardless.
//   refetchOnMount 'always' the reason painting a stale cache is safe: whatever we show on
//                           mount is already being replaced in the background. 'always'
//                           ignores staleTime deliberately — opening a screen is an explicit
//                           "show me what is true now", and one request is cheap next to
//                           being wrong about a kibbutz.
//   refetchOnWindowFocus    coming back to the tab after a phone call is the same intent.
//                           This one DOES respect staleTime, so alt-tabbing is not a load test.
//   networkMode             'offlineFirst': run the queryFn even when the browser reports
//                           offline. `navigator.onLine` is famously wrong on cellular in a
//                           קיבוץ, and the legacy app has always just tried the request; under
//                           the default 'online' mode one false negative leaves the screen
//                           paused (`fetchStatus: 'paused'`) with no background refresh at all.
//
// gcTime stays 24 h: it is what keeps a query in the dehydrated blob overnight, which is what
// makes tomorrow morning's first paint instant on the way to the first kibbutz.
import { createElement, type ReactNode } from 'react';
import { QueryClient, hashKey, type QueryKey } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/** The defaults, named so the unit test pins the POLICY and not a QueryClient internal. */
export const QUERY_DEFAULTS = {
  staleTime: 60_000,
  gcTime: 24 * 60 * 60_000,
  retry: 1,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  networkMode: 'offlineFirst',
} as const;

export const queryClient = new QueryClient({
  defaultOptions: { queries: { ...QUERY_DEFAULTS } },
});

/** The localStorage key the dehydrated cache lives under. Exported: `hasPersistedData` reads it. */
export const PERSIST_KEY = 'sigma-query-cache-v1';

export const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: PERSIST_KEY,
});

/**
 * Pure: does this dehydrated blob already hold data for `key`?
 *
 * Restoring the persisted cache is asynchronous (one microtask), so on the first render of a
 * cold boot `useQuery` honestly reports `data: undefined, isLoading: true` even though a full
 * answer is sitting in localStorage. Asking the blob directly is how a screen tells "nothing
 * to show" (skeleton) apart from "a paint is one tick away" (no skeleton, no flash).
 * Kept pure — the test feeds it strings, including junk.
 */
export function persistedHas(raw: string | null, key: QueryKey): boolean {
  if (!raw) return false;
  let blob: any;
  try { blob = JSON.parse(raw); } catch { return false; }
  const queries = blob?.clientState?.queries;
  if (!Array.isArray(queries)) return false;
  const hash = hashKey(key);
  return queries.some((q: any) => q?.queryHash === hash && q?.state?.data !== undefined);
}

/** The same question against the real store. Never throws (private mode / blocked storage). */
export function hasPersistedData(key: QueryKey): boolean {
  try { return persistedHas(window.localStorage.getItem(PERSIST_KEY), key); }
  catch { return false; }
}

/**
 * Pure: may this screen show skeletons? §7k #10 is one sentence — "skeletons only when there
 * is no cache at all" — and this is it. `cached` is `hasPersistedData(key)`, or any other
 * evidence the screen has something to paint (the legacy localStorage mirror the card home
 * reads as `initialData`, for instance).
 */
export function showSkeleton(hasData: boolean, cached: boolean): boolean {
  return !hasData && !cached;
}

/**
 * Refresh everything: invalidate every query (TanStack refetches the mounted ones) and kick
 * the legacy EMS cache sync, which is a different cache entirely — it lives in the Sheet and
 * feeds the on-card task widget for people who never sign in to EMS themselves. Pull-to-refresh
 * is the only deliberate "refresh now" gesture in the app, so it forces past the 5-minute
 * throttle the background sync runs under.
 *
 * Never rejects: a refresh that throws would surface as an unhandled rejection on a gesture.
 */
export async function refreshAll(): Promise<void> {
  const sigma = (window as any).sigma;
  const ems = (async () => { try { await sigma?.emsSync?.(true); } catch { /* offline / not connected */ } })();
  const queries = queryClient.invalidateQueries().catch(() => { /* a failed refetch keeps the cached paint */ });
  await Promise.all([queries, ems]);
}

/** Wrap an island that reads data. Written with createElement so this stays a .ts module. */
export function SigmaProviders({ children }: { children: ReactNode }) {
  return createElement(PersistQueryClientProvider, { client: queryClient, persistOptions: { persister } }, children);
}
