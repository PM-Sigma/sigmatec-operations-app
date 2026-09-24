// @vitest-environment jsdom
// PushLog (round 5 G-U3) — the wiring only; mode names, tiles and the line shape are pinned
// in pushLog.test.ts.
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

afterEach(cleanup);

const { st, fetchMock } = vi.hoisted(() => ({
  st: { name: 'עידן', isIdan: true },
  fetchMock: vi.fn(async () => [
    { sent_at: '2026-09-23T11:00:00Z', event: 'visitCron', status: 'sent', where_txt: 'גבים', qty: 1, recipient: 'אביאם', error: null, actor: null, title: null },
    { sent_at: '2026-09-23T10:00:00Z', event: 'pending', status: 'failed', where_txt: 'חוקוק', qty: 3, recipient: 'עמיחי', error: '410 Gone — נא להתחבר מחדש', actor: 'אביאם', title: null },
    { sent_at: '2026-09-23T09:00:00Z', event: 'someUnknownMode', status: 'sent', where_txt: null, qty: null, recipient: 'ניתאי', error: null, actor: null, title: null },
  ]),
}));

vi.mock('@/bridge', () => ({
  sigma: { isIdan: () => st.isIdan, getCurrentUser: () => st.name, canExportExcel: () => false },
}));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/components/EmsGate', () => ({ EmsGate: ({ children }: any) => <>{children}</> }));
vi.mock('@/lib/pushLog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pushLog')>('@/lib/pushLog');
  return { ...actual, fetchPushLog: fetchMock };
});

import { PushLog } from '@/islands/PushLog';

beforeEach(() => { Object.assign(st, { name: 'עידן', isIdan: true }); fetchMock.mockClear(); });

describe('PushLog', () => {
  it('renders the title, tiles and every row, once the fetch resolves', async () => {
    render(<PushLog />);
    await waitFor(() => {
      expect(screen.getByText('יומן התראות')).toBeTruthy();
      expect(screen.getByText('סה״כ')).toBeTruthy();
      expect(screen.getByText('נשלחו')).toBeTruthy();
      expect(screen.getByText('נכשלו')).toBeTruthy();
      expect(screen.getByText('מנוי מת')).toBeTruthy();
    });
  });

  it('a failed row shows its error text right on the row, not only in a title attribute', async () => {
    render(<PushLog />);
    await waitFor(() => expect(screen.getByText(/410 Gone/)).toBeTruthy());
    const err = screen.getByText(/410 Gone/);
    expect(err.getAttribute('title')).toBeNull();
  });

  it('an unrecognised event mode shows the neutral Hebrew fallback, never a raw key or an empty cell', async () => {
    render(<PushLog />);
    await waitFor(() => expect(screen.getByText('התראה אחרת')).toBeTruthy());
    expect(screen.queryByText(/someUnknownMode/)).toBeNull();
  });

  it('anyone but עידן renders nothing', async () => {
    Object.assign(st, { name: 'אביאם', isIdan: false });
    const { container } = render(<PushLog />);
    expect(container.querySelector('[data-testid="pushlog-page"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
