// @vitest-environment jsdom
// Render goldens for 📝 ישיבה → סיכום (company-process spec §1.3). The pure rules live in
// app/src/lib/meetingReview.test.ts; what is pinned HERE is everything a golden cannot see —
// that a chip, an owner, an edit, a ➕ and a move really reach the draft; that בצע calls the
// writer ONCE with the bundle the draft describes; that ביטול writes nothing at all (the
// contract the whole screen exists for); and that a viewer or a non-admin cannot open it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(cleanup);

const { state, rpc, inserted, updated, created, sonner, tracked } = vi.hoisted(() => ({
  state: { user: 'עידן', viewer: false, admin: true },
  rpc: [] as Array<{ fn: string; args: any }>,
  inserted: [] as Array<{ table: string; row: any }>,
  updated: [] as Array<{ table: string; row: any }>,
  created: [] as any[],
  tracked: [] as string[],
  sonner: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/bridge', () => ({
  sigma: {
    getCurrentUser: () => state.user,
    isAdmin: () => state.admin,
    isViewer: () => state.viewer,
    createTask: (row: any) => { created.push(row); return Promise.resolve({ sent: true, id: 'T-' + created.length }); },
    emsSiteIdForKibbutz: async () => 'site-1',
  },
  useCurrentUser: () => ({ name: state.user, role: state.viewer ? 'viewer' : 'idan', isViewer: state.viewer }),
  useSigmaEvent: () => {},
  useEmsConnected: () => true,
}));

vi.mock('sonner', () => ({ toast: sonner }));
vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));
vi.mock('@/lib/track', () => ({ track: (a: string, b?: string) => { tracked.push(b ? a + ':' + b : a); }, trackMount: vi.fn() }));
vi.mock('@/components/EmsGate', () => ({ EmsGate: ({ children }: any) => <>{children}</> }));

vi.mock('@/lib/supabase', () => {
  /** The rows the RPC "wrote", so the ems_task_id PATCH can find their ids. */
  const stored: Array<Record<string, unknown>> = [];
  const table = (name: string) => ({
    select: (_c?: string) => {
      const q = {
        eq: () => q,
        is: async () => ({ data: [], error: null }),
        single: async () => ({ data: { id: 'x' }, error: null }),
        then: (res: any) => Promise.resolve({
          data: name === 'kibbutz_meeting_notes' ? stored : [], error: null,
        }).then(res),
      };
      return q;
    },
    insert: (row: any) => {
      inserted.push({ table: name, row });
      return { select: async () => ({ data: [{ id: name + '-1' }], error: null }) };
    },
    update: (row: any) => {
      updated.push({ table: name, row });
      return {
        eq: (_col: string, val: any) => {
          if (name === 'kibbutz_meeting_notes') {
            const hit = stored.find((s: any) => s.id === val);
            if (hit) Object.assign(hit, row);
          }
          return { select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) };
        },
      };
    },
  });
  const client = {
    from: table,
    rpc: (fn: string, args: any) => {
      rpc.push({ fn, args });
      if (fn === 'import_meeting_notes') {
        stored.length = 0;
        (args?.p?.rows || []).forEach((r: any, i: number) =>
          stored.push({ id: 'kmn-' + (i + 1), kibbutz: r.kibbutz, seq: r.seq }));
      }
      return Promise.resolve({ data: { inserted: (args?.p?.rows || []).length }, error: null });
    },
  };
  return {
    SB_URL: 'https://sb.test', SB_ANON: 'anon',
    getSupabase: async () => client,
    sbWrite: async (run: any) => {
      const res = await run(client);
      if (res?.error) throw res.error;
      return res?.data ?? null;
    },
  };
});

const { MeetingReview, openMeetingReview } = await import('./MeetingReview');

/** Two kibbutzim, four lines — the same shape lib/meetingReview.test.ts uses. */
const PARSED = {
  meeting_date: '2026-09-17',
  meeting_kind: 'company' as const,
  sections: [
    {
      heading: 'דפנה', kibbutzim: ['דפנה'], unmatched: [],
      bullets: [
        { seq: 1, text: 'להחליף את המונה הראשי מול הגזבר.', owners: ['אביאם'], quiet: false },
        { seq: 2, text: 'ללא פערים.', owners: [], quiet: true },
      ],
    },
    {
      heading: 'חוקוק', kibbutzim: ['חוקוק'], unmatched: [],
      bullets: [{ seq: 1, text: 'הוחלט שהקריאות הידניות קובעות.', owners: ['עידן'], quiet: false }],
    },
  ],
};

async function openScreen() {
  render(<MeetingReview />);
  await act(async () => { openMeetingReview(PARSED as any); });
  await waitFor(() => expect(screen.getByTestId('meeting-review')).toBeTruthy());
}

beforeEach(() => {
  state.user = 'עידן'; state.viewer = false; state.admin = true;
  rpc.length = 0; inserted.length = 0; updated.length = 0; created.length = 0; tracked.length = 0;
  sonner.success.mockClear(); sonner.error.mockClear();
});

describe('the screen', () => {
  it('opens on the parse, one section per kibbutz, every line with a proposal', async () => {
    await openScreen();
    expect(screen.getByTestId('review-section-דפנה')).toBeTruthy();
    expect(screen.getByTestId('review-section-חוקוק')).toBeTruthy();
    expect(screen.getByTestId('review-chip-דפנה#1-ems').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('review-chip-דפנה#2-chatter').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('review-chip-חוקוק#1-decision').getAttribute('aria-pressed')).toBe('true');
  });

  it('writes NOTHING while it is open', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-chip-דפנה#2-ems'));
    fireEvent.change(screen.getByTestId('review-owner-דפנה#2'), { target: { value: 'מתניה' } });
    expect(rpc).toHaveLength(0);
    expect(inserted).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('the 🔒 chip is offered now that internal tasks have a write path (Task 26)', async () => {
    await openScreen();
    expect(screen.getByTestId('review-chip-דפנה#1-internal')).toBeTruthy();
  });

  it('בצע with a line marked 🔒 inserts exactly one internal_tasks row, owner + kibbutz carried over', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-chip-דפנה#1-internal'));
    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(sonner.success).toHaveBeenCalled());
    const rows = inserted.filter(i => i.table === 'internal_tasks');
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toEqual([{ title: 'להחליף את המונה הראשי מול הגזבר.', owner: 'אביאם', kibbutz: 'דפנה', created_by: 'עידן' }]);
  });

  it('a chip tap changes exactly that line', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-chip-דפנה#1-idea'));
    expect(screen.getByTestId('review-chip-דפנה#1-idea').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('review-chip-דפנה#1-ems').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('review-chip-חוקוק#1-decision').getAttribute('aria-pressed')).toBe('true');
  });

  it('✏️ rewrites the sentence', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-edit-דפנה#1'));
    fireEvent.change(screen.getByTestId('review-edit-text-דפנה#1'), { target: { value: 'להזמין מונה חדש' } });
    fireEvent.click(screen.getByTestId('review-edit-save-דפנה#1'));
    expect(screen.getByTestId('review-text-דפנה#1').textContent).toContain('להזמין מונה חדש');
  });

  it('➕ שורה משלי adds a line to that kibbutz', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-add-דפנה'));
    fireEvent.change(screen.getByTestId('review-add-text-דפנה'), { target: { value: 'לשלוח מייל מסכם.' } });
    fireEvent.click(screen.getByTestId('review-add-save-דפנה'));
    await waitFor(() => expect(screen.getByText('לשלוח מייל מסכם.', { exact: false })).toBeTruthy());
  });

  it('⋯ → "העבר לקיבוץ אחר" moves the line to the other kibbutz', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-more-דפנה#1'));
    fireEvent.change(screen.getByTestId('review-move-דפנה#1'), { target: { value: 'חוקוק' } });
    await waitFor(() => expect(screen.getByTestId('review-line-דפנה#1')).toBeTruthy());
    const hukok = screen.getByTestId('review-section-חוקוק').parentElement!;
    expect(hukok.textContent).toContain('להחליף את המונה הראשי מול הגזבר.');
    expect(hukok.textContent).toContain('הועבר מ־');
  });

  it('a dropped line lands on the header it was dropped on', async () => {
    await openScreen();
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) || '' };
    fireEvent.dragStart(screen.getByTestId('review-line-דפנה#1'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('review-section-חוקוק'), { dataTransfer });
    await waitFor(() =>
      expect(screen.getByTestId('review-section-חוקוק').parentElement!.textContent).toContain('הועבר מ־'));
  });

  it('📋 opens the task modal prefilled, and the save only changes the draft', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-task-דפנה#1'));
    await waitFor(() => expect(screen.getByTestId('review-task-modal')).toBeTruthy());
    expect((screen.getByTestId('review-task-title') as HTMLInputElement).value)
      .toBe('להחליף את המונה הראשי מול הגזבר');
    fireEvent.change(screen.getByTestId('review-task-title'), { target: { value: 'החלפת מונה ראשי' } });
    fireEvent.click(screen.getByTestId('review-task-save'));
    expect(created).toHaveLength(0);              // still nothing in EMS
    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].title).toBe('החלפת מונה ראשי');
  });

  it('בצע writes the bullets once and opens one task per 📋 line', async () => {
    await openScreen();
    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(sonner.success).toHaveBeenCalled());

    expect(rpc.filter(r => r.fn === 'import_meeting_notes')).toHaveLength(1);
    const p = rpc[0].args.p;
    expect(p.meeting_date).toBe('2026-09-17');
    expect(p.created_by).toBe('עידן');
    expect(p.rows).toHaveLength(3);
    expect(p.rows.map((r: any) => r.kibbutz)).toEqual(['דפנה', 'דפנה', 'חוקוק']);
    expect(p.rows[2].text).toBe('🧭 הוחלט שהקריאות הידניות קובעות.');

    // one EMS task (the single 📋 line), linked back onto its note
    expect(created).toHaveLength(1);
    expect(created[0].kibbutz).toBe('דפנה');
    expect(updated.filter(u => u.table === 'kibbutz_meeting_notes' && u.row.ems_task_id)).toHaveLength(1);
    expect(tracked).toContain('review-commit:3');
    // no line was set to 🔒 in this run, so the internal-task table is untouched
    expect(inserted.filter(i => i.table === 'internal_tasks')).toHaveLength(0);
  });

  it('בצע sends what was EDITED, not what was parsed', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-chip-דפנה#2-ems'));
    fireEvent.click(screen.getByTestId('review-edit-דפנה#2'));
    fireEvent.change(screen.getByTestId('review-edit-text-דפנה#2'), { target: { value: 'לתאם ביקור בשבוע הבא' } });
    fireEvent.click(screen.getByTestId('review-edit-save-דפנה#2'));
    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(created).toHaveLength(2));
    expect(rpc[0].args.p.rows[1].text).toBe('לתאם ביקור בשבוע הבא');
  });

  it('ביטול discards everything and writes nothing', async () => {
    await openScreen();
    fireEvent.click(screen.getByTestId('review-chip-דפנה#2-ems'));
    fireEvent.click(screen.getByTestId('review-cancel'));
    await waitFor(() => expect(screen.queryByTestId('review-commit')).toBeNull());
    expect(rpc).toHaveLength(0);
    expect(created).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it('the button says what בצע is about to do', async () => {
    await openScreen();
    expect(screen.getByTestId('review-commit').textContent)
      .toBe('בצע — 1 משימות · 1 הערות · 1 דיבורים');
  });

  it('a partial בצע failure never re-creates the tasks that already landed', async () => {
    await openScreen();
    // Turn all three lines into 📋 lines, so the run has three EMS tasks to create (line 2 —
    // דפנה#2 — is the one whose sigma.createTask throws on the first attempt).
    fireEvent.click(screen.getByTestId('review-chip-דפנה#2-ems'));
    fireEvent.click(screen.getByTestId('review-chip-חוקוק#1-ems'));

    const { sigma } = await import('@/bridge');
    let calls = 0;
    sigma.createTask = ((row: any) => {
      calls++;
      if (calls === 2) return Promise.reject(new Error('EMS down'));
      created.push(row);
      return Promise.resolve({ sent: true, id: 'T-' + created.length });
    }) as any;

    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(sonner.error).toHaveBeenCalledWith(
      expect.stringContaining('נוצרו 2 משימות, 1 נכשלו'),
    ));
    expect(calls).toBe(3); // line 1 succeeded, line 2 (דפנה#2) threw, line 3 was still attempted
    expect(created).toHaveLength(2); // line 1's and line 3's tasks (line 2's create rejected)

    // second בצע: only the still-missing line (דפנה#2) goes to createTask again
    const callsBeforeRetry = calls;
    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(sonner.success).toHaveBeenCalled());
    expect(calls - callsBeforeRetry).toBe(1);
    expect(created).toHaveLength(3); // one more real task created on retry

    // all three notes ended up linked (three distinct task ids patched) across the two attempts
    const ids = new Set(
      updated.filter(u => u.table === 'kibbutz_meeting_notes' && u.row.ems_task_id).map(u => u.row.ems_task_id),
    );
    expect(ids.size).toBe(3);
  });

  it('a failed write is reported in words the person can act on', async () => {
    await openScreen();
    const { getSupabase } = await import('@/lib/supabase');
    const client: any = await getSupabase();
    const realRpc = client.rpc;
    client.rpc = () => Promise.resolve({ data: null, error: new Error('אין חיבור') });
    await act(async () => { fireEvent.click(screen.getByTestId('review-commit')); });
    await waitFor(() => expect(sonner.error).toHaveBeenCalled());
    client.rpc = realRpc;
  });
});

describe('the role matrix', () => {
  it('a viewer cannot open it', async () => {
    state.viewer = true; state.admin = false;
    render(<MeetingReview />);
    await act(async () => { openMeetingReview(PARSED as any); });
    expect(screen.queryByTestId('review-commit')).toBeNull();
    expect(sonner.error).toHaveBeenCalled();
  });

  it('a non-admin team member cannot open it', async () => {
    state.user = 'אביאם'; state.admin = false;
    render(<MeetingReview />);
    await act(async () => { openMeetingReview(PARSED as any); });
    expect(screen.queryByTestId('review-commit')).toBeNull();
    expect(sonner.error).toHaveBeenCalled();
  });
});
