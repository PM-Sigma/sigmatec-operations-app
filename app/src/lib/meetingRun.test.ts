// @vitest-environment jsdom
// Goldens for the pure "since the previous meeting" split (Package H item 5), plus the
// hook-level lazy-session behaviour (package M, D1): `useMeetingRun` no longer inserts a
// `meeting_sessions` row on mount — only on the first `start()` or `log()` — so opening and
// closing מצב ישיבה without doing anything leaves no row behind.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { useMeetingRun } from './meetingRun';

afterEach(cleanup);

const { inserted, updated } = vi.hoisted(() => ({
  inserted: [] as Array<{ table: string; row: any }>,
  updated: [] as Array<{ table: string; row: any; id: string }>,
}));

vi.mock('./supabase', () => {
  const table = (name: string) => ({
    insert: (row: any) => {
      inserted.push({ table: name, row });
      return { select: () => ({ single: async () => ({ data: { id: name + '-' + inserted.length, ...row }, error: null }) }) };
    },
    update: (row: any) => ({
      eq: (_col: string, id: string) => {
        updated.push({ table: name, row, id });
        return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
      },
    }),
  });
  return {
    getSupabase: async () => ({ from: table }),
    sbWrite: async (run: any) => {
      const res = await run({ from: table });
      if (res?.error) throw res.error;
      return res?.data ?? null;
    },
  };
});

beforeEach(() => { inserted.length = 0; updated.length = 0; });

// sinceLastMeeting/SinceLastTask (Package H item 5) retired in M-U1: the per-kibbutz timeline
// (meetingTimeline.ts) replaced the "מאז הישיבה הקודמת" block that was its only caller (M-R6).

// ───────────────────────────── useMeetingRun: lazy session (D1) ─────────────────────────────

describe('useMeetingRun — no session row until the meeting actually does something', () => {
  it('mounting the hook inserts nothing', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    expect(result.current.session).toBeNull();
    // give any stray microtask a turn — still nothing.
    await act(async () => { await Promise.resolve(); });
    expect(inserted).toHaveLength(0);
  });

  it('start() inserts exactly one session row', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(inserted.filter(i => i.table === 'meeting_sessions')).toHaveLength(1);
    expect(inserted[0].row).toMatchObject({ date: '2026-09-23', kind: 'company', host: 'עידן' });
  });

  it('log() before start() inserts the session first, then the event at t_sec 0', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    await act(async () => { await result.current.log('marker', { kibbutz: 'דפנה' }); });
    expect(inserted.filter(i => i.table === 'meeting_sessions')).toHaveLength(1);
    const events = inserted.filter(i => i.table === 'meeting_events');
    expect(events).toHaveLength(1);
    expect(events[0].row).toMatchObject({ kind: 'marker', kibbutz: 'דפנה', t_sec: 0 });
  });

  it('the same holds for kind: "dev"', async () => {
    const { result } = renderHook(() => useMeetingRun('dev', 'עידן', '2026-09-23'));
    expect(inserted).toHaveLength(0);
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(inserted.filter(i => i.table === 'meeting_sessions' && i.row.kind === 'dev')).toHaveLength(1);
  });

  it('concurrent start() + log() insert only once', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    await act(async () => {
      result.current.start();
      await result.current.log('marker');
    });
    expect(inserted.filter(i => i.table === 'meeting_sessions')).toHaveLength(1);
  });
});

// ───────────────────────────── mark() / noteMark() ("סמן רגע", M-L4) ─────────────────────────────

describe('mark / noteMark', () => {
  it('mark() before start() creates the session, then logs a marker at t_sec 0, returning its id', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    let out!: { id: string; t_sec: number };
    await act(async () => { out = await result.current.mark('גבים'); });
    expect(inserted.filter(i => i.table === 'meeting_sessions')).toHaveLength(1);
    const events = inserted.filter(i => i.table === 'meeting_events');
    expect(events).toHaveLength(1);
    expect(events[0].row).toMatchObject({ kind: 'marker', kibbutz: 'גבים', t_sec: 0 });
    expect(out.t_sec).toBe(0);
    expect(out.id).toEqual(expect.stringContaining('meeting_events-'));
  });

  it('mark(null) logs no kibbutz', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    await act(async () => { await result.current.mark(null); });
    const events = inserted.filter(i => i.table === 'meeting_events');
    expect(events[0].row).not.toHaveProperty('kibbutz');
  });

  it('noteMark() updates the event\'s hint, trimmed and collapsed to one line', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    let out!: { id: string; t_sec: number };
    await act(async () => { out = await result.current.mark('גבים'); });
    await act(async () => { await result.current.noteMark(out.id, '  לבדוק שוב \n את המונה  '); });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ table: 'meeting_events', id: out.id, row: { hint: 'לבדוק שוב את המונה' } });
  });

  it('noteMark() cuts a note longer than 120 characters', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    await act(async () => { await result.current.noteMark('some-id', 'א'.repeat(200)); });
    expect(updated[0].row.hint).toHaveLength(120);
  });

  it('noteMark() with no id is a no-op', async () => {
    const { result } = renderHook(() => useMeetingRun('company', 'עידן', '2026-09-23'));
    await act(async () => { await result.current.noteMark('', 'note'); });
    expect(updated).toHaveLength(0);
  });
});
