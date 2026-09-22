import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  canWriteInternal, countBadge, dueLabel, isOverdueInternal, myOpen, openFor, promoteToEms, toggleDone,
  type InternalTaskRow,
} from './internalTasks';

const row = (over: Partial<InternalTaskRow> = {}): InternalTaskRow => ({
  id: 'r1', title: 'תדפיס חדש למונה', owner: 'עידן', kibbutz: 'דפנה', done: false,
  created_by: 'עידן', created_at: '2026-09-17T10:00:00Z', ...over,
});

describe('openFor', () => {
  it('this kibbutz, open only, oldest first', () => {
    const rows = [
      row({ id: 'a', kibbutz: 'דפנה', created_at: '2026-09-18T00:00:00Z' }),
      row({ id: 'b', kibbutz: 'דפנה', created_at: '2026-09-01T00:00:00Z' }),
      row({ id: 'c', kibbutz: 'חוקוק' }),
      row({ id: 'd', kibbutz: 'דפנה', done: true }),
    ];
    expect(openFor(rows, 'דפנה').map(r => r.id)).toEqual(['b', 'a']);
  });

  it('a company-wide row (kibbutz null) never leaks into a kibbutz section', () => {
    expect(openFor([row({ kibbutz: null })], 'דפנה')).toEqual([]);
  });

  it('empty / missing input → []', () => {
    expect(openFor(null, 'דפנה')).toEqual([]);
    expect(openFor(undefined, 'דפנה')).toEqual([]);
  });
});

describe('myOpen', () => {
  it('owner = person, open only — kibbutz-null rows included', () => {
    const rows = [
      row({ id: 'a', owner: 'עידן', kibbutz: 'דפנה' }),
      row({ id: 'b', owner: 'עידן', kibbutz: null }),
      row({ id: 'c', owner: 'עמיחי', kibbutz: 'דפנה' }),
      row({ id: 'd', owner: 'עידן', done: true }),
    ];
    expect(myOpen(rows, 'עידן').map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('no person → []', () => {
    expect(myOpen([row()], '')).toEqual([]);
  });
});

describe('countBadge', () => {
  it('counts open rows for the kibbutz', () => {
    expect(countBadge([row(), row({ id: 'x', done: true })], 'דפנה')).toBe(1);
  });

  it('hides at 0', () => {
    expect(countBadge([], 'דפנה')).toBe(0);
    expect(countBadge([row({ done: true })], 'דפנה')).toBe(0);
  });
});

describe('toggleDone', () => {
  it('flips done, pure — the input row is untouched', () => {
    const r = row({ done: false });
    const flipped = toggleDone(r);
    expect(flipped.done).toBe(true);
    expect(r.done).toBe(false);
    expect(toggleDone(flipped).done).toBe(false);
  });
});

describe('promoteToEms', () => {
  it('golden payload — taskFromBullet shape, owner as assignee', () => {
    const payload = promoteToEms(row({ title: 'להחליף מונה 12', owner: 'ניתאי', created_at: '2026-09-17T00:00:00Z' }), 'דפנה');
    expect(payload).toEqual({
      kibbutz: 'דפנה',
      title: 'להחליף מונה 12',
      description: 'להחליף מונה 12\n\nמקור: ישיבת חברה 17.9.26',
      assigneeName: 'ניתאי',
      priority: 'medium',
    });
  });

  it('no owner → no assigneeName key at all', () => {
    const payload = promoteToEms(row({ owner: null }), 'דפנה');
    expect(payload).not.toHaveProperty('assigneeName');
  });
});

describe('canWriteInternal', () => {
  it('every employee can write; a viewer cannot', () => {
    expect(canWriteInternal(false)).toBe(true);
    expect(canWriteInternal(true)).toBe(false);
  });
});

// ───────────────────────────── contract sweep ─────────────────────────────
// 22.9 (עידן): a due date IS allowed now (it is a fact on the row). Reminders still are not.
describe('22.9 ruling — a due date is a fact on the row, never a reminder', () => {
  const code = fs.readFileSync(path.resolve(__dirname, 'internalTasks.ts'), 'utf8');
  it('no `remind` field/property anywhere in the module', () => {
    expect(/\bremind\w*\s*[:?]/i.test(code)).toBe(false);
  });
  it('dueLabel / isOverdueInternal read the ISO date at day granularity', () => {
    expect(dueLabel({ due_date: '2026-09-05' })).toBe('5.9');
    expect(dueLabel({ due_date: null })).toBe('');
    const now = new Date(2026, 8, 22);
    expect(isOverdueInternal({ due_date: '2026-09-21', done: false }, now)).toBe(true);
    expect(isOverdueInternal({ due_date: '2026-09-22', done: false }, now)).toBe(false);
    expect(isOverdueInternal({ due_date: '2026-09-21', done: true }, now)).toBe(false);
    expect(isOverdueInternal({ due_date: null, done: false }, now)).toBe(false);
  });
});
