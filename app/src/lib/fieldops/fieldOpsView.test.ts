// פעולות שטח — the page's decisions (manual "who is on this IP" status, the manual read plan,
// circuits, error text). Documentation-range IPs only (repo is public).
import { describe, expect, it } from 'vitest';
import type { EmsModbusMeter } from '@/lib/ems/types';
import {
  circuitsOf, errorText, isIPv4, listEligible, manualStatus, meterLabel, pairEntries, parseUnit, planManualRead,
} from './fieldOpsView';

const m = (id: string, ip: string, unit: number, o: Partial<EmsModbusMeter> = {}): EmsModbusMeter => ({
  id, serial: 'S' + id, address: 'כתובת ' + id, siteId: 'site', siteName: 'קיבוץ דוגמה', ip, unit, typeCode: 12,
  typeName: 'Satec PM135', cm: 1, vm: 1, pm: 1, typePm: 1, lastCallDate: null, ...o,
});
const tn = (c: number) => ({ 12: 'Satec PM135', 25: 'ABB B23/B24' } as Record<number, string>)[c] || String(c);

describe('manualStatus — 0 / 1 / several matches (עידן 27.9)', () => {
  it('0 matches: not registered', () => {
    expect(manualStatus([], null)).toEqual({ tone: 'warn', ipLine: 'ה-IP הזה לא מוקם ב-EMS — המונה לא רשום', unitLine: null, sameDevice: [] });
  });
  it('0 matches with a unit typed: that meter is not registered either', () => {
    expect(manualStatus([], 3).unitLine).toBe('אין ב-EMS מונה על ה-IP הזה עם ID 3 — המונה לא רשום');
  });
  it('1 match', () => {
    const s = manualStatus([m('1', '192.0.2.10', 1)], null);
    expect([s.tone, s.ipLine, s.unitLine, s.sameDevice.length]).toEqual(['ok', 'ה-IP הזה מוביל למונה אחד ב-EMS', null, 1]);
  });
  it('several matches', () => {
    expect(manualStatus([m('1', '192.0.2.10', 1), m('2', '192.0.2.10', 2)], null).ipLine).toBe('ה-IP הזה מוביל ל-2 מונים ב-EMS');
  });
  it('several + a unit that matches one', () => {
    const s = manualStatus([m('1', '192.0.2.10', 1), m('2', '192.0.2.10', 2)], 2);
    expect([s.tone, s.unitLine]).toEqual(['ok', 'המונה עם ID 2 רשום ב-EMS: S2 · כתובת 2']);
  });
  it('several + a unit that matches none → warn', () => {
    const s = manualStatus([m('1', '192.0.2.10', 1), m('2', '192.0.2.10', 2)], 7);
    expect([s.tone, s.unitLine]).toEqual(['warn', 'אין ב-EMS מונה על ה-IP הזה עם ID 7 — המונה לא רשום']);
  });
  it('a unit shared by several circuits', () => {
    expect(manualStatus([m('1', '192.0.2.10', 1), m('2', '192.0.2.10', 1)], 1).unitLine).toBe('ל-ID 1 רשומים ב-EMS 2 מעגלים — כרטיס לכל מעגל');
  });
});

describe('planManualRead', () => {
  it('validation', () => {
    expect(planManualRead('', '', null, [], tn).error).toBe('נא למלא כתובת IP');
    expect(planManualRead('192.0.2', '', null, [], tn).error).toContain('לא תקינה');
    expect(planManualRead('192.0.2.10', '300', 12, [], tn).error).toContain('1 ל-247');
    expect(planManualRead('192.0.2.10', '', null, [], tn).error).toContain('נא לבחור סוג מונה');
  });
  it('unregistered IP → the override with the typed type, no circuits', () => {
    expect(planManualRead(' 192.0.2.99 ', '4', 25, [], tn)).toEqual({ target: { ip: '192.0.2.99', unit: 4, typeCode: 25 }, circuits: [], typeNote: null, error: null });
  });
  it('registered IP, other unit → override through the IP\'s meter as carrier', () => {
    const p = planManualRead('192.0.2.10', '5', 12, [m('1', '192.0.2.10', 1)], tn);
    expect(p.target).toEqual({ ip: '192.0.2.10', unit: 5, typeCode: 12, meterId: '1' });
    expect(p.circuits).toEqual([]);
  });
  it('registered IP+unit → reads THAT meter, EMS type wins over a typed one', () => {
    const p = planManualRead('192.0.2.10', '', 25, [m('1', '192.0.2.10', 1), m('2', '192.0.2.10', 1)], tn);
    expect(p.target).toEqual({ meterId: '1', ip: '192.0.2.10', unit: 1 });
    expect(p.circuits.map(c => c.id)).toEqual(['1', '2']);
    expect(p.typeNote).toBe('ב-EMS רשום Satec PM135 — הקריאה לפיו');
  });
});

describe('list + circuits', () => {
  it('listEligible drops non-IPv4 and non-Modbus meters, sorts by serial', () => {
    const ms = [m('3', '192.0.2.3', 1), m('1', '1451510', 1), m('2', '192.0.2.2', 1, { typeCode: 99 }), m('10', '192.0.2.4', 1)];
    expect(listEligible(ms).map(x => x.id)).toEqual(['3', '10']);
  });
  it('meterLabel', () => expect(meterLabel(m('1', '192.0.2.10', 3))).toBe('S1 · כתובת 1 · 192.0.2.10 · ID 3'));
  it('circuitsOf: one card per circuit on the same IP+unit', () => {
    const a = m('1', '192.0.2.10', 1, { serial: '100-1' }), b = m('2', '192.0.2.10', 1, { serial: '100-2' }), c = m('3', '192.0.2.10', 2);
    expect(circuitsOf(b, [c, b, a]).map(x => x.serial)).toEqual(['100-1', '100-2']);
  });
  it('pairEntries: per-circuit when counts agree, else the single reading on every card', () => {
    const e = (ft: number) => ({ values: { FT: ft }, counterNumber: '', units: null, queryDate: '' });
    const a = m('1', '192.0.2.10', 1), b = m('2', '192.0.2.10', 1);
    expect(pairEntries([e(1), e(2)], [a, b]).map(p => p.entry.values.FT)).toEqual([1, 2]);
    expect(pairEntries([e(1)], [a, b]).map(p => p.entry.values.FT)).toEqual([1, 1]);
    expect(pairEntries([e(1)], []).map(p => p.meter)).toEqual([null]);
  });
  it('isIPv4 / parseUnit', () => {
    expect([isIPv4('192.0.2.1'), isIPv4('192.0.2.01'), isIPv4('1451510')]).toEqual([true, false, false]);
    expect([parseUnit(''), parseUnit('3'), Number.isNaN(parseUnit('0')), Number.isNaN(parseUnit('x'))]).toEqual([null, 3, true, true]);
  });
});

describe('errorText', () => {
  it('maps every function error code', () => {
    expect(errorText({ code: 'timeout' })).toContain('לא ענה בזמן');
    expect(errorText({ code: 'ems-forbidden' })).toBe('אין לך הרשאה לפעולות מונה ב-EMS');
    expect(errorText({ code: 'ems-bad-request', detail: 'Meter does not have an IP address configured' })).toBe('למונה אין כתובת IP ב-EMS');
    expect(errorText({ code: 'ems-bad-request', detail: 'No MODBUS meter type mapping for meter type 99' })).toBe('סוג המונה ב-EMS לא ממופה ל-ModbusClient');
    expect(errorText({ code: 'forbidden: staff only' })).toBe('הדף פתוח לצוות בלבד');
    expect(errorText({ sessionLost: true })).toBe('החיבור ל-EMS פג — צריך להתחבר מחדש');
    expect(errorText({ code: 'network' })).toContain('אין חיבור');
  });
});
