// Goldens for the meeting timeline (package M, M-R1/M-R2): what goes on one kibbutz's "מה קרה"
// list since the previous meeting, and where each kind lands. Pure — no React, no network — so
// the placement rules are pinned without a DOM: an EMS task at its latest change (creation, a
// non-closing comment, or an update more than 2 minutes past either), an internal task at its
// open date, a meeting note at its meeting date, a visit at its visit date.
import { describe, it, expect } from 'vitest';
import { emsLatestChange, isClosingComment, timelineFor, windowStartFor } from './meetingTimeline';

const T = (o: any) => ({ id: 't1', title: 'החלפת מונה', description: '', status: 'open', priority: '', type: '', site: { id: 's', name: 'גבים' }, assignee: null, expectedCompletionDate: '', createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', ...o });
const C = (at: string, message = 'בדקתי', author = 'אביאם') => ({ id: at, message, createdAt: at, author });

describe('emsLatestChange', () => {
  it('creation when nothing else happened', () =>
    expect(emsLatestChange(T({}), [])).toEqual({ at: '2026-09-10T08:00:00Z', reason: 'created' }));
  it('the newest non-closing comment wins over creation', () =>
    expect(emsLatestChange(T({}), [C('2026-09-15T09:00:00Z'), C('2026-09-12T09:00:00Z')])).toEqual({ at: '2026-09-15T09:00:00Z', reason: 'comment', by: 'אביאם' }));
  it('an update after the last comment (e.g. a due date from the calendar) wins', () =>
    expect(emsLatestChange(T({ updatedAt: '2026-09-18T10:00:00Z', expectedCompletionDate: '2026-09-25T12:00:00Z' }), [C('2026-09-15T09:00:00Z')]).reason).toBe('updated'));
  it('updatedAt within 2 minutes of a comment is that comment, not a separate update', () =>
    expect(emsLatestChange(T({ updatedAt: '2026-09-15T09:01:00Z' }), [C('2026-09-15T09:00:00Z')]).reason).toBe('comment'));
  it('a closing comment never counts', () => {
    expect(isClosingComment(C('2026-09-16T09:00:00Z', 'נסגר בישיבת צוות 16.9 · עמיחי'))).toBe(true);
    expect(emsLatestChange(T({}), [C('2026-09-16T09:00:00Z', 'נסגר בישיבת צוות 16.9 · עמיחי')]).reason).toBe('created');
  });
});

describe('timelineFor', () => {
  const input = {
    kibbutz: 'גבים',
    emsTasks: [T({}), T({ id: 't2', title: 'ישן', createdAt: '2026-08-01T08:00:00Z', updatedAt: '2026-08-01T08:00:00Z' }), T({ id: 't3', status: 'done' })],
    comments: { t1: [C('2026-09-15T09:00:00Z')] },
    internal: [{ id: 'i1', title: 'להזמין כבל', owner: 'ניתאי', kibbutz: 'גבים', done: false, created_by: 'עידן', created_at: '2026-09-14T07:00:00Z', due_date: null, priority: null, kind: null } as any],
    notes: [{ id: 'n1', kibbutz: 'גבים', meeting_date: '2026-09-16', text: 'לתאם ביקור', owners: ['אביאם'] } as any],
    visits: [{ kibbutz: 'גבים', date: '2026-09-17', visitor: 'אביאם' }, { kibbutz: 'חוקוק', date: '2026-09-17', visitor: 'ניתאי' }],
  };
  it('places each kind by its own rule, newest first, only this kibbutz, only open EMS', () => {
    const { items, olderOpen } = timelineFor(input as any, '2026-09-11T00:00:00Z');
    expect(items.map(i => i.key)).toEqual(['visit:גבים|2026-09-17|אביאם', 'note:n1', 'ems:t1', 'internal:i1']);
    expect(items.find(i => i.key === 'ems:t1')!.meta).toBe('תגובה · אביאם');
    expect(olderOpen.map(i => i.key)).toEqual(['ems:t2']);
  });
  it('a date-only row lands on Israel noon, so 17.9 stays 17.9', () =>
    expect(timelineFor(input as any, '2026-09-11T00:00:00Z').items[0].at).toBe('2026-09-17T09:00:00.000Z'));
  it('a multi-visitor visit is one item naming everyone', () => {
    const v = { ...input, visits: [{ kibbutz: 'גבים', date: '2026-09-17', visitor: 'אביאם', visitors: ['אביאם', 'ניתאי'] }] };
    expect(timelineFor(v as any, '2026-09-11T00:00:00Z').items.filter(i => i.kind === 'visit').map(i => i.meta)).toEqual(['ביקור · אביאם, ניתאי']);
  });
  it('empty input → empty lists, never throws', () =>
    expect(timelineFor({ kibbutz: 'x', emsTasks: [], comments: {}, internal: [], notes: [], visits: [] }, '2026-09-11T00:00:00Z')).toEqual({ items: [], olderOpen: [] }));
});

describe('windowStartFor', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  it('since the previous meeting (start of that Israel day)', () => expect(windowStartFor('since', '2026-09-16', now)).toBe('2026-09-15T21:00:00.000Z'));
  it('no previous meeting → 30 days', () => expect(windowStartFor('since', null, now)).toBe(windowStartFor('30d', null, now)));
  it('30 days', () => expect(windowStartFor('30d', '2026-09-16', now)).toBe('2026-08-23T21:00:00.000Z'));
});
