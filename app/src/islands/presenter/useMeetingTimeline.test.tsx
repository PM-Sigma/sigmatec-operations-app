// @vitest-environment jsdom
// Goldens for the meeting-timeline data hook (package M, M-L7): merging EMS tasks across a
// kibbutz's several EMS sites, no EMS = no items and no error, comments paced at most 4 in
// flight, and the offline/signed-out fallback to the shared cache's titles (no dates, no
// reason). Nothing here ever reaches real EMS — the gateway is a fake, injected with
// setEmsGateway.
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { state } = vi.hoisted(() => ({
  state: {
    emsConnected: true,
    kibbutzim: [] as any[],
    notes: [] as any[],
    internal: [] as any[],
    visits: [] as any[],
    cachedTasks: [] as any[],
  },
}));

vi.mock('@/bridge', () => ({
  sigma: {
    loadAllVisitsCombined: () => state.visits,
    emsCacheTasksForKibbutz: (_name: string) => state.cachedTasks,
  },
  sigmaBus: new EventTarget(),
  useEmsConnected: () => state.emsConnected,
}));

function makeChain(data: any[]) {
  const chain: any = {
    eq: () => chain, lt: () => chain, gte: () => chain, in: () => chain, is: () => chain,
    order: () => chain, limit: () => chain,
    single: async () => ({ data: data[0] ?? null, error: null }),
    then: (res: any) => Promise.resolve({ data, error: null }).then(res),
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: async () => ({
    from: (name: string) => ({
      select: () => makeChain(
        name === 'kibbutzim' ? state.kibbutzim :
        name === 'kibbutz_meeting_notes' ? state.notes :
        name === 'internal_tasks' ? state.internal : []),
    }),
  }),
}));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
vi.mock('@/lib/query', () => ({ get queryClient() { return qc; } }));

const { setEmsGateway } = await import('@/lib/ems/gateway');
const { useMeetingTimeline } = await import('./useMeetingTimeline');

function withClient({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function fakeGateway(overrides: Partial<Record<string, any>> = {}) {
  return {
    transport: 'rest',
    capabilities: () => ({} as any),
    isConnected: () => true,
    listSites: async () => [],
    listMeters: async () => [],
    getMeter: async () => null,
    listOpenTasks: overrides.listOpenTasks || (async () => []),
    getTask: async () => null,
    createTask: async () => ({ sent: true }),
    updateTask: async () => ({ sent: true }),
    listComments: overrides.listComments || (async () => []),
    addComment: async () => ({ sent: true }),
    listUsers: async () => [],
    listAlerts: async () => null,
    energyBalance: async () => null,
    billingSummary: async () => null,
  } as any;
}

const T = (id: string, o: Partial<any> = {}) => ({
  id, title: `task ${id}`, description: '', status: 'open', priority: '', type: '',
  site: { id: 's', name: 'גבים' }, assignee: null, expectedCompletionDate: '',
  createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', ...o,
});

beforeEach(() => {
  qc.clear();
  state.emsConnected = true;
  state.kibbutzim = [{ name: 'גבים', ems_site_ids: [] }];
  state.notes = [];
  state.internal = [];
  state.visits = [];
  state.cachedTasks = [];
});
afterEach(() => { setEmsGateway(null); });

describe('useMeetingTimeline', () => {
  it('merges tasks across several ems_site_ids without duplicates', async () => {
    state.kibbutzim = [{ name: 'גבים', ems_site_ids: ['S1', 'S2'] }];
    const calls: string[] = [];
    setEmsGateway(fakeGateway({
      listOpenTasks: async (q: { siteId?: string }) => {
        calls.push(q.siteId || '');
        if (q.siteId === 'S1') return [T('shared'), T('a')];
        if (q.siteId === 'S2') return [T('shared'), T('b')];
        return [];
      },
    }));
    const { result } = renderHook(() => useMeetingTimeline('גבים', '30d'), { wrapper: withClient });
    await waitFor(() => expect(result.current.items.map(i => i.key).sort())
      .toEqual(['ems:a', 'ems:b', 'ems:shared']));
    expect(calls.sort()).toEqual(['S1', 'S2']);
  });

  it('no ems_site_ids: no EMS items, no error', async () => {
    state.kibbutzim = [{ name: 'גבים', ems_site_ids: [] }];
    setEmsGateway(fakeGateway());
    const { result } = renderHook(() => useMeetingTimeline('גבים', '30d'), { wrapper: withClient });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.filter(i => i.kind === 'ems')).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('paces comment fetches at most 4 in flight at once', async () => {
    state.kibbutzim = [{ name: 'גבים', ems_site_ids: ['S1'] }];
    const ids = ['t1', 't2', 't3', 't4', 't5', 't6'];
    let inFlight = 0, maxInFlight = 0;
    setEmsGateway(fakeGateway({
      listOpenTasks: async () => ids.map(id => T(id)),
      listComments: async (id: string) => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 5));
        inFlight--;
        return [{ id: 'c-' + id, message: 'hi', createdAt: '2026-09-20T00:00:00Z', author: 'x' }];
      },
    }));
    const { result } = renderHook(() => useMeetingTimeline('גבים', '30d'), { wrapper: withClient });
    await waitFor(() => expect(result.current.items.length).toBe(6), { timeout: 3000 });
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);            // actually paced, not one-at-a-time either
  });

  it('EMS disconnected: emsLive is false, internal/notes/visits still show, cached titles land in olderOpen with no date/reason', async () => {
    state.emsConnected = false;
    state.kibbutzim = [{ name: 'גבים', ems_site_ids: ['S1'] }];
    state.internal = [{ id: 'i1', title: 'להזמין כבל', owner: 'ניתאי', kibbutz: 'גבים', done: false, created_by: 'עידן', created_at: new Date().toISOString() }];
    state.cachedTasks = [{ id: 'cached-1', title: 'משימה ישנה', status: 'open' }, { id: 'cached-done', title: 'סגורה', status: 'done' }];
    setEmsGateway(fakeGateway());   // never called while offline
    const { result } = renderHook(() => useMeetingTimeline('גבים', '30d'), { wrapper: withClient });
    await waitFor(() => expect(result.current.items.some(i => i.key === 'internal:i1')).toBe(true));
    expect(result.current.emsLive).toBe(false);
    expect(result.current.items.filter(i => i.kind === 'ems')).toEqual([]);
    expect(result.current.olderOpen).toEqual([
      { key: 'ems:cached-1', kind: 'ems', at: '', title: 'משימה ישנה', meta: '', taskId: 'cached-1', status: 'open' },
    ]);
  });

  it('EMS connected but the live fetch FAILS: falls back to the cache instead of going blank', async () => {
    state.kibbutzim = [{ name: 'גבים', ems_site_ids: ['S1'] }];
    state.cachedTasks = [{ id: 'cached-1', title: 'משימה ישנה', status: 'open' }];
    setEmsGateway(fakeGateway({
      listOpenTasks: async () => { throw new Error('EMS 503'); },
    }));
    const { result } = renderHook(() => useMeetingTimeline('גבים', '30d'), { wrapper: withClient });
    await waitFor(() => expect(result.current.olderOpen.length).toBe(1));
    expect(result.current.emsLive).toBe(true);               // still connected — just this fetch failed
    expect(result.current.items.filter(i => i.kind === 'ems')).toEqual([]);
    expect(result.current.olderOpen).toEqual([
      { key: 'ems:cached-1', kind: 'ems', at: '', title: 'משימה ישנה', meta: '', taskId: 'cached-1', status: 'open' },
    ]);
  });

  it('switching kibbutz and back reuses the cache — no re-fetch within staleTime', async () => {
    state.kibbutzim = [
      { name: 'גבים', ems_site_ids: ['S1'] },
      { name: 'חוקוק', ems_site_ids: ['S2'] },
    ];
    const calls: string[] = [];
    setEmsGateway(fakeGateway({
      listOpenTasks: async (q: { siteId?: string }) => { calls.push(q.siteId || ''); return []; },
    }));
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useMeetingTimeline(k, '30d'),
      { wrapper: withClient, initialProps: { k: 'גבים' } },
    );
    await waitFor(() => expect(calls).toContain('S1'));
    rerender({ k: 'חוקוק' });
    await waitFor(() => expect(calls).toContain('S2'));
    rerender({ k: 'גבים' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls.filter(c => c === 'S1')).toHaveLength(1);   // cached, not re-fetched
  });
});
