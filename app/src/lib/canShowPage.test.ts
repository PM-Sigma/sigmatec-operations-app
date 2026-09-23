// The React half of the page gate: canShowPage.ts must forward to the bridge and NEVER open a
// page when the bridge is missing or throws. The role matrix itself (who may open what) is the
// legacy rule and is golden-tested in test-can-show-page.mjs at the repo root.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { bridge } = vi.hoisted(() => ({ bridge: { impl: (_p: string): unknown => true } }));
vi.mock('@/bridge', () => ({ sigma: { canShowPage: (p: string) => bridge.impl(p) } }));

import { canShowPage } from '@/lib/canShowPage';

describe('canShowPage (React wrapper)', () => {
  beforeEach(() => { bridge.impl = () => true; });

  it('answers exactly what the bridge answers, per page', () => {
    const open = new Set(['kibbutz', 'calendar']);
    bridge.impl = p => open.has(p);
    expect(canShowPage('kibbutz' as any)).toBe(true);
    expect(canShowPage('calendar' as any)).toBe(true);
    expect(canShowPage('inventory' as any)).toBe(false);
    expect(canShowPage('pushlog' as any)).toBe(false);
  });

  it('coerces truthy/falsy bridge answers to a boolean', () => {
    bridge.impl = () => 1;
    expect(canShowPage('kibbutz' as any)).toBe(true);
    bridge.impl = () => undefined;
    expect(canShowPage('kibbutz' as any)).toBe(false);
  });

  it('a throwing bridge means "no", never a silently-open page', () => {
    bridge.impl = () => { throw new Error('legacy bundle not loaded'); };
    expect(canShowPage('kibbutz' as any)).toBe(false);
    expect(canShowPage('hours' as any)).toBe(false);
  });
});
