// app/src/lib/burnsParity.test.ts — TEMPORARY: proves the TS port equals 24-meter-burns.js
// before the legacy file is deleted (G-U4 deletes this test together with the file).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import * as T from './burns';

const src = fs.readFileSync(path.resolve(__dirname, '../../../js/src/24-meter-burns.js'), 'utf8');
const B: any = vm.runInNewContext('var B = {};' + src.match(/\/\/ PURE-START([\s\S]*?)\/\/ PURE-END/)![1] + '; B', {});

const rows: any[] = [
  { meter_id: 'a', serial: '68369287', site: 'אור הנר', meter_type: 'E360CT', address: 'רפת 7 מונה ייצור', ct_ratio: 50, solar_names: 'סולארי רפת 7', status: 'pending', generator_id: null },
  { meter_id: 'b', serial: '59965612', site: 'אור הנר', meter_type: 'E360PP', address: 'סולארי דיר', ct_ratio: 1, solar_names: null, status: 'burned', burned_by: 'אביאם', burned_at: '2026-09-20T08:00:00Z', generator_id: 'g1' },
  { meter_id: 'c', serial: '11111111', site: 'מעוז חיים', meter_type: 'E360CT', address: 'לול 4', ct_ratio: 40, solar_names: 'סולארי לולים', status: 'burned', generator_id: null },
  { meter_id: 'd', serial: '22222222', site: 'מעוז חיים', meter_type: 'E360SP', address: 'בית 12', ct_ratio: 1, solar_names: null, status: 'issue', note: 'אין גישה', generator_id: null },
  { meter_id: 'e', serial: '33333333', site: 'מעוז חיים', meter_type: 'E360PP', address: 'מוסך‏', ct_ratio: 1, solar_names: 'סולארי מוסך', status: 'pending', generator_id: 'gone' },
];
const gens: any[] = [{ id: 'g1', site: 'אור הנר', name: 'גנרטור רפת', device_serial: '999' }];

describe('burns TS port = legacy 24-meter-burns.js', () => {
  it.each(['', '287', 'רפת', 'גנרטור רפת', 'מעוז  חיים'])('matches(%s)', q => {
    for (const r of rows) expect(T.burnMatches(r, q, gens)).toBe(B.matches(r, q, gens));
  });
  it('filter / sort / group', () => {
    for (const f of [{}, { site: 'אור הנר' }, { status: 'pending' }, { kind: 'CT' }, { kind: 'PP', q: 'מוסך' }] as any[])
      expect(T.filterBurnRows(rows, f, gens)).toEqual(B.filterRows(rows, f, gens));
    expect(T.sortBurnRows(rows)).toEqual(B.sortRows(rows));
    expect(T.groupBurnsBySite(rows)).toEqual(B.groupBySite(rows));
    expect(T.burnGenSummary(gens, rows)).toEqual(B.genSummary(gens, rows));
  });
  it('xlsx spec, cell for cell', () => {
    expect(JSON.parse(JSON.stringify(T.burnXlsxSpec(rows, gens)))).toEqual(JSON.parse(JSON.stringify(B.xlsxSpec(rows, gens))));
  });
  it('EMS mapping', () => {
    const meters = [{ id: 'm1', serialNumber: 123, site: { id: 's1', name: ' גבים ' }, type: { key: 'landis_e360ct' }, currentMultiplier: 40, role: { code: 21 }, parent: { serialNumber: 9 } },
                    { id: 'm2', serialNumber: 5, site: { name: 'גבים' }, type: { name: 'Other' } }];
    const solars = [{ name: 'סולארי ב', solarMeters: [{ meter: { id: 'm1' } }] }, { name: 'סולארי א', solarMeters: [{ meter: { id: 'm1' } }] }];
    expect(T.emsToBurnRows(meters, solars)).toEqual(B.emsToBurnRows(meters, solars));
    expect(T.emsHitLines(meters)).toEqual(B.emsHitLines(meters));
  });
});
