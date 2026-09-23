// @vitest-environment jsdom
// K-L5: one read of a kibbutz's visits, newest first, re-reading on `visit-saved`. `sigma`/
// `sigmaBus` are consts bound once when `@/bridge` first evaluates (bridge.ts:303-304) — real
// tests of anything reading them mock the module (see myTasksBadge.test.tsx), never poke
// `window.sigma` after import, which a bound const would never see.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rows = [
  { id: 'a', kibbutz: 'חוקוק', date: '2026-09-10T09:00:00.000Z', visitor: 'אביאם' },
  { id: 'b', kibbutz: 'חוקוק', date: '2026-09-18T09:00:00.000Z', visitor: 'ניתאי' },
  { id: 'c', kibbutz: 'יגור', date: '2026-09-20T09:00:00.000Z', visitor: 'אביאם' },
  { id: 'd', kibbutz: 'חוקוק', date: '', visitor: 'אביאם' },
];

const { st, bus } = vi.hoisted(() => ({ st: { data: [] as any[] }, bus: new EventTarget() }));

vi.mock('@/bridge', () => ({
  sigma: { loadAllVisitsCombined: () => st.data },
  sigmaBus: bus,
}));

const { useKibbutzVisits, visitsForKibbutz } = await import('./kibbutzVisits');

afterEach(cleanup);

describe('visitsForKibbutz', () => {
  it('that kibbutz, dated, newest first', () => {
    expect(visitsForKibbutz(rows as any, 'חוקוק').map(v => v.id)).toEqual(['b', 'a']);
  });
});

describe('useKibbutzVisits', () => {
  it('re-reads on visit-saved', () => {
    st.data = rows.slice(0, 1);
    const { result } = renderHook(() => useKibbutzVisits('חוקוק'));
    expect(result.current.map(v => v.id)).toEqual(['a']);
    st.data = rows;
    act(() => { bus.dispatchEvent(new CustomEvent('visit-saved', { detail: { kibbutz: 'חוקוק' } })); });
    expect(result.current.map(v => v.id)).toEqual(['b', 'a']);
  });
});
