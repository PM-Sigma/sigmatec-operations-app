// @vitest-environment jsdom
// Spec §7n: the gate matrix, the ?login=0 host rule, the 401 debounce and the re-mint timer
// math. Everything here is the PURE core — the rendered card / sheet are pinned by
// app/src/components/ReLoginSheet.test.tsx, the browser round trip by
// qa/playwright/tests/session-gate.spec.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXPIRY_DEBOUNCE_MS, SESSION_EXPIRED,
  gateState, isGateOpen, mockHostAllowed, mockModeAllowed,
  notifySessionExpired, resetExpiryDebounce, shouldEmitExpiry,
  type GateInput,
} from './session';
import { REMINT_EVERY_MS, remintDelay, shouldRemintNow } from './remint';

const base: GateInput = {
  emsConnected: false, hasPass: false, passPending: false, everSignedIn: false, role: 'team',
  hostname: 'pm-sigma.github.io', search: '',
};

describe('?login=0 is test-only', () => {
  it('is honoured on a developer machine and on the branch preview', () => {
    expect(mockHostAllowed('localhost')).toBe(true);
    expect(mockHostAllowed('127.0.0.1')).toBe(true);
    expect(mockHostAllowed('raw.githack.com')).toBe(true);
    expect(mockModeAllowed('127.0.0.1', '?login=0&sb=0')).toBe(true);
  });

  it('is IGNORED on the production origin', () => {
    expect(mockHostAllowed('pm-sigma.github.io')).toBe(false);
    expect(mockModeAllowed('pm-sigma.github.io', '?login=0&sb=0')).toBe(false);
    expect(gateState({ ...base, hostname: 'pm-sigma.github.io', search: '?login=0' })).toBe('locked');
  });

  it('is not granted by a look-alike host', () => {
    expect(mockHostAllowed('githack.com.evil.net')).toBe(false);
    expect(mockHostAllowed('notlocalhost')).toBe(false);
  });

  it('needs the flag, not only an allowed host', () => {
    expect(mockModeAllowed('localhost', '?sb=0')).toBe(false);
    expect(mockModeAllowed('localhost', '?login=01')).toBe(false);
  });
});

describe('gate matrix (connected / expired / never × role)', () => {
  it('connected → content', () => {
    expect(gateState({ ...base, emsConnected: true })).toBe('open');
    expect(gateState({ ...base, hasPass: true })).toBe('open');
    expect(isGateOpen('open')).toBe(true);
  });

  it('signed in before, session gone → expired', () => {
    expect(gateState({ ...base, everSignedIn: true })).toBe('expired');
    expect(isGateOpen('expired')).toBe(false);
  });

  it('never signed in → locked', () => {
    expect(gateState(base)).toBe('locked');
    expect(isGateOpen('locked')).toBe(false);
  });

  // review fix 2: the view-only entry mints the SAME pass (ems-auth mode 'viewer'), so the one
  // rule is "has a pass" — a viewer waved through without one read empty screens and was then
  // shown a sheet he could not satisfy.
  it('a viewer WITH a pass sees content', () => {
    expect(gateState({ ...base, role: 'viewer', hasPass: true, everSignedIn: true })).toBe('open');
  });

  it('a viewer WITHOUT a pass is not waved through', () => {
    expect(gateState({ ...base, role: 'viewer', everSignedIn: true })).toBe('expired');
    expect(gateState({ ...base, role: 'viewer' })).toBe('locked');
  });

  it('a cold boot mid-mint renders content, not the sign-in card', () => {
    expect(gateState({ ...base, passPending: true, everSignedIn: true })).toBe('pending');
    expect(isGateOpen('pending')).toBe(true);
    // …but a device that never signed in is still locked, mint or no mint
    expect(gateState({ ...base, passPending: true })).toBe('locked');
  });

  it('mock mode on an allowed host wins over everything', () => {
    expect(gateState({ ...base, hostname: 'localhost', search: '?login=0&sb=0' })).toBe('mock');
    expect(isGateOpen('mock')).toBe(true);
  });
});

describe('one expiry, not one per request', () => {
  beforeEach(() => {
    resetExpiryDebounce();
    delete (window as any).sigmaSessionExpired;
    (window as any).sigmaBus = new EventTarget();
  });

  it('5 concurrent 401s produce exactly ONE event', () => {
    const seen: string[] = [];
    (window as any).sigmaBus.addEventListener(SESSION_EXPIRED, (e: Event) =>
      seen.push(String((e as CustomEvent).detail?.reason)));
    const emitted = [1, 2, 3, 4, 5].map(() => notifySessionExpired('sb-401'));
    expect(emitted.filter(Boolean)).toHaveLength(1);
    expect(seen).toEqual(['sb-401']);
  });

  it('a later 401, after the window, is a new expiry', () => {
    expect(shouldEmitExpiry(1_000, 1_000 + EXPIRY_DEBOUNCE_MS - 1)).toBe(false);
    expect(shouldEmitExpiry(1_000, 1_000 + EXPIRY_DEBOUNCE_MS)).toBe(true);
    expect(shouldEmitExpiry(null, 5_000)).toBe(true);
  });

  it('delegates to the legacy debouncer when the bundle is loaded', () => {
    const bridged = vi.fn(() => true);
    (window as any).sigmaSessionExpired = bridged;
    expect(notifySessionExpired('ems-401')).toBe(true);
    expect(bridged).toHaveBeenCalledWith('ems-401');
  });
});

describe('re-mint timer math', () => {
  it('re-mints every 50 min while the pass is valid', () => {
    expect(REMINT_EVERY_MS).toBe(50 * 60_000);
    const now = 1_000_000;
    // a fresh 180-min pass → the timer fires at 50 min, well inside it
    expect(remintDelay({ exp: now + 175 * 60_000 }, now)).toBe(REMINT_EVERY_MS);
  });

  it('never schedules past the expiry — a short pass is re-minted before it dies', () => {
    const now = 1_000_000;
    // 20 min left → 10 min before expiry, not 50 min from now
    expect(remintDelay({ exp: now + 20 * 60_000 }, now)).toBe(10 * 60_000);
  });

  it('a pass already inside the safety margin is re-minted at once', () => {
    const now = 1_000_000;
    expect(remintDelay({ exp: now + 3 * 60_000 }, now)).toBe(0);
    expect(remintDelay(null, now)).toBe(0);
  });

  it('a tab coming back to the foreground re-mints only when it is due', () => {
    const now = 1_000_000;
    expect(shouldRemintNow({ exp: now + 120 * 60_000 }, now)).toBe(false);
    expect(shouldRemintNow({ exp: now + 9 * 60_000 }, now)).toBe(true);
    expect(shouldRemintNow(null, now)).toBe(true);
  });
});

// ───────── spec 2026-09-23 ems-session: the freeze rule (goldens) ─────────
import { expiryDecision, shouldFreeze, type ExpiryInput } from './session';

describe('expiryDecision — when the app freezes', () => {
  const NOW = 1_800_000_000_000;
  const base: ExpiryInput = {
    role: 'field', mock: false, everSignedIn: true, emsTokenLive: true,
    passExp: NOW + 60_000, now: NOW,
  };
  const cases: Array<[string, Partial<ExpiryInput>, string]> = [
    ['live EMS + live pass', {}, 'ok'],
    ['pass lapsed, EMS still live → renew silently', { passExp: NOW - 1 }, 'remint'],
    ['no pass at all, EMS live → renew', { passExp: 0 }, 'remint'],
    ['EMS session gone → freeze', { emsTokenLive: false }, 'freeze'],
    ['EMS gone and pass lapsed → freeze', { emsTokenLive: false, passExp: 0 }, 'freeze'],
    ['never signed in → the login gate owns it', { everSignedIn: false, emsTokenLive: false }, 'ok'],
    ['mint in flight (cold boot) → wait', { emsTokenLive: false, passPending: true }, 'ok'],
    ['mock mode never freezes', { mock: true, emsTokenLive: false }, 'ok'],
    ['public cert link never freezes', { certView: true, emsTokenLive: false }, 'ok'],
    ['viewer is unchanged (PIN, no EMS)', { role: 'viewer', emsTokenLive: false }, 'ok'],
    ['401 with EMS live → one re-mint', { status: 401 }, 'remint'],
    ['401 with EMS gone → freeze', { status: 401, emsTokenLive: false }, 'freeze'],
    ['401 42501 is a permission answer, not an expiry', { status: 401, code: '42501', emsTokenLive: false }, 'ok'],
    ['403 PGRST301 (JWT expired) → freeze', { status: 403, code: 'PGRST301', emsTokenLive: false }, 'freeze'],
    ['plain 403 is "not allowed", not an expiry', { status: 403, emsTokenLive: false }, 'ok'],
    ['200 is fine', { status: 200, emsTokenLive: false }, 'ok'],
  ];
  for (const [name, patch, want] of cases) {
    it(name, () => expect(expiryDecision({ ...base, ...patch })).toBe(want));
  }
});

describe('shouldFreeze — the gate state for staff vs the viewer', () => {
  it('expired staff freezes', () => {
    for (const role of ['idan', 'field', 'pm', 'dev', 'ceo']) expect(shouldFreeze('expired', role)).toBe(true);
  });
  it('the viewer never freezes (keeps the PIN card)', () => expect(shouldFreeze('expired', 'viewer')).toBe(false));
  it('open / mock / pending / locked never freeze', () => {
    for (const s of ['open', 'mock', 'pending', 'locked'] as const) expect(shouldFreeze(s, 'idan')).toBe(false);
  });
});
