// Goldens for the calendar's third view — רשימה (spec §7g, §7m R1/R2/R3/R4, Task 14).
//
// The fixture day is THURSDAY 17.9.2026, inside the same September the calendar and the
// attendance goldens use, so a reader comparing the three screens is comparing one month.
import { describe, expect, it } from 'vitest';
import {
  companyItems, DEFAULT_FILTERS, filterTasks, groupTasks, NO_SITE, shareText, siteOptions,
  sortTasks, waLink,
  type CompanyRow, type ListTask, type TaskFilters,
} from './taskList';

const TODAY = new Date(2026, 8, 17, 10, 0, 0);          // Thursday 17.9.2026, 10:00 local

const T = (over: Partial<ListTask> & { id: string }): ListTask => ({
  title: '',
  status: 'new',
  priority: 'normal',
  type: 'other',
  site: null,
  expectedCompletionDate: '',
  assignee: null,
  description: '',
  ...over,
});

const TASKS: ListTask[] = [
  T({ id: 't1', title: 'תקלת תקשורת בבקר', status: 'in_progress', priority: 'high',
    site: { id: 's-yagur', name: 'יגור' }, expectedCompletionDate: '2026-09-14',
    assignee: { id: 'u1', firstName: 'ניתאי', lastName: 'לוי' }, description: 'הבקר לא מדווח' }),
  T({ id: 't2', title: 'אספקת 12 מונים', status: 'new', priority: 'urgent',
    site: { id: 's-dganya', name: 'דגניה' }, expectedCompletionDate: '2026-09-20' }),
  T({ id: 't3', title: 'התקנה הושלמה', status: 'done', priority: 'normal',
    site: { id: 's-hukok', name: 'חוקוק' }, expectedCompletionDate: '2026-09-07' }),
  T({ id: 't4', title: 'ממתין לאישור לקוח', status: 'waiting_for_client',
    site: { id: 's-yagur', name: 'יגור' }, expectedCompletionDate: '',
    assignee: { id: 'u1', firstName: 'ניתאי', lastName: 'לוי' } }),
  T({ id: 't5', title: 'בדיקת זרימת נתונים', priority: 'low',
    site: { id: 's-gvat', name: 'גבת' }, expectedCompletionDate: '2026-09-17',
    assignee: { id: 'u2', firstName: 'אביאם', lastName: '' } }),
  T({ id: 't6', title: 'משימה בלי אתר', expectedCompletionDate: '2026-09-16',
    assignee: { id: 'u1', firstName: 'ניתאי', lastName: 'לוי' } }),
];

const F = (over: Partial<TaskFilters> = {}): TaskFilters => ({ ...DEFAULT_FILTERS, ...over });
const ids = (list: ListTask[]) => list.map(t => t.id);

// ───────────────────────────── filters (the six R2 names) ─────────────────────────────

describe('filterTasks', () => {
  it('a finished task never reaches the list, whatever the filters say', () => {
    const all = filterTasks(TASKS, F({ mine: false }), { me: 'ניתאי', now: TODAY });
    expect(ids(all)).not.toContain('t3');
    expect(ids(all)).toEqual(['t1', 't2', 't4', 't5', 't6']);
  });

  it('"שלי" keeps the viewer\'s own, matched loosely (EMS carries a surname, the app does not)', () => {
    expect(ids(filterTasks(TASKS, F(), { me: 'ניתאי', now: TODAY }))).toEqual(['t1', 't4', 't6']);
    expect(ids(filterTasks(TASKS, F(), { me: 'אביאם', now: TODAY }))).toEqual(['t5']);
  });

  it('"כולל של אחרים" (mine off) is the whole open list — an unassigned task included', () => {
    expect(ids(filterTasks(TASKS, F({ mine: false }), { me: 'ניתאי', now: TODAY })))
      .toEqual(['t1', 't2', 't4', 't5', 't6']);
  });

  it('nobody is signed in → "שלי" cannot mean anything, so it shows everything rather than nothing', () => {
    expect(ids(filterTasks(TASKS, F(), { me: '', now: TODAY }))).toEqual(['t1', 't2', 't4', 't5', 't6']);
  });

  it('status / priority / site narrow by the exact EMS values', () => {
    expect(ids(filterTasks(TASKS, F({ mine: false, status: 'in_progress' }), { me: '', now: TODAY }))).toEqual(['t1']);
    expect(ids(filterTasks(TASKS, F({ mine: false, priority: 'urgent' }), { me: '', now: TODAY }))).toEqual(['t2']);
    expect(ids(filterTasks(TASKS, F({ mine: false, site: 's-yagur' }), { me: '', now: TODAY }))).toEqual(['t1', 't4']);
  });

  it('search reads the title, the description and the site name — case and spacing forgiven', () => {
    expect(ids(filterTasks(TASKS, F({ mine: false, q: '  תקשורת ' }), { me: '', now: TODAY }))).toEqual(['t1']);
    expect(ids(filterTasks(TASKS, F({ mine: false, q: 'מדווח' }), { me: '', now: TODAY }))).toEqual(['t1']);
    expect(ids(filterTasks(TASKS, F({ mine: false, q: 'יגור' }), { me: '', now: TODAY }))).toEqual(['t1', 't4']);
  });

  it('"באיחור" is a DAY comparison — a task due today is not late', () => {
    expect(ids(filterTasks(TASKS, F({ mine: false, overdue: true }), { me: '', now: TODAY }))).toEqual(['t1', 't6']);
  });

  it('the filters compose, and an empty result is an empty list, never a throw', () => {
    expect(filterTasks(TASKS, F({ overdue: true, site: 's-gvat' }), { me: 'ניתאי', now: TODAY })).toEqual([]);
    expect(filterTasks([], F(), { me: 'ניתאי', now: TODAY })).toEqual([]);
    expect(filterTasks(null as any, F(), { me: 'ניתאי', now: TODAY })).toEqual([]);
  });
});

// ───────────────────────────── order ─────────────────────────────

describe('sortTasks', () => {
  it('overdue first (oldest debt at the top), then what is coming, then whatever has no date', () => {
    const open = filterTasks(TASKS, F({ mine: false }), { me: '', now: TODAY });
    expect(ids(sortTasks(open, TODAY))).toEqual(['t1', 't6', 't5', 't2', 't4']);
  });

  it('two tasks on the same day keep a stable, readable order (by title)', () => {
    const a = T({ id: 'a', title: 'ב', expectedCompletionDate: '2026-09-20' });
    const b = T({ id: 'b', title: 'א', expectedCompletionDate: '2026-09-20' });
    expect(ids(sortTasks([a, b], TODAY))).toEqual(['b', 'a']);
  });
});

// ───────────────────────────── grouping ─────────────────────────────

describe('groupTasks', () => {
  const groups = groupTasks(filterTasks(TASKS, F({ mine: false }), { me: '', now: TODAY }), TODAY);

  it('groups by kibbutz, the one carrying the oldest debt first, and site-less work LAST', () => {
    expect(groups.map(g => g.kibbutz)).toEqual(['יגור', 'גבת', 'דגניה', NO_SITE]);
  });

  it('every group knows how much of it is late and when it is next due', () => {
    expect(groups.map(g => [g.kibbutz, g.overdue, g.due])).toEqual([
      ['יגור', 1, '2026-09-14'],
      ['גבת', 0, '2026-09-17'],
      ['דגניה', 0, '2026-09-20'],
      [NO_SITE, 1, '2026-09-16'],
    ]);
  });

  it('inside a group the rows carry the same order the flat list has', () => {
    expect(ids(groups[0].items)).toEqual(['t1', 't4']);
  });

  it('a kibbutz with no open work is simply not a group', () => {
    expect(groups.map(g => g.kibbutz)).not.toContain('חוקוק');
  });
});

// ───────────────────────────── the site filter's options ─────────────────────────────

describe('siteOptions', () => {
  it('one option per real site, Hebrew order, no duplicates and no blank', () => {
    expect(siteOptions(TASKS)).toEqual([
      { id: 's-gvat', name: 'גבת' },
      { id: 's-dganya', name: 'דגניה' },
      { id: 's-hukok', name: 'חוקוק' },
      { id: 's-yagur', name: 'יגור' },
    ]);
  });
});

// ───────────────────────────── "חברה" — the company block ─────────────────────────────

describe('companyItems', () => {
  const rows: CompanyRow[] = [
    { id: 'i1', title: 'הזמנת בקר 504', kibbutz: null, done: false, owner: 'עידן' },
    { id: 'i2', title: 'כבר בוצע', kibbutz: null, done: true, owner: null },
    { id: 'i3', title: 'של יגור', kibbutz: 'יגור', done: false, owner: null },
  ];

  it('company work = an internal task with no kibbutz and not done', () => {
    expect(companyItems(rows, null)).toEqual([{ id: 'i1', title: 'הזמנת בקר 504', heading: '', owner: 'עידן' }]);
  });

  it('before the rows exist, the three legacy lists still show — with their own headings', () => {
    expect(companyItems([], { orders: ['הזמנת בקר 504'], info: ['ספק קרלו'], guidelines: [] })).toEqual([
      { id: 'legacy:orders:0', title: 'הזמנת בקר 504', heading: '🛒 הזמנות', owner: null },
      { id: 'legacy:info:0', title: 'ספק קרלו', heading: 'ℹ️ מידע', owner: null },
    ]);
  });

  it('once a row exists the legacy lists are ignored — one source, never two', () => {
    expect(companyItems(rows, { orders: ['ישן'], info: [], guidelines: [] }).map(i => i.title))
      .toEqual(['הזמנת בקר 504']);
  });

  it('nothing anywhere is an empty block, not a crash', () => {
    expect(companyItems(null, null)).toEqual([]);
    expect(companyItems([], { orders: [], info: [], guidelines: [] })).toEqual([]);
  });
});

// ───────────────────────────── שתף (the one surviving report) ─────────────────────────────

describe('shareText', () => {
  it('is the old "משימות באחריותי" text, per kibbutz, with the company block on top', () => {
    const mine = sortTasks(filterTasks(TASKS, F(), { me: 'ניתאי', now: TODAY }), TODAY);
    const text = shareText({
      person: 'ניתאי',
      groups: groupTasks(mine, TODAY),
      company: companyItems([], { orders: ['הזמנת בקר 504'], info: [], guidelines: [] }),
      now: TODAY,
    });
    expect(text).toBe(
      '*📋 משימות EMS באחריותי — ניתאי*\n'
      + '📅 17.9.2026\n'
      + '\n*━━━ 📌 משימות חברה כלליות ━━━*\n'
      + '\n*🛒 הזמנות*\n'
      + '- הזמנת בקר 504\n'
      + '\n*━━━ יגור ━━━*\n'
      + '- תקלת תקשורת בבקר (🔄 בטיפול) · ⏰ 14.9\n'
      + '- ממתין לאישור לקוח (⏳ ממתין ללקוח)\n'
      + '\n*━━━ ללא אתר ━━━*\n'
      + '- משימה בלי אתר (🆕 חדשה) · ⏰ 16.9\n'
      + '\n🔗 https://pm-sigma.github.io/sigmatec-operations-app/',
    );
  });

  it('no open work says so, and still carries whatever the company owes', () => {
    expect(shareText({ person: 'אביאם', groups: [], company: [], now: TODAY })).toBe(
      '*📋 משימות EMS באחריותי — אביאם*\n📅 17.9.2026\n\n✨ אין משימות EMS פתוחות',
    );
  });
});

describe('waLink', () => {
  it('builds the wa.me link with the text encoded', () => {
    expect(waLink('972528119081', 'שלום')).toBe('https://wa.me/972528119081?text=' + encodeURIComponent('שלום'));
  });
  it('no phone → no link (the button is hidden rather than dead)', () => {
    expect(waLink('', 'שלום')).toBe('');
  });
});
