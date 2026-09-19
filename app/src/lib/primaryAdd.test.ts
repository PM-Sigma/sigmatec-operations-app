// The FULL page × role matrix §7k.2 demands ("must be fully modeled and never ambiguous").
// Decision #13 was accepted only on condition of this table, so the table is the test.
import { describe, expect, it } from 'vitest';
import { ADD_LABEL, primaryAdd, primaryAddLabel, type AddAction, type AddPage } from '@/lib/primaryAdd';
import type { PersonRole } from '@/lib/landing';

const PAGES: AddPage[] = ['kibbutz', 'calendar', 'inventory', 'attendance', 'dev', 'pushlog', 'burns'];
const ROLES: PersonRole[] = ['field', 'pm', 'dev', 'ceo', 'viewer'];

describe('primaryAdd — the matrix', () => {
  // page → what a NON-viewer who cannot manage kibbutzim gets
  const plain: Record<AddPage, AddAction> = {
    kibbutz: 'none',
    calendar: 'event',
    inventory: 'stockChange',
    attendance: 'visit',
    dev: 'none',
    pushlog: 'none',
    burns: 'none',      // 🔥 צריבות (Task 23) — a fixed meter list, nothing to add by hand
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

  it('the calendar depends on the context, exactly as §7k.2 words it', () => {
    expect(primaryAdd('calendar', 'pm', { daySelected: true })).toBe('schedule');
    expect(primaryAdd('calendar', 'pm', { daySelected: false })).toBe('event');
    expect(primaryAdd('calendar', 'pm')).toBe('event');
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
