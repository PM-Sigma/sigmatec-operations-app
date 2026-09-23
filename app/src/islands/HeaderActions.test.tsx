// @vitest-environment jsdom
// The header's right-hand cluster. The rules behind it are golden-tested elsewhere
// (primaryAdd.test, myTasks.test); this asserts the wiring the phone QA rounds asked for:
// ✅ המשימות שלי with its count opens the sheet by the raw event (round 4, X), ➕ קיבוץ is
// desktop-only (round 2, A2), and the viewer's one ➕ is feedback.
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { st } = vi.hoisted(() => ({ st: { name: 'עידן', role: 'idan', isViewer: false, page: 'kibbutz', count: 3 } }));

vi.mock('@/bridge', () => ({ useCurrentUser: () => ({ name: st.name, role: st.role, isViewer: st.isViewer }) }));
vi.mock('@/lib/currentPage', () => ({ useCurrentPage: () => st.page }));
vi.mock('@/lib/myTasksBadge', () => ({ useMyTasksCount: () => st.count }));
vi.mock('@/lib/runAdd', () => ({ runAdd: vi.fn() }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/components/UserChip', () => ({ UserChip: () => <span data-testid="user-chip" /> }));
vi.mock('@/islands', () => ({ mount: () => true }));

import { HeaderActionsPanel } from '@/islands/HeaderActions';

beforeEach(() => { Object.assign(st, { name: 'עידן', role: 'idan', isViewer: false, page: 'kibbutz', count: 3 }); });

describe('HeaderActions', () => {
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

  it('"קיבוץ חדש" is hidden on the phone (it lives in ⋯ עוד there)', () => {
    render(<HeaderActionsPanel />);
    const btn = screen.getByText('קיבוץ חדש').closest('button')!;
    expect(btn.className).toMatch(/\bhidden\b/);
    expect(btn.className).toMatch(/md:inline-flex/);
  });

  it('the viewer gets feedback as his only page action, shown on every size', () => {
    Object.assign(st, { name: 'צופה', role: 'viewer', isViewer: true });
    render(<HeaderActionsPanel />);
    expect(screen.queryByText('קיבוץ חדש')).toBeNull();
    const btn = screen.getByText('רעיון או באג').closest('button')!;
    expect(btn.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});
