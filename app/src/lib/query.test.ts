// @vitest-environment jsdom
// The stale-while-revalidate policy (spec §7k #10, Task 20).
//
// These four settings are a PRODUCT decision, not a tuning knob: עידן's ruling is that every
// screen paints the last known state instantly and refreshes silently behind it. A future
// change that flips `refetchOnMount` back to the default, or puts `networkMode` back to
// 'online', would look harmless in a diff and would quietly reintroduce both the empty first
// screen and the "paused" refresh on flaky cellular. So the policy is pinned by name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashKey } from '@tanstack/react-query';
import {
  PERSIST_KEY, QUERY_DEFAULTS, hasPersistedData, persistedHas, queryClient, refreshAll, showSkeleton,
} from './query';

describe('the query policy (§7k #10)', () => {
  it('paints from cache and revalidates: always on mount, on focus, offline-first', () => {
    expect(QUERY_DEFAULTS.refetchOnMount).toBe('always');
    expect(QUERY_DEFAULTS.refetchOnWindowFocus).toBe(true);
    expect(QUERY_DEFAULTS.networkMode).toBe('offlineFirst');
  });

  it('keeps a 60 s stale window — the throttle for focus refetches, not a gate on the paint', () => {
    expect(QUERY_DEFAULTS.staleTime).toBe(60_000);
  });

  it('keeps the cache for a day, so tomorrow morning still paints instantly', () => {
    expect(QUERY_DEFAULTS.gcTime).toBe(24 * 60 * 60_000);
  });

  it('retries once — enough for one dropped packet, not enough to stall a screen', () => {
    expect(QUERY_DEFAULTS.retry).toBe(1);
  });

  it('the live client really carries the policy (not just the exported object)', () => {
    const q = queryClient.getDefaultOptions().queries as Record<string, unknown>;
    expect(q.refetchOnMount).toBe('always');
    expect(q.refetchOnWindowFocus).toBe(true);
    expect(q.networkMode).toBe('offlineFirst');
    expect(q.staleTime).toBe(60_000);
    expect(q.gcTime).toBe(24 * 60 * 60_000);
  });
});

describe('showSkeleton', () => {
  it('shows skeletons ONLY when there is nothing at all to paint', () => {
    expect(showSkeleton(false, false)).toBe(true);
  });

  it('never shows them when a cache exists — that is the whole point of #10', () => {
    expect(showSkeleton(false, true)).toBe(false);
  });

  it('never shows them over data, cached or not', () => {
    expect(showSkeleton(true, false)).toBe(false);
    expect(showSkeleton(true, true)).toBe(false);
  });
});

describe('persistedHas', () => {
  const blob = (queries: unknown[]) => JSON.stringify({ timestamp: 1, buster: '', clientState: { mutations: [], queries } });
  const entry = (key: unknown[], data: unknown) => ({ queryKey: key, queryHash: hashKey(key as any), state: { data, dataUpdatedAt: 1 } });

  it('finds a query by its hashed key', () => {
    expect(persistedHas(blob([entry(['kibbutzim'], [{ name: 'דפנה' }])]), ['kibbutzim'])).toBe(true);
  });

  it('is exact about the key — a different key is not a cache hit', () => {
    const raw = blob([entry(['kibbutzim'], [])]);
    expect(persistedHas(raw, ['meetingNotes'])).toBe(false);
    expect(persistedHas(raw, ['attRows', 'עידן', 2026, 9])).toBe(false);
  });

  it('matches a compound key the way TanStack hashes it', () => {
    const key = ['attRows', 'עידן', 2026, 9];
    expect(persistedHas(blob([entry(key, [])]), ['attRows', 'עידן', 2026, 9])).toBe(true);
    expect(persistedHas(blob([entry(key, [])]), ['attRows', 'עידן', 2026, 8])).toBe(false);
  });

  it('an EMPTY array is still a cache hit — "this kibbutz has no notes" is an answer', () => {
    expect(persistedHas(blob([entry(['meetingNotes', 'דפנה'], [])]), ['meetingNotes', 'דפנה'])).toBe(true);
  });

  it('an undefined payload is not (a dehydrated query that never resolved)', () => {
    expect(persistedHas(blob([{ queryKey: ['x'], queryHash: hashKey(['x']), state: {} }]), ['x'])).toBe(false);
  });

  it('survives every shape of junk instead of taking the screen down', () => {
    expect(persistedHas(null, ['x'])).toBe(false);
    expect(persistedHas('', ['x'])).toBe(false);
    expect(persistedHas('not json at all', ['x'])).toBe(false);
    expect(persistedHas('{}', ['x'])).toBe(false);
    expect(persistedHas(JSON.stringify({ clientState: { queries: 'nope' } }), ['x'])).toBe(false);
    expect(persistedHas(JSON.stringify({ clientState: { queries: [null, 7] } }), ['x'])).toBe(false);
  });
});

describe('hasPersistedData', () => {
  afterEach(() => { try { window.localStorage.clear(); } catch { /* jsdom */ } });

  it('reads the persister\'s own key', () => {
    const key = ['kibbutzim'];
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify({
      clientState: { queries: [{ queryKey: key, queryHash: hashKey(key as any), state: { data: [1] } }] },
    }));
    expect(hasPersistedData(key)).toBe(true);
    expect(hasPersistedData(['something-else'])).toBe(false);
  });

  it('answers false when the store is empty or unreachable', () => {
    expect(hasPersistedData(['kibbutzim'])).toBe(false);
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try { expect(hasPersistedData(['kibbutzim'])).toBe(false); } finally { spy.mockRestore(); }
  });
});

describe('refreshAll (the pull-to-refresh action)', () => {
  const spyOnInvalidate = () => vi.spyOn(queryClient, 'invalidateQueries');
  let invalidate: ReturnType<typeof spyOnInvalidate>;

  beforeEach(() => { invalidate = spyOnInvalidate().mockResolvedValue(undefined); });
  afterEach(() => { invalidate.mockRestore(); delete (window as any).sigma; });

  it('invalidates EVERY query and FORCES the legacy EMS sync past its throttle', async () => {
    const emsSync = vi.fn().mockResolvedValue(true);
    (window as any).sigma = { emsSync };
    await refreshAll();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0][0]).toBeUndefined();   // no filter = all of them
    expect(emsSync).toHaveBeenCalledWith(true);
  });

  it('works with no legacy bridge at all (a page where sigma never loaded)', async () => {
    await expect(refreshAll()).resolves.toBeUndefined();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('never rejects when the EMS sync throws — a gesture must not raise an unhandled rejection', async () => {
    (window as any).sigma = { emsSync: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(refreshAll()).resolves.toBeUndefined();
  });

  it('never rejects when the refetch fails — the cached paint simply stays', async () => {
    invalidate.mockRejectedValue(new Error('network'));
    (window as any).sigma = { emsSync: vi.fn().mockResolvedValue(false) };
    await expect(refreshAll()).resolves.toBeUndefined();
  });
});
