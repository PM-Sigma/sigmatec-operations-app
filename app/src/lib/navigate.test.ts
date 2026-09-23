// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above imports; state they close over goes through vi.hoisted()
// (see runAdd.test.ts — a plain top-level const hits a TDZ ReferenceError under this vitest).
const { state, sigma } = vi.hoisted(() => {
  const state = { user: 'עידן', role: 'idan', gated: new Set<string>(), landing: 'auto' as string };
  const sigma = {
    showPage: vi.fn(),
    getCurrentUser: () => state.user,
    getRole: () => state.role,
    canShowPage: (p: string) => !state.gated.has(p),
  };
  return { state, sigma };
});
vi.mock('@/bridge', () => ({ sigma }));
vi.mock('@/lib/settings', () => ({ getSettings: () => ({ landing: state.landing }) }));

import { go, goBack, goHome } from '@/lib/navigate';

beforeEach(() => {
  vi.clearAllMocks();
  state.user = 'עידן'; state.role = 'idan'; state.gated = new Set(); state.landing = 'auto';
  delete (document as any).startViewTransition;
});

describe('goHome (Σ)', () => {
  const cases: Array<[string, string, string]> = [
    ['עידן', 'idan', 'kibbutz'], ['עמיחי', 'team', 'kibbutz'], ['אביאם', 'team', 'kibbutz'],
    ['ניתאי', 'team', 'kibbutz'], ['מתניה', 'team', 'dev'], ['אליה', 'team', 'dev'],
    ['אבצן', 'team', 'kibbutz'], ['צפייה', 'viewer', 'kibbutz'],
  ];
  for (const [user, role, page] of cases) {
    it(`${user} → ${page}`, () => {
      state.user = user; state.role = role;
      expect(goHome().page).toBe(page);
      expect(sigma.showPage).toHaveBeenCalledWith(page);
    });
  }
  it('a stored landing wins', () => {
    state.landing = 'calendar';
    expect(goHome().page).toBe('calendar');
  });
  it('a gated stored landing falls back to the role default, then קיבוצים', () => {
    state.user = 'מתניה'; state.landing = 'inventory'; state.gated = new Set(['inventory', 'dev']);
    expect(goHome().page).toBe('kibbutz');
    expect(sigma.showPage).not.toHaveBeenCalledWith('inventory');
    expect(sigma.showPage).not.toHaveBeenCalledWith('dev');
  });
});

describe('goBack', () => {
  it('uses the legacy pageBack (previous page, else the cards) when it exists', () => {
    const pageBack = vi.fn();
    (window as any).pageBack = pageBack;
    goBack();
    expect(pageBack).toHaveBeenCalledOnce();
    delete (window as any).pageBack;
  });
  it('without pageBack it goes home', () => {
    goBack();
    expect(sigma.showPage).toHaveBeenCalledWith('kibbutz');
  });
});

describe('go', () => {
  it('without View Transitions it just shows the page', () => {
    go('calendar');
    expect(sigma.showPage).toHaveBeenCalledWith('calendar');
  });
});

describe('go with View Transitions', () => {
  it('runs showPage exactly once inside the transition and marks the kind', () => {
    (document as any).startViewTransition = vi.fn((cb: () => void) => { cb(); return {}; });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    go('hours', 'drill');
    expect(sigma.showPage).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.nav).toBe('drill');
  });
  it('a throwing startViewTransition still shows the page once', () => {
    (document as any).startViewTransition = vi.fn(() => { throw new Error('InvalidStateError'); });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    go('calendar');
    expect(sigma.showPage).toHaveBeenCalledTimes(1);
  });
  it('a transition that calls back AND throws does not show the page twice', () => {
    (document as any).startViewTransition = vi.fn((cb: () => void) => { cb(); throw new Error('late'); });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    go('calendar');
    expect(sigma.showPage).toHaveBeenCalledTimes(1);
  });
  it('reduced motion cuts instantly, with no transition', () => {
    const vt = vi.fn();
    (document as any).startViewTransition = vt;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    go('calendar');
    expect(vt).not.toHaveBeenCalled();
    expect(sigma.showPage).toHaveBeenCalledOnce();
  });
});
