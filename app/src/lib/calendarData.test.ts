import { describe, expect, it } from 'vitest';
import { pickBlock, type KibbutzBlock } from './calendar';
import { applyBlockPick, undoBlockPick, type CalendarIo } from './calendarData';

const DAY = '2026-09-24';
const block: KibbutzBlock = {
  kibbutz: 'יגור', placed: false, tasks: [
    { key: 'ems:e1', id: 'e1', kind: 'ems', title: 'בדיקת מונים', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
    { key: 'ems:e2', id: 'e2', kind: 'ems', title: 'החלפת בקר', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
    { key: 'internal:i1', id: 'i1', kind: 'internal', title: 'להחזיר מונה', owner: 'אביאם', due: '', onThisDay: false, overdue: false },
  ],
};

function fakeIo(opts: { failEms?: string[]; failInternal?: string[] } = {}) {
  const log: string[] = [];
  const plans: Array<{ person: string; date: string; stops: string[]; due: Record<string, string[]> }> = [];
  const io: CalendarIo = {
    async upsertPlan(person, date, stops, due) { log.push('plan'); plans.push({ person, date, stops, due }); },
    async patchEms(patches) {
      log.push('ems');
      const failed = patches.filter(p => (opts.failEms || []).includes(p.id)).map(p => ({ id: p.id, error: 'x' }));
      return { ok: patches.length - failed.length, failed };
    },
    async patchInternal(patches) {
      log.push('internal');
      return { failed: patches.filter(p => (opts.failInternal || []).includes(p.id)).map(p => p.id) };
    },
  };
  return { io, log, plans };
}

describe('applyBlockPick', () => {
  it('writes the plan for the person it was GIVEN (עידן planning אביאם’s day), then EMS, then internal', async () => {
    const pick = pickBlock(block, ['ems:e1', 'internal:i1'], DAY, ['גבת']);
    const f = fakeIo();
    const res = await applyBlockPick(pick, 'אביאם', DAY, { 'גבת': ['e9'] }, f.io);
    expect(res.failed).toEqual([]);
    expect(f.log).toEqual(['plan', 'ems', 'internal']);
    expect(f.plans[0]).toEqual({ person: 'אביאם', date: DAY, stops: ['גבת', 'יגור'], due: { 'גבת': ['e9'], 'יגור': ['e1'] } });
  });
  it('does not rewrite the route when the stop was already there', async () => {
    const pick = pickBlock({ ...block, placed: true }, ['ems:e1'], DAY, ['יגור']);
    const f = fakeIo();
    await applyBlockPick(pick, 'אביאם', DAY, {}, f.io);
    expect(f.log).toEqual(['ems', 'internal']);
  });
  it('a partial EMS failure keeps the stop and reports exactly what failed', async () => {
    const pick = pickBlock(block, ['ems:e1', 'ems:e2', 'internal:i1'], DAY, []);
    const f = fakeIo({ failEms: ['e2'], failInternal: ['i1'] });
    const res = await applyBlockPick(pick, 'אביאם', DAY, {}, f.io);
    expect(res.failed).toEqual(['e2', 'i1']);
    expect(f.plans).toHaveLength(1);
  });
});

describe('undoBlockPick', () => {
  it('puts the route back and reverses every date', async () => {
    const pick = pickBlock(block, ['ems:e1', 'internal:i1'], DAY, ['גבת']);
    const f = fakeIo();
    const calls: unknown[] = [];
    const io: CalendarIo = {
      ...f.io,
      async patchEms(p) { calls.push(['ems', p]); return { ok: p.length, failed: [] }; },
      async patchInternal(p) { calls.push(['internal', p]); return { failed: [] }; },
    };
    await undoBlockPick(pick, 'אביאם', DAY, { 'גבת': ['e9'] }, io);
    expect(f.plans[0].stops).toEqual(['גבת']);
    expect(calls).toEqual([
      ['ems', [{ id: 'e1', body: { expectedCompletionDate: null } }]],
      ['internal', [{ id: 'i1', due_date: null }]],
    ]);
  });
});
