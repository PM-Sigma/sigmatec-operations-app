// Goldens for one-click EMS close in the meeting (package M, M-R8): who may close, the exact
// close-comment wording, the 5 s deferred-commit queue with undo, and the send path behind the
// TYPED EMS gateway (review focus #1–#4) — `emsGateway().addComment` / `.updateTask`, never
// `sigma.emsWrite` directly (spec §7o: that's adapter-only). Every EMS call here is a fake —
// nothing in this file, or reachable from it, ever calls real EMS.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setEmsGateway, type EmsGateway } from '@/lib/ems/gateway';
import {
  CLOSERS, canCloseInMeeting, closeComment, createCloseQueue, sendClose, type PendingClose,
} from './meetingClose';

type WriteFn = (...args: any[]) => Promise<{ sent: boolean; queued?: boolean; error?: string }>;

const calls = { comment: [] as any[], status: [] as any[], getTask: [] as string[] };

function fakeGateway(opts: {
  tasks?: Record<string, { status: string }>;
  getTaskImpl?: (id: string) => Promise<{ status: string } | null>;
  addComment?: WriteFn;
  updateTask?: WriteFn;
} = {}): EmsGateway {
  const tasks = opts.tasks || {};
  return {
    transport: 'rest',
    capabilities: () => ({} as any),
    isConnected: () => true,
    listSites: async () => [],
    listMeters: async () => [],
    getMeter: async () => null,
    listOpenTasks: async () => [],
    getTask: async (id: string) => {
      calls.getTask.push(id);
      if (opts.getTaskImpl) return opts.getTaskImpl(id) as any;
      return tasks[id] ? ({ id, status: tasks[id].status } as any) : null;
    },
    createTask: async () => ({ sent: true }),
    updateTask: async (id: string, patch: any) => {
      calls.status.push({ id, patch });
      return (opts.updateTask ? opts.updateTask(id, patch) : { sent: true }) as any;
    },
    listComments: async () => [],
    addComment: async (id: string, text: string) => {
      calls.comment.push({ id, text });
      return (opts.addComment ? opts.addComment(id, text) : { sent: true }) as any;
    },
    listUsers: async () => [],
    listAlerts: async () => null,
    energyBalance: async () => null,
    billingSummary: async () => null,
  };
}

afterEach(() => { setEmsGateway(null); vi.useRealTimers(); });
beforeEach(() => { calls.comment.length = 0; calls.status.length = 0; calls.getTask.length = 0; });

// ───────────────────────────── canCloseInMeeting / closeComment ─────────────────────────────

it('only עידן and עמיחי, never the viewer', () => {
  expect(canCloseInMeeting('עידן', false)).toBe(true);
  expect(canCloseInMeeting('עמיחי', false)).toBe(true);
  for (const p of ['אביאם', 'ניתאי', 'מתניה', '']) expect(canCloseInMeeting(p, false)).toBe(false);
  expect(canCloseInMeeting('עידן', true)).toBe(false);
});

it('CLOSERS lists exactly who canCloseInMeeting honours', () => {
  expect(CLOSERS).toEqual(['עידן', 'עמיחי']);
});

it('the comment, Israel date, no leading zeros', () =>
  expect(closeComment('עמיחי', new Date('2026-09-03T22:30:00Z'))).toBe('נסגר בישיבת צוות 4.9 · עמיחי'));

// ───────────────────────────── createCloseQueue ─────────────────────────────

describe('createCloseQueue', () => {
  it('commits after 5 s; undo inside the window sends nothing', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (_p: PendingClose) => ({ sent: true }));
    const q = createCloseQueue({ send });
    const undo = q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    q.schedule({ taskId: 'b', status: 'cancelled', by: 'עידן', at: new Date() });
    undo();
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].taskId).toBe('b');
  });

  it('flush sends everything pending once (pagehide / leaving the kibbutz)', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ sent: true }));
    const q = createCloseQueue({ send });
    q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    await q.flush(); await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush skips the re-read — the app may already be gone (Opus round-5 audit, item 2)', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ sent: true }));
    const q = createCloseQueue({ send });
    q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    await q.flush();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'a' }), { skipReread: true });
  });

  it('undo returns false once it is too late (Opus round-5 audit, item 1: "undo lies after flush")', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ sent: true }));
    const q = createCloseQueue({ send });
    const undo = q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    expect(undo()).toBe(true);          // still pending — undo really cancelled it
    expect(undo()).toBe(false);         // already gone — a second click cannot lie about it
    const undo2 = q.schedule({ taskId: 'b', status: 'done', by: 'עידן', at: new Date() });
    await q.flush();                    // committed early
    expect(undo2()).toBe(false);        // too late — flush already sent it
  });

  it('re-scheduling the same task replaces it (clicked בוצע, then בוטל)', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (_p: PendingClose) => ({ sent: true }));
    const q = createCloseQueue({ send });
    q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    q.schedule({ taskId: 'a', status: 'cancelled', by: 'עידן', at: new Date() });
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].status).toBe('cancelled');
  });

  it('pending() reflects what is still waiting, and drops on commit', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ sent: true }));
    const q = createCloseQueue({ send });
    q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    expect(q.pending().map(p => p.taskId)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(q.pending()).toEqual([]);
  });

  it('onSettled reports the result of a commit', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => ({ sent: true, queued: true }));
    const onSettled = vi.fn();
    const q = createCloseQueue({ send, onSettled });
    q.schedule({ taskId: 'a', status: 'done', by: 'עידן', at: new Date() });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0][0].taskId).toBe('a');
    expect(onSettled.mock.calls[0][1]).toEqual({ sent: true, queued: true });
  });
});

// ───────────────────────────── sendClose ─────────────────────────────

describe('sendClose', () => {
  const p = (over: Partial<PendingClose> = {}): PendingClose =>
    ({ taskId: 'a', status: 'done', by: 'עידן', at: new Date('2026-09-23T10:00:00Z'), ...over });

  it('re-reads the task through the gateway; already-closed writes nothing', async () => {
    setEmsGateway(fakeGateway({ tasks: { a: { status: 'done' } } }));
    const r = await sendClose(p());
    expect(r).toEqual({ sent: false, skipped: 'already-closed' });
    expect(calls.comment).toHaveLength(0);
    expect(calls.status).toHaveLength(0);
  });

  it('writes the comment then the status, through addComment/updateTask, in that order', async () => {
    setEmsGateway(fakeGateway({ tasks: { a: { status: 'open' } } }));
    const r = await sendClose(p({ status: 'cancelled', by: 'עמיחי' }));
    expect(calls.comment).toEqual([{ id: 'a', text: 'נסגר בישיבת צוות 23.9 · עמיחי' }]);
    expect(calls.status).toEqual([{ id: 'a', patch: { status: 'cancelled' } }]);
    expect(r).toEqual({ sent: true, queued: false });
  });

  it('a queued write (offline) is reported as queued, both writes still attempted', async () => {
    setEmsGateway(fakeGateway({
      tasks: { a: { status: 'open' } },
      addComment: async () => ({ sent: false, queued: true }),
      updateTask: async () => ({ sent: false, queued: true }),
    }));
    const r = await sendClose(p());
    expect(calls.comment).toHaveLength(1);
    expect(calls.status).toHaveLength(1);
    expect(r).toMatchObject({ queued: true });
  });

  it('an error from the comment write stops before the status write', async () => {
    setEmsGateway(fakeGateway({
      tasks: { a: { status: 'open' } },
      addComment: async () => ({ sent: false, error: '(500) boom' }),
    }));
    const r = await sendClose(p());
    expect(calls.comment).toHaveLength(1);
    expect(calls.status).toHaveLength(0);
    expect(r).toEqual({ sent: false, error: '(500) boom' });
  });

  it('a real API rejection on the status write is surfaced too', async () => {
    setEmsGateway(fakeGateway({
      tasks: { a: { status: 'open' } },
      updateTask: async () => ({ sent: false, error: '(422) rejected' }),
    }));
    const r = await sendClose(p());
    expect(calls.comment).toHaveLength(1);
    expect(calls.status).toHaveLength(1);
    expect(r).toEqual({ sent: false, error: '(422) rejected' });
  });

  it('a task the gateway cannot find (null) is written anyway (best effort)', async () => {
    setEmsGateway(fakeGateway({ tasks: {} }));
    const r = await sendClose(p({ taskId: 'unknown' }));
    expect(r).toEqual({ sent: true, queued: false });
    expect(calls.comment).toHaveLength(1);
    expect(calls.status).toHaveLength(1);
  });

  it('offline: getTask THROWS (network error, not "not found") — still queues both writes, never aborts', async () => {
    setEmsGateway(fakeGateway({
      getTaskImpl: async () => { throw new Error('network unreachable'); },
      addComment: async () => ({ sent: false, queued: true }),
      updateTask: async () => ({ sent: false, queued: true }),
    }));
    const r = await sendClose(p());
    expect(calls.getTask).toEqual(['a']);
    expect(calls.comment).toEqual([{ id: 'a', text: 'נסגר בישיבת צוות 23.9 · עידן' }]);
    expect(calls.status).toEqual([{ id: 'a', patch: { status: 'done' } }]);
    expect(r).toEqual({ sent: false, queued: true });
  });

  it('skipReread: never calls getTask, writes straight through (Opus round-5 audit, item 2)', async () => {
    setEmsGateway(fakeGateway({ tasks: { a: { status: 'open' } } }));
    const r = await sendClose(p(), { skipReread: true });
    expect(calls.getTask).toEqual([]);
    expect(calls.comment).toHaveLength(1);
    expect(calls.status).toHaveLength(1);
    expect(r).toEqual({ sent: true, queued: false });
  });
});
