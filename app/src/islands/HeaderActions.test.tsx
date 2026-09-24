// @vitest-environment jsdom
// The header's right-hand cluster (round 5, U1/U3): Σ home, ✅ המשימות שלי, ⋯ עוד on desktop
// too, ⚙️ gear. The page action itself moved to PageBar (S-5) and is tested there.
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { st } = vi.hoisted(() => ({ st: { name: 'עידן', role: 'idan', isViewer: false, count: 3 } }));

vi.mock('@/bridge', () => ({
  useCurrentUser: () => ({ name: st.name, role: st.role, isViewer: st.isViewer }),
  useEmsConnected: () => true,
  sigma: { changeUser: vi.fn() },
}));
vi.mock('@/lib/myTasksBadge', () => ({ useMyTasksCount: () => st.count }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/lib/navigate', () => ({ goHome: vi.fn() }));
vi.mock('@/lib/useClickAway', () => ({ useClickAway: () => {} }));
vi.mock('@/lib/settings', () => ({ openSettings: vi.fn() }));
vi.mock('@/components/MoreSheet', () => ({ MoreSheet: () => <span data-testid="more-sheet" /> }));
vi.mock('@/islands', () => ({ mount: () => true }));

import { goHome } from '@/lib/navigate';
import { HeaderActionsPanel } from '@/islands/HeaderActions';

beforeEach(() => { Object.assign(st, { name: 'עידן', role: 'idan', isViewer: false, count: 3 }); vi.clearAllMocks(); });

describe('HeaderActions', () => {
  it('Σ calls goHome', () => {
    render(<HeaderActionsPanel />);
    fireEvent.click(screen.getByLabelText('מסך הבית'));
    expect(goHome).toHaveBeenCalledOnce();
  });

  it('✅ המשימות שלי shows the open count and opens the sheet by the raw event', () => {
    const opened = vi.fn();
    window.addEventListener('sigma-open-my-tasks', opened);
    render(<HeaderActionsPanel />);
    expect(screen.getByTestId('header-my-tasks-badge').textContent).toBe('3');
    fireEvent.click(screen.getByTestId('header-my-tasks'));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('sigma-open-my-tasks', opened);
  });

  it('no badge at 0, no button with nobody signed in', () => {
    st.count = 0;
    render(<HeaderActionsPanel />);
    expect(screen.getByTestId('header-my-tasks')).toBeTruthy();
    expect(screen.queryByTestId('header-my-tasks-badge')).toBeNull();
    cleanup();
    st.name = '';
    render(<HeaderActionsPanel />);
    expect(screen.queryByTestId('header-my-tasks')).toBeNull();
  });

  it('renders the desktop ⋯ עוד sheet and the gear bubble', () => {
    render(<HeaderActionsPanel />);
    expect(screen.getByTestId('more-sheet')).toBeTruthy();
    expect(screen.getByTestId('header-gear')).toBeTruthy();
  });
});
