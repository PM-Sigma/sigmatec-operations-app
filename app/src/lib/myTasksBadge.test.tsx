// @vitest-environment jsdom
// The header badge hook (round 4, Package X): it only FETCHES — the counting rule is golden-
// tested in myTasks.test.ts. What must hold here: it reads open internal tasks + the EMS cache,
// re-reads on the two bus events, and a failing source is a 0 badge, never a throw.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { st, bus } = vi.hoisted(() => ({
  st: { internal: [] as any[], ems: [] as any[], sbFails: false, emsFails: false, reads: 0 },
  bus: new EventTarget(),
}));

vi.mock('@/bridge', () => ({
  sigma: {
    emsCacheData: () => { if (st.emsFails) throw new Error('no cache'); return { tasks: st.ems }; },
  },
  sigmaBus: bus,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: async () => {
    if (st.sbFails) throw new Error('offline');
    return { from: () => ({ select: () => ({ eq: async () => { st.reads++; return { data: st.internal }; } }) }) };
  },
}));
// Transparent stand-in for the golden-tested rule: EMS rows count 10 each, internal rows 1.
vi.mock('@/lib/myTasks', () => ({
  myTasksCount: (ems: any[], internal: any[] | null, me: string) =>
    me ? (ems?.length || 0) * 10 + (internal?.length || 0) : 0,
}));

import { useMyTasksCount } from '@/lib/myTasksBadge';

beforeEach(() => { st.internal = []; st.ems = []; st.sbFails = false; st.emsFails = false; st.reads = 0; });

describe('useMyTasksCount', () => {
  it('counts the open internal rows and the EMS cache together', async () => {
    st.internal = [{ id: 1 }, { id: 2 }];
    st.ems = [{ id: 'a' }];
    const { result } = renderHook(() => useMyTasksCount('עידן'));
    await waitFor(() => expect(result.current).toBe(12));
  });

  it('re-reads internal tasks on internal-tasks-changed', async () => {
    st.internal = [{ id: 1 }];
    const { result } = renderHook(() => useMyTasksCount('עידן'));
    await waitFor(() => expect(result.current).toBe(1));
    st.internal = [{ id: 1 }, { id: 2 }, { id: 3 }];
    act(() => { bus.dispatchEvent(new Event('internal-tasks-changed')); });
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('recounts the EMS side on ems-cache-synced', async () => {
    const { result } = renderHook(() => useMyTasksCount('עידן'));
    await waitFor(() => expect(st.reads).toBe(1));
    expect(result.current).toBe(0);
    st.ems = [{ id: 'a' }, { id: 'b' }];
    act(() => { bus.dispatchEvent(new Event('ems-cache-synced')); });
    await waitFor(() => expect(result.current).toBe(20));
  });

  it('a failing source is a 0 badge, never a throw', async () => {
    st.sbFails = true; st.emsFails = true;
    const { result } = renderHook(() => useMyTasksCount('עידן'));
    await new Promise(r => setTimeout(r, 10));
    expect(result.current).toBe(0);
  });

  it('no signed-in person → 0', async () => {
    st.internal = [{ id: 1 }];
    const { result } = renderHook(() => useMyTasksCount(''));
    await new Promise(r => setTimeout(r, 10));
    expect(result.current).toBe(0);
  });
});
