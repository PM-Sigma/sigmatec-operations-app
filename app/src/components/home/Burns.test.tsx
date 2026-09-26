// @vitest-environment jsdom
// Render goldens for the 🔥 צריבות surfaces (Task 23): the card chip, the card-modal section
// and the landing strip. The RULES are goldens in lib/burns.test.ts — what is asserted here
// is that each surface obeys them on screen: hide-at-zero, the role matrix (a viewer sees the
// list and no buttons), ticking writes, and the flag takes everything away.
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BurnRow } from '@/lib/burns';

const { who, rows, gens, writes } = vi.hoisted(() => ({
  who: { name: 'אביאם', role: 'team', isViewer: false },
  rows: { current: [] as any[] },
  gens: { current: [] as any[] },
  writes: { updates: [] as Array<{ patch: any; ids: string[] }> },
}));

vi.mock('@/bridge', () => ({
  sigma: { openKibbutzModal: vi.fn(), showPage: vi.fn(), getCurrentUser: () => who.name, isViewer: () => who.isViewer },
  sigmaBus: new EventTarget(),
  useCurrentUser: () => ({ name: who.name, role: who.role, isViewer: who.isViewer }),
}));

vi.mock('@/lib/track', () => ({ track: vi.fn() }));

// A supabase-js double thin enough to be obvious and complete enough to record a write.
vi.mock('@/lib/supabase', () => {
  const table = (name: string) => {
    const api: any = {
      _ids: [] as string[],
      _patch: null as any,
      select: () => api,
      order: () => api,
      update(patch: any) { api._patch = patch; return api; },
      in(_col: string, ids: string[]) { api._ids = ids; return api; },
      then(res: any) {                                   // awaited directly by sbWrite
        if (api._patch) writes.updates.push({ patch: api._patch, ids: api._ids });
        return Promise.resolve({ data: [], error: null }).then(res);
      },
    };
    Object.defineProperty(api, 'data', { get: () => (name === 'meter_burns' ? rows.current : gens.current) });
    return api;
  };
  return {
    getSupabase: async () => ({
      from: (name: string) => {
        const t = table(name);
        // a plain read resolves to the fixture rows
        t.order = () => ({ ...t, then: (res: any) => Promise.resolve({ data: name === 'meter_burns' ? rows.current : gens.current, error: null }).then(res) });
        return t;
      },
    }),
    sbWrite: async (run: (sb: any) => any) => {
      const sb = { from: (n: string) => table(n) };
      return run(sb);
    },
  };
});

vi.mock('@/lib/query', () => ({
  queryClient: { invalidateQueries: vi.fn() },
  SigmaProviders: ({ children }: { children: React.ReactNode }) => children,
}));

const mod = await import('./Burns');
const { BurnsPanel, BurnsStrip } = mod;

const row = (o: Partial<BurnRow> & { meter_id: string; site: string }): BurnRow => ({
  serial: o.meter_id, meter_type: 'E360PP', status: 'pending', parent_serial: '900', ...o,
} as BurnRow);

const FIXTURE: BurnRow[] = [
  row({ meter_id: 'a1', site: 'אור הנר', serial: '68369287', meter_type: 'E360CT', ct_ratio: 50, address: 'רפת 7' }),
  row({ meter_id: 'a2', site: 'אור הנר', serial: '59965612', status: 'burned' }),
  row({ meter_id: 'm1', site: 'מעוז חיים', serial: '22221111', status: 'burned' }),
];

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  who.name = 'אביאם'; who.role = 'team'; who.isViewer = false;
  rows.current = FIXTURE.map(r => ({ ...r }));
  gens.current = [];
  writes.updates.length = 0;
  delete (globalThis as any).BURNS_PROJECT_ACTIVE;
});
afterEach(cleanup);

// The card chip (BurnChip) is removed (round 5, K2/K-U4) — burns never render on a kibbutz
// card, closed or open.

describe('the card-modal section', () => {
  it('lists this kibbutz only, not-done first, and counts what is left', async () => {
    wrap(<BurnsPanel kibbutz="אור הנר" />);
    // 22.9 (D1): the section is a summary row until tapped
    fireEvent.click(await screen.findByTestId('burns-panel-toggle'));
    const list = await screen.findAllByTestId('burn-row');
    expect(list.map(el => el.getAttribute('data-meter'))).toEqual(['a1', 'a2']);
    expect(screen.getByTestId('burns-panel-count').textContent).toBe('נותרו 1/2');
    expect(screen.queryByText('פרויקט זמני')).toBeNull();   // 22.9: the label is gone
  });

  it('a kibbutz with no meters renders no section (not an empty one)', async () => {
    const { container } = wrap(<BurnsPanel kibbutz="דפנה" />);
    await waitFor(() => expect(screen.queryByTestId('burns-panel')).toBeNull());
    expect(container.textContent).toBe('');
  });

  it('✅ נצרב writes the patch for that meter, and nothing EMS-owned', async () => {
    wrap(<BurnsPanel kibbutz="אור הנר" />);
    fireEvent.click(await screen.findByTestId('burns-panel-toggle'));
    const buttons = await screen.findAllByTestId('burn-toggle');
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(writes.updates).toHaveLength(1));
    expect(writes.updates[0].ids).toEqual(['a1']);
    expect(writes.updates[0].patch.status).toBe('burned');
    expect(writes.updates[0].patch.burned_by).toBe('אביאם');
    for (const k of ['serial', 'site', 'meter_type', 'ct_ratio', 'address']) {
      expect(writes.updates[0].patch).not.toHaveProperty(k);
    }
  });

  it('VIEWER REGRESSION: he sees every meter and not one button or checkbox', async () => {
    who.name = 'צופה'; who.role = 'viewer'; who.isViewer = true;
    wrap(<BurnsPanel kibbutz="אור הנר" />);
    fireEvent.click(await screen.findByTestId('burns-panel-toggle'));
    expect((await screen.findAllByTestId('burn-row'))).toHaveLength(2);
    expect(screen.queryAllByTestId('burn-toggle')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('hidden from אליה entirely', async () => {
    who.name = 'אליה';
    const { container } = wrap(<BurnsPanel kibbutz="אור הנר" />);
    await waitFor(() => expect(screen.queryByTestId('burns-panel')).toBeNull());
    expect(container.textContent).toBe('');
  });
});

describe('the landing strip (round 5, K1 — one row, same text for every role)', () => {
  it('בוצעו X מתוך Y · לפירוט', async () => {
    wrap(<BurnsStrip />);
    const strip = await screen.findByTestId('burns-strip');
    expect(strip.textContent).toContain('פרויקט צריבות מונים');
    expect(strip.textContent).toContain('בוצעו 2 מתוך 3');
    expect(strip.textContent).toContain('לפירוט');
  });

  it('and for עמיחי — no per-role text any more', async () => {
    who.name = 'עמיחי';
    wrap(<BurnsStrip />);
    const strip = await screen.findByTestId('burns-strip');
    expect(strip.textContent).toContain('בוצעו 2 מתוך 3');
  });

  it('HIDE AT ZERO METERS — no meters at all, no strip', async () => {
    rows.current = [];
    const { container } = wrap(<BurnsStrip />);
    await waitFor(() => expect(screen.queryByTestId('burns-strip')).toBeNull());
    expect(container.textContent).toBe('');
  });

  it('still shown when everything is burned — the project flag removes it, not the count', async () => {
    rows.current = FIXTURE.map(r => ({ ...r, status: 'burned' }));
    wrap(<BurnsStrip />);
    const strip = await screen.findByTestId('burns-strip');
    expect(strip.textContent).toContain('בוצעו 3 מתוך 3');
  });

  it('a tap opens the burns page and filters nothing', async () => {
    const { sigma } = await import('@/bridge');
    wrap(<BurnsStrip />);
    fireEvent.click(await screen.findByTestId('burns-strip'));
    expect((sigma as any).showPage).toHaveBeenCalledWith('burns');
  });

  it('the flag takes the strip away too', async () => {
    (globalThis as any).BURNS_PROJECT_ACTIVE = false;
    const { container } = wrap(<BurnsStrip />);
    await waitFor(() => expect(screen.queryByTestId('burns-strip')).toBeNull());
    expect(container.textContent).toBe('');
  });
});
