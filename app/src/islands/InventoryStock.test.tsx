// @vitest-environment jsdom
// U3 step 1 (unit): the KPI tile states against poolView() — the low tile is a real toggle
// (tap once → filtered, tap again → clears), matching StatTile's aria-pressed contract.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

vi.mock('@/bridge', () => ({
  sigma: { canExportExcel: () => false, orders: () => [], isIdan: () => true, isViewer: () => false },
  useCurrentUser: () => ({ name: 'עידן', role: 'idan', isViewer: false }),
  useSigmaEvent: () => {},
}));

vi.mock('@/lib/inventoryApi', () => ({
  useInventory: () => ({
    data: {
      products: [
        { id: 'p1', name: 'מונה PM135', category: 'מונה', active: true },
        { id: 'p2', name: 'בקר 504', category: 'בקר', active: true },
      ],
      orders: [], movements: [
        { product: 'מונה PM135', fromLocation: '', toLocation: 'חברה', quantity: 2, reason: 'opening_balance', refId: '', createdBy: '' },
        { product: 'בקר 504', fromLocation: '', toLocation: 'חברה', quantity: 12, reason: 'opening_balance', refId: '', createdBy: '' },
      ],
      requirements: [], returns: [],
    },
  }),
}));

import { InventoryStockTab } from '@/islands/InventoryStock';

describe('InventoryStockTab — KPI tap-filter', () => {
  it('tapping מלאי נמוך filters the pool list to low items only, and tapping again clears it', () => {
    render(<InventoryStockTab />);
    expect(screen.getByTestId('inv-pool-row-מונה PM135')).toBeTruthy();
    expect(screen.getByTestId('inv-pool-row-בקר 504')).toBeTruthy();

    const lowTile = screen.getByTestId('inv-kpi-low').querySelector('button')!;
    fireEvent.click(lowTile);
    expect(screen.getByTestId('inv-pool-row-מונה PM135')).toBeTruthy();
    expect(screen.queryByTestId('inv-pool-row-בקר 504')).toBeNull();
    expect(lowTile.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(lowTile);
    expect(screen.getByTestId('inv-pool-row-בקר 504')).toBeTruthy();
    expect(lowTile.getAttribute('aria-pressed')).toBe('false');
  });
});
