import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { READINGS_USERS, canUseReadings } from './readingsRoster';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('readings roster', () => {
  it('equals the Edge Function roster (single source of truth on the server)', () => {
    const src = read('../../../supabase/functions/_shared/readingsRoster.js');
    const m = /READINGS_USERS\s*=\s*\[([^\]]*)\]/.exec(src)!;
    const server = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    expect(READINGS_USERS).toEqual(server);
  });

  it('equals the legacy page gate (00-bridge.js canShowPage("readings"))', () => {
    const src = read('../../../js/src/00-bridge.js');
    const m = /case 'readings':[^\n]*?\[('[^\]]*)\]/.exec(src)!;
    const legacy = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    expect(legacy).toEqual(READINGS_USERS);
  });

  it('only the three names, trimmed; everyone else and non-strings are out', () => {
    expect(canUseReadings('עידן')).toBe(true);
    expect(canUseReadings(' מתניה ')).toBe(true);
    expect(canUseReadings('אביאם')).toBe(false);
    expect(canUseReadings('')).toBe(false);
    expect(canUseReadings(undefined)).toBe(false);
  });
});
