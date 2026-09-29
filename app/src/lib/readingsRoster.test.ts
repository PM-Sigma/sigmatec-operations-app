import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canUseReadings } from './readingsRoster';

describe('readings access', () => {
  it('equals the legacy page gate (00-bridge.js canShowPage("readings")): signed-in, not viewer', () => {
    const src = readFileSync(new URL('../../../js/src/00-bridge.js', import.meta.url), 'utf8');
    expect(/case 'readings':\s*return !call\('isViewer', \[\], false\) && !!call\('getCurrentUser', \[\], ''\);/.test(src)).toBe(true);
  });
  it('any staff name yes; viewer, blank and missing no', () => {
    for (const n of ['עידן', ' מתניה ', 'אביאם', 'ניתאי', 'אליה', 'אבצן']) expect(canUseReadings(n)).toBe(true);
    expect(canUseReadings('צופה', true)).toBe(false);
    expect(canUseReadings('  ')).toBe(false);
    expect(canUseReadings('')).toBe(false);
    expect(canUseReadings(undefined)).toBe(false);
  });
});
