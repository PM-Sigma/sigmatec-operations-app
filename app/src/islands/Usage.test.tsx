// @vitest-environment jsdom
// Render goldens for the 📈 שימוש island (spec §7j): the עידן-only gate, the deep link the
// weekly push uses, and the fact that every number on screen comes from aggregate().
//
// Recharts is mocked to a plain <div>: ResponsiveContainer measures its parent, which is
// always 0×0 in jsdom, so the real chart would render nothing and only slow the suite down.
// The chart's DATA is covered by usage.test.ts (perDay) — what matters here is the page around it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('recharts', () => {
  const Stub = ({ children }: any) => <div data-testid="chart">{children}</div>;
  return {
    ResponsiveContainer: Stub, BarChart: Stub, Bar: Stub, CartesianGrid: Stub, XAxis: Stub, YAxis: Stub,
    Tooltip: Stub, Legend: Stub,
  };
});

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: async () => ({ rpc }),
  SB_URL: 'https://example.test',
  SB_ANON: 'anon',
}));

const at = (daysAgo: number, h = 9) =>
  new Date(Date.now() - daysAgo * 86400_000).toISOString().replace(/T\d\d/, 'T' + String(h).padStart(2, '0'));

const ROWS = [
  { person: 'אביאם', page: 'kibbutz', action: 'view', target: null, at: at(1, 8), session_id: 's1', device: 'phone' },
  { person: 'אביאם', page: 'kibbutz', action: 'visit-saved', target: 'גבת', at: at(1, 9), session_id: 's1', device: 'phone' },
  { person: 'אביאם', page: 'calendar', action: 'view', target: null, at: at(2, 9), session_id: 's2', device: 'phone' },
  { person: 'ניתאי', page: 'kibbutz', action: 'view', target: null, at: at(3, 9), session_id: 's3', device: 'phone' },
  { person: 'אביאם', page: 'kibbutz', action: 'search-no-results', target: 'גשר', at: at(1, 8), session_id: 's1', device: 'phone' },
];

function asUser(name: string, opts: { idan?: boolean; viewer?: boolean } = {}) {
  (window as any).sigmaBus = new EventTarget();
  (window as any).sigma = {
    getCurrentUser: () => name,
    getRole: () => (opts.viewer ? 'viewer' : opts.idan ? 'idan' : 'team'),
    isIdan: () => !!opts.idan,
    isViewer: () => !!opts.viewer,
    isEmsConnected: () => true,   // the §7n gate: a signed-in session
    toast: vi.fn(),
    sbPass: () => ({ token: 't', exp: Date.now() + 60_000 }),
  };
}

describe('📈 שימוש island', () => {
  beforeEach(() => {
    // The query cache is a module singleton PERSISTED to localStorage (lib/query.ts), so
    // without this every test after the first one rehydrates the previous test's rows.
    try { localStorage.clear(); } catch { /* noop */ }
    rpc.mockReset();
    rpc.mockResolvedValue({ data: ROWS, error: null });
    location.hash = '';
  });
  afterEach(() => {
    // vitest runs without `globals: true`, so RTL's auto-cleanup is NOT registered and the
    // previous test's dialog would still be in the document.
    cleanup();
    delete (window as any).sigma;
    delete (window as any).sigmaBus;
    location.hash = '';
    vi.resetModules();
  });

  // Explicit timeout, not the 15s default: this is the file's heaviest render (KPI strip + heat
  // table + top actions + narrative, four `findByText` waits chained), and it was seen timing
  // out under a fully-loaded test-all run (many vitest workers + a concurrent build sharing the
  // same CPU) while passing in isolation in ~3.5s — a real load-sensitivity, not a logic bug. A
  // generous fixed ceiling keeps the test deterministic under contention without hiding an
  // actual regression (a hung render still fails, just not on a hair-trigger).
  it('opens on the #usage deep link (the weekly push action) and renders the report', async () => {
    asUser('עידן', { idan: true });
    location.hash = '#usage';
    const { Usage } = await import('./Usage');
    render(<Usage />);

    expect(await screen.findByText('📈 שימוש · 30 ימים אחרונים', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('usage_report', { p_days: 30, p_actor: 'עידן' }));

    // KPI strip + heat table + top actions + narrative, all from aggregate()/usageNarrative()
    expect(await screen.findByText('פעולות השבוע')).toBeInTheDocument();
    expect(screen.getByText('מפת חום: אדם × עמוד (כניסות)')).toBeInTheDocument();
    expect(screen.getByText('סיכום ביקור נשמר')).toBeInTheDocument();
    expect(screen.getByText('🔔 התקציר השבועי (ראשון 08:00)')).toBeInTheDocument();
    expect(screen.getByText(/החיפוש בקיבוצים נכשל פעם אחת/)).toBeInTheDocument();
    // the roster is always listed, so a person with no events is visible as such
    // twice on purpose: once as a heat-table row, once in "נראו לאחרונה"
    expect(screen.getAllByText('מתניה')).toHaveLength(2);
  }, 30_000);

  it('never opens for anyone but עידן, and never asks the server', async () => {
    asUser('ניתאי');
    location.hash = '#usage';
    const { Usage } = await import('./Usage');
    render(<Usage />);
    // Flush the microtask queue and one macrotask turn — NOT a wall-clock sleep. A fixed
    // `setTimeout(30)` is a race against the machine: on a loaded runner the query had not
    // fired yet and the test passed for the wrong reason, and the same arbitrary number is
    // what made this file time out under `npm run qa`. Two `act` turns are enough for React
    // to commit and for any promise the island kicked off to settle, whatever the CPU is
    // doing. (Task 18 — flake filed from Task 29's review.)
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('📈 שימוש · 30 ימים אחרונים')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('turns the RLS refusal into Hebrew instead of a Postgres string', async () => {
    const { usageError } = await import('./Usage');
    expect(usageError({ message: 'permission denied for function usage_report' }))
      .toBe('ההתחברות פגה. צריך להתחבר מחדש');
    expect(usageError({ message: 'boom' })).toBe('boom');
  });

  it('says so plainly when nothing has been collected yet', async () => {
    asUser('עידן', { idan: true });
    rpc.mockResolvedValue({ data: [], error: null });
    location.hash = '#usage';
    const { Usage } = await import('./Usage');
    render(<Usage />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    // No hand-tuned timeout: testing-library's default already retries until the suite's own
    // deadline, and a 3 s ceiling inside a 5 s test is what turned a slow render into a
    // confusing "element not found" instead of a clean timeout. (Task 18)
    expect(await screen.findByText(/עוד לא נאספו נתוני שימוש/)).toBeInTheDocument();
  });
});
