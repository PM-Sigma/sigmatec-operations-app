// F3 — the §6 golden table (spec 2026-09-23-field-ops-modbus-design.md): a stored ModbusClient
// reply + the EMS multipliers in → the exact strings the page renders. Plus the contract tests.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORRECTIONS, FIXED_UNITS_MARKER, LEGACY_MODBUS_TYPE, MODBUS_TYPES, buildRows, correct, israelTime, mult,
  outcome, parseModbusResponse, parsePing, responseMs, serialCheck, type Row,
} from './modbusScale';
import types from './__fixtures__/emsMeterTypes.json';

type M = { cm: number | null; vm: number | null; pm: number | null; typePm: number | null; typeCode: number };
const meter = (typeCode: number, cm: number | null = 1, typePm: number | null = 1, vm: number | null = 1, pm: number | null = 1): M => ({ cm, vm, pm, typePm, typeCode });
const reply = (o: Record<string, unknown>) => [{ IPAddress: '192.0.2.1', DeviceId: 1, CounterNumber: 'XXX', QueryDate: '2026-09-27T10:00:00', ...o }];

function render(data: unknown, m: M | null) {
  const p = parseModbusResponse(data);
  if (p.kind !== 'ok') throw new Error('not ok: ' + p.kind);
  const legacy = m ? LEGACY_MODBUS_TYPE[m.typeCode] : null;
  const r = buildRows(p.entries[0], m, legacy);
  const by = (k: string) => r.rows.find(x => x.key === k) as Row | undefined;
  return { ...r, by, shown: (k: string) => by(k)?.shown };
}

describe('§6 golden table', () => {
  it('G1 Satec PM135 low-res — as-is, PF ÷1000, kW≈97.98', () => {
    const g = render(reply({ FT: 169404, V1: 235, V2: 234, V3: 234, I1: 166, I2: 139, I3: 113, PF: 1000, CT_Ratio: 0 }), meter(12));
    expect([g.shown('FT'), g.shown('V1'), g.shown('V2'), g.shown('I1'), g.shown('I3'), g.shown('PF'), g.shown('kW')])
      .toEqual(['169,404', '235', '234', '166', '113', '1.000', '97.98']);
    expect(g.by('FT')!.corrected).toBe(false);
  });
  it('G2 Satec L123 high-res PT=1 — energy ×1000 (S1)', () => {
    const g = render(reply({ FT: 28.141, V1: 226, I1: 0.08, PF: 1000 }), meter(14));
    expect([g.by('FT')!.device, g.shown('FT'), g.shown('V1'), g.shown('I1'), g.shown('PF')]).toEqual(['28.14', '28,141', '226', '0.08', '1.000']);
    expect(g.by('FT')!.corrected).toBe(true);
    expect(g.notes.join()).toContain('×1000');
  });
  it('G3 Satec EM133 high-res — FT ≈12,660, CT 50 shown and never used, kW≈2.61', () => {
    const g = render(reply({ FT: 12.66, V1: 229.9, V2: 223.9, V3: 221.5, I1: 2.58, I2: 0.85, I3: 8.24, PF: 1000, CT_Ratio: 50 }), meter(10));
    expect([g.shown('FT'), g.shown('V1'), g.shown('I3'), g.shown('CT'), g.shown('kW')]).toEqual(['12,660', '229.9', '8.24', '50', '2.61']);
  });
  it('G4 Satec HV PT≠1 — no energy correction, PF 0.969', () => {
    const g = render(reply({ FT: 10323, V1: 13078, V2: 13196, V3: 13383, I1: 65, I2: 58, I3: 63, PF: 969 }), meter(13));
    expect([g.shown('FT'), g.shown('V1'), g.shown('I1'), g.shown('PF')]).toEqual(['10,323', '13,078', '65', '0.969']);
    expect(g.by('FT')!.corrected).toBe(false);
  });
  it('G5 Satec BFM II — FT ×0.1 (type pm), V ÷10 (S3), I unverified', () => {
    const g = render(reply({ FT: 16166, V1: 2354, I1: 1118 }), meter(15, 1, 0.1));
    expect([g.shown('FT'), g.shown('V1'), g.shown('I1')]).toEqual(['1,616.6', '235.4', '1,118']);
    expect(g.by('I1')!.unverified).toBe(true);
    expect(g.by('V1')!.corrected).toBe(true);
  });
  it('G6 CG EM341 — as-is, kW≈0.0034', () => {
    const g = render(reply({ FT: 5721.9, V1: 238.4, V2: 239, V3: 239, I1: 0, I2: 0, I3: 0.018, PF: 0.792 }), meter(24));
    expect([g.shown('FT'), g.shown('I3'), g.shown('PF'), g.shown('kW')]).toEqual(['5,721.9', '0.018', '0.792', '0.0034']);
  });
  it('G7 CG EM331 — as-is', () => {
    const g = render(reply({ FT: 602336, RT: 29438.8, I1: 1.024, PF: 0.137 }), meter(126));
    expect([g.shown('FT'), g.shown('RT'), g.shown('I1'), g.shown('PF')]).toEqual(['602,336', '29,438.8', '1.024', '0.137']);
  });
  it('G8 Fineco EM737 Direct — PF 0 → "—" (S6)', () => {
    const g = render(reply({ FT: 48736.14, I1: 7.146, I2: 4.457, I3: 3.439, V1: 229, V2: 231.3, V3: 232, PF: 0 }), meter(43));
    expect([g.shown('FT'), g.shown('I1'), g.shown('V2')]).toEqual(['48,736.14', '7.146', '231.3']);
    expect(g.by('PF')!.shown).toBe('—');
    expect(g.by('kW')).toBeUndefined();
  });
  it('G9 Fineco EM437-X — as-is, PF "—"', () => {
    const g = render(reply({ FT: 61.69, I1: 0.097, I2: 11.465, I3: 0.863, CT_Ratio: 0, PF: 0 }), meter(41));
    expect([g.shown('FT'), g.shown('I2'), g.shown('PF'), g.shown('CT')]).toEqual(['61.69', '11.465', '—', '0']);
  });
  it('G10 ABB cm 200 — I 112/84/108, FT 3,425,444.2, kW≈−60.49', () => {
    const g = render(reply({ I1: 0.56, I2: 0.42, I3: 0.54, V1: 229.7, V2: 229.5, V3: 230.1, FT: 17127.221, PF: -0.866 }), meter(25, 200));
    expect([g.shown('I1'), g.shown('I2'), g.shown('I3'), g.shown('FT'), g.shown('V1'), g.shown('kW')])
      .toEqual(['112', '84', '108', '3,425,444.2', '229.7', '-60.49']);
    expect(g.by('I1')!.device).toBe('0.56');
  });
  it('G11 QNG4 cm 0.2 — I 5.94/108.94/65.62, FT 42,961.66', () => {
    const g = render(reply({ I1: 29.7, I2: 544.7, I3: 328.1, FT: 214808.297 }), meter(22, 0.2));
    expect([g.shown('I1'), g.shown('I2'), g.shown('I3'), g.shown('FT')]).toEqual(['5.94', '108.94', '65.62', '42,961.66']);
  });
  it('G12 QNG1 cm 0.4 — 921.19 A, marked unverified (S4)', () => {
    const g = render(reply({ I1: 2302.976 }), meter(20, 0.4));
    expect(g.shown('I1')).toBe('921.19');
    expect(g.by('I1')!.unverified).toBe(true);
  });
  it('G13 error array → failed + Detail + the auto-poll hint', () => {
    const o = outcome({ id: '', operationCode: 'modbus_read', status: 'completed', errorMessage: '', createdAt: '', completedAt: '', executedBy: '',
      responseData: [{ Error: true, Title: 'Meter read error', Status: 500, Detail: 'Connection timeout: No response from device', IP: '192.0.2.1' }] });
    expect(o).toEqual({ kind: 'fail', message: 'Connection timeout: No response from device', hint: 'ייתכן שהמונה בקריאה אוטומטית — נסה שוב בעוד דקה' });
  });
  it('G14 [null] → the wrong-type sentence', () => {
    const o = outcome({ id: '', operationCode: '', status: 'completed', responseData: [null], errorMessage: '', createdAt: '', completedAt: '', executedBy: '' });
    expect(o).toEqual({ kind: 'fail', message: 'המונה לא החזיר נתונים — ייתכן שסוג המונה ב-EMS שגוי' });
  });
  it('G15 multiplier null / 0 / NaN → 1', () => {
    for (const cm of [null, 0, NaN]) {
      const g = render(reply({ FT: 100, I1: 5 }), meter(24, cm as any, null, 0, null));
      expect([g.shown('FT'), g.shown('I1')]).toEqual(['100', '5']);
    }
    expect([mult(null), mult(0), mult(NaN), mult(0.5)]).toEqual([1, 1, 1, 0.5]);
  });
});

describe('outcomes, parse edge cases', () => {
  const log = (o: any) => ({ id: '', operationCode: '', status: 'completed', responseData: null, errorMessage: '', createdAt: '', completedAt: '', executedBy: '', ...o });
  it('[] → unsupported; failed → errorMessage; stuck → still running; no log', () => {
    expect(outcome(log({ responseData: [] })).kind).toBe('fail');
    expect((outcome(log({ responseData: [] })) as any).message).toBe('סוג המונה לא נתמך ב-ModbusClient');
    expect(outcome(log({ status: 'failed', errorMessage: 'timeout of 120000ms exceeded' }))).toEqual({ kind: 'fail', message: 'timeout of 120000ms exceeded', hint: 'ייתכן שהמונה בקריאה אוטומטית — נסה שוב בעוד דקה' });
    expect((outcome(log({ status: 'in_progress' })) as any).message).toContain('עדיין רצה');
    expect(outcome(null).kind).toBe('fail');
    expect(parseModbusResponse('not json').kind).toBe('bad');
    expect(parseModbusResponse(JSON.stringify(reply({ FT: 1 }))).kind).toBe('ok');
  });
  it('multi-circuit reply keeps every entry', () => {
    const p = parseModbusResponse([...reply({ FT: 1, CounterNumber: '100-1' }), ...reply({ FT: 2, CounterNumber: '100-2' })]);
    expect(p.kind === 'ok' && p.entries.map(e => e.values.FT)).toEqual([1, 2]);
  });
  it('response time, Israel time, serial check', () => {
    expect(responseMs(log({ createdAt: '2026-09-27T10:00:00Z', completedAt: '2026-09-27T10:00:04.250Z' }))).toBe(4250);
    expect(israelTime('2026-09-27T10:00:04Z')).toContain('13:00:04');
    expect(serialCheck('1239859', '1239859-1')).toBe('match');
    expect(serialCheck('9999', '1239859')).toBe('mismatch');
    expect(serialCheck('XXX', '1239859')).toBe('unknown');
  });
  it('ping summary', () => {
    const p = parsePing({ ipAddress: '192.0.2.1', successCount: 3, totalAttempts: 4, averageRoundtripTime: 120,
      details: [{ attempt: 1, status: 'Success', roundtripTime: 110 }, { attempt: 2, status: 'TimedOut', roundtripTime: 0 }] });
    expect(p).toMatchObject({ successCount: 3, totalAttempts: 4, avgMs: 120 });
    expect(p!.attempts.map(a => a.ok)).toEqual([true, false]);
    expect(parsePing({ successCount: 0, averageRoundtripTime: -1, details: [] })!.avgMs).toBeNull();
    expect(parsePing([null])).toBeNull();
  });
});

describe('the version check', () => {
  it('eng-v2 replies are never corrected (no double correction after the ModbusClient fix)', () => {
    const c = correct({ FT: 28141, V1: 226.1, I1: 0.08, PF: 1 }, 32, FIXED_UNITS_MARKER);
    expect(c.values).toEqual({ FT: 28141, V1: 226.1, I1: 0.08, PF: 1 });
    expect(c.corrected).toEqual([]);
  });
  it('an unknown Units marker is shown as-is with a note', () => {
    const c = correct({ FT: 28.141, V1: 226.1 }, 32, 'eng-v9');
    expect(c.values.FT).toBe(28.141);
    expect(c.notes[0]).toContain('eng-v9');
  });
  it('every correction targets known legacy models', () => {
    const legacy = new Set([...Object.values(LEGACY_MODBUS_TYPE), 45]);
    for (const c of CORRECTIONS) for (const m of c.models) expect(legacy.has(m)).toBe(true);
  });
});

describe('contracts', () => {
  it('every Modbus meter_type has type vm = cm = 1 (EMS energy ignores them; the PQ report applies them — S8)', () => {
    for (const t of (types as any).data) {
      expect([t.code, Number(t.voltageMultiplier), Number(t.currentMultiplier)]).toEqual([t.code, 1, 1]);
    }
  });
  it('the types fixture, the picker and the legacy map cover the same 17 codes', () => {
    const codes = (xs: number[]) => [...xs].sort((a, b) => a - b);
    const legacy = codes(Object.keys(LEGACY_MODBUS_TYPE).map(Number));
    expect(codes((types as any).data.map((t: any) => t.code))).toEqual(legacy);
    expect(codes(MODBUS_TYPES.map(t => t.code))).toEqual(legacy);
  });
  it('the legacy map is identical to the field-ops function\'s copy', () => {
    const src = readFileSync(resolve(__dirname, '../../../../supabase/functions/field-ops/handler.ts'), 'utf8');
    const block = /LEGACY_MODBUS_TYPE: Record<number, number> = \{([\s\S]*?)\};/.exec(src)![1];
    const fn = Object.fromEntries([...block.matchAll(/(\d+):\s*(\d+)/g)].map(m => [m[1], Number(m[2])]));
    expect(fn).toEqual(Object.fromEntries(Object.entries(LEGACY_MODBUS_TYPE).map(([k, v]) => [k, v])));
  });
});
