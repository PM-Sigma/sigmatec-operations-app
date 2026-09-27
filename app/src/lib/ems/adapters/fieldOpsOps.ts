// פעולות שטח → קריאת מודבוס: the five gateway ops + their mappers, split out of rest.ts so the
// boot bundle does not carry them (rest.ts lazy-imports this file on first use).
import type { EmsModbusMeter, ModbusOpLog, ModbusOpResult, ModbusTarget } from '../types';
import type { RestTransport } from './rest';

const str = (v: unknown) => (v == null ? '' : String(v));

// ── פעולות שטח (field-ops function) ──

/** EMS decimals arrive as strings ("1.0000"); anything unparseable is null, never NaN. */
export function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export function mapModbusMeter(r: any): EmsModbusMeter {
  return {
    id: str(r?.id),
    serial: str(r?.serialNumber),
    address: str(r?.address),
    siteId: str(r?.site?.id),
    siteName: str(r?.site?.name),
    ip: str(r?.ipAddress).trim(),
    unit: parseInt(str(r?.deviceNumber), 10) || 1,
    typeCode: numOrNull(r?.type?.code),
    typeName: str(r?.type?.name),
    cm: numOrNull(r?.currentMultiplier),
    vm: numOrNull(r?.voltageMultiplier),
    pm: numOrNull(r?.powerMultiplier),
    typePm: numOrNull(r?.type?.powerMultiplier),
    lastCallDate: r?.lastTransmission?.callDate ? str(r.lastTransmission.callDate) : null,
  };
}

export function mapOpLog(r: any): ModbusOpLog {
  return {
    id: str(r?.id),
    operationCode: str(r?.operationCode),
    status: str(r?.status),
    responseData: r?.responseData ?? null,
    errorMessage: str(r?.errorMessage),
    createdAt: str(r?.createdAt),
    completedAt: str(r?.completedAt),
    executedBy: str(r?.executedBy),
  };
}

export function mapOpResult(d: any): ModbusOpResult {
  return {
    meter: d?.meter ? mapModbusMeter(d.meter) : null,
    override: Array.isArray(d?.override) ? d.override.map(String) : [],
    log: d?.log ? mapOpLog(d.log) : null,
  };
}


function fo(t: RestTransport) {
  return (p: Record<string, unknown>, ms: number) => {
    if (!t.fieldOps) throw new Error('field-ops transport missing');
    return t.fieldOps(p, ms);
  };
}

/** Only the keys the function accepts; undefined ones are dropped (the function 400s on extras). */
export function cleanTarget(x: { meterId?: string; ip?: string; unit?: number; typeCode?: number }, read: boolean) {
  const o: Record<string, unknown> = {};
  if (x.meterId) o.meterId = x.meterId;
  if (x.ip) o.ip = x.ip;
  if (read && x.ip && x.unit != null) o.unit = x.unit;
  if (read && x.ip && x.typeCode != null) o.typeCode = x.typeCode;
  return o;
}


export function fieldOpsOps(t: RestTransport) {
  return {
    // פעולות שטח → קריאת מודבוס. Timeouts mirror spec §8.2: the browser gives up after the
  // function (125 s read / 65 s ping) would have.
  async modbusMeters(siteId: string) {
    const d = await fo(t)({ mode: 'meters', siteId }, 60_000);
    return (Array.isArray(d?.meters) ? d.meters : []).map(mapModbusMeter);
  },
  async modbusLookup(ip: string) {
    const d = await fo(t)({ mode: 'lookup', ip }, 90_000);
    return (Array.isArray(d?.meters) ? d.meters : []).map(mapModbusMeter);
  },
  async modbusRead(target: ModbusTarget) {
    return mapOpResult(await fo(t)({ mode: 'read', ...cleanTarget(target, true) }, 140_000));
  },
  async modbusPing(target: ModbusTarget) {
    return mapOpResult(await fo(t)({ mode: 'ping', ...cleanTarget(target, false) }, 80_000));
  },
  async meterOpsHistory(meterId: string) {
    const d = await fo(t)({ mode: 'history', meterId }, 30_000);
    return (Array.isArray(d?.logs) ? d.logs : []).map(mapOpLog);
  },

  };
}
