// THE VIEWER MATRIX (task-4 step 6, review miss 8). Every write the viewer must not reach and
// the one he must, asserted in ONE place so the answer to "what can צופה do?" is a file rather
// than a hunt through four components.
//
// `test-viewer-gate.mjs` covers the legacy half (the PIN entry and the router blocks) and is
// untouched by Task 4. This file covers the React half, where the gates are pure functions.
import { describe, expect, it } from 'vitest';
import { canManageKibbutzim, cardActionsFor, canEditEnergy } from '@/lib/kibbutzim';
import { canImportNotes } from '@/lib/meetingNotes';
import { listMoreItems, registerMoreItem, _resetRegistry } from '@/lib/registry';
import { primaryAdd } from '@/lib/primaryAdd';
import { roleOf, landingFor } from '@/lib/landing';

describe('the viewer matrix', () => {
  it('canManageKibbutzim === false, even for a name that otherwise could', () => {
    // The PIN role wins over the name: a viewer device is a viewer device.
    expect(canManageKibbutzim('עידן', true)).toBe(false);
    expect(canManageKibbutzim('עמיחי', true)).toBe(false);
    expect(canManageKibbutzim('צופה', true)).toBe(false);
  });

  it('importing a meeting summary is refused (the ⋯ row is never even offered)', () => {
    // `openMeetingImport` in the review's wording = this gate; ImportNotes.tsx registers its
    // row and renders its sheet only when it passes.
    expect(canImportNotes(true, true)).toBe(false);     // admin AND viewer → still no
    expect(canImportNotes(false, true)).toBe(false);
    expect(canImportNotes(true, false)).toBe(true);     // …and an admin who is not a viewer can
  });

  it('opening an EMS task from a bullet is refused — the viewer gets the timeline only', () => {
    // `noteOpenTask` in the review's wording: the ➕ that turns a bullet into an EMS task is
    // rendered from `cardActionsFor`/`canAct`, and for a viewer there is no write action at all.
    expect(cardActionsFor('viewer')).toEqual(['meetings']);
    expect(cardActionsFor('viewer')).not.toContain('visit');
    expect(cardActionsFor('viewer')).not.toContain('cert');
  });

  it('the energy types are not his to change either', () => {
    expect(canEditEnergy('צופה')).toBe(false);
  });

  it('📣 feedback IS allowed — it is his one write (spec §7 Part F)', () => {
    // There is no gate to assert, and that is the point: Feedback.tsx registers its ⋯ row with
    // NO `roles` and NO `visible` predicate, so the registry offers it to the viewer like
    // everyone else. (Feedback.test.tsx covers the submit path itself for a viewer.)
    _resetRegistry();
    registerMoreItem({ id: 'feedback', label: '📣 רעיון / באג', icon: 'MessageSquarePlus', onSelect: () => {} });
    expect(listMoreItems('viewer').map(i => i.id)).toContain('feedback');
    // …while an admin-only row is NOT offered to him
    registerMoreItem({ id: 'import-meeting', label: 'ייבוא', icon: 'FileDown', roles: ['idan', 'team'], onSelect: () => {} });
    expect(listMoreItems('viewer').map(i => i.id)).not.toContain('import-meeting');
    _resetRegistry();
  });

  it('his ONE ➕ is feedback, on every page — so no ➕ of his is ever blocked after the tap', () => {
    for (const page of ['kibbutz', 'calendar', 'inventory', 'attendance', 'dev', 'pushlog'] as const) {
      expect(primaryAdd(page, 'viewer', { canManageKibbutzim: true, daySelected: true })).toBe('feedback');
    }
  });

  it('he is recognised as a viewer from the PIN role alone, and lands on the reports hub', () => {
    expect(roleOf('צופה', 'viewer')).toBe('viewer');
    expect(landingFor('viewer', 'צופה')).toEqual({ page: 'kibbutz', scrollTo: 'viewerReportsHub' });
  });
});
