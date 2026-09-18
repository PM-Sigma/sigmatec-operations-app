// @vitest-environment jsdom
// Render goldens for the on-card EMS-tasks widget (spec §4 Part C, task-3-brief REVISION 2:
// "the golden test becomes a vitest render test with @testing-library/react"). Written before
// wiring EmsTasks.tsx into KibbutzCard (TDD).
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { CardEmsTask } from '@/lib/emsTasks';

afterEach(cleanup);

const { mockSigma, busListeners } = vi.hoisted(() => {
  const state = { tasks: [] as any[] };
  return {
    mockSigma: {
      state,
      emsCacheTasksForKibbutz: vi.fn(() => state.tasks),
      openKibbutzEmsTask: vi.fn(),
    },
    busListeners: new Map<string, Set<(e: any) => void>>(),
  };
});

vi.mock('@/bridge', () => ({
  sigma: mockSigma,
  useCurrentUser: () => ({ name: 'עידן', role: 'team', isViewer: false }),
  useSigmaEvent: (name: string, handler: (e: any) => void) => {
    React.useEffect(() => {
      if (!busListeners.has(name)) busListeners.set(name, new Set());
      busListeners.get(name)!.add(handler);
      return () => { busListeners.get(name)!.delete(handler); };
    }, [name, handler]);
  },
}));

function emitEmsCacheSynced() {
  (busListeners.get('ems-cache-synced') || new Set()).forEach(fn => fn({ detail: {} }));
}

// Imported AFTER the mock so the component picks up the mocked bridge.
const { EmsTasks } = await import('./EmsTasks');

const task = (over: Partial<CardEmsTask> = {}): CardEmsTask => ({
  id: 't1', title: 'תקן שעון', status: 'in_progress', priority: 'high',
  expectedCompletionDate: '', description: '', assignee: null,
  ...over,
});

beforeEach(() => {
  mockSigma.openKibbutzEmsTask.mockClear();
  mockSigma.state.tasks = [];
});

describe('EmsTasks', () => {
  it('no open tasks → renders nothing', () => {
    mockSigma.state.tasks = [];
    const { container } = render(<EmsTasks kibbutz="דפנה" />);
    expect(container.firstChild).toBeNull();
  });

  it('header shows the open count', () => {
    mockSigma.state.tasks = [task({ id: 'a' }), task({ id: 'b' })];
    render(<EmsTasks kibbutz="דפנה" />);
    expect(screen.getByText('📋 משימות EMS')).toBeTruthy();
    expect(screen.getByText('2 פתוחות')).toBeTruthy();
  });

  it('a description containing markup renders as literal TEXT, never HTML (React escaping)', () => {
    mockSigma.state.tasks = [task({ description: 'תקלה ב-<b>לוח</b> החשמל' })];
    render(<EmsTasks kibbutz="דפנה" />);
    expect(screen.getByText('תקלה ב-<b>לוח</b> החשמל')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });

  it('no description → no .t-desc element', () => {
    mockSigma.state.tasks = [task({ description: '' })];
    const { container } = render(<EmsTasks kibbutz="דפנה" />);
    expect(container.querySelector('.t-desc')).toBeNull();
  });

  it('overdue task → ⏰ marker and the overdue class', () => {
    mockSigma.state.tasks = [task({ expectedCompletionDate: '2020-01-01' })];
    const { container } = render(<EmsTasks kibbutz="דפנה" />);
    expect(container.querySelector('.card-ems-task.overdue')).toBeTruthy();
    expect(screen.getByText(/⏰/)).toBeTruthy();
  });

  it('a future due date → no ⏰, no overdue class', () => {
    mockSigma.state.tasks = [task({ expectedCompletionDate: '2099-01-01' })];
    const { container } = render(<EmsTasks kibbutz="דפנה" />);
    expect(container.querySelector('.card-ems-task.overdue')).toBeNull();
  });

  it('no assignee → no 👤 chip', () => {
    mockSigma.state.tasks = [task({ assignee: null })];
    render(<EmsTasks kibbutz="דפנה" />);
    expect(screen.queryByText(/👤/)).toBeNull();
  });

  it('assignee present → 👤 first-name chip', () => {
    mockSigma.state.tasks = [task({ assignee: { id: 'u1', firstName: 'ניתאי' } })];
    render(<EmsTasks kibbutz="דפנה" />);
    expect(screen.getByText(/👤 ניתאי/)).toBeTruthy();
  });

  it('click on a task → sigma.openKibbutzEmsTask(id)', () => {
    mockSigma.state.tasks = [task({ id: 'task-42' })];
    const { container } = render(<EmsTasks kibbutz="דפנה" />);
    fireEvent.click(container.querySelector('.card-ems-task')!);
    expect(mockSigma.openKibbutzEmsTask).toHaveBeenCalledWith('task-42');
  });

  it('re-renders on ems-cache-synced', () => {
    mockSigma.state.tasks = [];
    const { container } = render(<EmsTasks kibbutz="דפנה" />);
    expect(container.firstChild).toBeNull();
    mockSigma.state.tasks = [task({ id: 'new-1' })];
    act(() => emitEmsCacheSynced());
    expect(screen.getByText('1 פתוחות')).toBeTruthy();
  });
});
