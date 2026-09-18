// @vitest-environment jsdom
// The tracking contract (spec §7j): buffer, flush timing, ONE bulk insert, and the silent
// drop when offline or unauthenticated. Analytics that blocks the UI or retries in a loop is
// worse than no analytics, so those are the properties pinned here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTracker, FLUSH_AT, FLUSH_MS, flushPolicy, MAX_BUFFER, MAX_TARGET,
  searchMissTarget, track, _resetTracking, type FlushReason, type FlushState, type TrackerDeps,
} from './track';
import type { UsageEvent } from './usageNarrative';

const state = (p: Partial<FlushState> = {}): FlushState => ({
  buffered: 1, msSinceOldest: 0, online: true, authenticated: true, reason: 'timer', ...p,
});

describe('flushPolicy', () => {
  it('waits while the buffer is young and small', () => {
    expect(flushPolicy(state({ msSinceOldest: FLUSH_MS - 1 }))).toBe('wait');
  });

  it('waits on an empty buffer, whatever the reason', () => {
    expect(flushPolicy(state({ buffered: 0, reason: 'pagehide' }))).toBe('wait');
    expect(flushPolicy(state({ buffered: 0, online: false }))).toBe('wait');
  });

  it('flushes once the interval has elapsed', () => {
    expect(flushPolicy(state({ msSinceOldest: FLUSH_MS }))).toBe('flush');
  });

  it('flushes early when the buffer fills up', () => {
    expect(flushPolicy(state({ buffered: FLUSH_AT }))).toBe('flush');
  });

  it('flushes on pagehide no matter how young the buffer is', () => {
    expect(flushPolicy(state({ reason: 'pagehide', msSinceOldest: 5 }))).toBe('flush');
  });

  it('DROPS when offline or unauthenticated — never queues for later', () => {
    expect(flushPolicy(state({ online: false, msSinceOldest: FLUSH_MS }))).toBe('drop');
    expect(flushPolicy(state({ authenticated: false, reason: 'pagehide' }))).toBe('drop');
    // offline wins over every flush trigger, pagehide included
    expect(flushPolicy(state({ online: false, reason: 'pagehide', buffered: 999 }))).toBe('drop');
  });
});

describe('createTracker', () => {
  const ev = (action: string): UsageEvent => ({ person: 'אביאם', page: 'kibbutz', action, at: '2026-09-18T09:00:00Z' });

  function harness(over: Partial<TrackerDeps> = {}) {
    const inserts: UsageEvent[][] = [];
    const reasons: FlushReason[] = [];
    let now = 0;
    const deps: TrackerDeps = {
      insert: async (rows, reason) => { inserts.push(rows); reasons.push(reason); },
      now: () => now,
      online: () => true,
      authenticated: () => true,
      session: () => 'sess1',
      device: () => 'phone',
      ...over,
    };
    return { inserts, reasons, deps, at: (ms: number) => { now = ms; }, t: createTracker(deps) };
  }

  it('buffers and sends everything as ONE bulk insert', async () => {
    const h = harness();
    h.t.push(ev('view')); h.t.push(ev('visit-saved'));
    expect(h.t.size).toBe(2);
    h.at(FLUSH_MS);
    expect(await h.t.tick('timer')).toBe('flush');
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toHaveLength(2);
    expect(h.t.size).toBe(0);
  });

  it('stamps session and device at flush time', async () => {
    const h = harness();
    h.t.push(ev('view'));
    await h.t.tick('pagehide');
    expect(h.inserts[0][0]).toMatchObject({ session_id: 'sess1', device: 'phone', action: 'view' });
  });

  it('drops the buffer when offline and inserts nothing', async () => {
    const h = harness({ online: () => false });
    h.t.push(ev('view')); h.t.push(ev('view'));
    expect(await h.t.tick('pagehide')).toBe('drop');
    expect(h.inserts).toHaveLength(0);
    expect(h.t.size).toBe(0);
    expect(h.t.dropped).toBe(2);
  });

  it('drops the buffer when there is no write pass', async () => {
    const h = harness({ authenticated: () => false });
    h.t.push(ev('view'));
    expect(await h.t.tick('timer')).toBe('drop');
    expect(h.inserts).toHaveLength(0);
  });

  it('tells insert WHY it ran, so the unload path can pick a surviving transport', async () => {
    const h = harness();
    h.t.push(ev('view'));
    await h.t.tick('pagehide');
    h.t.push(ev('view'));
    h.at(FLUSH_MS * 2);
    await h.t.tick('timer');
    expect(h.reasons).toEqual(['pagehide', 'timer']);
  });

  it('never throws and never re-queues when the insert fails', async () => {
    const h = harness({ insert: async () => { throw new Error('401'); } });
    h.t.push(ev('view'));
    await expect(h.t.tick('pagehide')).resolves.toBe('flush');
    expect(h.t.size).toBe(0);
    expect(h.t.dropped).toBe(1);
  });

  it('caps the buffer and drops the OLDEST event', async () => {
    const h = harness();
    for (let i = 0; i < MAX_BUFFER + 5; i++) h.t.push({ ...ev('view'), target: String(i) });
    expect(h.t.size).toBe(MAX_BUFFER);
    expect(h.t.dropped).toBe(5);
    await h.t.tick('pagehide');
    expect(h.inserts[0][0].target).toBe('5');
  });

  it('ignores an event with no action', () => {
    const h = harness();
    h.t.push({ at: '2026-09-18T09:00:00Z' } as UsageEvent);
    expect(h.t.size).toBe(0);
  });
});

describe('track()', () => {
  beforeEach(() => {
    _resetTracking();
    (window as any).__sigmaTrack = [];
    delete (window as any).sigmaTrack;
    (window as any).sigma = { getCurrentUser: () => 'אביאם' };
    (window as any)._currentPage = 'kibbutz';
  });
  afterEach(() => {
    delete (window as any).sigma; delete (window as any)._currentPage; delete (window as any).sigmaTrack;
    _resetTracking();
  });

  it('stamps person + current page into the shared queue', () => {
    track('visit-saved', 'גבת');
    const q = (window as any).__sigmaTrack as UsageEvent[];
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ person: 'אביאם', page: 'kibbutz', action: 'visit-saved', target: 'גבת' });
    expect(Date.parse(q[0].at)).not.toBeNaN();
  });

  it('truncates a target instead of storing prose (the backstop)', () => {
    track('kibbutz-created', 'x'.repeat(200));
    expect(((window as any).__sigmaTrack as UsageEvent[])[0].target).toHaveLength(MAX_TARGET);
  });

  it('records a search miss WITHOUT the query (review fix round 1)', () => {
    // searchMissTarget is the only thing islands/Home.tsx may hand to track() for a miss.
    expect(searchMissTarget('גשר')).toBe('results:0,len:3');
    expect(searchMissTarget('  שלוחות ב  ')).toBe('results:0,len:8');   // trimmed, and the space counts
    expect(searchMissTarget('')).toBe('results:0,len:0');
    expect(searchMissTarget(null)).toBe('results:0,len:0');
    // nothing that came out of it can contain a Hebrew letter — i.e. any of the query
    expect(/[֐-׿]/.test(searchMissTarget('גשר'))).toBe(false);

    track('search-no-results', searchMissTarget('גשר'));
    expect(((window as any).__sigmaTrack as UsageEvent[])[0].target).toBe('results:0,len:3');
  });

  it('delegates to the bridge when legacy is loaded, so who/where is stamped in ONE place', () => {
    const spy = vi.fn();
    (window as any).sigmaTrack = spy;
    track('mount', 'sigma-usage');
    expect(spy).toHaveBeenCalledWith('mount', 'sigma-usage', undefined);
    expect((window as any).__sigmaTrack).toHaveLength(0);
  });

  it('swallows anything thrown by the page — a caller is never affected', () => {
    (window as any).sigmaTrack = () => { throw new Error('boom'); };
    expect(() => track('view')).not.toThrow();
  });
});
