import { describe, expect, it } from 'vitest';
import { dayDetails, type DayVisit } from './attDayDetails';

const D = '2026-10-08';
const visits: DayVisit[] = [
  { id: 'v2', date: D + 'T13:30:00', visitor: 'אביאם, ניתאי', kibbutz: 'חוקוק', duration: '2', reason: 'תקלה', summary: 'הוחלף מונה', openItems: '', products: [{ name: 'מונה', qty: 2 }], emsTaskId: 't1' },
  { id: 'v1', date: D + 'T08:15:00', visitor: 'אביאם', kibbutz: 'דפנה', duration: 3, reason: 'ביקור שגרתי', summary: 'נבדקו לוחות', openItems: 'להחליף ממסר', products: ['כבל'] },
  { id: 'v3', date: D, visitor: 'ניתאי', kibbutz: 'כפר עזה', summary: 'לא שלי' },
  { id: 'v4', date: '2026-10-09', visitor: 'אביאם', kibbutz: 'דפנה', summary: 'יום אחר' },
];

describe('dayDetails', () => {
  it('field day: several visits in time order, task title + status, short open items/products', () => {
    const r = dayDetails({ date: D, person: 'אביאם', row: { date: D, type: 'field', source: 'visit_auto' }, visits,
      tasks: [{ id: 't1', title: 'החלפת מונה', status: 'in_progress' }], statusLabel: s => (s === 'in_progress' ? 'בטיפול' : s) });
    expect(r).toEqual({ kind: 'field', source: 'מסיכום ביקור', visits: [
      { kibbutz: 'דפנה', when: '3 שעות', reason: 'ביקור שגרתי', task: '', summary: 'נבדקו לוחות', open: 'להחליף ממסר', products: 'כבל' },
      { kibbutz: 'חוקוק', when: '2 שעות', reason: 'תקלה', task: 'החלפת מונה · בטיפול', summary: 'הוחלף מונה', open: '', products: 'מונה ×2' },
    ] });
  });

  it('non-field day with a note → type + note + manual source', () => {
    expect(dayDetails({ date: D, person: 'עמיחי', row: { date: D, type: 'other', note: ' כנס ', source: 'manual' }, visits }))
      .toEqual({ kind: 'day', type: 'אחר', note: 'כנס', source: 'דיווח ידני' });
  });

  it('absence from the calendar → יומן-היעדרות', () => {
    expect(dayDetails({ date: D, person: 'עמיחי', row: { date: D, type: 'vacation', source: 'calendar' }, visits: [] }))
      .toEqual({ kind: 'day', type: 'חופש', note: '', source: 'יומן-היעדרות' });
  });

  it('no report', () => {
    expect(dayDetails({ date: '2026-10-01', person: 'אביאם', row: null, visits })).toEqual({ kind: 'none', text: 'אין דיווח ליום זה', draft: '' });
  });

  it('no report but a visit draft exists', () => {
    expect(dayDetails({ date: '2026-10-01', person: 'אביאם', row: null, visits: [], hasDraft: true }))
      .toEqual({ kind: 'none', text: 'אין דיווח ליום זה', draft: 'יש טיוטת ביקור שלא נשמרה' });
  });
});
