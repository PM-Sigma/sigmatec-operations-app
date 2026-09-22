// @vitest-environment jsdom
// Render goldens for ▶/■ (Task 29): who sees the control at all, that a running session
// survives a remount (the "reload"), that the stop sheet asks for nothing but allows
// attendees + tags + a note, and — the rule that matters — that a Clockify failure STILL
// writes the local row, with `clockify_id = null`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { RUNNING_KEY, TAGS_KEY } from '@/lib/clockify';

afterEach(cleanup);

const { state, inserted, updated, deleted, busEvents, toasts } = vi.hoisted(() => ({
  state: { user: 'עידן', isViewer: false, contacts: [] as any[], fnFail: false, entryId: 'clk-1', calls: [] as any[], writeFail: false },
  inserted: [] as Array<{ table: string; row: any }>,
  // the row now exists from the start (22.9): the stop sheet UPDATEs it and drop DELETEs it,
  // so the mock has to carry all three verbs and remember which id each one hit.
  updated: [] as Array<{ table: string; id: string; patch: any }>,
  deleted: [] as Array<{ table: string; id: string }>,
  busEvents: [] as Array<{ type: string; detail: any }>,
  toasts: [] as string[],
}));

class FakeBus extends EventTarget {
  dispatchEvent(e: Event) { busEvents.push({ type: e.type, detail: (e as CustomEvent).detail }); return super.dispatchEvent(e); }
}
const bus = new FakeBus();

vi.mock('@/bridge', () => ({
  sigmaBus: bus,
  sigma: { emsToken: () => 'ems-token' },
  useCurrentUser: () => ({ name: state.user, role: state.isViewer ? 'viewer' : 'idan', isViewer: state.isViewer }),
}));
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toasts.push('success:' + m),
    error: (m: string) => toasts.push('error:' + m),
    info: (m: string) => toasts.push('info:' + m),
  },
}));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  SB_URL: 'https://sb.test', SB_ANON: 'anon',
  getSupabase: async () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: state.contacts, error: null }) }) }),
  }),
  sbWrite: async (run: (sb: any) => Promise<any>) => {
    if (state.writeFail) throw new Error('no pass');
    const res = await run({
      from: (table: string) => ({
        insert: (row: any) => {
          inserted.push({ table, row });
          const id = table === 'work_sessions' ? 'ws-' + inserted.filter(i => i.table === 'work_sessions').length : 'row-1';
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        },
        update: (patch: any) => ({ eq: async (_c: string, id: string) => { updated.push({ table, id, patch }); return { data: null, error: null }; } }),
        delete: () => ({ eq: async (_c: string, id: string) => { deleted.push({ table, id }); return { data: null, error: null }; } }),
      }),
    });
    if (res && res.error) throw new Error(res.error.message);
    return res ? res.data : null;
  },
}));

// The edge function, faked at the fetch boundary — the component must never know a credential.
const fetchMock = vi.fn(async (_url: string, init: any) => {
  const body = JSON.parse(init.body);
  state.calls.push(body);
  if (state.fnFail && body.action === 'entry') {
    return { ok: false, json: async () => ({ error: 'clockify 502' }) } as any;
  }
  const data =
    body.action === 'tags' ? { tags: [{ id: 't1', name: 'הדרכה על המערכת' }, { id: 't2', name: 'טיפול בתקלות' }] }
      : body.action === 'projects' ? { projects: [{ id: 'p1', name: 'חוקוק' }] }
        : { entry: { id: state.entryId } };
  return { ok: true, json: async () => data } as any;
});
vi.stubGlobal('fetch', fetchMock);

const { WorkTimer } = await import('./WorkTimer');

beforeEach(() => {
  localStorage.clear();
  state.user = 'עידן'; state.isViewer = false; state.contacts = []; state.fnFail = false; state.calls = []; state.writeFail = false;
  inserted.length = 0; updated.length = 0; deleted.length = 0; busEvents.length = 0; toasts.length = 0;
  fetchMock.mockClear();
});

const startTimer = async () => {
  render(<WorkTimer kibbutz="חוקוק" />);
  await act(async () => { fireEvent.click(screen.getByTestId('work-timer-start')); });
  // starting also opens the `work_sessions` row, off the critical path — let it land.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

// 22.9 (E1): the running clock opens ITS sheet first; "סגור שעות" hands over to the stop sheet.
const openSheet = async () => {
  await act(async () => { fireEvent.click(screen.getByTestId('work-timer-stop')); });
  await waitFor(() => expect(screen.getByTestId('work-timer-edit')).toBeTruthy());
  await act(async () => { fireEvent.click(screen.getByTestId('work-timer-finish')); });
  await waitFor(() => expect(screen.getByTestId('work-timer-sheet')).toBeTruthy());
};

/** The stop sheet's write: the one update that CLOSES the row (סגור שעות also saves the
 *  running session's people/tags on the way past, which is an update too). */
const closedRow = () => updated.filter(u => u.table === 'work_sessions' && u.patch.ended_at);

describe('who sees ▶', () => {
  it.each([['עידן', true], ['מתניה', true], ['אביאם', false], ['עמיחי', false], ['אליה', false]])(
    '%s → %s', async (user, visible) => {
      state.user = user as string;
      const { container } = render(<WorkTimer kibbutz="חוקוק" />);
      await waitFor(() => {
        expect(!!container.querySelector('[data-testid="work-timer-start"]')).toBe(visible as boolean);
      });
    });

  it('a viewer never sees it, even under a tracker name', async () => {
    state.user = 'עידן'; state.isViewer = true;
    const { container } = render(<WorkTimer kibbutz="חוקוק" />);
    expect(container.querySelector('[data-testid="work-timer-start"]')).toBeNull();
  });
});

describe('▶ start', () => {
  it('persists the session so a remount (a reload) finds it still running', async () => {
    await startTimer();
    expect(screen.getByTestId('work-timer-stop')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(RUNNING_KEY) as string)['עידן'].kibbutz).toBe('חוקוק');

    cleanup();
    render(<WorkTimer kibbutz="חוקוק" />);
    await waitFor(() => expect(screen.getByTestId('work-timer-stop')).toBeTruthy());
    expect(screen.getByTestId('work-timer-elapsed').textContent).toMatch(/^\d\d:\d\d/);
  });

  it('a second kibbutz is refused while one is running (one session per person)', async () => {
    await startTimer();
    cleanup();
    render(<WorkTimer kibbutz="אור הנר" />);
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-start')); });
    expect(toasts.some(t => t.startsWith('info:') && t.includes('חוקוק'))).toBe(true);
    // still only ONE stored session, the original one
    expect(Object.keys(JSON.parse(localStorage.getItem(RUNNING_KEY) as string))).toEqual(['עידן']);
    expect(JSON.parse(localStorage.getItem(RUNNING_KEY) as string)['עידן'].kibbutz).toBe('חוקוק');
  });

  it('the running card is the only one showing ■ — another card still offers ▶', async () => {
    await startTimer();
    cleanup();
    render(<WorkTimer kibbutz="גפן" />);
    await waitFor(() => expect(screen.getByTestId('work-timer-start')).toBeTruthy());
  });
});

describe('■ the stop sheet', () => {
  it('offers the kibbutz contacts and the live tags, billable OFF by default', async () => {
    state.contacts = [{ id: 'c1', name: 'גפן' }, { id: 'c2', name: 'רבקה' }];
    await startTimer();
    await openSheet();
    await waitFor(() => expect(screen.getByTestId('attendee-גפן')).toBeTruthy());
    expect(screen.getByTestId('tag-טיפול בתקלות')).toBeTruthy();
    expect((screen.getByTestId('work-timer-billable') as HTMLInputElement).checked).toBe(false);
    // the tag list came from the FUNCTION, not from a hard-coded vocabulary
    expect(state.calls.some(c => c.action === 'tags')).toBe(true);
    expect(JSON.parse(localStorage.getItem(TAGS_KEY) as string).tags).toHaveLength(2);
  });

  it('requires nothing: confirm with no attendee and no tag still saves', async () => {
    await startTimer();
    await openSheet();
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-confirm')); });
    // the stop sheet CLOSES the row that was opened at the start — it does not add a second one.
    await waitFor(() => expect(closedRow()).toHaveLength(1));
    expect(inserted.filter(i => i.table === 'work_sessions')).toHaveLength(1);
    expect(closedRow()[0].id).toBe('ws-1');
    expect(closedRow()[0].patch.attendees).toEqual([]);
    expect(closedRow()[0].patch.tags).toEqual([]);
    // no dangling separator when there are no tags
    expect(closedRow()[0].patch.description).toBe('חוקוק');
  });

  it('attendees + tags + note + billable land on the row and on the Clockify entry', async () => {
    state.contacts = [{ id: 'c1', name: 'גפן' }];
    await startTimer();
    await openSheet();
    await waitFor(() => expect(screen.getByTestId('attendee-גפן')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('attendee-גפן'));
      fireEvent.click(screen.getByTestId('tag-הדרכה על המערכת'));
      fireEvent.click(screen.getByTestId('tag-טיפול בתקלות'));
      fireEvent.change(screen.getByTestId('work-timer-note'), { target: { value: 'שיחה' } });
      fireEvent.click(screen.getByTestId('work-timer-billable'));
    });
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-confirm')); });
    await waitFor(() => expect(closedRow()).toHaveLength(1));

    const row = closedRow()[0].patch;
    expect(row.attendees).toEqual(['גפן']);
    expect(row.tags).toEqual(['הדרכה על המערכת', 'טיפול בתקלות']);
    expect(row.billable).toBe(true);
    expect(row.clockify_id).toBe('clk-1');
    expect(row.note).toBe('שיחה');

    const entryCall = state.calls.find(c => c.action === 'entry');
    expect(entryCall.entry.description).toBe('חוקוק — הדרכה על המערכת, טיפול בתקלות · שיחה');
    expect(entryCall.entry.tagIds).toEqual(['t1', 't2']);
    expect(entryCall.entry.projectId).toBe('p1');
    expect(entryCall.entry.billable).toBe(true);
    // the running session is over and the bus was told once
    expect(JSON.parse(localStorage.getItem(RUNNING_KEY) as string)['עידן']).toBeUndefined();
    expect(busEvents.filter(e => e.type === 'work-session-saved')).toHaveLength(1);
  });

  it('a contact can be added inline and is selected immediately', async () => {
    await startTimer();
    await openSheet();
    await act(async () => {
      fireEvent.change(screen.getByTestId('work-timer-new-contact'), { target: { value: 'יוסי החדש' } });
      fireEvent.click(screen.getByTestId('work-timer-add-contact'));
    });
    await waitFor(() => expect(screen.getByTestId('attendee-יוסי החדש')).toBeTruthy());
    expect(inserted.some(i => i.table === 'site_contacts' && i.row.name === 'יוסי החדש')).toBe(true);

    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-confirm')); });
    await waitFor(() => expect(closedRow()).toHaveLength(1));
    expect(closedRow()[0].patch.attendees).toEqual(['יוסי החדש']);
  });

  it('CLOCKIFY FAILS → the row is still written, with clockify_id = null', async () => {
    state.fnFail = true;
    await startTimer();
    await openSheet();
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-confirm')); });
    await waitFor(() => expect(closedRow()).toHaveLength(1));
    expect(closedRow()[0].patch.clockify_id).toBeNull();
    expect(closedRow()[0].patch.started_at).toBeTruthy();
    expect(toasts.some(t => t.startsWith('success:') && t.includes('מאוחר יותר'))).toBe(true);
    expect(busEvents.filter(e => e.type === 'work-session-saved')).toHaveLength(1);
  });
});

// THE server-push contract (22.9): the reminder has to reach him with the phone closed, and
// the only thing that can make that true is a row that exists while the clock is still
// running. These pin the row's whole life against the component.
describe('the open work_sessions row', () => {
  it('starting opens a row with ended_at = null and remembers its id on the running session', async () => {
    await startTimer();
    const opened = inserted.filter(i => i.table === 'work_sessions');
    expect(opened).toHaveLength(1);
    expect(opened[0].row.ended_at).toBeNull();
    expect(opened[0].row.person).toBe('עידן');
    expect(opened[0].row.kibbutz).toBe('חוקוק');
    expect(opened[0].row.started_at).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(RUNNING_KEY) as string)['עידן'].row_id).toBe('ws-1');
  });

  it('עצור ומחק removes the row — an open row would be nudged forever', async () => {
    await startTimer();
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-stop')); });
    await waitFor(() => expect(screen.getByTestId('work-timer-edit')).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-drop')); });
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-drop-yes')); });
    await waitFor(() => expect(deleted).toHaveLength(1));
    expect(deleted[0]).toEqual({ table: 'work_sessions', id: 'ws-1' });
    expect(JSON.parse(localStorage.getItem(RUNNING_KEY) as string)['עידן']).toBeUndefined();
  });

  it('a pause keeps the row in step, so the server does not nudge a stopped clock', async () => {
    await startTimer();
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-stop')); });
    await waitFor(() => expect(screen.getByTestId('work-timer-edit')).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-pause')); });
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].id).toBe('ws-1');
    expect(updated[0].patch.paused_at).toBeTruthy();
    // …and resuming banks the pause and clears it again
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-pause')); });
    await waitFor(() => expect(updated).toHaveLength(2));
    expect(updated[1].patch.paused_at).toBeNull();
    expect(updated[1].patch.paused_ms).toBeGreaterThanOrEqual(0);
  });

  it('THE OPENING INSERT IS REFUSED → the clock still runs and the stop sheet falls back to an insert', async () => {
    state.writeFail = true;
    await startTimer();
    expect(screen.getByTestId('work-timer-stop')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(RUNNING_KEY) as string)['עידן'].row_id).toBeUndefined();

    state.writeFail = false;
    await openSheet();
    await act(async () => { fireEvent.click(screen.getByTestId('work-timer-confirm')); });
    await waitFor(() => expect(inserted.some(i => i.table === 'work_sessions')).toBe(true));
    expect(closedRow()).toHaveLength(0);          // nothing to update — there was no row
    expect(inserted.find(i => i.table === 'work_sessions')!.row.ended_at).toBeTruthy();
  });

  it('the push deep link opens the running card own sheet', async () => {
    await startTimer();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('sigma-open-timer', { detail: { kibbutz: 'חוקוק' } }));
    });
    await waitFor(() => expect(screen.getByTestId('work-timer-edit')).toBeTruthy());
  });

  it('…and a card whose timer is NOT the running one ignores it', async () => {
    await startTimer();
    cleanup();
    render(<WorkTimer kibbutz="גפן" />);
    await waitFor(() => expect(screen.getByTestId('work-timer-start')).toBeTruthy());
    await act(async () => {
      window.dispatchEvent(new CustomEvent('sigma-open-timer', { detail: { kibbutz: 'גפן' } }));
    });
    expect(screen.queryByTestId('work-timer-edit')).toBeNull();
  });
});

describe('no secret ever reaches the bundle', () => {
  it('there is no CLOCKIFY_ string under app/src or js/src', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const roots = [resolve(__dirname, '../..'), resolve(__dirname, '../../../../js/src')];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx|js|jsx|css)$/.test(e)) continue;
        const text = readFileSync(p, 'utf8');
        // The words may appear in a COMMENT naming the handoff item; a real leak is the
        // secret being read or assigned in code.
        for (const line of text.split('\n')) {
          if (!/CLOCKIFY_(API_KEY|WORKSPACE_ID|USER_ID)/.test(line)) continue;
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
          hits.push(p + ': ' + line.trim().slice(0, 120));
        }
      }
    };
    for (const r of roots) walk(r);
    expect(hits).toEqual([]);
  });
});
