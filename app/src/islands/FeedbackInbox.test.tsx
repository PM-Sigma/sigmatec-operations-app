// @vitest-environment jsdom
// Render goldens for the 📣 admin inbox (spec §7 Part F): the admin-only gate, the status
// buttons, and the 🐙 "פתח כרטיס בלוח הפיתוח" path — a bug becomes a CHILD card of a Main
// Fields parent, titled by the Git Ticket System rules, and the issue number lands on the row.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(cleanup);

const { who, rows, updates, sonner, gh } = vi.hoisted(() => ({
  who: { admin: true, viewer: false },
  rows: [] as any[],
  updates: [] as any[],
  sonner: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  gh: { calls: [] as any[], createResult: { number: 321, url: 'u', warnings: [] as string[] } },
}));

vi.mock('@/bridge', () => ({
  sigma: { isAdmin: () => who.admin, isViewer: () => who.viewer, emsToken: () => 'ems-tok' },
  useCurrentUser: () => ({ name: 'עידן', role: 'idan', isViewer: who.viewer }),
  useSigmaEvent: () => {},
  // The §7n gate asks the bridge whether the sign-in is live; in a unit test it is.
  useEmsConnected: () => true,
}));

vi.mock('sonner', () => ({ toast: sonner }));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));

// The real <SigmaProviders> (one shared QueryClient + the localStorage persister) is what the
// island uses in production and works under jsdom — only the cache is reset between tests.
import { queryClient } from '@/lib/query';

vi.mock('@/lib/supabase', () => ({
  SB_URL: 'https://sb.test', SB_ANON: 'anon',
  getSupabase: async () => sbStub(),
  sbWrite: async (run: any) => {
    const res = await run(sbStub());
    if (res?.error) throw res.error;
    return res?.data ?? null;
  },
}));

// The inbox never UPDATEs `feedback` directly — the table has no UPDATE policy and the
// privilege is revoked (db/feedback.sql). Every change goes through the SECURITY DEFINER
// function `feedback_admin_update(p_id, p_actor, p_status, p_github_issue)`, so that is what
// the stub records: the call, WITH the actor it was given.
function sbStub() {
  return {
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }),
    }),
    rpc: async (fn: string, args: any) => {
      updates.push({ fn, ...args });
      return { data: { id: args.p_id }, error: null };
    },
  };
}

const { FeedbackInbox, openFeedbackInbox } = await import('./FeedbackInbox');

const row = (over: Partial<any> = {}) => ({
  id: 'f1', author: 'אביאם', kind: 'bug', text: 'הכפתור לא מגיב בסיכום ביקור',
  audio_path: null, status: 'new', github_issue: null, created_at: '2026-09-18T07:05:00Z',
  ...over,
});

beforeEach(() => {
  who.admin = true; who.viewer = false;
  rows.length = 0; updates.length = 0; gh.calls.length = 0;
  gh.createResult = { number: 321, url: 'u', warnings: [] };
  for (const fn of Object.values(sonner)) (fn as any).mockClear();
  // BOTH have to go: <SigmaProviders> persists the cache to localStorage, so without this a
  // later test re-hydrates the previous test's rows and renders them instead of its own.
  queryClient.clear();
  try { localStorage.clear(); } catch { /* jsdom */ }
  location.hash = '';
  (globalThis as any).fetch = vi.fn(async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    gh.calls.push(body);
    if (body.mode === 'listParents') {
      return new Response(JSON.stringify({ parents: [{ number: 104, title: 'התראות | הגדרות וסינון' }] }), { status: 200 });
    }
    if (body.mode === 'createIssue') return new Response(JSON.stringify(gh.createResult), { status: 200 });
    return new Response('{}', { status: 200 });
  });
});

describe('inbox gate', () => {
  it('opens for an admin', async () => {
    rows.push(row());
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    expect(await screen.findByText(/תיבה נכנסת/)).toBeTruthy();
  });

  it('never opens for a non-admin', () => {
    who.admin = false;
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    expect(screen.queryByText(/תיבה נכנסת/)).toBeNull();
    expect(sonner.error).toHaveBeenCalledWith('התיבה הנכנסת מוגבלת למנהלים');
  });

  it('never opens for a viewer the bridge happens to call admin', () => {
    who.viewer = true;
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    expect(screen.queryByText(/תיבה נכנסת/)).toBeNull();
  });

  it('opens itself on the push deep link #feedback-inbox', async () => {
    rows.push(row());
    location.hash = '#feedback-inbox';
    render(<FeedbackInbox />);
    expect(await screen.findByText(/תיבה נכנסת/)).toBeTruthy();
  });
});

describe('inbox rows', () => {
  it('shows the author, the kind and the text — and בלי שם when there is no author', async () => {
    rows.push(row({ id: 'a', author: null, kind: 'idea', text: 'רעיון נחמד' }));
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    expect(await screen.findByText('בלי שם')).toBeTruthy();
    expect(screen.getByText('רעיון נחמד')).toBeTruthy();
    expect(screen.getByText('רעיון', { selector: 'span' })).toBeTruthy();
  });

  it('flips a status from the pushed detail', async () => {
    rows.push(row());
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    fireEvent.click(await screen.findByText('הכפתור לא מגיב בסיכום ביקור'));
    fireEvent.click(await screen.findByRole('radio', { name: 'טופל' }));
    await waitFor(() => expect(updates).toEqual([
      { fn: 'feedback_admin_update', p_id: 'f1', p_actor: 'עידן', p_status: 'done', p_github_issue: null },
    ]));
  });

  it('offers the dev-board card only for a bug, and only while it has no card yet', async () => {
    rows.push(row({ id: 'b1', kind: 'bug', text: 'באג פתוח' }), row({ id: 'i1', kind: 'idea', text: 'רעיון פתוח' }),
      row({ id: 'b2', kind: 'bug', text: 'באג עם כרטיס', github_issue: 7 }));
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());

    fireEvent.click(await screen.findByText('באג פתוח'));
    expect(await screen.findByText('פתיחת כרטיס בלוח הפיתוח')).toBeTruthy();
    fireEvent.click(screen.getByText('חזרה לרשימה'));

    fireEvent.click(await screen.findByText('רעיון פתוח'));
    expect(screen.queryByText('פתיחת כרטיס בלוח הפיתוח')).toBeNull();
    fireEvent.click(screen.getByText('חזרה לרשימה'));

    fireEvent.click(await screen.findByText('באג עם כרטיס'));
    expect(await screen.findByText('#7')).toBeTruthy();
    expect(screen.queryByText('פתיחת כרטיס בלוח הפיתוח')).toBeNull();
  });
});

describe('bug → dev-board card', () => {
  it('requires a parent, then creates a child card titled by the ticket rules', async () => {
    rows.push(row({ text: 'ההתראות לא נשלחות בשבת' }));
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    fireEvent.click(await screen.findByText('ההתראות לא נשלחות בשבת'));
    fireEvent.click(await screen.findByText('פתיחת כרטיס בלוח הפיתוח'));

    // the parents come from the github function's listParents mode
    await waitFor(() => expect(gh.calls.some(c => c.mode === 'listParents')).toBe(true));

    fireEvent.click(await screen.findByText('יצירת כרטיס ב-Backlog'));
    await waitFor(() => expect(gh.calls.some(c => c.mode === 'createIssue')).toBe(true));

    const call = gh.calls.find(c => c.mode === 'createIssue');
    expect(call.title).toBe('התראות | הגדרות וסינון | ההתראות לא נשלחות בשבת');
    expect(call.parent).toBe(104);
    expect(call.labels).toEqual(['bug']);
    expect(call.body).toContain('ההתראות לא נשלחות בשבת');
    expect(call.token).toBe('ems-tok');

    // and the issue number lands on the row
    await waitFor(() => expect(updates).toEqual([
      { fn: 'feedback_admin_update', p_id: 'f1', p_actor: 'עידן', p_status: 'seen', p_github_issue: 321 },
    ]));
    expect(sonner.success).toHaveBeenCalledWith('נוצר כרטיס #321 ב-Backlog');
  });

  it('refuses to create a card with no parent — the board is two-level by rule', async () => {
    rows.push(row({ text: 'משהו כללי נשבר' }));            // no alert keywords → nothing pre-selected
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    fireEvent.click(await screen.findByText('משהו כללי נשבר'));
    fireEvent.click(await screen.findByText('פתיחת כרטיס בלוח הפיתוח'));
    await screen.findByText('יצירת כרטיס ב-Backlog');
    expect((screen.getByText('יצירת כרטיס ב-Backlog').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(gh.calls.some(c => c.mode === 'createIssue')).toBe(false);
  });

  it('surfaces the board warnings instead of pretending the card is perfect', async () => {
    rows.push(row({ text: 'ההתראה נכשלה' }));
    gh.createResult = { number: 55, url: 'u', warnings: ['parent: not found'] };
    render(<FeedbackInbox />);
    act(() => openFeedbackInbox());
    fireEvent.click(await screen.findByText('ההתראה נכשלה'));
    fireEvent.click(await screen.findByText('פתיחת כרטיס בלוח הפיתוח'));
    fireEvent.click(await screen.findByText('יצירת כרטיס ב-Backlog'));
    await waitFor(() => expect(sonner.warning).toHaveBeenCalled());
  });
});
