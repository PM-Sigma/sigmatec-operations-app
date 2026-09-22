// @vitest-environment jsdom
// Render goldens for 🔒 internal tasks (Task 26, reshaped 22.9): the READ-ONLY card section,
// the modal panel with its actions, the two card adders, "היום שלי", and that a write really
// reaches supabase (with the 22.9 fields, and without them on an older schema) and emits
// `internal-tasks-changed` exactly once.
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { state, rows, inserted, updated, created, sonner, busEvents, schema } = vi.hoisted(() => ({
  state: { user: 'עידן', viewer: false },
  rows: [] as any[],
  inserted: [] as Array<{ table: string; row: any }>,
  updated: [] as Array<{ table: string; row: any }>,
  created: [] as any[],
  sonner: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  busEvents: [] as string[],
  schema: { hasFields: true },
}));

class FakeBus extends EventTarget {
  dispatchEvent(e: Event) { busEvents.push(e.type); return super.dispatchEvent(e); }
}
const bus = new FakeBus();

vi.mock('@/bridge', () => ({
  sigma: {
    createTask: (row: any) => { created.push(row); return Promise.resolve({ sent: true, id: 'T-' + created.length }); },
    openKibbutzModal: vi.fn(),
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
      return { select: () => ({ single: async () => {
        // An older database refuses the 22.9 columns the way PostgREST does.
        if (!schema.hasFields && ('due_date' in row || 'priority' in row || 'kind' in row)) {
          throw new Error("Could not find the 'due_date' column of 'internal_tasks' in the schema cache");
        }
        return { data: { id: 'new-1' }, error: null };
      } }) };
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

const { InternalTasksSection, InternalTasksPanel, TaskAdders, MyInternalTasks, createInternalTask } = await import('./InternalTasks');

function withClient(node: React.ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const row = (over: Partial<any> = {}) => ({
  id: 'r1', title: 'תדפיס חדש למונה', owner: null, kibbutz: 'דפנה', done: false,
  created_by: 'עידן', created_at: '2026-09-17T10:00:00Z', ...over,
});

beforeEach(() => {
  rows.length = 0; inserted.length = 0; updated.length = 0; created.length = 0; busEvents.length = 0;
  state.viewer = false; schema.hasFields = true;
  qc.clear();
});

describe('InternalTasksSection (the home card — read only)', () => {
  it('nothing open → renders nothing', async () => {
    const { container } = render(withClient(<InternalTasksSection kibbutz="דפנה" />));
    await waitFor(() => expect(container.querySelector('.card-internal-tasks')).toBeNull());
  });

  it('renders open rows for this kibbutz only, with the owner and the due date, and no actions', async () => {
    rows.push(row({ id: 'a', kibbutz: 'דפנה', owner: 'ניתאי', due_date: '2026-09-05' }), row({ id: 'b', kibbutz: 'חוקוק' }), row({ id: 'c', kibbutz: 'דפנה', done: true }));
    const { container } = render(withClient(<InternalTasksSection kibbutz="דפנה" />));
    await waitFor(() => expect(screen.getByText('תדפיס חדש למונה')).toBeTruthy());
    expect(screen.queryAllByText('תדפיס חדש למונה')).toHaveLength(1);
    expect(screen.getByText('ניתאי')).toBeTruthy();
    expect(screen.getByText('5.9')).toBeTruthy();
    expect(container.querySelector('.internal-task-row button')).toBeNull();        // no ✓, no ⬆
    expect(container.querySelector('.internal-task-input')).toBeNull();             // no add box
  });
});

describe('TaskAdders (the two bubbles under the card)', () => {
  it('render for a writer, not for the viewer', async () => {
    const a = render(withClient(<TaskAdders kibbutz="דפנה" />));
    expect(screen.getByTestId('add-ems-task')).toBeTruthy();
    expect(screen.getByTestId('add-internal-task')).toBeTruthy();
    a.unmount();
    state.viewer = true;
    const { container } = render(withClient(<TaskAdders kibbutz="דפנה" />));
    expect(container.firstChild).toBeNull();
  });
});

describe('InternalTasksPanel (inside the kibbutz card)', () => {
  it('✓ toggles done exactly once and emits the bus event exactly once', async () => {
    rows.push(row({ id: 'a' }));
    render(withClient(<InternalTasksPanel kibbutz="דפנה" canAct={true} />));
    await waitFor(() => expect(screen.getByText('תדפיס חדש למונה')).toBeTruthy());
    const btn = document.querySelector('.internal-task-row button') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0]).toEqual({ table: 'internal_tasks', row: { done: true } });
    expect(busEvents.filter(e => e === 'internal-tasks-changed')).toHaveLength(1);
  });

  it('⬆ promotes to EMS, then marks the row done — never before', async () => {
    rows.push(row({ id: 'a', owner: 'ניתאי' }));
    render(withClient(<InternalTasksPanel kibbutz="דפנה" canAct={true} />));
    await waitFor(() => expect(document.querySelector('.internal-task-promote')).toBeTruthy());
    const btn = document.querySelector('.internal-task-promote') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].assigneeName).toBe('ניתאי');
    expect(updated[0]).toEqual({ table: 'internal_tasks', row: { done: true } });
  });

  it('the viewer sees rows without ✓ / ⬆ / ➕', async () => {
    rows.push(row());
    const { container } = render(withClient(<InternalTasksPanel kibbutz="דפנה" canAct={false} />));
    await waitFor(() => expect(screen.getByText('תדפיס חדש למונה')).toBeTruthy());
    expect(container.querySelector('.internal-task-row button')).toBeNull();
    expect(screen.queryByText('➕ משימה פנימית')).toBeNull();
  });
});

describe('createInternalTask', () => {
  it('writes the 22.9 fields and emits internal-tasks-changed once', async () => {
    await createInternalTask('לבדוק את שער החשמל', 'דפנה', 'ניתאי', 'עידן', { due_date: '2026-10-01', priority: 'high', kind: 'טכני' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual({ table: 'internal_tasks', row: {
      title: 'לבדוק את שער החשמל', kibbutz: 'דפנה', owner: 'ניתאי', created_by: 'עידן',
      due_date: '2026-10-01', priority: 'high', kind: 'טכני',
    } });
    expect(busEvents.filter(e => e === 'internal-tasks-changed')).toHaveLength(1);
  });

  it('on a database without the 22.9 columns it falls back to the old shape — the task is never lost', async () => {
    schema.hasFields = false;
    await createInternalTask('לבדוק את שער החשמל', 'דפנה', 'ניתאי', 'עידן', { due_date: '2026-10-01', priority: 'high', kind: null });
    expect(inserted).toHaveLength(2);
    expect(inserted[1].row).toEqual({ title: 'לבדוק את שער החשמל', kibbutz: 'דפנה', owner: 'ניתאי', created_by: 'עידן' });
    expect(busEvents.filter(e => e === 'internal-tasks-changed')).toHaveLength(1);
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
