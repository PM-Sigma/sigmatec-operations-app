// F2 goldens — the פעולות שטח gateway ops (spec 2026-09-23-field-ops-modbus-design.md §10):
// the exact payload each op hands the field-ops transport, and raw EMS JSON → app types.
import { describe, expect, it, vi } from 'vitest';
import { cleanTarget, mapModbusMeter, mapOpLog, mapOpResult, numOrNull, restAdapter, type RestTransport } from './adapters/rest';
import meterJson from '../fieldops/__fixtures__/emsModbusMeter.json';

function fake(reply: any = {}) {
  const fieldOps = vi.fn(async (_p: Record<string, unknown>, _ms: number) => reply);
  const t: RestTransport = {
    emsApi: vi.fn(async () => []), emsWrite: vi.fn(async () => ({ sent: true })),
    queueOffline: () => {}, isConnected: () => true, getSites: async () => [], fieldOps,
  };
  return { gw: restAdapter(t), calls: () => fieldOps.mock.calls.map(c => [c[0], c[1]]) };
}

describe('mappers', () => {
  it('EMS meter JSON → EmsModbusMeter (strings → numbers, IP trimmed, unit parsed)', () => {
    expect(mapModbusMeter(meterJson)).toEqual({
      id: '0b8f6c1e-3c7a-4e1d-9d52-6a1f2b3c4d5e', serial: '1557654', address: 'לול צפוני',
      siteId: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', siteName: 'קיבוץ דוגמה',
      ip: '192.0.2.44', unit: 3, typeCode: 25, typeName: 'ABB B23/B24',
      cm: 200, vm: 1, pm: null, typePm: 1, lastCallDate: '2026-09-27T09:30:00.000Z',
    });
  });
  it('device number: EMS rule parseInt || 1', () => {
    expect(mapModbusMeter({ deviceNumber: '' }).unit).toBe(1);
    expect(mapModbusMeter({ deviceNumber: 'abc' }).unit).toBe(1);
    expect(mapModbusMeter({ deviceNumber: '06' }).unit).toBe(6);
  });
  it('numOrNull never yields NaN', () => {
    expect([numOrNull('0.1000'), numOrNull(''), numOrNull('x'), numOrNull(null), numOrNull(0)]).toEqual([0.1, null, null, null, 0]);
  });
  it('op log + result', () => {
    const log = { id: 'L', operationCode: 'modbus_read', status: 'completed', responseData: [null], errorMessage: null,
      createdAt: '2026-09-27T10:00:00Z', completedAt: '2026-09-27T10:00:04Z', executedBy: 'עידן' };
    expect(mapOpLog(log)).toEqual({ ...log, errorMessage: '' });
    const r = mapOpResult({ meter: null, override: ['meterIpAddress'], log });
    expect(r.meter).toBeNull();
    expect(r.override).toEqual(['meterIpAddress']);
    expect(r.log?.responseData).toEqual([null]);
    expect(mapOpResult({})).toEqual({ meter: null, override: [], log: null });
  });
});

describe('payload goldens — what reaches field-ops', () => {
  it('modbusMeters / lookup / history', async () => {
    const f = fake({ meters: [meterJson], logs: [] });
    const m = await f.gw.modbusMeters('site-1');
    expect(m[0].serial).toBe('1557654');
    await f.gw.modbusLookup('192.0.2.44');
    await f.gw.meterOpsHistory('m1');
    expect(f.calls()).toEqual([
      [{ mode: 'meters', siteId: 'site-1' }, 60000],
      [{ mode: 'lookup', ip: '192.0.2.44' }, 90000],
      [{ mode: 'history', meterId: 'm1' }, 30000],
    ]);
  });
  it('list read sends only the meterId; manual read sends ip/unit/type; ping never sends unit/type', async () => {
    const f = fake({ meter: meterJson, override: [], log: { status: 'completed' } });
    const r = await f.gw.modbusRead({ meterId: 'm1' });
    expect(r.meter?.cm).toBe(200);
    await f.gw.modbusRead({ ip: '198.51.100.7', unit: 2, typeCode: 22 });
    await f.gw.modbusPing({ ip: '198.51.100.7', unit: 2, typeCode: 22 });
    expect(f.calls()).toEqual([
      [{ mode: 'read', meterId: 'm1' }, 140000],
      [{ mode: 'read', ip: '198.51.100.7', unit: 2, typeCode: 22 }, 140000],
      [{ mode: 'ping', ip: '198.51.100.7' }, 80000],
    ]);
  });
  it('cleanTarget drops unit/type without an ip', () => {
    expect(cleanTarget({ meterId: 'm', unit: 3, typeCode: 12 }, true)).toEqual({ meterId: 'm' });
  });
});
