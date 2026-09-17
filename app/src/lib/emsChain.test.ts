// Goldens for the chain's pure helpers. emsChainRun itself is I/O glue (bridge + supabase),
// covered by the browser smoke; everything it DECIDES lives in these helpers + emsChainReduce.
import { describe, it, expect } from 'vitest';
import { matchSite, countMeters, duplicateLinkOf } from './emsChain';
import type { KibbutzRow } from './kibbutzim';

describe('matchSite', () => {
  const sites = [{ id: 'A', name: 'גבים' }, { id: 'B', name: ' גבים — שכונה חדשה ' }, { id: 'C', name: 'יגור' }];

  it('prefers the exact normalized name', () => {
    expect(matchSite(sites, 'גבים — שכונה חדשה')!.id).toBe('B');
    expect(matchSite(sites, '  יגור ')!.id).toBe('C');
  });

  it('falls back to containment either way', () => {
    expect(matchSite(sites, 'קיבוץ גבים')!.id).toBe('A');
  });

  it('returns null for an empty or unknown name', () => {
    expect(matchSite(sites, '')).toBe(null);
    expect(matchSite(sites, 'זזזז')).toBe(null);
  });
});

describe('countMeters', () => {
  it('counts per energy_type_code, tolerating the camelCase shape', () => {
    expect(countMeters([
      { energy_type_code: 1 }, { energy_type_code: 1 }, { energyTypeCode: 2 }, { energyType: { code: 3 } }, {},
    ])).toEqual({ 1: 2, 2: 1, 3: 1 });
  });
});

describe('duplicateLinkOf', () => {
  const rows: KibbutzRow[] = [
    { name: 'יגור', ems_site_ids: ['S1'] },
    { name: 'ארכיון', ems_site_ids: ['S2'], archived_at: '2026-01-01' },
    { name: 'גבים — שכונה', ems_site_ids: ['S3'] },
  ];
  it('names the live row that already claims the site', () => {
    expect(duplicateLinkOf('S1', rows, 'גבים — שכונה')).toBe('יגור');
  });
  it('ignores archived rows and the row being edited', () => {
    expect(duplicateLinkOf('S2', rows, 'x')).toBe(null);
    expect(duplicateLinkOf('S3', rows, 'גבים — שכונה')).toBe(null);
  });
});
