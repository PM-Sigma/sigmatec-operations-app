import { describe, expect, it, vi } from 'vitest';
import { applyStatusChanges, KEEP_STATUS, needsEmsLinkWarning, plannedStatusChanges, statusChoices } from './visitEmsLink';

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
