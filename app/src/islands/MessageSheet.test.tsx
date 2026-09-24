// @vitest-environment jsdom
// ✉️ הודעה לעובד — moved out of CommandBar.tsx before Ctrl+K was deleted (round 5, X-L7, F1).
// Render goldens for the one thing that must not have broken in the move: the sheet still
// opens, still lists the roster, still sends exactly once. The pure send/roster rules
// themselves belong to whichever module owns `sigma.staffSendMessage` (js/src/17-messages.js);
// this only pins the island's own wiring.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

afterEach(cleanup);

const { mockSigma, registered } = vi.hoisted(() => ({
  mockSigma: {
    STAFF_PEOPLE: ['עידן', 'עמיחי', 'אביאם'],
    staffSendMessage: vi.fn().mockResolvedValue(undefined),
    toast: vi.fn(),
    isViewer: () => false,
    getCurrentUser: () => 'עידן',
  },
  registered: [] as any[],
}));

vi.mock('@/bridge', () => ({
  sigma: mockSigma,
  useCurrentUser: () => ({ name: 'עידן', role: 'idan', isViewer: false }),
  useEmsConnected: () => true,
}));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/lib/registry', () => ({ registerMoreItem: (item: any) => registered.push(item) }));

import { openMessageSheet, mountMessageSheet, MessageSheetPanel } from './MessageSheet';

beforeEach(() => {
  registered.length = 0;
  mockSigma.staffSendMessage.mockClear();
  mockSigma.toast.mockClear();
});

describe('MessageSheet', () => {
  it('mountMessageSheet registers the ⋯ עוד row (same id "staff-message" CommandBar had)', () => {
    mountMessageSheet();
    expect(registered).toHaveLength(1);
    expect(registered[0].id).toBe('staff-message');
    expect(registered[0].label).toBe('✉️ הודעה לעובד');
  });

  it('openMessageSheet(to) opens the dialog with that recipient preset', async () => {
    render(<MessageSheetPanel />);
    openMessageSheet('אביאם');
    await waitFor(() => expect(screen.getByTestId('cmd-message')).toBeTruthy());
    expect((screen.getByTestId('cmd-message-to') as HTMLSelectElement).value).toBe('אביאם');
    expect(screen.getByTestId('cmd-message-to').tagName).toBe('SELECT');   // never free text
  });

  it('"שלח" is disabled while empty, and sending calls staffSendMessage exactly once then closes', async () => {
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
    await waitFor(() => expect(screen.queryByTestId('cmd-message')).toBeNull());   // closed after send
  });
});
