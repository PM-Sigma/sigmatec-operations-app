// The data-source abstraction (Task 28). The point of these goldens is that the UI can never
// tell which implementation it got, and that an EMS which answers nothing produces אין נתונים
// rather than a red kibbutz.
import { describe, expect, it, vi } from 'vitest';
import { HEALTH_CONFIG_DRAFT, NO_DATA, SCORE } from './health';
import {
  ageInDays, emsApiSource, loadHealth, nullSource, oldestOpenTaskDays, sourceFor,
  type EmsDeps, type HealthSource,
} from './healthSources';

const NOW = Date.parse('2026-09-19T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

describe('nullSource', () => {
  it('structurally satisfies HealthSource and answers null everywhere', async () => {
    const s: HealthSource = nullSource;
    for (const key of ['finance', 'energy', 'alerts', 'recurring'] as const) {
      expect(typeof s[key]).toBe('function');
      await expect(s[key]('דפנה')).resolves.toBeNull();
    }
  });
});

describe('sourceFor', () => {
  const deps: EmsDeps = { emsApi: async () => [], getEmsSites: async () => [] };

  it('config `ems` with a bridge → the EMS source', () => {
    expect(sourceFor(HEALTH_CONFIG_DRAFT, deps)).not.toBe(nullSource);
  });

  it('no bridge, or a config that asks for nothing → the null source', () => {
    expect(sourceFor(HEALTH_CONFIG_DRAFT, null)).toBe(nullSource);
    const off = { ...HEALTH_CONFIG_DRAFT, source: 'none' } as typeof HEALTH_CONFIG_DRAFT;
    expect(sourceFor(off, deps)).toBe(nullSource);
  });
});

describe('ageInDays / oldestOpenTaskDays', () => {
  it('unparsable or absent → null; a future stamp clamps to today', () => {
    expect(ageInDays(null, NOW)).toBeNull();
    expect(ageInDays('not a date', NOW)).toBeNull();
    expect(ageInDays(daysAgo(-3), NOW)).toBe(0);
  });

  it('picks the oldest row and ignores the unusable ones', () => {
    const rows = [{ updatedAt: daysAgo(2) }, { created_at: daysAgo(11) }, { updatedAt: 'x' }];
    expect(oldestOpenTaskDays(rows, NOW)).toBe(11);
  });

  it('nothing open → null, which is NOT "everything is fine"', () => {
    expect(oldestOpenTaskDays([], NOW)).toBeNull();
  });
});

describe('emsApiSource — only what EMS actually exposes', () => {
  const deps = (over: Partial<EmsDeps> = {}): EmsDeps => ({
    getEmsSites: async () => [{ id: 'site-1', name: 'דפנה' }],
    emsApi: async () => ({ items: [{ updatedAt: daysAgo(9) }] }),
    ...over,
  });

  it('billing, energy balance and the recurring bucket have no endpoint → null', async () => {
    const s = emsApiSource(deps(), () => NOW);
    await expect(s.finance('דפנה')).resolves.toBeNull();
    await expect(s.energy('דפנה')).resolves.toBeNull();
    await expect(s.recurring('דפנה')).resolves.toBeNull();
  });

  it('open EMS requests are real; silent meters have no feed → null', async () => {
    const s = emsApiSource(deps(), () => NOW);
    await expect(s.alerts('דפנה')).resolves.toEqual({ silentMeters: null, oldestOpenTaskDays: 9 });
  });

  it('asks EMS for the open statuses of that site only', async () => {
    const emsApi = vi.fn(async () => []);
    await emsApiSource(deps({ emsApi }), () => NOW).alerts('דפנה');
    expect(emsApi.mock.calls[0][0]).toContain('siteId=site-1');
    expect(emsApi.mock.calls[0][0]).toContain('statuses=open,in_progress,pending');
  });

  it('a kibbutz that resolves to no EMS site → null, not an error', async () => {
    const s = emsApiSource(deps({ getEmsSites: async () => [] }), () => NOW);
    await expect(s.alerts('דפנה')).resolves.toBeNull();
  });

  it('EMS not signed in (every call throws) → null everywhere, never a throw', async () => {
    const boom = async () => { throw new Error('401'); };
    const s = emsApiSource({ emsApi: boom, getEmsSites: boom as any }, () => NOW);
    await expect(s.alerts('דפנה')).resolves.toBeNull();
  });
});

describe('loadHealth', () => {
  it('the null source produces the אין נתונים state — no score, no band', async () => {
    const h = await loadHealth(nullSource, 'דפנה');
    expect(h.score).toBeNull();
    expect(h.band).toBeNull();
    expect(h.draft).toBe(true);
    expect(h.signals.finance.why).toBe(NO_DATA);
  });

  it('a source that throws is the same as a source that knows nothing', async () => {
    const angry: HealthSource = {
      finance: async () => { throw new Error('nope'); },
      energy: async () => { throw new Error('nope'); },
      alerts: async () => { throw new Error('nope'); },
      recurring: async () => { throw new Error('nope'); },
    };
    await expect(loadHealth(angry, 'דפנה')).resolves.toMatchObject({ score: null, band: null });
  });

  it('scores only what the source knew, and leaves the rest out of the average', async () => {
    const partial: HealthSource = {
      ...nullSource,
      energy: async () => ({ lossPct: 1 }),
    };
    const h = await loadHealth(partial, 'דפנה');
    expect(h.signals.energy.score).toBe(SCORE.good);
    expect(h.score).toBe(SCORE.good);
    expect(h.band).toBe('green');
  });
});
