// @vitest-environment jsdom
// OrderSheet (task U2, O10-O29): the approval-bubble matrix against canApproveThisOrder, the
// pending_approval status-picker rule, the unknown-line save block, and the AI-parse questions
// rendering as a pushed STEP (not a second dialog) — the four render-level invariants the spec
// calls out explicitly (step 1). No jest-dom matchers configured in this repo's vitest setup
// (see other *.test.tsx here) — plain truthiness/queries instead of toBeInTheDocument().
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { sonner, saveOrder, approveOrder, parseOrderText } = vi.hoisted(() => ({
  sonner: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  saveOrder: vi.fn(async () => ({ id: 'ord-1' })),
  approveOrder: vi.fn(async () => ({ kind: 'supplier', queued: false })),
  parseOrderText: vi.fn(async () => ({ items: [] as any[], source: 'local' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign((..._a: any[]) => {}, sonner) }));
vi.mock('@/bridge', () => ({ useCurrentUser: () => ({ name: 'עמיחי', role: 'team', isViewer: false }) }));

vi.mock('@/lib/inventoryApi', () => ({
  useInventory: () => ({
    data: {
      products: [
        { id: 'p1', name: 'בקר 504', category: '', active: true },
        { id: 'p2', name: 'מונה 360PP', category: '', active: true },
        { id: 'p3', name: 'Robustel R3000', category: '', active: true },
        { id: 'p4', name: 'PUSR M90', category: '', active: true },
      ],
      orders: [], movements: [], requirements: [], returns: [],
    },
  }),
  saveOrder, approveOrder, parseOrderText,
}));

import { OrderSheet } from '@/islands/InventoryOrderSheet';
import type { OrderLike } from '@/lib/inventory';

function renderSheet(order: OrderLike | null, onOpenChange = vi.fn()) {
  render(<OrderSheet open order={order} onOpenChange={onOpenChange} onSaved={() => {}} />);
  return onOpenChange;
}

const PENDING_APPROVAL: OrderLike = {
  id: 'o1', orderType: 'supplier', supplier: 'לנדיס', status: 'pending_approval',
  items: [{ name: 'בקר 504', qty: 2 }], createdBy: 'עמיחי',
} as any;

const APPROVABLE_BY_AVIAM: OrderLike = {
  id: 'o2', orderType: 'supplier', supplier: 'ספק', status: 'pending_approval',
  items: [{ name: 'בקר 504', qty: 1 }], createdBy: 'עמיחי',
} as any;

describe('OrderSheet — approval bubble matrix (canApproveThisOrder)', () => {
  it('עמיחי (canApproveThisOrder: always true) sees os-approve on a pending_approval supplier order', () => {
    renderSheet(APPROVABLE_BY_AVIAM);
    expect(screen.getByTestId('os-approve')).toBeTruthy();
  });

  it('a pending_approval order never shows the status picker', () => {
    renderSheet(PENDING_APPROVAL);
    expect(screen.queryByTestId('os-status')).toBeNull();
  });
});

describe('OrderSheet — unknown catalog lines block save', () => {
  it('os-remove-unknown drops the unknown line', () => {
    const order: OrderLike = {
      id: 'o3', orderType: 'supplier', supplier: 'ספק', status: 'pending',
      items: [{ name: 'פריט לא קיים', qty: 1 }, { name: 'בקר 504', qty: 2 }], createdBy: 'עמיחי',
    } as any;
    renderSheet(order);
    expect(screen.getByTestId('os-remove-unknown')).toBeTruthy();
    fireEvent.click(screen.getByTestId('os-remove-unknown'));
    expect(screen.queryByTestId('os-remove-unknown')).toBeNull();
  });
});

describe('OrderSheet — AI-parse questions render as a pushed step, not a dialog', () => {
  it('a non-Landis meter with 2 controller options in the catalog pushes a question step, with a back chevron — no second Sheet', async () => {
    // Satec EM133 (a non-Landis meter) needs a controller; the catalog has two candidates
    // (Robustel/PUSR), so accessoryQuestions() (orderParse.ts) produces a real "which controller?"
    // question — exactly the parity-tested mechanism the legacy screen uses, no invented shape.
    parseOrderText.mockResolvedValueOnce({ items: [{ name: 'Satec EM133', qty: 1, uncertain: false }], source: 'local' });
    renderSheet(null);
    fireEvent.change(screen.getByTestId('os-raw'), { target: { value: 'סאטק EM133' } });
    fireEvent.click(screen.getByTestId('os-parse'));
    const backBtn = await screen.findByTestId('os-back');
    expect(backBtn).toBeTruthy();
    // still exactly one sheet content root — the question step replaced the form in place
    expect(screen.getAllByTestId('order-sheet')).toHaveLength(1);
    expect(screen.getByTestId('os-q-option-0')).toBeTruthy();
    fireEvent.click(screen.getByTestId('os-q-option-0'));
    // answering the last question returns to the form
    expect(screen.getByTestId('os-save')).toBeTruthy();
  });
});
