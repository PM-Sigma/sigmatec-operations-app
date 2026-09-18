// Pure logic for the on-card EMS-tasks widget (spec §4 Part C, task-3-brief). Written before
// emsTasks.ts (TDD) — every case below is one of the task-3-brief decisions.
import { describe, it, expect } from 'vitest';
import {
  isOverdue, dueText, taskMeta, sortTasksForCard, toggleClamp,
  EMS_STATUS_LABEL, EMS_PRIORITY_LABEL, type CardEmsTask,
} from './emsTasks';

const task = (over: Partial<CardEmsTask> = {}): CardEmsTask => ({
  id: 't1', title: 'תקן שעון', status: 'in_progress', priority: 'high',
  ...over,
});

describe('isOverdue', () => {
  const now = new Date('2026-09-18T00:00:00Z');

  it('past due date, still open → overdue', () => {
    expect(isOverdue(task({ expectedCompletionDate: '2026-09-01' }), now)).toBe(true);
  });

  it('future due date → not overdue', () => {
    expect(isOverdue(task({ expectedCompletionDate: '2026-12-01' }), now)).toBe(false);
  });

  it('no due date → not overdue', () => {
    expect(isOverdue(task({ expectedCompletionDate: '' }), now)).toBe(false);
  });

  it('past due date but closed status → not overdue (only open tasks reach the card anyway)', () => {
    expect(isOverdue(task({ expectedCompletionDate: '2026-09-01', status: 'done' }), now)).toBe(false);
  });
});

describe('isOverdue — day granularity, no timezone slide (fix round 1)', () => {
  // `new Date('YYYY-MM-DD')` parses as UTC midnight; comparing it against a LOCAL `now`
  // (Israel UTC+2/3) used to flip a same-day-due task overdue hours before local midnight.
  // These build the "day" from Y/M/D parts (bare-date literal, or the instant's local
  // getters) and compare day-to-day, never instant-to-instant.
  it('due TODAY, 00:01 local → not overdue, however early in the day', () => {
    const now = new Date(2026, 8, 18, 0, 1); // 18 Sep 2026, local components
    expect(isOverdue(task({ expectedCompletionDate: '2026-09-18' }), now)).toBe(false);
  });

  it('due YESTERDAY → overdue', () => {
    const now = new Date(2026, 8, 18, 0, 1);
    expect(isOverdue(task({ expectedCompletionDate: '2026-09-17' }), now)).toBe(true);
  });

  it('an EMS timestamp with a time component (not a bare date) is handled the same way', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    const dueOneLocalDayEarlier = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    expect(isOverdue(task({ expectedCompletionDate: dueOneLocalDayEarlier }), now)).toBe(true);
    expect(isOverdue(task({ expectedCompletionDate: now.toISOString() }), now)).toBe(false);
  });
});

describe('dueText', () => {
  it('formats d.m with no year', () => {
    expect(dueText(task({ expectedCompletionDate: '2026-09-05' }))).toBe('5.9');
    expect(dueText(task({ expectedCompletionDate: '2026-01-31' }))).toBe('31.1');
  });

  it('no date → empty string', () => {
    expect(dueText(task({ expectedCompletionDate: '' }))).toBe('');
  });
});

describe('taskMeta', () => {
  const now = new Date('2026-09-18T00:00:00Z');

  it('assignee present → firstName chip', () => {
    const m = taskMeta(task({ assignee: { id: 'u1', firstName: 'אביאם', lastName: 'כהן' } }), now);
    expect(m.assigneeFirstName).toBe('אביאם');
  });

  it('no assignee → null (component must not render the 👤 chip)', () => {
    expect(taskMeta(task({ assignee: null }), now).assigneeFirstName).toBeNull();
    expect(taskMeta(task({}), now).assigneeFirstName).toBeNull();
  });

  it('overdue flag + due text + priority label all come through', () => {
    const m = taskMeta(task({ expectedCompletionDate: '2026-09-01', priority: 'urgent' }), now);
    expect(m.overdue).toBe(true);
    expect(m.due).toBe('1.9');
    expect(m.priorityLabel).toBe(EMS_PRIORITY_LABEL.urgent);
  });

  it('unknown status/priority fall back to the raw value, never crash', () => {
    const m = taskMeta(task({ priority: 'weird' as any }), now);
    expect(m.priorityLabel).toBe('weird');
    expect(EMS_STATUS_LABEL['weird']).toBeUndefined();
  });
});

describe('sortTasksForCard — mine-first, otherwise stable', () => {
  it('my open task bubbles to the top', () => {
    const a = task({ id: 'a', assignee: { id: 'u1', firstName: 'ניתאי' } });
    const b = task({ id: 'b', assignee: { id: 'u2', firstName: 'אביאם' } });
    const c = task({ id: 'c', assignee: null });
    expect(sortTasksForCard([a, b, c], 'אביאם').map(t => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('no match for "me" → original order preserved', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    expect(sortTasksForCard([a, b], 'עידן').map(t => t.id)).toEqual(['a', 'b']);
  });

  it('empty "me" → never matches, original order kept', () => {
    const a = task({ id: 'a', assignee: { id: 'u1', firstName: '' } });
    const b = task({ id: 'b' });
    expect(sortTasksForCard([a, b], '').map(t => t.id)).toEqual(['a', 'b']);
  });
});

describe('toggleClamp — pure "עוד"/"פחות" state (fix round 1)', () => {
  it('flips one task, leaves the rest untouched, toggles back off', () => {
    const s1 = toggleClamp({}, 'a');
    expect(s1).toEqual({ a: true });
    const s2 = toggleClamp(s1, 'b');
    expect(s2).toEqual({ a: true, b: true });
    expect(toggleClamp(s2, 'a')).toEqual({ a: false, b: true });
  });
});
