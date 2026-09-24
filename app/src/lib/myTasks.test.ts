// Goldens for "המשימות שלי" (round 4, Package X) — the one list that carries a person's EMS
// work and his 🔒 internal work together, grouped by the place each belongs to.
//
// Same fixture day as taskList.test.ts: Thursday 17.9.2026.
import { describe, expect, it, vi } from 'vitest';
import {
  internalForGroups, myEms, myInternal, myTaskGroups, myTasksCount, myTasksLabel, MY_TASKS_TITLE,
  taskTags, undoable, UNDO_MS,
} from './myTasks';
import { COMPANY_GROUP, NO_SITE, type ListTask } from './taskList';
import type { InternalTaskRow } from './internalTasks';

const TODAY = new Date(2026, 8, 17, 10, 0, 0);

const T = (over: Partial<ListTask> & { id: string }): ListTask => ({
  title: '', status: 'new', priority: 'normal', type: 'other', site: null,
  expectedCompletionDate: '', assignee: null, description: '', ...over,
});

const R = (over: Partial<InternalTaskRow> & { id: string }): InternalTaskRow => ({
  title: '', owner: 'עידן', kibbutz: null, done: false, created_at: '2026-09-01T08:00:00Z', ...over,
});

const EMS: ListTask[] = [
  T({ id: 'e1', title: 'תקלת תקשורת', site: { id: 's1', name: 'יגור' },
    expectedCompletionDate: '2026-09-10', assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ' } }),
  T({ id: 'e2', title: 'אספקת מונים', site: { id: 's2', name: 'דפנה' },
    expectedCompletionDate: '2026-09-30', assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ' } }),
  T({ id: 'e3', title: 'של מישהו אחר', site: { id: 's2', name: 'דפנה' },
    assignee: { id: 'u2', firstName: 'ניתאי', lastName: 'ל' } }),
  T({ id: 'e4', title: 'כבר נסגרה', status: 'done', site: { id: 's1', name: 'יגור' },
    assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ' } }),
  T({ id: 'e5', title: 'בלי אתר', assignee: { id: 'u1', firstName: 'עידן', lastName: 'מ' } }),
];

const ROWS: InternalTaskRow[] = [
  R({ id: 'i1', title: 'לעדכן את המחירון', kibbutz: null }),
  R({ id: 'i2', title: 'לבדוק את הגנרטור', kibbutz: 'חוקוק' }),
  R({ id: 'i3', title: 'של ניתאי', kibbutz: 'חוקוק', owner: 'ניתאי' }),
  R({ id: 'i4', title: 'כבר בוצע', kibbutz: 'דפנה', done: true }),
  R({ id: 'i5', title: 'לתאם ביקור', kibbutz: 'דפנה' }),
];

describe('myEms / myInternal', () => {
  it('keeps only my OPEN EMS work, overdue first', () => {
    expect(myEms(EMS, 'עידן', TODAY).map(t => t.id)).toEqual(['e1', 'e2', 'e5']);
  });

  it('nobody signed in → nothing, rather than everybody else\'s work', () => {
    expect(myEms(EMS, '', TODAY)).toEqual([]);
    expect(myInternal(ROWS, '')).toEqual([]);
  });

  it('keeps only my open 🔒 rows, company-wide included', () => {
    expect(myInternal(ROWS, 'עידן').map(r => r.id)).toEqual(['i1', 'i2', 'i5']);
  });
});

describe('myTaskGroups', () => {
  const groups = myTaskGroups(EMS, ROWS, { me: 'עידן', now: TODAY });

  it('חברה heads the list, the kibbutzim follow in Hebrew order, "ללא אתר" closes it', () => {
    expect(groups.map(g => g.kibbutz)).toEqual([COMPANY_GROUP, 'דפנה', 'חוקוק', 'יגור', NO_SITE]);
    expect(groups[0].company).toBe(true);
    expect(groups[0].real).toBe(false);
    expect(groups[1].real).toBe(true);
    expect(groups[groups.length - 1].real).toBe(false);
  });

  it('puts both kinds of work in the same block and counts them together', () => {
    const dafna = groups.find(g => g.kibbutz === 'דפנה')!;
    expect(dafna.ems.map(t => t.id)).toEqual(['e2']);
    expect(dafna.internal.map(r => r.id)).toEqual(['i5']);
    expect(dafna.count).toBe(2);
    const company = groups[0];
    expect(company.ems).toEqual([]);
    expect(company.internal.map(r => r.id)).toEqual(['i1']);
  });

  it('a kibbutz with only 🔒 work still gets a block', () => {
    expect(groups.find(g => g.kibbutz === 'חוקוק')!.internal.map(r => r.id)).toEqual(['i2']);
  });

  it('nothing of mine → no blocks at all', () => {
    expect(myTaskGroups(EMS, ROWS, { me: 'עמיחי', now: TODAY })).toEqual([]);
  });
});

describe('myTasksCount / myTasksLabel', () => {
  it('counts both kinds', () => {
    expect(myTasksCount(EMS, ROWS, 'עידן', TODAY)).toBe(6);
    expect(myTasksCount(EMS, ROWS, 'עמיחי', TODAY)).toBe(0);
    expect(myTasksCount(null, null, 'עידן', TODAY)).toBe(0);
  });

  it('the label says the number only when there is one', () => {
    expect(myTasksLabel(0)).toBe(MY_TASKS_TITLE);
    expect(myTasksLabel(3)).toBe('המשימות שלי, 3 פתוחות');
  });
});

describe('internalForGroups (the calendar list)', () => {
  it('buckets the rows, and names only the kibbutzim the EMS groups do not already carry', () => {
    const { byKibbutz, extra } = internalForGroups([{ kibbutz: 'דפנה' }], ROWS);
    expect(byKibbutz['דפנה'].map(r => r.id)).toEqual(['i5']);
    expect(byKibbutz['חוקוק'].map(r => r.id)).toEqual(['i2', 'i3']);
    expect(byKibbutz[COMPANY_GROUP].map(r => r.id)).toEqual(['i1']);
    // חברה already heads the list on its own; דפנה is an EMS group already on screen.
    expect(extra).toEqual(['חוקוק']);
  });

  it('drops finished rows and survives no input at all', () => {
    expect(internalForGroups([], ROWS).byKibbutz['דפנה'].map(r => r.id)).toEqual(['i5']);
    expect(internalForGroups([], null)).toEqual({ byKibbutz: {}, extra: [] });
  });
});

describe('taskTags (round 5, L3)', () => {
  it('late → danger with Clock, ≤3 then +N', () => {
    const t = taskTags({ due: '20.9', late: true, priority: 'דחופה', assignee: null, internal: true });
    expect(t[0]).toEqual({ text: 'באיחור · 20.9', role: 'danger', icon: 'Clock' });
    expect(t.length).toBe(3);
    expect(t[2]).toEqual({ text: '+2', role: 'neutral' });
  });

  it('no emoji anywhere', () => {
    for (const x of taskTags({ due: '30.9', late: false, internal: true, assignee: 'עידן' })) {
      expect(x.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe('undoable (round 5, L3)', () => {
  it('commits after the window', async () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => 'ok');
    const u = undoable(commit);
    vi.advanceTimersByTime(UNDO_MS);
    await expect(u.done).resolves.toBe('ok');
    expect(commit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('cancel inside the window never writes', async () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => 'ok');
    const u = undoable(commit);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(u.cancel()).toBe(true);
    vi.advanceTimersByTime(10);
    await expect(u.done).resolves.toBeNull();
    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
