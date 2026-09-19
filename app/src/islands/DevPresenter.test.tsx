// @vitest-environment jsdom
// Render goldens for ▶ ישיבת פיתוח (company-process spec §7). The ranking and the selectors
// are pinned in lib/sprintPrep.test.ts; what is pinned HERE is everything a pure golden cannot
// see — that the walk crosses the three columns in order, that 📌 writes exactly ONE
// `meeting_events` row of kind `issue` with its issue number, that accepting a proposal calls
// the EXISTING move action once and never a create, and that the role gate holds.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(cleanup);

const { state, inserted, ghCalls, sonner, tracked } = vi.hoisted(() => ({
  state: { user: 'עידן', viewer: false, admin: true },
  inserted: [] as Array<{ table: string; row: any }>,
  ghCalls: [] as any[],
  tracked: [] as string[],
  sonner: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const DAY = 86400000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

const BOARD = [
  { number: 1, title: 'קיבוצים | — | תחום ראשי', status: 'Main Fields', state: 'open', pos: 0 },
  {
    number: 10, title: 'קיבוצים | קריאות | תיקון קריאה שלילית', status: 'In Progress', state: 'open',
    parent: 1, pos: 1, body: '## מטרה\nלתקן קריאה שלילית.', createdAt: ago(30), updatedAt: ago(20),
    comments: [{ id: 'c1', author: 'מתניה', body: 'עידן, איזה תעריף?', createdAt: ago(2) }],
  },
  { number: 12, title: 'דוחות | ייצוא | ייצוא אקסל', status: 'In Review', state: 'open', parent: 1, pos: 2, body: '## אפיון\nא.', createdAt: ago(60), updatedAt: ago(9) },
  { number: 13, title: 'דוחות | ייצוא | PDF', status: 'Ready', state: 'open', parent: 1, pos: 3, body: 'שורה', createdAt: ago(5), updatedAt: ago(2) },
  { number: 21, title: 'דוחות | הדפסה | כותרת', status: 'Backlog', state: 'open', parent: 1, pos: 4, priority: 'קריטי', body: '## רקע\nדחוף.', createdAt: ago(3) },
];

vi.mock('@/bridge', () => ({
  sigma: {
    getCurrentUser: () => state.user,
    isAdmin: () => state.admin,
    isViewer: () => state.viewer,
    emsToken: () => 'ems-token',
  },
  useCurrentUser: () => ({ name: state.user, role: state.viewer ? 'viewer' : 'idan', isViewer: state.viewer }),
  useSigmaEvent: () => {},
  useEmsConnected: () => true,
}));

vi.mock('sonner', () => ({ toast: sonner }));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/lib/track', () => ({ track: (a: string, b?: string) => { tracked.push(b ? a + ':' + b : a); }, trackMount: vi.fn() }));
vi.mock('@/lib/registry', () => ({ registerMoreItem: vi.fn() }));

vi.mock('@/lib/devBoard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/devBoard')>('@/lib/devBoard');
  return {
    ...actual,
    fetchDevBoard: async () => BOARD,
    moveToSprint: async (numbers: number[]) => {
      ghCalls.push({ mode: 'setStatus', numbers });
      return { updated: numbers };
    },
  };
});

vi.mock('@/lib/supabase', () => {
  const table = (name: string) => ({
    select: () => ({ then: (res: any) => Promise.resolve({ data: [], error: null }).then(res) }),
    insert: (row: any) => {
      inserted.push({ table: name, row });
      return { select: () => ({ single: async () => ({ data: { id: name + '-1', ...row }, error: null }) }) };
    },
    update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }) }),
  });
  return {
    SB_URL: 'https://sb.test', SB_ANON: 'anon',
    getSupabase: async () => ({ from: table }),
    sbWrite: async (run: any) => {
      const res = await run({ from: table });
      if (res?.error) throw res.error;
      return res?.data ?? null;
    },
  };
});

const { DevPresenter, openDevPresenter } = await import('./DevPresenter');

async function openScreen() {
  render(<DevPresenter />);
  await act(async () => { openDevPresenter(); });
  await waitFor(() => expect(screen.getByTestId('dev-prep')).toBeTruthy());
}

const events = () => inserted.filter(i => i.table === 'meeting_events').map(i => i.row);

beforeEach(() => {
  state.user = 'עידן'; state.viewer = false; state.admin = true;
  inserted.length = 0; ghCalls.length = 0; tracked.length = 0;
  sonner.success.mockClear(); sonner.error.mockClear();
});

describe('the 📋 prep card', () => {
  it('opens on the prep card with the burndown and every list', async () => {
    await openScreen();
    expect(screen.getByTestId('dev-burndown').textContent).toContain('0/3');
    expect(screen.getByTestId('dev-nospec').textContent).toContain('#13');
    expect(screen.getByTestId('dev-blocked').textContent).toContain('#10');
    expect(screen.getByTestId('dev-questions').textContent).toContain('עידן, איזה תעריף?');
    expect(screen.getByTestId('dev-proposed').textContent).toContain('#21');
  });

  it('a dev session is opened for the meeting', async () => {
    await openScreen();
    await waitFor(() => expect(inserted.some(i => i.table === 'meeting_sessions' && i.row.kind === 'dev')).toBe(true));
  });

  it('accepting a proposal calls the EXISTING move action once, and never creates a card', async () => {
    await openScreen();
    await act(async () => { fireEvent.click(screen.getByTestId('dev-accept-21')); });
    await waitFor(() => expect(ghCalls.length).toBe(1));
    expect(ghCalls[0]).toEqual({ mode: 'setStatus', numbers: [21] });
    expect(ghCalls.some(c => c.mode === 'createIssue')).toBe(false);
    // …and pressing it again is refused rather than moving it twice.
    await act(async () => { fireEvent.click(screen.getByTestId('dev-accept-21')); });
    expect(ghCalls.length).toBe(1);
  });
});

describe('the walk', () => {
  async function startWalk() {
    await openScreen();
    await act(async () => { fireEvent.click(screen.getByTestId('dev-start')); });
    await waitFor(() => expect(screen.getByTestId('dev-card-title')).toBeTruthy());
  }

  it('walks בפיתוח עכשיו → שלבי בדיקות → ספרינט הקרוב, one card per screen', async () => {
    await startWalk();
    expect(screen.getByTestId('dev-column').textContent).toBe('בפיתוח עכשיו');
    expect(screen.getByTestId('dev-card-title').textContent).toContain('תיקון קריאה שלילית');
    expect(screen.getByTestId('dev-counter').textContent).toContain('1 / 3');
    expect(screen.getByTestId('dev-card-body').textContent).toContain('לתקן קריאה שלילית');
    expect(screen.getByTestId('dev-card-comments').textContent).toContain('מתניה');
    expect(screen.getByTestId('dev-card-questions').textContent).toContain('איזה תעריף');

    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    expect(screen.getByTestId('dev-column').textContent).toBe('שלבי בדיקות');
    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    expect(screen.getByTestId('dev-column').textContent).toBe('ספרינט הקרוב');
    // …and it does not wrap around past the last card.
    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    expect(screen.getByTestId('dev-counter').textContent).toContain('3 / 3');

    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect(screen.getByTestId('dev-column').textContent).toBe('שלבי בדיקות');
  });

  it('a parent card is never walked', async () => {
    await startWalk();
    expect(screen.getByTestId('dev-counter').textContent).toContain('/ 3');
    expect(screen.getByTestId('dev-card-title').textContent).not.toContain('תחום ראשי');
  });

  it('📌 writes exactly one issue event with the card`s number, and does not move the screen', async () => {
    await startWalk();
    await waitFor(() => expect(events().length).toBeGreaterThan(0));
    const before = events().length;
    await act(async () => { fireEvent.click(screen.getByTestId('dev-marker')); });
    await waitFor(() => expect(events().length).toBe(before + 1));
    const row = events()[events().length - 1];
    expect(row.kind).toBe('issue');
    expect(row.issue_number).toBe(10);
    expect(screen.getByTestId('dev-counter').textContent).toContain('1 / 3');
  });

  it('Space marks the moment too', async () => {
    await startWalk();
    await waitFor(() => expect(events().length).toBeGreaterThan(0));
    const before = events().length;
    await act(async () => { fireEvent.keyDown(window, { key: ' ' }); });
    await waitFor(() => expect(events().length).toBe(before + 1));
    expect(screen.getByTestId('dev-counter').textContent).toContain('1 / 3');
  });

  it('arriving at a card logs it once — never twice for the same arrival', async () => {
    await startWalk();
    await waitFor(() => expect(events().filter(r => r.issue_number === 10).length).toBe(1));
    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    await waitFor(() => expect(events().filter(r => r.issue_number === 12).length).toBe(1));
  });
});

describe('the gate', () => {
  it('a viewer never gets the screen', async () => {
    state.user = 'צפייה'; state.viewer = true; state.admin = false;
    render(<DevPresenter />);
    await act(async () => { openDevPresenter(); });
    expect(screen.queryByTestId('dev-presenter')).toBeNull();
  });

  it('מתניה and אליה run it behind the dev-page gate; אביאם does not', async () => {
    state.user = 'מתניה'; state.admin = false;
    await openScreen();
    cleanup();

    state.user = 'אביאם'; state.admin = false;
    render(<DevPresenter />);
    await act(async () => { openDevPresenter(); });
    expect(screen.queryByTestId('dev-presenter')).toBeNull();
  });
});

describe('the copy rule (§6)', () => {
  it('says nothing about the app`s own mechanics', async () => {
    await openScreen();
    const text = screen.getByTestId('dev-presenter').textContent || '';
    expect(text).not.toMatch(/GitHub|Supabase|API|token|edge|fetch/i);
  });
});
