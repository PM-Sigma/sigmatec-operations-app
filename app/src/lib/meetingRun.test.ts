// @vitest-environment jsdom
// Goldens for the pure "since the previous meeting" split (Package H item 5), plus the
// hook-level lazy-session behaviour (package M, D1): `useMeetingRun` no longer inserts a
// `meeting_sessions` row on mount — only on the first `start()` or `log()` — so opening and
// closing מצב ישיבה without doing anything leaves no row behind.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { sinceLastMeeting, useMeetingRun, type SinceLastTask } from './meetingRun';

afterEach(cleanup);

const { inserted } = vi.hoisted(() => ({ inserted: [] as Array<{ table: string; row: any }> }));

vi.mock('./supabase', () => {
  const table = (name: string) => ({
    insert: (row: any) => {
      inserted.push({ table: name, row });
      return { select: () => ({ single: async () => ({ data: { id: name + '-' + inserted.length, ...row }, error: null }) }) };
    },
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

beforeEach(() => { inserted.length = 0; });

const t = (id: string, openedAt: string, closedAt?: string | null): SinceLastTask => ({
  id, title: `task ${id}`, openedAt, closedAt: closedAt ?? null,
});

describe('sinceLastMeeting', () => {
  it('no previous meeting: nothing to report', () => {
    const tasks = [t('1', '2026-09-01T10:00:00Z')];
    expect(sinceLastMeeting(tasks, null)).toEqual({ openedSince: [], closedSince: [] });
    expect(sinceLastMeeting(tasks, undefined)).toEqual({ openedSince: [], closedSince: [] });
  });

  it('splits opened-and-still-open from opened-and-since-closed', () => {
    const tasks = [
      t('open-after', '2026-09-10T09:00:00Z'),
      t('closed-after', '2026-09-11T09:00:00Z', '2026-09-15T09:00:00Z'),
      t('opened-before', '2026-09-01T09:00:00Z'),
    ];
    const result = sinceLastMeeting(tasks, '2026-09-05T00:00:00Z');
    expect(result.openedSince.map(x => x.id)).toEqual(['open-after']);
    expect(result.closedSince.map(x => x.id)).toEqual(['closed-after']);
  });

  it('boundary date itself is excluded (strictly after)', () => {
    const tasks = [t('same-instant', '2026-09-05T00:00:00Z')];
    expect(sinceLastMeeting(tasks, '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
  });

  it('empty/missing task list is safe', () => {
    expect(sinceLastMeeting([], '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
    expect(sinceLastMeeting(null, '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
  });

  it('ignores a task with no openedAt and an unparsable previous date', () => {
    const tasks = [{ id: 'x', title: 'no date', openedAt: '' } as SinceLastTask];
    expect(sinceLastMeeting(tasks, '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
    expect(sinceLastMeeting([t('1', '2026-09-10T00:00:00Z')], 'not-a-date')).toEqual({ openedSince: [], closedSince: [] });
  });
});

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
