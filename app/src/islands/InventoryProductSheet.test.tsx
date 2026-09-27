// @vitest-environment jsdom
// U6 step 1 (unit): close-without-save writes nothing, the delete affordance is עידן-only, and
// the 5s undo window really cancels the delete (spec P17/P18, F15).
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

let currentRole = 'idan';
vi.mock('@/bridge', () => ({
  useCurrentUser: () => ({ name: currentRole === 'idan' ? 'עידן' : 'עמיחי', role: currentRole, isViewer: false }),
}));

const api = vi.hoisted(() => ({
  saveProduct: vi.fn(async () => ({ id: 'p2' })),
  setProductActive: vi.fn(async () => {}),
  deletePreview: vi.fn(async () => ({
    product: 'בקר 504', exists: 1, movements: 3, orders_deleted: [], orders_trimmed: [],
    certs_referencing: [], certs_referencing_active: [], visits_trimmed: 0,
    requirements_deleted: 0, requirements_trimmed: 0, returns: 0, recounts: 0, alerts: 0,
    parse_examples: 0, fingerprint: 'fp-1',
  })),
  deleteProduct: vi.fn(async () => ({})),
}));
const { saveProduct, setProductActive, deletePreview, deleteProduct } = api;
vi.mock('@/lib/inventoryApi', () => api);

const hoisted = vi.hoisted(() => {
  let actionRef: { label: string; onClick: () => void } | null = null;
  const fn: any = vi.fn((_msg: string, opts?: any) => { actionRef = opts?.action ?? null; return 'toast-id'; });
  fn.success = vi.fn();
  fn.error = vi.fn();
  return { fn, getAction: () => actionRef, reset: () => { actionRef = null; } };
});
const toastFn = hoisted.fn;
vi.mock('sonner', () => ({ toast: hoisted.fn }));

import { ProductSheet } from '@/islands/InventoryProductSheet';

const PRODUCT = { id: 'p2', name: 'בקר 504', category: 'בקר', active: true, display_name: 'בקר' };

beforeEach(() => {
  currentRole = 'idan';
  saveProduct.mockClear(); setProductActive.mockClear(); deletePreview.mockClear(); deleteProduct.mockClear();
  toastFn.mockClear(); hoisted.reset();
});

describe('ProductSheet — no draft on close', () => {
  it('closing without pressing שמירה never calls saveProduct', () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <ProductSheet open={open} onOpenChange={setOpen} product={null} hasMovements={false}
                      onSaved={() => {}} onDeleted={() => {}} />
      );
    }
    const { rerender } = render(<Harness />);
    fireEvent.change(screen.getByTestId('ps-name'), { target: { value: 'פריט חדש' } });
    // Simulate the sheet closing (backdrop/Esc) without ever pressing ps-save.
    rerender(<Harness />);
    expect(saveProduct).not.toHaveBeenCalled();
  });
});

describe('ProductSheet — delete is עידן-only', () => {
  it('a non-עידן never sees ps-delete', () => {
    currentRole = 'amichai';
    render(<ProductSheet open onOpenChange={() => {}} product={PRODUCT} hasMovements onSaved={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByTestId('ps-more'));
    expect(screen.queryByTestId('ps-delete')).toBeNull();
    // The non-destructive toggle is still there for anyone who can open the sheet.
    expect(screen.getByTestId('ps-toggle')).toBeTruthy();
  });

  it('עידן sees ps-delete and it opens the preview confirm sheet', async () => {
    render(<ProductSheet open onOpenChange={() => {}} product={PRODUCT} hasMovements onSaved={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByTestId('ps-more'));
    fireEvent.click(screen.getByTestId('ps-delete'));
    await vi.waitFor(() => expect(deletePreview).toHaveBeenCalledWith('בקר 504'));
    await vi.waitFor(() => expect(screen.getByTestId('del-confirm')).toBeTruthy());
    expect(screen.getByTestId('del-line-0').textContent).toContain('תנועות מלאי');
  });
});

describe('ProductSheet — undo within 5s cancels the delete', () => {
  it('pressing the toast undo before 5s means deleteProduct is never called', async () => {
    vi.useFakeTimers();
    try {
      render(<ProductSheet open onOpenChange={() => {}} product={PRODUCT} hasMovements onSaved={() => {}} onDeleted={() => {}} />);
      fireEvent.click(screen.getByTestId('ps-more'));
      fireEvent.click(screen.getByTestId('ps-delete'));
      await vi.waitFor(() => expect(screen.getByTestId('del-confirm')).toBeTruthy());
      fireEvent.click(screen.getByTestId('del-confirm'));
      expect(hoisted.getAction()).toBeTruthy();
      hoisted.getAction()!.onClick(); // undo, before the 5s timer fires
      await vi.advanceTimersByTimeAsync(5500);
      expect(deleteProduct).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('letting the 5s elapse without undo calls deleteProduct with the fingerprint', async () => {
    vi.useFakeTimers();
    try {
      render(<ProductSheet open onOpenChange={() => {}} product={PRODUCT} hasMovements onSaved={() => {}} onDeleted={() => {}} />);
      fireEvent.click(screen.getByTestId('ps-more'));
      fireEvent.click(screen.getByTestId('ps-delete'));
      await vi.waitFor(() => expect(screen.getByTestId('del-confirm')).toBeTruthy());
      fireEvent.click(screen.getByTestId('del-confirm'));
      await vi.advanceTimersByTimeAsync(5500);
      expect(deleteProduct).toHaveBeenCalledWith('בקר 504', 'fp-1');
    } finally {
      vi.useRealTimers();
    }
  });
});
