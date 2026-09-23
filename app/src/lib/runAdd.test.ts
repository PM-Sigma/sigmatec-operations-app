// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above imports; a plain top-level `const` referenced inside one
// hits a TDZ ReferenceError under this vitest version, so the mock's own state goes through
// vi.hoisted() (the pattern already used in HeaderActions.test.tsx).
const { sigma } = vi.hoisted(() => ({
  sigma: { showPage: vi.fn(), openVisitQuick: vi.fn(), toast: vi.fn() },
}));
vi.mock('@/bridge', () => ({ sigma }));

import { openVisit, runAdd } from '@/lib/runAdd';

describe('runAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).sigmaHome;
    delete (window as any).sigmaField;
  });

  it('kibbutz opens the home sheet', () => {
    const openSheet = vi.fn();
    (window as any).sigmaHome = { openSheet };
    runAdd('kibbutz');
    expect(openSheet).toHaveBeenCalledOnce();
  });

  it('kibbutz with no home island says where to go, in noun-free neutral copy', () => {
    runAdd('kibbutz');
    expect(sigma.toast).toHaveBeenCalledWith('הוספת קיבוץ זמינה בעמוד הקיבוצים');
  });

  it('stockChange goes to inventory and opens the form', () => {
    const seen: string[] = [];
    window.addEventListener('sigma-open-stock-change', () => seen.push('open'), { once: true });
    runAdd('stockChange');
    expect(sigma.showPage).toHaveBeenCalledWith('inventory');
    expect(seen).toEqual(['open']);
  });

  it('feedback dispatches the feedback open event', () => {
    const seen: string[] = [];
    window.addEventListener('sigma-open-feedback', () => seen.push('fb'), { once: true });
    runAdd('feedback');
    expect(seen).toEqual(['fb']);
  });

  it('none does nothing', () => {
    runAdd('none');
    expect(sigma.showPage).not.toHaveBeenCalled();
  });
});

describe('openVisit', () => {
  beforeEach(() => { vi.clearAllMocks(); delete (window as any).sigmaField; });

  it('prefers the field arrival sheet, then the manual chapters sheet, then the legacy form', () => {
    (window as any).sigmaField = { maybeOpen: () => false, openManual: vi.fn(() => true) };
    openVisit();
    expect((window as any).sigmaField.openManual).toHaveBeenCalledOnce();
    expect(sigma.openVisitQuick).not.toHaveBeenCalled();
  });

  it('falls back to the legacy form only with no field island', () => {
    openVisit();
    expect(sigma.openVisitQuick).toHaveBeenCalledOnce();
  });
});
