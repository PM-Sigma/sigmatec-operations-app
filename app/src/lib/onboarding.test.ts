import { describe, expect, it } from 'vitest';
import {
  canEditTemplate, daysInOnboarding, isComplete, nextState, nextStep, progressOf,
  stepsFromTemplate, waitAge, type OnboardingStepRow, type OnboardingTemplate,
} from './onboarding';

const DEFAULT_TEMPLATE: OnboardingTemplate = {
  name: 'ברירת מחדל',
  steps: [
    { key: 'ems_site', label: 'הקמת אתר ב-EMS', waits: false },
    { key: 'customer_list', label: 'קבלת רשימת לקוחות מהקיבוץ (ממתין למייל)', waits: true },
    { key: 'meter_login', label: 'קבלת פרטי כניסה למערכת המונים (ממתין למייל)', waits: true },
    { key: 'meter_import', label: 'ייבוא מונים', waits: false },
    { key: 'tariffs', label: 'תעריפים', waits: false },
    { key: 'comms', label: 'תקשורת', waits: false },
    { key: 'training', label: 'הדרכה', waits: false },
    { key: 'first_bill_check', label: 'בדיקת חשבון ראשון', waits: false },
    { key: 'go_live', label: 'העברה לפעילים', waits: false },
  ],
};

describe('stepsFromTemplate', () => {
  it('produces the nine seeded rows in order, all open — waits does not start waiting', () => {
    const rows = stepsFromTemplate(DEFAULT_TEMPLATE, 'גבת');
    expect(rows).toHaveLength(9);
    rows.forEach((r, i) => {
      expect(r.kibbutz).toBe('גבת');
      expect(r.seq).toBe(i);
      expect(r.state).toBe('open');
      expect(r.step_key).toBe(DEFAULT_TEMPLATE.steps[i].key);
    });
    // the two "ממתין למייל" steps still start open, not waiting
    expect(rows[1].state).toBe('open');
    expect(rows[2].state).toBe('open');
    // waits is carried into the frozen row from the template step, not re-derived by key later
    expect(rows[1].waits).toBe(true);
    expect(rows[2].waits).toBe(true);
    expect(rows[0].waits).toBe(false);
  });

  it('empty template → empty rows', () => {
    expect(stepsFromTemplate({ name: 'x', steps: [] }, 'גבת')).toEqual([]);
  });
});

function rowsAt(states: OnboardingStepRow['state'][], createdAt = '2026-09-01T08:00:00Z'): OnboardingStepRow[] {
  return states.map((state, i) => ({
    kibbutz: 'גבת', step_key: 's' + i, seq: i, state, created_at: createdAt,
  }));
}

describe('progressOf', () => {
  it('0 done', () => {
    expect(progressOf(rowsAt(Array(9).fill('open')))).toEqual({ done: 0, total: 9, pct: 0, label: '0/9' });
  });
  it('partial', () => {
    const states: OnboardingStepRow['state'][] = ['done', 'done', 'done', 'done', 'done', 'open', 'waiting', 'open', 'open'];
    expect(progressOf(rowsAt(states))).toEqual({ done: 5, total: 9, pct: 56, label: '5/9' });
  });
  it('all 9 done', () => {
    expect(progressOf(rowsAt(Array(9).fill('done')))).toEqual({ done: 9, total: 9, pct: 100, label: '9/9' });
  });
  it('empty', () => {
    expect(progressOf(null)).toEqual({ done: 0, total: 0, pct: 0, label: '0/0' });
  });
});

describe('daysInOnboarding', () => {
  it('same day → 0', () => {
    const steps = rowsAt(['open'], '2026-09-19T22:00:00Z');
    expect(daysInOnboarding(steps, new Date('2026-09-19T05:00:00Z'))).toBe(0);
  });
  it('across a DST boundary (built from Y/M/D parts, not raw ms) — Israel DST ends 2026-10-25', () => {
    // spawned before the clocks-back weekend, checked after: still a plain calendar-day count.
    const steps = rowsAt(['open'], '2026-10-20T00:00:00Z');
    expect(daysInOnboarding(steps, new Date('2026-10-27T00:00:00Z'))).toBe(7);
  });
  it('uses the EARLIEST created_at when steps differ', () => {
    const steps: OnboardingStepRow[] = [
      { kibbutz: 'גבת', step_key: 'a', seq: 0, state: 'done', created_at: '2026-09-10T00:00:00Z' },
      { kibbutz: 'גבת', step_key: 'b', seq: 1, state: 'open', created_at: '2026-09-01T00:00:00Z' },
    ];
    expect(daysInOnboarding(steps, new Date('2026-09-15T00:00:00Z'))).toBe(14);
  });
  it('no steps → 0', () => {
    expect(daysInOnboarding([], new Date())).toBe(0);
  });
});

describe('waitAge', () => {
  it('null when the step is not waiting', () => {
    const step: OnboardingStepRow = { kibbutz: 'גבת', step_key: 'a', state: 'open' };
    expect(waitAge(step, new Date())).toBeNull();
  });
  it('null when waiting but sent_at is missing', () => {
    const step: OnboardingStepRow = { kibbutz: 'גבת', step_key: 'a', state: 'waiting' };
    expect(waitAge(step, new Date())).toBeNull();
  });
  it('days since sent_at when waiting', () => {
    const step: OnboardingStepRow = { kibbutz: 'גבת', step_key: 'a', state: 'waiting', sent_at: '2026-09-10T00:00:00Z' };
    expect(waitAge(step, new Date('2026-09-15T00:00:00Z'))).toBe(5);
  });
});

describe('nextStep', () => {
  it('first non-done in seq order', () => {
    const steps: OnboardingStepRow[] = [
      { kibbutz: 'ג', step_key: 'a', seq: 0, state: 'done' },
      { kibbutz: 'ג', step_key: 'b', seq: 1, state: 'waiting' },
      { kibbutz: 'ג', step_key: 'c', seq: 2, state: 'open' },
    ];
    expect(nextStep(steps)?.step_key).toBe('b');
  });
  it('null when every step is done', () => {
    expect(nextStep(rowsAt(Array(3).fill('done')))).toBeNull();
  });
  it('null when there are no steps', () => {
    expect(nextStep([])).toBeNull();
  });
});

describe('isComplete', () => {
  it('false with any open/waiting step', () => {
    const states: OnboardingStepRow['state'][] = [...Array(8).fill('done'), 'waiting'];
    expect(isComplete(rowsAt(states))).toBe(false);
  });
  it('true when all nine are done', () => {
    expect(isComplete(rowsAt(Array(9).fill('done')))).toBe(true);
  });
  it('false for an empty list (nothing to be complete)', () => {
    expect(isComplete([])).toBe(false);
  });
});

describe('nextState — tap cycle', () => {
  it('a waits step: open → waiting → done → open', () => {
    const open: OnboardingStepRow = { kibbutz: 'ג', step_key: 'customer_list', state: 'open' };
    const toWaiting = nextState(open, true);
    expect(toWaiting.state).toBe('waiting');
    expect(toWaiting.sent_at).toBeTruthy();

    const waiting: OnboardingStepRow = { ...open, state: 'waiting', sent_at: toWaiting.sent_at };
    const toDone = nextState(waiting, true);
    expect(toDone.state).toBe('done');
    expect(toDone.done_at).toBeTruthy();

    const done: OnboardingStepRow = { ...waiting, state: 'done', done_at: toDone.done_at };
    expect(nextState(done, true)).toMatchObject({ state: 'open', sent_at: null, done_at: null });
  });

  it('a non-waits step skips waiting: open → done → open', () => {
    const open: OnboardingStepRow = { kibbutz: 'ג', step_key: 'tariffs', state: 'open' };
    const toDone = nextState(open, false);
    expect(toDone.state).toBe('done');

    const done: OnboardingStepRow = { ...open, state: 'done', done_at: toDone.done_at };
    expect(nextState(done, false)).toMatchObject({ state: 'open' });
  });
});

describe('canEditTemplate — role matrix', () => {
  it('עידן edits', () => expect(canEditTemplate('עידן')).toBe(true));
  it('a viewer / anyone else does not', () => {
    expect(canEditTemplate('צפייה')).toBe(false);
    expect(canEditTemplate('עמיחי')).toBe(false);
    expect(canEditTemplate('')).toBe(false);
  });
});
