// Goldens for D-L4 — status-log day-stamps (port of devLoadStatusLog / devLogStatuses /
// devStamps, 18-dev-tasks.js). `dev_status_log` (db/dev_status_log.sql): anon read, authenticated
// insert; this module is the new writer.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { st } = vi.hoisted(() => ({ st: { rows: [] as any[], upserts: [] as any[], selectFails: false } }));

vi.mock('./supabase', () => ({
  getSupabase: async () => ({
    from: () => ({
      select: () => ({
        in: async () => (st.selectFails ? { data: null, error: new Error('offline') } : { data: st.rows, error: null }),
      }),
    }),
  }),
  sbWrite: async (run: any) => {
    const res = await run({
      from: () => ({
        upsert: (rows: any, opts: any) => { st.upserts.push({ rows, opts }); return { error: null }; },
      }),
    });
    if (res?.error) throw res.error;
    return res?.data ?? null;
  },
}));

import { fetchStatusLog, logStatuses, stampsFor, type StatusLog } from './devStatusLog';
import type { DevCard } from './sprintPrep';

beforeEach(() => { st.rows = []; st.upserts = []; st.selectFails = false; });

describe('stampsFor', () => {
  it('orders by the pipeline order and skips missing stages', () => {
    const log: StatusLog = { 12: { committed: '2026-09-20', backlog: '2026-09-01', prog: '2026-09-10' } };
    expect(stampsFor(log, 12)).toEqual([
      { stage: 'backlog', day: '2026-09-01' },
      { stage: 'prog', day: '2026-09-10' },
      { stage: 'committed', day: '2026-09-20' },
    ]);
  });

  it('a card with no log entry → empty', () => {
    expect(stampsFor({}, 99)).toEqual([]);
  });
});

describe('fetchStatusLog', () => {
  it('groups rows by issue → { stage: day }', async () => {
    st.rows = [{ issue: 12, status: 'backlog', day: '2026-09-01' }, { issue: 12, status: 'prog', day: '2026-09-10' }];
    expect(await fetchStatusLog([12])).toEqual({ 12: { backlog: '2026-09-01', prog: '2026-09-10' } });
  });

  it('no numbers → {} with no request; a failed read → {}', async () => {
    expect(await fetchStatusLog([])).toEqual({});
    st.selectFails = true;
    expect(await fetchStatusLog([12])).toEqual({});
  });
});

describe('logStatuses', () => {
  it('upserts one row per card at its current stage, ignoring duplicates', async () => {
    const cards: DevCard[] = [{ number: 3, title: 'a', status: 'In Progress' } as DevCard, { number: 4, title: 'b', status: 'Backlog' } as DevCard];
    await logStatuses(cards, '2026-09-23');
    expect(st.upserts).toEqual([{
      rows: [{ issue: 3, status: 'prog', day: '2026-09-23' }, { issue: 4, status: 'backlog', day: '2026-09-23' }],
      opts: { onConflict: 'issue,status', ignoreDuplicates: true },
    }]);
  });

  it('no cards → no write', async () => {
    await logStatuses([], '2026-09-23');
    expect(st.upserts).toEqual([]);
  });
});
