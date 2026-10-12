import { describe, expect, it, vi } from 'vitest';
import { allTaskIds, applyStatusChanges, canLinkAndSave, KEEP_STATUS, linkedTaskIds, needsEmsLinkWarning, plannedStatusChanges, statusChoices, statusUpdateToasts, toggleTaskId } from './visitEmsLink';

describe('needsEmsLinkWarning', () => {
  it('no task + open tasks -> dialog', () => expect(needsEmsLinkWarning({ emsTaskIds: [], openTaskCount: 2 })).toBe(true));
  it('undefined ids -> dialog', () => expect(needsEmsLinkWarning({ openTaskCount: 1 })).toBe(true));
  it('linked -> no dialog', () => expect(needsEmsLinkWarning({ emsTaskIds: ['t1'], openTaskCount: 2 })).toBe(false));
  it('no open tasks -> no dialog', () => expect(needsEmsLinkWarning({ emsTaskIds: [], openTaskCount: 0 })).toBe(false));
  it('explicit save-without-link skips it', () => expect(needsEmsLinkWarning({ emsTaskIds: [], openTaskCount: 3, skipped: true })).toBe(false));
});

describe('statusChoices', () => {
  it('keep first, then every known status incl. done', () => {
    const c = statusChoices();
    expect(c[0].value).toBe(KEEP_STATUS);
    expect(c.map(x => x.value)).toEqual(expect.arrayContaining(['new', 'in_progress', 'done', 'cancelled']));
  });
});

describe('plannedStatusChanges', () => {
  it('drops keep, empty and unchanged', () => {
    expect(plannedStatusChanges({ a: 'keep', b: 'done', c: 'in_progress', d: '' }, { b: 'new', c: 'in_progress' }))
      .toEqual([{ id: 'b', status: 'done' }]);
  });
});

describe('applyStatusChanges', () => {
  it('calls the setter per change', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const r = await applyStatusChanges([{ id: 'a', status: 'done' }], set);
    expect(set).toHaveBeenCalledWith('a', 'done');
    expect(r).toEqual({ done: 1, failed: [] });
  });
  it('an EMS failure is reported, never thrown, and continues', async () => {
    const set = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce(undefined);
    const r = await applyStatusChanges([{ id: 'a', status: 'done' }, { id: 'b', status: 'done' }], set);
    expect(r.done).toBe(1);
    expect(r.failed).toHaveLength(1);
  });
});

describe('multi-EMS selection (12.10)', () => {
  it('toggle adds then removes, keeping order', () => {
    expect(toggleTaskId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleTaskId(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('select-all = every open task, in list order', () => expect(allTaskIds([{ id: 'T-1' }, { id: 7 }])).toEqual(['T-1', '7']));
  it('dialog: "שייך ושמור" needs at least one', () => {
    expect(canLinkAndSave([])).toBe(false);
    expect(canLinkAndSave(['a', 'b'])).toBe(true);
  });
  it('dialog decision: several linked -> no warning', () =>
    expect(needsEmsLinkWarning({ emsTaskIds: ['a', 'b'], openTaskCount: 3 })).toBe(false));
});

describe('status updates over several tasks', () => {
  it('runs one at a time, one failure does not stop the rest, toasts name the failed task', async () => {
    const order: string[] = [];
    const r = await applyStatusChanges([{ id: 'a', status: 'done' }, { id: 'b', status: 'done' }, { id: 'c', status: 'in_progress' }],
      async (id) => { order.push(id); if (id === 'b') throw new Error('503'); });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(r.done).toBe(2);
    const m = statusUpdateToasts(r, id => ({ a: 'A', b: 'בדיקת תקשורת', c: 'C' } as Record<string, string>)[id], () => 'השרת לא זמין');
    expect(m.ok).toBe('עודכנו 2 משימות');
    expect(m.errors).toEqual(['הביקור נשמר, אך עדכון "בדיקת תקשורת" נכשל · השרת לא זמין']);
  });
  it('only picked, changed statuses', () =>
    expect(plannedStatusChanges({ a: 'done', b: KEEP_STATUS, c: 'new' }, { a: 'new', c: 'new' })).toEqual([{ id: 'a', status: 'done' }]));
});

describe('linkedTaskIds reader fallback', () => {
  it('uses ems_task_ids when present', () => expect(linkedTaskIds({ emsTaskIds: ['a', 'b', 'a'], emsTaskId: 'a' })).toEqual(['a', 'b']));
  it('falls back to ems_task_id when the column is empty or missing', () => {
    expect(linkedTaskIds({ emsTaskIds: [], emsTaskId: 'x' })).toEqual(['x']);
    expect(linkedTaskIds({ emsTaskId: 'x' })).toEqual(['x']);
    expect(linkedTaskIds({})).toEqual([]);
  });
});
