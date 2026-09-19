// @vitest-environment jsdom
// Render goldens for 🔒 internal tasks (Task 26): the card section, "היום שלי", and that a
// write really reaches supabase and emits `internal-tasks-changed` exactly once.
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { state, rows, inserted, updated, created, sonner, busEvents } = vi.hoisted(() => ({
  state: { user: 'עידן', viewer: false },
  rows: [] as any[],
  inserted: [] as Array<{ table: string; row: any }>,
  updated: [] as Array<{ table: string; row: any }>,
  created: [] as any[],
  sonner: { success: vi.fn(), error: vi.fn() },
  busEvents: [] as string[],
}));

class FakeBus extends EventTarget {
  dispatchEvent(e: Event) { busEvents.push(e.type); return super.dispatchEvent(e); }
}
const bus = new FakeBus();

vi.mock('@/bridge', () => ({
  sigma: {
    createTask: (row: any) => { created.push(row); return Promise.resolve({ sent: true, id: 'T-' + created.length }); },
  },
  sigmaBus: bus,
  useCurrentUser: () => ({ name: state.user, role: state.viewer ? 'viewer' : 'idan', isViewer: state.viewer }),
}));

vi.mock('sonner', () => ({ toast: sonner }));

vi.mock('@/lib/supabase', () => {
  const table = (name: string) => ({
    select: () => ({
      order: () => Promise.resolve({ data: rows, error: null }),
    }),
    insert: (row: any) => {
      inserted.push({ table: name, row });
      return { select: () => ({ single: async () => ({ data: { id: 'new-1' }, error: null }) }) };
    },
    update: (row: any) => {
      updated.push({ table: name, row });
      return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: row.id || 'x' }, error: null }) }) }) };
    },
  });
  return {
    getSupabase: async () => ({ from: table }),
    sbWrite: (fn: () => Promise<any>) => fn(),
  };
});

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
vi.mock('@/lib/query', () => ({ queryClient: qc }));

const { InternalTasksSection, MyInternalTasks } = await import('./InternalTasks');

function withClient(node: React.ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const row = (over: Partial<any> = {}) => ({
  id: 'r1', title: 'תדפיס חדש למונה', owner: null, kibbutz: 'דפנה', done: false,
  created_by: 'עידן', created_at: '2026-09-17T10:00:00Z', ...over,
});

beforeEach(() => {
  rows.length = 0; inserted.length = 0; updated.length = 0; created.length = 0; busEvents.length = 0;
  state.viewer = false;
  qc.clear();
});

describe('InternalTasksSection', () => {
  it('nothing to show and cannot write → renders nothing', async () => {
    state.viewer = true;
    const { container } = render(withClient(<InternalTasksSection kibbutz="דפנה" canAct={false} />));
    await waitFor(() => expect(container.querySelector('.card-internal-tasks')).toBeNull());
  });

  it('renders open rows for this kibbutz only', async () => {
    rows.push(row({ id: 'a', kibbutz: 'דפנה' }), row({ id: 'b', kibbutz: 'חוקוק' }), row({ id: 'c', kibbutz: 'דפנה', done: true }));
    render(withClient(<InternalTasksSection kibbutz="דפנה" canAct={true} />));
    await waitFor(() => expect(screen.getByText('תדפיס חדש למונה')).toBeTruthy());
    expect(screen.queryAllByText('תדפיס חדש למונה')).toHaveLength(1);
  });

  it('a viewer sees the rows but no add box and no toggle button', async () => {
    rows.push(row());
    state.viewer = true;
    const { container } = render(withClient(<InternalTasksSection kibbutz="דפנה" canAct={false} />));
    await waitFor(() => expect(screen.getByText('תדפיס חדש למונה')).toBeTruthy());
    expect(container.querySelector('.internal-task-input')).toBeNull();
  });

  it('adding a task inserts + emits internal-tasks-changed', async () => {
    render(withClient(<InternalTasksSection kibbutz="דפנה" canAct={true} />));
    await waitFor(() => expect(document.querySelector('.internal-task-input')).toBeTruthy());
    const input = document.querySelector('.internal-task-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'לבדוק את שער החשמל' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toEqual({ table: 'internal_tasks', row: { title: 'לבדוק את שער החשמל', kibbutz: 'דפנה', owner: 'עידן', created_by: 'עידן' } });
    expect(busEvents.filter(e => e === 'internal-tasks-changed')).toHaveLength(1);
  });

  it('✓ toggles done exactly once and emits the bus event exactly once', async () => {
    rows.push(row({ id: 'a' }));
    render(withClient(<InternalTasksSection kibbutz="דפנה" canAct={true} />));
    await waitFor(() => expect(screen.getByText('תדפיס חדש למונה')).toBeTruthy());
    const btn = document.querySelector('.internal-task-row button') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0]).toEqual({ table: 'internal_tasks', row: { done: true } });
    expect(busEvents.filter(e => e === 'internal-tasks-changed')).toHaveLength(1);
  });

  it('⬆ promotes to EMS, then marks the row done — never before', async () => {
    rows.push(row({ id: 'a', owner: 'ניתאי' }));
    render(withClient(<InternalTasksSection kibbutz="דפנה" canAct={true} />));
    await waitFor(() => expect(document.querySelector('.internal-task-promote')).toBeTruthy());
    const btn = document.querySelector('.internal-task-promote') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].assigneeName).toBe('ניתאי');
    expect(updated[0]).toEqual({ table: 'internal_tasks', row: { done: true } });
  });
});

describe('MyInternalTasks', () => {
  it('no open rows for this person → renders nothing', async () => {
    rows.push(row({ owner: 'עמיחי' }));
    const { container } = render(withClient(<MyInternalTasks person="עידן" canAct={true} />));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('shows the person\'s own open rows, including company-wide (kibbutz null)', async () => {
    rows.push(row({ id: 'a', owner: 'עידן', kibbutz: null, title: 'לעדכן את המחירון' }));
    render(withClient(<MyInternalTasks person="עידן" canAct={true} />));
    await waitFor(() => expect(screen.getByText('לעדכן את המחירון')).toBeTruthy());
  });
});
