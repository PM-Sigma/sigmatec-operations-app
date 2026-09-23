import { describe, expect, it } from 'vitest';
import { abilities, isNoopPick, pickBlock, type KibbutzBlock } from './calendar';
import { applyBlockPick, undoBlockPick, type CalendarIo, type PlanGuard } from './calendarData';

const DAY = '2026-09-24';
const TODAY = '2026-09-23';
const block: KibbutzBlock = {
  kibbutz: 'יגור', placed: false, tasks: [
    { key: 'ems:e1', id: 'e1', kind: 'ems', title: 'בדיקת מונים', owner: 'אביאם', due: '', dueRaw: null, onThisDay: false, overdue: false },
    { key: 'ems:e2', id: 'e2', kind: 'ems', title: 'החלפת בקר', owner: 'אביאם', due: '', dueRaw: null, onThisDay: false, overdue: false },
    { key: 'internal:i1', id: 'i1', kind: 'internal', title: 'להחזיר מונה', owner: 'אביאם', due: '', dueRaw: null, onThisDay: false, overdue: false },
  ],
};

// A caller allowed to plan אביאם's own day.
const OK: PlanGuard = { me: 'אביאם', today: TODAY, can: abilities('team', 'אביאם') };

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
    const res = await applyBlockPick(pick, 'אביאם', DAY, { 'גבת': ['e9'] }, OK, f.io);
    expect(res.failed).toEqual([]);
    expect(f.log).toEqual(['plan', 'ems', 'internal']);
    expect(f.plans[0]).toEqual({ person: 'אביאם', date: DAY, stops: ['גבת', 'יגור'], due: { 'גבת': ['e9'], 'יגור': ['e1'] } });
  });
  it('still writes the plan (task_ids) even when the stop already existed, as long as something was ticked', async () => {
    // Audit fix: a stop that was already on the route used to skip the plan write entirely, so
    // a newly-ticked EMS task's id never reached the day's task_ids snapshot.
    const pick = pickBlock({ ...block, placed: true }, ['ems:e1'], DAY, ['יגור']);
    const f = fakeIo();
    await applyBlockPick(pick, 'אביאם', DAY, { 'יגור': ['e0'] }, OK, f.io);
    expect(f.log).toEqual(['plan', 'ems', 'internal']);
    expect(f.plans[0]).toEqual({ person: 'אביאם', date: DAY, stops: ['יגור'], due: { 'יגור': ['e0', 'e1'] } });
  });
  it('a genuine no-op (stop already there, nothing ticked) writes no plan at all', async () => {
    const pick = pickBlock({ ...block, placed: true }, [], DAY, ['יגור']);
    expect(isNoopPick(pick)).toBe(true);
    const f = fakeIo();
    await applyBlockPick(pick, 'אביאם', DAY, {}, OK, f.io);
    expect(f.log).toEqual(['ems', 'internal']);
  });
  it('a partial EMS failure keeps the stop and reports exactly what failed', async () => {
    const pick = pickBlock(block, ['ems:e1', 'ems:e2', 'internal:i1'], DAY, []);
    const f = fakeIo({ failEms: ['e2'], failInternal: ['i1'] });
    const res = await applyBlockPick(pick, 'אביאם', DAY, {}, OK, f.io);
    expect(res.failed).toEqual(['e2', 'i1']);
    expect(f.plans).toHaveLength(1);
  });
  it('refuses to write when the caller may not plan this person’s day (defense in depth)', async () => {
    const pick = pickBlock(block, ['ems:e1'], DAY, []);
    const f = fakeIo();
    const notAllowed: PlanGuard = { me: 'ניתאי', today: TODAY, can: abilities('team', 'ניתאי') };
    await expect(applyBlockPick(pick, 'אביאם', DAY, {}, notAllowed, f.io)).rejects.toThrow();
    expect(f.log).toEqual([]);
  });
  it('refuses to write for a day that has already passed (defense in depth)', async () => {
    const pick = pickBlock(block, ['ems:e1'], DAY, []);
    const f = fakeIo();
    const pastGuard: PlanGuard = { me: 'אביאם', today: '2026-09-25', can: abilities('team', 'אביאם') };
    await expect(applyBlockPick(pick, 'אביאם', DAY, {}, pastGuard, f.io)).rejects.toThrow();
    expect(f.log).toEqual([]);
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
    await undoBlockPick(pick, 'אביאם', DAY, { 'גבת': ['e9'] }, OK, io);
    expect(f.plans[0].stops).toEqual(['גבת']);
    expect(calls).toEqual([
      ['ems', [{ id: 'e1', body: { expectedCompletionDate: null } }]],
      ['internal', [{ id: 'i1', due_date: null }]],
    ]);
  });
  it('also writes the plan back on an already-placed stop, so the ticked ids are removed again', async () => {
    const pick = pickBlock({ ...block, placed: true }, ['ems:e1'], DAY, ['יגור']);
    const f = fakeIo();
    // The caller passes the PRE-pick snapshot (what applyBlockPick was given before it merged e1 in).
    await undoBlockPick(pick, 'אביאם', DAY, { 'יגור': ['e0'] }, OK, f.io);
    expect(f.plans[0]).toEqual({ person: 'אביאם', date: DAY, stops: ['יגור'], due: { 'יגור': ['e0'] } });
  });
  it('refuses to write when the caller may not plan this person’s day (defense in depth)', async () => {
    const pick = pickBlock(block, ['ems:e1'], DAY, ['יגור']);
    const f = fakeIo();
    const notAllowed: PlanGuard = { me: 'ניתאי', today: TODAY, can: abilities('team', 'ניתאי') };
    await expect(undoBlockPick(pick, 'אביאם', DAY, {}, notAllowed, f.io)).rejects.toThrow();
    expect(f.log).toEqual([]);
  });
});
