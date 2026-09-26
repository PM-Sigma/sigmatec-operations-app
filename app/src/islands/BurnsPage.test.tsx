// @vitest-environment jsdom
// BurnsPage (round 5 G-U2) — the wiring only; filter/group/xlsx rules are pinned in
// burns.test.ts / burnsParity.test.ts, the data layer in burnsData.test.ts.
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { st, refreshMock, undoMock } = vi.hoisted(() => ({
  st: { name: 'אביאם', isViewer: false },
  refreshMock: vi.fn(async () => ({ ran: true, upserted: 0, skipped: 0 })),
  undoMock: vi.fn(async () => {}),
}));

const ROWS = [
  { meter_id: 'a', serial: '111', site: 'אור הנר', meter_type: 'E360PP', status: 'pending', generator_id: null, address: 'רפת' },
  { meter_id: 'b', serial: '222', site: 'אור הנר', meter_type: 'E360CT', status: 'burned', generator_id: null, address: 'לול' },
];

vi.mock('@/bridge', () => ({
  sigma: { canExportExcel: () => false, showPage: vi.fn() },
  useCurrentUser: () => ({ name: st.name, role: 'pm', isViewer: st.isViewer }),
}));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/EmsGate', () => ({ EmsGate: ({ children }: any) => <>{children}</> }));
vi.mock('@/lib/burnsData', () => ({
  useBurns: () => ({ data: ROWS, isLoading: false, isError: false, refetch: vi.fn() }),
  useBurnGenerators: () => ({ data: [], isLoading: false, isError: false }),
  markBurned: vi.fn(async () => {}),
  unburnWithUndo: vi.fn(async () => ({ undo: undoMock })),
  refreshBurnsFromEms: refreshMock,
  searchEmsMeters: vi.fn(async () => []),
  saveGeneratorSerial: vi.fn(async () => {}),
  assignGenerator: vi.fn(async () => {}),
  ensureGenerator: vi.fn(async () => ({ id: 'g1', site: 'אור הנר', name: 'חדש' })),
  markIssue: vi.fn(async () => {}),
}));

import { BurnsPage } from '@/islands/BurnsPage';

beforeEach(() => { Object.assign(st, { name: 'אביאם', isViewer: false }); refreshMock.mockClear(); undoMock.mockClear(); });

describe('BurnsPage', () => {
  it('renders the two-line title and the stat tiles', () => {
    render(<BurnsPage />);
    expect(screen.getByText(/צריבות: מוני ייצור E360/)).toBeTruthy();
    expect(screen.getByText('נותרו')).toBeTruthy();
    expect(screen.getByText('נצרבו')).toBeTruthy();
    expect(screen.getByText('בעיות')).toBeTruthy();
  });

  it('a writer mount triggers the background EMS refresh once', () => {
    render(<BurnsPage />);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('a viewer mount never refreshes from EMS, and sees no burn/generator controls', () => {
    Object.assign(st, { name: 'צופה', isViewer: true });
    render(<BurnsPage />);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('ייצוא לאקסל')).toBeNull();
    expect(screen.queryByLabelText('גנרטורים')).toBeNull();
  });

  it('מתניה (not in the burns audience) renders nothing at all', () => {
    Object.assign(st, { name: 'מתניה', isViewer: false });
    const { container } = render(<BurnsPage />);
    expect(container.textContent).toBe('');
  });

  it('tapping the נותרו tile filters to pending, a second tap clears it', () => {
    render(<BurnsPage />);
    const tile = screen.getByText('נותרו').closest('button')!;
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('false');
  });
});
