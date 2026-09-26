// @vitest-environment jsdom
// ✉️ הודעה לעובד — moved out of CommandBar.tsx before Ctrl+K was deleted (round 5, X-L7, F1),
// rebuilt on the design system (X-U1). Render goldens for the one thing that must not have
// broken: the sheet still opens, still lists the roster (minus me — person-scoped RLS, X-R3),
// still sends exactly once, and a 42501 gets its own toast. The pure send/roster rules
// themselves belong to whichever module owns `sigma.staffSendMessage` (js/src/17-messages.js);
// this only pins the island's own wiring.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

afterEach(cleanup);

const { mockSigma, registered, toastMock } = vi.hoisted(() => ({
  mockSigma: {
    STAFF_PEOPLE: ['עידן', 'עמיחי', 'אביאם'],
    staffSendMessage: vi.fn().mockResolvedValue(undefined),
    isViewer: () => false,
    getCurrentUser: () => 'עידן',
  },
  registered: [] as any[],
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/bridge', () => ({
  sigma: mockSigma,
  useCurrentUser: () => ({ name: 'עידן', role: 'idan', isViewer: false }),
  useEmsConnected: () => true,
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/lib/registry', () => ({ registerMoreItem: (item: any) => registered.push(item) }));

import { openMessageSheet, mountMessageSheet, MessageSheetPanel } from './MessageSheet';

beforeEach(() => {
  registered.length = 0;
  mockSigma.staffSendMessage.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe('MessageSheet', () => {
  it('mountMessageSheet registers the ⋯ עוד row (same id "staff-message" CommandBar had)', () => {
    mountMessageSheet();
    expect(registered).toHaveLength(1);
    expect(registered[0].id).toBe('staff-message');
    expect(registered[0].label).toBe('✉️ הודעה לעובד');
  });

  it('openMessageSheet(to) opens the sheet with that recipient preset, and never a native select', async () => {
    render(<MessageSheetPanel />);
    openMessageSheet('אביאם');
    await waitFor(() => expect(screen.getByTestId('cmd-message')).toBeTruthy());
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    const to = screen.getByTestId('cmd-message-to');
    expect(to.querySelector('[aria-pressed="true"]')?.textContent).toBe('אביאם');
  });

  it('the recipient list excludes myself (person-scoped messages, X-R3)', async () => {
    render(<MessageSheetPanel />);
    openMessageSheet();
    await waitFor(() => expect(screen.getByTestId('cmd-message')).toBeTruthy());
    const to = screen.getByTestId('cmd-message-to');
    expect(to.textContent).not.toContain('עידן');   // getCurrentUser() in this test
    expect(to.textContent).toContain('עמיחי');
    expect(to.textContent).toContain('אביאם');
  });

  it('"שליחה" is disabled while empty, and sending calls staffSendMessage exactly once then closes', async () => {
    render(<MessageSheetPanel />);
    openMessageSheet('אביאם');
    await waitFor(() => expect(screen.getByTestId('cmd-message')).toBeTruthy());

    const send = screen.getByTestId('cmd-message-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('cmd-message-text'), { target: { value: 'שלום' } });
    expect(send.disabled).toBe(false);

    fireEvent.click(send);
    await waitFor(() => expect(mockSigma.staffSendMessage).toHaveBeenCalledTimes(1));
    expect(mockSigma.staffSendMessage).toHaveBeenCalledWith('אביאם', 'שלום');
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('ההודעה נשלחה'));
    await waitFor(() => expect(screen.queryByTestId('cmd-message')).toBeNull());   // closed after send
  });

  it('a 42501 from the server gets its own clear toast, and the sheet stays open', async () => {
    mockSigma.staffSendMessage.mockRejectedValueOnce(Object.assign(new Error('שמירה נכשלה (401)'), { code: '42501' }));
    render(<MessageSheetPanel />);
    openMessageSheet('אביאם');
    await waitFor(() => expect(screen.getByTestId('cmd-message')).toBeTruthy());

    fireEvent.change(screen.getByTestId('cmd-message-text'), { target: { value: 'שלום' } });
    fireEvent.click(screen.getByTestId('cmd-message-send'));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('אין הרשאה לשלוח כרגע. כדאי להתחבר מחדש ולנסות שוב.'));
    expect(screen.getByTestId('cmd-message')).toBeTruthy();   // never silently closes on a real failure
  });

  it('any other failure gets a plain retry toast, not the 42501 wording', async () => {
    mockSigma.staffSendMessage.mockRejectedValueOnce(new Error('שמירה נכשלה (500)'));
    render(<MessageSheetPanel />);
    openMessageSheet('אביאם');
    await waitFor(() => expect(screen.getByTestId('cmd-message')).toBeTruthy());

    fireEvent.change(screen.getByTestId('cmd-message-text'), { target: { value: 'שלום' } });
    fireEvent.click(screen.getByTestId('cmd-message-send'));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('ההודעה לא נשלחה: שמירה נכשלה (500)'));
  });
});
