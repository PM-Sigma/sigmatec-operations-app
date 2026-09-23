// Goldens for one-click EMS close in the meeting (package M, M-R8): who may close, the exact
// close-comment wording, the 5 s deferred-commit queue with undo, and the send path behind the
// existing EMS gateway (review focus #1–#4). Every EMS call here is a fake — nothing in this
// file, or reachable from it, ever calls real EMS.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { emsWriteCalls, emsWriteImpl } = vi.hoisted(() => ({
  emsWriteCalls: [] as Array<Record<string, unknown>>,
  emsWriteImpl: { fn: null as unknown as (item: Record<string, unknown>) => Promise<any> },
}));

vi.mock('@/bridge', () => ({
  sigma: {
    emsWrite: (item: Record<string, unknown>) => { emsWriteCalls.push(item); return emsWriteImpl.fn(item); },
  },
}));

import { setEmsGateway, type EmsGateway } from '@/lib/ems/gateway';
import {
  CLOSERS, canCloseInMeeting, closeComment, createCloseQueue, sendClose, type PendingClose,
} from './meetingClose';

function fakeGateway(tasks: Record<string, { status: string }>): EmsGateway {
  return {
    transport: 'rest',
    capabilities: () => ({} as any),
    isConnected: () => true,
    listSites: async () => [],
    listMeters: async () => [],
    getMeter: async () => null,
    listOpenTasks: async () => [],
    getTask: async (id: string) => (tasks[id] ? ({ id, status: tasks[id].status } as any) : null),
    createTask: async () => ({ sent: true }),
    updateTask: async () => ({ sent: true }),
    listComments: async () => [],
    addComment: async () => ({ sent: true }),
    listUsers: async () => [],
    listAlerts: async () => null,
    energyBalance: async () => null,
    billingSummary: async () => null,
  };
}

afterEach(() => { setEmsGateway(null); vi.useRealTimers(); });
beforeEach(() => { emsWriteCalls.length = 0; emsWriteImpl.fn = async () => ({ sent: true }); });

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

  it('re-reads the task; already-closed writes nothing', async () => {
    setEmsGateway(fakeGateway({ a: { status: 'done' } }));
    const r = await sendClose(p());
    expect(r).toEqual({ sent: false, skipped: 'already-closed' });
    expect(emsWriteCalls).toHaveLength(0);
  });

  it('writes the comment then the status, in that order', async () => {
    setEmsGateway(fakeGateway({ a: { status: 'open' } }));
    const r = await sendClose(p({ status: 'cancelled', by: 'עמיחי' }));
    expect(emsWriteCalls).toEqual([
      { kind: 'comment', taskId: 'a', message: 'נסגר בישיבת צוות 23.9 · עמיחי' },
      { kind: 'status', taskId: 'a', status: 'cancelled' },
    ]);
    expect(r).toEqual({ sent: true, queued: false });
  });

  it('a queued write (offline) is reported as queued, both writes still attempted', async () => {
    setEmsGateway(fakeGateway({ a: { status: 'open' } }));
    emsWriteImpl.fn = async () => ({ sent: false, queued: true });
    const r = await sendClose(p());
    expect(emsWriteCalls).toHaveLength(2);
    expect(r).toMatchObject({ queued: true });
  });

  it('an error from the comment write stops before the status write', async () => {
    setEmsGateway(fakeGateway({ a: { status: 'open' } }));
    emsWriteImpl.fn = async (item: Record<string, unknown>) =>
      item.kind === 'comment' ? { sent: false, error: '(500) boom' } : { sent: true };
    const r = await sendClose(p());
    expect(emsWriteCalls).toHaveLength(1);
    expect(r).toEqual({ sent: false, error: '(500) boom' });
  });

  it('a real API rejection on the status write is surfaced too', async () => {
    setEmsGateway(fakeGateway({ a: { status: 'open' } }));
    emsWriteImpl.fn = async (item: Record<string, unknown>) =>
      item.kind === 'status' ? { sent: false, error: '(422) rejected' } : { sent: true };
    const r = await sendClose(p());
    expect(emsWriteCalls).toHaveLength(2);
    expect(r).toEqual({ sent: false, error: '(422) rejected' });
  });

  it('a task the gateway cannot find is written anyway (best effort)', async () => {
    setEmsGateway(fakeGateway({}));
    const r = await sendClose(p({ taskId: 'unknown' }));
    expect(r).toEqual({ sent: true, queued: false });
    expect(emsWriteCalls).toHaveLength(2);
  });
});
