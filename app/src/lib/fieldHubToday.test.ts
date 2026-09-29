import { describe, expect, it } from 'vitest';
import { myDueTasks, nextStop, todayStops } from './fieldHubToday';
import type { ListTask } from './taskList';
import type { InternalTaskRow } from './internalTasks';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const T = (o: Partial<ListTask> & { id: string }): ListTask => ({
  title: o.id, status: 'new', priority: 'normal', type: 'other', site: null,
  expectedCompletionDate: '', assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ' }, description: '', ...o,
});
const R = (o: Partial<InternalTaskRow> & { id: string }): InternalTaskRow => ({
  title: o.id, owner: 'עידן', kibbutz: null, done: false, created_at: '2026-09-01T08:00:00Z', ...o,
});

describe('todayStops', () => {
  const visits = [
    { date: '2026-09-29', kibbutz: 'יגור', visitor: 'עידן' },
    { date: '2026-09-29', kibbutz: 'דפנה', visitor: 'ניתאי' },
    { date: '2026-09-28', kibbutz: 'חוקוק', visitor: 'עידן' },
    { date: '2026-09-29', kibbutz: 'כפר עזה', visitor: 'ניתאי, עידן' },
  ];
  it('keeps plan order, marks done, appends unplanned own visits, drops others and other days', () => {
    const s = todayStops(['דפנה', 'יגור', 'יגור'], visits, 'עידן', '2026-09-29');
    expect(s).toEqual([
      { kibbutz: 'דפנה', done: false },
      { kibbutz: 'יגור', done: true },
      { kibbutz: 'כפר עזה', done: true },
    ]);
    expect(nextStop(s)).toBe('דפנה');
  });
  it('empty when nothing', () => {
    expect(todayStops([], [], 'עידן', '2026-09-29')).toEqual([]);
    expect(nextStop([])).toBeUndefined();
  });
});

describe('myDueTasks', () => {
  const ems = [
    T({ id: 'today', expectedCompletionDate: '2026-09-29' }),
    T({ id: 'late', expectedCompletionDate: '2026-09-20' }),
    T({ id: 'future', expectedCompletionDate: '2026-10-01' }),
    T({ id: 'nodue' }),
    T({ id: 'done', status: 'done', expectedCompletionDate: '2026-09-20' }),
    T({ id: 'other', expectedCompletionDate: '2026-09-20', assignee: { id: 'u2', firstName: 'ניתאי', lastName: 'ל' } }),
  ];
  const internal = [
    R({ id: 'i-today', due_date: '2026-09-29', kibbutz: 'יגור' }),
    R({ id: 'i-late', due_date: '2026-09-25' }),
    R({ id: 'i-done', due_date: '2026-09-25', done: true }),
    R({ id: 'i-other', due_date: '2026-09-25', owner: 'ניתאי' }),
    R({ id: 'i-future', due_date: '2026-09-30' }),
  ];
  it('today + overdue, mine only, open only, oldest due first', () => {
    const r = myDueTasks(ems, internal, 'עידן', NOW);
    expect(r.rows.map(x => x.id)).toEqual(['late', 'i-late', 'today', 'i-today']);
    expect(r.rows.find(x => x.id === 'late')!.late).toBe(true);
    expect(r.rows.find(x => x.id === 'today')!.late).toBe(false);
    expect(r.rows.find(x => x.id === 'i-late')!.late).toBe(true);
    expect(r.more).toBe(0);
  });
  it('caps at max and counts the rest', () => {
    const r = myDueTasks(ems, internal, 'עידן', NOW, 3);
    expect(r.rows).toHaveLength(3);
    expect(r.more).toBe(1);
    expect(r.total).toBe(4);
  });
  it('no user, no rows', () => {
    expect(myDueTasks(ems, internal, '', NOW).rows).toEqual([]);
  });
});
