// The FULL page × role matrix §7k.2 demands ("must be fully modeled and never ambiguous").
// Decision #13 was accepted only on condition of this table, so the table is the test.
import { describe, expect, it } from 'vitest';
import { ADD_LABEL, primaryAdd, primaryAddLabel, type AddAction, type AddPage } from '@/lib/primaryAdd';
import type { PersonRole } from '@/lib/landing';

const PAGES: AddPage[] = ['kibbutz', 'calendar', 'inventory', 'attendance', 'dev', 'pushlog', 'burns', 'hours'];
const ROLES: PersonRole[] = ['field', 'pm', 'dev', 'ceo', 'viewer'];

describe('primaryAdd — the matrix', () => {
  // page → what a NON-viewer who cannot manage kibbutzim gets
  const plain: Record<AddPage, AddAction> = {
    kibbutz: 'none',
    calendar: 'none',    // the calendar island owns its own ➕ (22.9, B4)
    inventory: 'stockChange',
    attendance: 'visit',
    dev: 'none',
    pushlog: 'none',
    burns: 'none',      // 🔥 צריבות (Task 23) — a fixed meter list, nothing to add by hand
    hours: 'none',      // ⏱ שעות (22.9) — the page carries its own הוספה ידנית
  };

  for (const page of PAGES) {
    it(`${page}: a field/dev user without kibbutz rights → ${plain[page]}`, () => {
      expect(primaryAdd(page, 'field')).toBe(plain[page]);
      expect(primaryAdd(page, 'dev')).toBe(plain[page]);
    });
  }

  it('the card home offers ➕ קיבוץ only to the people who may create one', () => {
    expect(primaryAdd('kibbutz', 'pm', { canManageKibbutzim: true })).toBe('kibbutz');
    expect(primaryAdd('kibbutz', 'ceo', { canManageKibbutzim: true })).toBe('kibbutz');
    expect(primaryAdd('kibbutz', 'field', { canManageKibbutzim: false })).toBe('none');
    expect(primaryAdd('kibbutz', 'field')).toBe('none');
  });

  it('the calendar offers no header ➕ — its island has its own (22.9, B4)', () => {
    expect(primaryAdd('calendar', 'pm', { daySelected: true })).toBe('none');
    expect(primaryAdd('calendar', 'pm', { daySelected: false })).toBe('none');
    expect(primaryAdd('calendar', 'pm')).toBe('none');
  });

  it('the viewer gets 📣 and only 📣 — everywhere, so no ➕ of his is ever blocked', () => {
    for (const page of PAGES) {
      expect(primaryAdd(page, 'viewer', { canManageKibbutzim: true, daySelected: true })).toBe('feedback');
    }
  });

  it('every (page, role) answers exactly one action, and never undefined', () => {
    for (const page of PAGES) {
      for (const role of ROLES) {
        const a = primaryAdd(page, role, { canManageKibbutzim: true, daySelected: true });
        expect(typeof a).toBe('string');
        expect(a.length).toBeGreaterThan(0);
      }
    }
  });

  it('an unknown page is none, not a guess', () => {
    expect(primaryAdd('whatever' as AddPage, 'pm')).toBe('none');
  });
});

describe('primaryAddLabel', () => {
  it('none renders NOTHING — no purposeless buttons (§7k.2)', () => {
    expect(primaryAddLabel('none')).toBe(null);
  });

  it('every other action has a label that says what it does, never a bare plus', () => {
    for (const [action, label] of Object.entries(ADD_LABEL)) {
      expect(primaryAddLabel(action as AddAction)).toBe(label);
      expect(label.replace('➕', '').trim().length).toBeGreaterThan(2);
    }
  });
});

describe('ADD_LABEL copy rules', () => {
  it('has no emoji, no "!" and no masculine imperative', () => {
    for (const label of Object.values(ADD_LABEL)) {
      expect(label).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(label).not.toMatch(/!/);
      expect(label).not.toMatch(/(?<![א-ת])(שמור|שלח|סגור|בטל|מחק|ערוך|הוסף|בחר|אשר|פתח|העלה|עבור)(?![א-ת])/);
    }
  });
  it('pins the exact labels', () => {
    expect(ADD_LABEL).toEqual({
      kibbutz: 'קיבוץ חדש', visit: 'סיכום ביקור', feedback: 'רעיון או באג',
      schedule: 'מעבר ליומן', event: 'מעבר ליומן', stockChange: 'דיווח מלאי',
    });
  });
});
