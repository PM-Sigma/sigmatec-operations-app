// @vitest-environment jsdom
// The header's right-hand cluster (round 5, U1/U3): ✅ המשימות שלי, ⋯ עוד on desktop too,
// ⚙️ opens GearSheet. Σ and the page action moved out — Σ is index.html's static brand-mark
// (tested by test-shell-legacy.mjs), the page action is PageBar's (tested there).
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { st } = vi.hoisted(() => ({ st: { name: 'עידן', role: 'idan', isViewer: false, count: 3 } }));

vi.mock('@/bridge', () => ({
  useCurrentUser: () => ({ name: st.name, role: st.role, isViewer: st.isViewer }),
  useEmsConnected: () => true,
  sigma: { changeUser: vi.fn(), toast: vi.fn(), isInstalled: () => true, canInstall: () => false, appInstall: vi.fn() },
}));
vi.mock('@/lib/myTasksBadge', () => ({ useMyTasksCount: () => st.count }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/lib/settings', () => ({ openSettings: vi.fn() }));
vi.mock('@/components/MoreSheet', () => ({ MoreSheet: () => <span data-testid="more-sheet" /> }));
vi.mock('@/islands', () => ({ mount: () => true }));

import { HeaderActionsPanel } from '@/islands/HeaderActions';

beforeEach(() => { Object.assign(st, { name: 'עידן', role: 'idan', isViewer: false, count: 3 }); });

describe('HeaderActions', () => {
  it('✅ המשימות שלי shows the open count and opens the sheet by the raw event', () => {
    const opened = vi.fn();
    window.addEventListener('sigma-open-my-tasks', opened);
    render(<HeaderActionsPanel />);
    const btn = screen.getByTestId('header-my-tasks').querySelector('button')!;
    expect(btn.textContent).toContain('3');
    fireEvent.click(btn);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('sigma-open-my-tasks', opened);
  });

  it('no badge at 0, no button with nobody signed in', () => {
    st.count = 0;
    render(<HeaderActionsPanel />);
    expect(screen.getByTestId('header-my-tasks').querySelector('button')).toBeTruthy();
    cleanup();
    st.name = '';
    render(<HeaderActionsPanel />);
    expect(screen.queryByTestId('header-my-tasks')).toBeNull();
  });

  it('renders the desktop ⋯ עוד sheet and the gear bubble, which opens GearSheet on click', () => {
    render(<HeaderActionsPanel />);
    expect(screen.getByTestId('more-sheet')).toBeTruthy();
    const gear = screen.getByTestId('header-gear').querySelector('button')!;
    fireEvent.click(gear);
    // GearSheet mounts open — the identity block shows the signed-in name.
    expect(screen.getByText('עידן')).toBeTruthy();
  });
});
