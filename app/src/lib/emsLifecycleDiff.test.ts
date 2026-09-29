import { describe, expect, it } from 'vitest';
import { applySnapshot, emptyStore, validateSnapshotShape, type RawTask } from './emsLifecycleDiff';

const T0 = '2026-09-29T08:00:00.000Z';
const T1 = '2026-09-29T08:30:00.000Z';
const T2 = '2026-09-29T09:00:00.000Z';
const task = (o: Partial<RawTask> & { id: string }): RawTask => ({
  status: 'new', type: 'fixing_fault', priority: 'high', site: { id: 's1', name: 'דפנה' },
  assignee: null, expectedCompletionDate: '', createdAt: '2026-09-29T07:50:00Z', updatedAt: '2026-09-29T07:50:00Z', ...o,
});
const kinds = (st: ReturnType<typeof emptyStore>, id = 'a') => st.events.filter(e => e.task_id === id).map(e => e.kind);
const asg = { id: 'u1', firstName: 'ניתאי', lastName: 'כהן' };

describe('emsLifecycleDiff golden fixtures', () => {
  it('new task: first_seen + opened, pending assignment', () => {
    const st = emptyStore();
    expect(applySnapshot(st, [task({ id: 'a' })], T0, false)).toBe(1);
    expect(kinds(st)).toEqual(['first_seen', 'opened']);
    const s = st.state.get('a')!;
    expect(s.assigned_src).toBe('pending');
    expect(s.assigned_at).toBeNull();
    expect(s.opened_src).toBe('ems');
  });
  it('assign needs BOTH assignee and due date; the first sync with both stamps assigned_at', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a' })], T0, false);
    applySnapshot(st, [task({ id: 'a', assignee: asg })], T1, false);
    expect(st.state.get('a')!.assigned_src).toBe('pending');
    expect(kinds(st)).not.toContain('assigned');
    applySnapshot(st, [task({ id: 'a', assignee: asg, expectedCompletionDate: '2026-10-05T00:00:00Z' })], T2, false);
    const s = st.state.get('a')!;
    expect([s.assigned_src, s.assigned_at]).toEqual(['derived', T2]);
    expect(kinds(st)).toContain('assigned');
    expect(kinds(st)).toContain('due_set');
  });
  it('reassign and unassign are events, assigned_at keeps the FIRST time', () => {
    const st = emptyStore();
    const due = '2026-10-05T00:00:00Z';
    applySnapshot(st, [task({ id: 'a', assignee: asg, expectedCompletionDate: due })], T0, false);
    expect(st.state.get('a')!.assigned_at).toBe(T0);
    applySnapshot(st, [task({ id: 'a', assignee: { id: 'u2', firstName: 'x', lastName: 'y' }, expectedCompletionDate: due })], T1, false);
    applySnapshot(st, [task({ id: 'a', assignee: null, expectedCompletionDate: due })], T2, false);
    expect(kinds(st)).toEqual(expect.arrayContaining(['reassigned', 'unassigned']));
    expect(st.state.get('a')!.assigned_at).toBe(T0);
  });
  it('already assigned when first seen and old: assigned_src unknown (excluded from time-to-assign)', () => {
    const st = emptyStore();
    const old = task({ id: 'a', assignee: asg, expectedCompletionDate: '2026-10-05', createdAt: '2026-08-01T00:00:00Z' });
    applySnapshot(st, [old], T0, false);
    const s = st.state.get('a')!;
    expect([s.assigned_src, s.assigned_at]).toEqual(['unknown', null]);
    applySnapshot(st, [old], T1, false);
    expect(st.state.get('a')!.assigned_at).toBeNull();
  });
  it('due date change', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a', expectedCompletionDate: '2026-10-05' })], T0, false);
    applySnapshot(st, [task({ id: 'a', expectedCompletionDate: '2026-10-09T00:00:00Z' })], T1, false);
    expect(kinds(st)).toContain('due_changed');
    expect(st.state.get('a')!.due_date).toBe('2026-10-09');
  });
  it('close (done) stamps closed_at from updatedAt; reopen clears it', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a' })], T0, false);
    applySnapshot(st, [task({ id: 'a', status: 'done', updatedAt: '2026-09-29T08:20:00Z' })], T1, false);
    let s = st.state.get('a')!;
    expect([s.closed_at, s.closed_src]).toEqual(['2026-09-29T08:20:00.000Z', 'ems']);
    expect(kinds(st)).toContain('closed');
    applySnapshot(st, [task({ id: 'a', status: 'in_progress' })], T2, false);
    s = st.state.get('a')!;
    expect([s.closed_at, s.closed_src]).toEqual([null, null]);
    expect(kinds(st)).toContain('reopened');
  });
  it('cancel is a closed status', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a' })], T0, false);
    applySnapshot(st, [task({ id: 'a', status: 'cancelled', updatedAt: undefined })], T1, false);
    const s = st.state.get('a')!;
    expect([s.status, s.closed_at, s.closed_src]).toEqual(['cancelled', T1, 'derived']);
  });
  it('disappear only on a FULL crawl; a partial (page-cap) crawl never emits it', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a' }), task({ id: 'b' })], T0, false);
    applySnapshot(st, [task({ id: 'b' })], T1, false);
    expect(kinds(st)).not.toContain('disappeared');
    applySnapshot(st, [task({ id: 'b' })], T2, true);
    expect(kinds(st)).toContain('disappeared');
    const a = st.state.get('a')!;
    expect([a.gone_at, a.closed_at, a.closed_src]).toEqual([T2, T2, 'disappeared']);
    expect(st.state.get('b')!.gone_at).toBeNull();
  });
  it('a disappeared task later seen closed gets the real close time', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a' }), task({ id: 'b' })], T0, false);
    applySnapshot(st, [task({ id: 'b' })], T1, true);
    applySnapshot(st, [task({ id: 'a', status: 'done', updatedAt: '2026-09-29T08:10:00Z' })], T2, false);
    const a = st.state.get('a')!;
    expect([a.closed_at, a.closed_src, a.gone_at]).toEqual(['2026-09-29T08:10:00.000Z', 'ems', null]);
  });
  it('re-sync of the same snapshot is idempotent (zero events)', () => {
    const st = emptyStore();
    const snap = [task({ id: 'a', assignee: asg, expectedCompletionDate: '2026-10-05' }), task({ id: 'b', status: 'done' })];
    applySnapshot(st, snap, T0, true);
    const events = JSON.stringify(st.events);
    expect(applySnapshot(st, snap, T1, true)).toBe(0);
    expect(applySnapshot(st, snap, T2, false)).toBe(0);
    expect(JSON.stringify(st.events)).toBe(events);
    expect(st.state.get('a')!.assigned_at).toBe(T0);
  });
  it('replaying the SAME instant twice (concurrent double call) collapses on the sync key', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a' })], T0, false);
    const a = applySnapshot(st, [task({ id: 'a', status: 'in_progress' })], T1, false);
    const count = st.events.length;
    st.state.get('a')!.status = 'new';
    const b = applySnapshot(st, [task({ id: 'a', status: 'in_progress' })], T1, false);
    expect(a).toBe(1);
    expect(b).toBe(0);
    expect(st.events.length).toBe(count);
  });
  it('ignores malformed rows and malformed dates without throwing', () => {
    const st = emptyStore();
    const bad: any[] = [null, 5, {}, { id: '' }, { id: 'x'.repeat(65) }, task({ id: 'ok', expectedCompletionDate: 'garbage', createdAt: 'nope' })];
    expect(() => applySnapshot(st, bad, T0, false)).not.toThrow();
    expect([...st.state.keys()]).toEqual(['ok']);
    expect(st.state.get('ok')!.due_date).toBeNull();
    expect(st.state.get('ok')!.opened_src).toBe('unknown');
  });
  it('backfill run: tasks without createdAt are unknown-assigned, never counted as fresh', () => {
    const st = emptyStore();
    applySnapshot(st, [task({ id: 'a', assignee: asg, expectedCompletionDate: '2026-10-05', createdAt: undefined })], T0, false, 'backfill');
    expect(st.state.get('a')!.assigned_src).toBe('unknown');
    expect(st.events.every(e => e.src === 'backfill')).toBe(true);
  });
  it('shape validation mirrors the SQL wrapper', () => {
    expect(validateSnapshotShape({}, false).ok).toBe(false);
    expect(validateSnapshotShape(null, false).ok).toBe(false);
    expect(validateSnapshotShape(new Array(5001).fill({}), false).ok).toBe(false);
    expect(validateSnapshotShape([], true).ok).toBe(false);
    expect(validateSnapshotShape([], false).ok).toBe(true);
    expect(validateSnapshotShape([{ id: 'a' }], true).ok).toBe(true);
  });
});
