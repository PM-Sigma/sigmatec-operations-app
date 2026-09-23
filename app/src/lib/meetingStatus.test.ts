// Goldens for the meeting's status blocks (package M, M-R7): burns as "נותרו X מתוך Y" (or
// "הכול נצרב" — in a meeting, all-done is news, not nothing) and onboarding as its latest
// status. Pure — built entirely on the existing burns.ts / onboarding.ts helpers.
import { afterEach, describe, expect, it } from 'vitest';
import type { BurnRow } from './burns';
import type { OnboardingStepRow } from './onboarding';
import { statusBlocks } from './meetingStatus';

const burn = (over: Partial<BurnRow>): BurnRow =>
  ({ meter_id: 'm1', serial: 's1', site: 'גבים', meter_type: 'E360PP', status: 'pending', ...over });

const step = (over: Partial<OnboardingStepRow>): OnboardingStepRow =>
  ({ kibbutz: 'גבים', step_key: 'k', state: 'open', ...over });

const base = { kibbutz: 'גבים', burns: [] as BurnRow[], burnsVisible: true, steps: [] as OnboardingStepRow[], emsOpen: 0, internalOpen: 0, now: new Date('2026-09-23T10:00:00Z') };

afterEach(() => { delete (globalThis as any).BURNS_PROJECT_ACTIVE; });

describe('statusBlocks — burns', () => {
  it('null when the project is off', () => {
    (globalThis as any).BURNS_PROJECT_ACTIVE = false;
    const rows = [burn({}), burn({ meter_id: 'm2', status: 'pending' })];
    expect(statusBlocks({ ...base, burns: rows }).burns).toBeNull();
  });

  it('null when there are no rows for this kibbutz', () => {
    const rows = [burn({ site: 'חוקוק' })];
    expect(statusBlocks({ ...base, burns: rows }).burns).toBeNull();
  });

  it('null when burnsVisible is false, even with pending rows', () => {
    const rows = [burn({})];
    expect(statusBlocks({ ...base, burns: rows, burnsVisible: false }).burns).toBeNull();
  });

  it('"נותרו X מתוך Y" while some are unburned', () => {
    const rows = [
      burn({ meter_id: 'm1', status: 'burned' }), burn({ meter_id: 'm2', status: 'burned' }),
      burn({ meter_id: 'm3', status: 'burned' }), burn({ meter_id: 'm4', status: 'burned' }),
      burn({ meter_id: 'm5', status: 'burned' }), burn({ meter_id: 'm6', status: 'burned' }),
      burn({ meter_id: 'm7', status: 'burned' }), burn({ meter_id: 'm8', status: 'burned' }),
      burn({ meter_id: 'm9', status: 'pending' }), burn({ meter_id: 'm10', status: 'pending' }),
      burn({ meter_id: 'm11', status: 'pending' }), burn({ meter_id: 'm12', status: 'issue' }),
    ];
    expect(statusBlocks({ ...base, burns: rows }).burns).toEqual({ remaining: 4, total: 12, text: 'נותרו 4 מתוך 12' });
  });

  it('"הכול נצרב" when every meter is burned — not null, that IS the news in a meeting', () => {
    const rows = [burn({ meter_id: 'm1', status: 'burned' }), burn({ meter_id: 'm2', status: 'burned' })];
    expect(statusBlocks({ ...base, burns: rows }).burns).toEqual({ remaining: 0, total: 2, text: 'הכול נצרב' });
  });
});

describe('statusBlocks — onboarding', () => {
  it('null with no steps', () => {
    expect(statusBlocks({ ...base, steps: [] }).onboarding).toBeNull();
  });

  it('label + next step + waiting days, when mid-checklist and waiting', () => {
    const steps: OnboardingStepRow[] = [
      step({ step_key: 'a', seq: 0, state: 'done' }),
      step({ step_key: 'b', seq: 1, state: 'done' }),
      step({ step_key: 'c', seq: 2, state: 'done' }),
      step({ step_key: 'd', seq: 3, state: 'done' }),
      step({ step_key: 'e', seq: 4, state: 'done' }),
      step({ step_key: 'f', seq: 5, label: 'חיבור מונים ל-EMS', state: 'waiting', sent_at: '2026-09-17T10:00:00Z' }),
      step({ step_key: 'g', seq: 6, state: 'open' }),
      step({ step_key: 'h', seq: 7, state: 'open' }),
      step({ step_key: 'i', seq: 8, state: 'open' }),
    ];
    expect(statusBlocks({ ...base, steps }).onboarding)
      .toEqual({ label: '5/9', next: 'חיבור מונים ל-EMS', waitingDays: 6, done: false });
  });

  it('done: true, next: null, when every step is done', () => {
    const steps: OnboardingStepRow[] = Array.from({ length: 3 }, (_, i) => step({ step_key: `s${i}`, seq: i, state: 'done' }));
    expect(statusBlocks({ ...base, steps }).onboarding).toEqual({ label: '3/3', next: null, waitingDays: null, done: true });
  });

  it('a next step that is not waiting has no waitingDays', () => {
    const steps: OnboardingStepRow[] = [step({ step_key: 'a', seq: 0, label: 'שלב א', state: 'open' })];
    expect(statusBlocks({ ...base, steps }).onboarding).toEqual({ label: '0/1', next: 'שלב א', waitingDays: null, done: false });
  });
});

describe('statusBlocks — emsOpen / internalOpen', () => {
  it('pass through unchanged — they are already counted upstream', () => {
    expect(statusBlocks({ ...base, emsOpen: 3, internalOpen: 2 })).toMatchObject({ emsOpen: 3, internalOpen: 2 });
  });
});
