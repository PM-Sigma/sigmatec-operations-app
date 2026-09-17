// The ONE query cache for every island (spec §7c: staleTime 60 s, persisted to localStorage
// for an offline first paint). Islands opt in by wrapping their tree in <SigmaProviders>;
// because the client and the persister are module singletons, two islands mounted by two
// different tasks share one cache instead of racing two PersistQueryClientProviders.
//
// Nothing in this module is imported by the nav/toaster islands — keeping TanStack out of
// the boot path is why ui/sigma.js stays small until the first data island lands.
import { createElement, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'sigma-query-cache-v1',
});

/** Wrap an island that reads data. Written with createElement so this stays a .ts module. */
export function SigmaProviders({ children }: { children: ReactNode }) {
  return createElement(PersistQueryClientProvider, { client: queryClient, persistOptions: { persister } }, children);
}
