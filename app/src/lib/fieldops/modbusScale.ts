// פעולות שטח → קריאת מודבוס: the ONE place a ModbusClient reply becomes numbers on screen.
// Spec: docs/superpowers/specs/2026-09-23-field-ops-modbus-design.md §3, §5, §6 + עידן's rulings.
//
// Two layers, each in exactly one place:
//   L0  register → engineering units. ModbusClient owns it, but it has known bugs (§5 S1–S6)
//       and עידן ruled that no other repo is ever changed — so the fixes live HERE, in the
//       per-model CORRECTIONS table, and apply ONLY while the reply has no `Units: "eng-v2"`
//       marker (the version check). The day ModbusClient ships the fix and the marker, the
//       table switches itself off and a double correction is impossible.
//   L1  EMS meter parameters, mirroring EMS exactly (`process_reading` / the PQ report):
//       I×cm · V×vm · kWh×(pm·typePm·vm·cm) · PF as-is · CT_Ratio shown, never used ·
//       meter-type vm/cm never used · null/NaN/0 multiplier → 1.
import type { EmsModbusMeter, ModbusOpLog } from '@/lib/ems/types';

/** EMS meter_types.code → legacy ModbusClient MeterType (EMS operation-registry.ts, read-only mirror). */
export const LEGACY_MODBUS_TYPE: Record<number, number> = {
  10: 9, 11: 17, 12: 19, 13: 30, 14: 32, 15: 8, 20: 36, 21: 35, 22: 33, 23: 34, 24: 43,
  25: 37, 40: 41, 41: 38, 42: 39, 43: 40, 126: 44,
};

/** The EMS Modbus types, for the manual-mode picker. */
export const MODBUS_TYPES: Array<{ code: number; name: string }> = [
  { code: 10, name: 'Satec EM133' }, { code: 11, name: 'Satec 133-LR' }, { code: 12, name: 'Satec PM135' },
  { code: 13, name: 'Satec 175/135 HV' }, { code: 14, name: 'Satec L123' }, { code: 15, name: 'Satec BFM II' },
  { code: 20, name: 'QNG1' }, { code: 21, name: 'QNG3' }, { code: 22, name: 'QNG4' },
  { code: 23, name: 'Carlo Gavazzi EM300' }, { code: 24, name: 'Carlo Gavazzi EM341' }, { code: 126, name: 'Carlo Gavazzi EM331' },
  { code: 25, name: 'ABB B23/B24' }, { code: 40, name: 'Fineco EM418' }, { code: 41, name: 'Fineco EM437-X' },
  { code: 42, name: 'Fineco EM737' }, { code: 43, name: 'Fineco EM737 Direct' },
];

export type Field = 'F1' | 'F2' | 'F3' | 'FT' | 'R1' | 'R2' | 'R3' | 'RT' | 'I1' | 'I2' | 'I3' | 'V1' | 'V2' | 'V3' | 'PF' | 'CT';
type Kind = 'energy' | 'current' | 'voltage' | 'pf' | 'ct';

/** The old page's 16 rows, in its order, with its labels. */
export const ROWS: Array<{ key: Field; label: string; unit: string; kind: Kind }> = [
  { key: 'F1', label: 'F1 (קדימה 1)', unit: 'kWh', kind: 'energy' },
  { key: 'F2', label: 'F2 (קדימה 2)', unit: 'kWh', kind: 'energy' },
  { key: 'F3', label: 'F3 (קדימה 3)', unit: 'kWh', kind: 'energy' },
  { key: 'FT', label: 'FT (סה״כ קדימה)', unit: 'kWh', kind: 'energy' },
  { key: 'R1', label: 'R1 (אחורה 1)', unit: 'kWh', kind: 'energy' },
  { key: 'R2', label: 'R2 (אחורה 2)', unit: 'kWh', kind: 'energy' },
  { key: 'R3', label: 'R3 (אחורה 3)', unit: 'kWh', kind: 'energy' },
  { key: 'RT', label: 'RT (סה״כ אחורה)', unit: 'kWh', kind: 'energy' },
  { key: 'I1', label: 'I1 (זרם פאזה 1)', unit: 'A', kind: 'current' },
  { key: 'I2', label: 'I2 (זרם פאזה 2)', unit: 'A', kind: 'current' },
  { key: 'I3', label: 'I3 (זרם פאזה 3)', unit: 'A', kind: 'current' },
  { key: 'V1', label: 'V1 (מתח פאזה 1)', unit: 'V', kind: 'voltage' },
  { key: 'V2', label: 'V2 (מתח פאזה 2)', unit: 'V', kind: 'voltage' },
  { key: 'V3', label: 'V3 (מתח פאזה 3)', unit: 'V', kind: 'voltage' },
  { key: 'PF', label: 'PF (גורם הספק)', unit: '', kind: 'pf' },
  { key: 'CT', label: 'CT (כופל במונה)', unit: '', kind: 'ct' },
];

export type Values = Partial<Record<Field, number | null>>;

// ───────────────────────────── parse ─────────────────────────────

export interface QueryMessage { values: Values; counterNumber: string; units: string | null; queryDate: string }

export type Parsed =
  | { kind: 'ok'; entries: QueryMessage[] }
  | { kind: 'error'; detail: string }
  | { kind: 'null' }
  | { kind: 'empty' }
  | { kind: 'bad' };

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ModbusClient's reply (as stored by EMS in `responseData`) → a tagged result. Never throws. */
export function parseModbusResponse(data: unknown): Parsed {
  let d: unknown = data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return { kind: 'bad' }; } }
  if (!Array.isArray(d)) return { kind: 'bad' };
  if (d.length === 0) return { kind: 'empty' };
  if (d.every(x => x == null)) return { kind: 'null' };
  const err = d.find((x: any) => x && x.Error === true) as any;
  if (err) return { kind: 'error', detail: String(err.Detail || err.Title || 'שגיאה לא ידועה') };
  const entries = d.filter((x: any) => x && typeof x === 'object').map((x: any): QueryMessage => {
    const values: Values = {};
    for (const r of ROWS) values[r.key] = num(r.key === 'CT' ? (x.CT_Ratio ?? x.CT) : x[r.key]);
    return {
      values,
      counterNumber: x.CounterNumber == null ? '' : String(x.CounterNumber),
      units: typeof x.Units === 'string' ? x.Units : null,
      queryDate: x.QueryDate == null ? '' : String(x.QueryDate),
    };
  });
  return entries.length ? { kind: 'ok', entries } : { kind: 'bad' };
}

/** The ModbusClient ping summary. */
export interface PingResult {
  ip: string; successCount: number; totalAttempts: number; avgMs: number | null;
  attempts: Array<{ attempt: number; status: string; ms: number | null; ok: boolean }>;
}
export function parsePing(data: unknown): PingResult | null {
  let d: any = data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
  if (Array.isArray(d)) d = d[0];
  if (!d || typeof d !== 'object' || !Array.isArray(d.details)) return null;
  const avg = num(d.averageRoundtripTime);
  return {
    ip: String(d.ipAddress ?? ''),
    successCount: num(d.successCount) ?? 0,
    totalAttempts: num(d.totalAttempts) ?? d.details.length,
    avgMs: avg != null && avg > 0 ? avg : null,
    attempts: d.details.map((x: any, i: number) => ({
      attempt: num(x?.attempt) ?? i + 1,
      status: String(x?.status ?? ''),
      ms: num(x?.roundtripTime),
      ok: x?.status === 'Success',
    })),
  };
}

// ───────────────────────────── L0 corrections (the version-checked table) ─────────────────────────────

/** The ModbusClient build the table was written against, and the marker that switches it off. */
export const CORRECTIONS_BASE = 'ModbusClient master 134262c (12.7.26)';
export const FIXED_UNITS_MARKER = 'eng-v2';

export interface Corrected {
  values: Values;
  /** Human-readable notes, one per correction or caveat applied. */
  notes: string[];
  /** Fields whose value is not verified (⚠ לא מאומת). */
  unverified: Field[];
  /** Fields a correction changed. */
  corrected: Field[];
}

const SATEC = [9, 17, 19, 30, 32];
const FINECO = [38, 39, 40, 41, 45];
const ENERGY: Field[] = ['F1', 'F2', 'F3', 'FT', 'R1', 'R2', 'R3', 'RT'];
const hasFraction = (xs: Array<number | null | undefined>) => xs.some(x => x != null && Math.abs(x - Math.round(x)) > 1e-9);

interface Correction {
  id: string;
  models: number[];
  apply(v: Values, out: Corrected): void;
}

/** One row per ModbusClient defect (spec §5). Each applies only to its models, only before eng-v2. */
export const CORRECTIONS: Correction[] = [
  {
    // S1: Satec on-demand multiplies ENERGY by U3 (a power unit). High resolution at PT=1 → U3 = 0.001,
    // so kWh arrives 1000× small. That mode is the only one where V/I carry fractions (U1 0.1, U2 0.01)
    // at LV; low resolution returns integers, and PT≠1 (HV, V in the thousands) has U3 = 1.
    id: 'S1', models: SATEC,
    apply(v, out) {
      const vs = [v.V1, v.V2, v.V3], is = [v.I1, v.I2, v.I3];
      const maxV = Math.max(0, ...vs.map(x => Math.abs(x ?? 0)));
      if (!(hasFraction([...vs, ...is]) && maxV < 1000)) return;
      for (const f of ENERGY) if (v[f] != null) { v[f] = v[f]! * 1000; out.corrected.push(f); }
      out.notes.push('אנרגיה תוקנה ×1000 (באג ModbusClient ב-Satec ברזולוציה גבוהה)');
    },
  },
  {
    // S2: Satec PF comes raw (1000 = 1.000).
    id: 'S2', models: [...SATEC, 8],
    apply(v, out) {
      if (v.PF != null && Math.abs(v.PF) > 1.5) { v.PF = v.PF / 1000; out.corrected.push('PF'); out.notes.push('PF תוקן ÷1000'); }
    },
  },
  {
    // S3: BFM II — resolution forced "low": V in device units (2354 = 235.4 V); I units unknown.
    id: 'S3', models: [8],
    apply(v, out) {
      for (const f of ['V1', 'V2', 'V3'] as Field[]) if (v[f] != null) { v[f] = v[f]! / 10; out.corrected.push(f); }
      out.unverified.push('I1', 'I2', 'I3');
      out.notes.push('BFM II: מתח תוקן ÷10, יחידות הזרם לא מאומתות');
    },
  },
  {
    // S4: QNG1 — ModbusClient already multiplies I by the device CT, and EMS then applies cm. Possible double CT.
    id: 'S4', models: [36],
    apply(_v, out) {
      out.unverified.push('I1', 'I2', 'I3');
      out.notes.push('QNG1: הזרם אולי מוכפל ב-CT פעמיים — לא מאומת מול מד צבת');
    },
  },
  {
    // S6: Fineco PF is `(int)float` → always 0. Show "—", never "0".
    id: 'S6', models: FINECO,
    apply(v, out) { if (v.PF === 0) { v.PF = null; out.notes.push('Fineco: PF לא נקרא (באג ModbusClient)'); } },
  },
];

/** L0: apply the model's corrections, unless the reply says ModbusClient already fixed itself. */
export function correct(raw: Values, legacyType: number | null, units: string | null): Corrected {
  const out: Corrected = { values: { ...raw }, notes: [], unverified: [], corrected: [] };
  if (units === FIXED_UNITS_MARKER) return out;
  if (units != null) { out.notes.push(`יחידות "${units}" לא מוכרות — מוצג כפי שהתקבל`); return out; }
  if (legacyType == null) return out;
  for (const c of CORRECTIONS) if (c.models.includes(legacyType)) c.apply(out.values, out);
  return out;
}

// ───────────────────────────── L1 (EMS meter parameters) ─────────────────────────────

/** EMS's COALESCE/num() rule: a missing, unparseable or zero multiplier means 1. */
export const mult = (x: number | null | undefined): number => (x == null || !Number.isFinite(x) || x === 0 ? 1 : x);

export interface Multipliers { cm: number; vm: number; energy: number }
export function multipliers(m: Pick<EmsModbusMeter, 'cm' | 'vm' | 'pm' | 'typePm'> | null): Multipliers {
  if (!m) return { cm: 1, vm: 1, energy: 1 };
  const cm = mult(m.cm), vm = mult(m.vm);
  return { cm, vm, energy: mult(m.pm) * mult(m.typePm) * vm * cm };
}

/** L1 on corrected device values. `kW` = PF × Σ(Vᵢ·Iᵢ)/1000 on the scaled values ("משוער"). */
export function scale(v: Values, m: Multipliers): Values & { kW: number | null } {
  const o: Values & { kW: number | null } = { kW: null };
  for (const r of ROWS) {
    const x = v[r.key];
    if (x == null) { o[r.key] = x; continue; }
    o[r.key] = r.kind === 'energy' ? x * m.energy : r.kind === 'current' ? x * m.cm : r.kind === 'voltage' ? x * m.vm : x;
  }
  const pairs = ([1, 2, 3] as const).map(i => [o[`V${i}` as Field], o[`I${i}` as Field]] as const).filter(([a, b]) => a != null && b != null);
  if (o.PF != null && pairs.length) o.kW = o.PF * pairs.reduce((s, [a, b]) => s + a! * b!, 0) / 1000;
  return o;
}

// ───────────────────────────── display ─────────────────────────────

const fmt = (x: number, max: number) => {
  const r = Number(x.toFixed(max));
  return (Object.is(r, -0) ? 0 : r).toLocaleString('en-US', { maximumFractionDigits: max });
};
export function formatValue(kind: Kind | 'kw', x: number | null | undefined): string {
  if (x == null) return '—';
  switch (kind) {
    case 'pf': return x.toFixed(3);
    case 'energy': return fmt(x, 2);
    case 'voltage': return fmt(x, 2);
    case 'current': return fmt(x, 3);
    case 'ct': return fmt(x, 3);
    case 'kw': return Math.abs(x) >= 1 ? fmt(x, 2) : fmt(x, 4);
  }
}

export interface Row { key: Field | 'kW'; label: string; unit: string; device: string; shown: string; unverified: boolean; corrected: boolean }

/** parse → correct → scale → the strings the page renders. Rows with no device value are dropped (the old page's rule). */
export function buildRows(entry: QueryMessage, meter: Pick<EmsModbusMeter, 'cm' | 'vm' | 'pm' | 'typePm' | 'typeCode'> | null, legacyType: number | null): { rows: Row[]; notes: string[]; mult: Multipliers } {
  const c = correct(entry.values, legacyType, entry.units);
  const m = multipliers(meter);
  const s = scale(c.values, m);
  const rows: Row[] = [];
  for (const r of ROWS) {
    const raw = entry.values[r.key];
    if (raw == null) continue;
    rows.push({
      key: r.key, label: r.label, unit: r.unit,
      device: formatValue(r.kind, raw),
      // CT_Ratio is the device's own setting — shown, never multiplied (S7).
      shown: formatValue(r.kind, s[r.key]),
      unverified: c.unverified.includes(r.key),
      corrected: c.corrected.includes(r.key),
    });
  }
  if (s.kW != null) rows.push({ key: 'kW', label: 'הספק משוער', unit: 'kW', device: '—', shown: formatValue('kw', s.kW), unverified: c.unverified.some(f => f.startsWith('I')), corrected: false });
  return { rows, notes: c.notes, mult: m };
}

/** The device's CounterNumber vs the EMS serial (prefix match, like ModbusClient's own check). */
export function serialCheck(counterNumber: string, emsSerial: string | null): 'match' | 'mismatch' | 'unknown' {
  const a = counterNumber.trim(), b = (emsSerial || '').trim();
  if (!a || !b || a === 'XXX') return 'unknown';
  const base = b.split('-')[0];
  return a.startsWith(base) || base.startsWith(a) ? 'match' : 'mismatch';
}

// ───────────────────────────── outcome (what the card says) ─────────────────────────────

export const TIMEOUT_HINT = 'ייתכן שהמונה בקריאה אוטומטית — נסה שוב בעוד דקה';
export type Outcome =
  | { kind: 'ok'; entries: QueryMessage[] }
  | { kind: 'fail'; message: string; hint?: string };

/** The EMS log → success, or the one clear sentence the card shows. Covers G13/G14, `[]`, stuck, failed. */
export function outcome(log: ModbusOpLog | null): Outcome {
  if (!log) return { kind: 'fail', message: 'לא התקבלה תשובה מ-EMS' };
  if (log.status === 'in_progress' || log.status === 'pending') return { kind: 'fail', message: 'הקריאה עדיין רצה ב-EMS — רענן את ההיסטוריה בעוד רגע' };
  if (log.status === 'failed') {
    const m = log.errorMessage || 'הקריאה נכשלה';
    return { kind: 'fail', message: m, hint: /timeout/i.test(m) ? TIMEOUT_HINT : undefined };
  }
  const p = parseModbusResponse(log.responseData);
  switch (p.kind) {
    case 'ok': return { kind: 'ok', entries: p.entries };
    case 'error': return { kind: 'fail', message: p.detail, hint: /timeout/i.test(p.detail) ? TIMEOUT_HINT : undefined };
    case 'null': return { kind: 'fail', message: 'המונה לא החזיר נתונים — ייתכן שסוג המונה ב-EMS שגוי' };
    case 'empty': return { kind: 'fail', message: 'סוג המונה לא נתמך ב-ModbusClient' };
    default: return { kind: 'fail', message: 'תשובה לא מוכרת מ-ModbusClient' };
  }
}

/** Response time from the EMS log (completedAt − createdAt), ms, or null. */
export function responseMs(log: ModbusOpLog | null): number | null {
  if (!log) return null;
  const a = Date.parse(log.createdAt), b = Date.parse(log.completedAt);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null;
}

/** An instant in Israel time, `27.9.2026, 13:00:04` — the old page showed UTC (3 h off). */
export function israelTime(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(t));
}
