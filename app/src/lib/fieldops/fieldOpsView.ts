// פעולות שטח → קריאת מודבוס: the page's decisions, pure (the island only renders them).
// Spec: docs/superpowers/specs/2026-09-23-field-ops-modbus-design.md §7, §8.3 + עידן's rulings 27.9.
import type { EmsModbusMeter, ModbusTarget } from '@/lib/ems/types';
import { LEGACY_MODBUS_TYPE, type QueryMessage } from './modbusScale';

/** Strict dotted-quad IPv4 — the same rule the field-ops function enforces. */
export function isIPv4(s: string): boolean {
  const p = s.trim().split('.');
  return p.length === 4 && p.every(o => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255);
}

/** '' → null (default 1 at read time); otherwise an integer 1–247 or NaN (invalid). */
export function parseUnit(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  return /^\d{1,3}$/.test(t) && Number(t) >= 1 && Number(t) <= 247 ? Number(t) : NaN;
}

/** The meters list mode offers: a Modbus type ModbusClient knows and an IPv4 address. */
export function listEligible(ms: EmsModbusMeter[]): EmsModbusMeter[] {
  return ms
    .filter(m => m.typeCode != null && LEGACY_MODBUS_TYPE[m.typeCode] !== undefined && isIPv4(m.ip))
    .sort((a, b) => a.serial.localeCompare(b.serial, 'he', { numeric: true }));
}

/** `serial · address · IP · ID n` (the unit is shown because IP+unit pairs are shared). */
export const meterLabel = (m: EmsModbusMeter) =>
  [m.serial, m.address, m.ip, 'ID ' + m.unit].filter(Boolean).join(' · ');

export function matchSearch(m: EmsModbusMeter, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || [m.serial, m.address, m.ip].some(x => x.toLowerCase().includes(t));
}

// ───────────── manual mode: "who is on this IP" (עידן 27.9) ─────────────

export interface ManualStatus {
  tone: 'ok' | 'warn' | 'info';
  /** The IP line, always shown once an IP is typed. */
  ipLine: string;
  /** The unit line, only when a unit was typed. */
  unitLine: string | null;
  /** The EMS meters on this IP AND unit (the ones whose multipliers apply). */
  sameDevice: EmsModbusMeter[];
}

export function manualStatus(matches: EmsModbusMeter[], unit: number | null): ManualStatus {
  const n = matches.length;
  const ipLine = n === 0 ? 'ה-IP הזה לא מוקם ב-EMS — המונה לא רשום'
    : n === 1 ? 'ה-IP הזה מוביל למונה אחד ב-EMS'
    : `ה-IP הזה מוביל ל-${n} מונים ב-EMS`;
  const u = unit ?? 1;
  const sameDevice = matches.filter(m => m.unit === u);
  let unitLine: string | null = null;
  if (unit != null) {
    unitLine = sameDevice.length === 0 ? `אין ב-EMS מונה על ה-IP הזה עם ID ${unit} — המונה לא רשום`
      : sameDevice.length === 1 ? `המונה עם ID ${unit} רשום ב-EMS: ${sameDevice[0].serial} · ${sameDevice[0].address || 'בלי כתובת'}`
      : `ל-ID ${unit} רשומים ב-EMS ${sameDevice.length} מעגלים — כרטיס לכל מעגל`;
  }
  const tone = n === 0 || (unit != null && sameDevice.length === 0) ? 'warn' : 'ok';
  return { tone, ipLine, unitLine, sameDevice };
}

export interface ManualPlan {
  target: ModbusTarget;
  /** One card per EMS circuit on the device; an empty list means "not registered" (one bare card). */
  circuits: EmsModbusMeter[];
  /** A typed type that differs from EMS: EMS wins for the read, and the page says so. */
  typeNote: string | null;
  error: string | null;
}

/** What a manual read sends. A registered device reads through its own meter (its multipliers
 *  apply); an unregistered one goes through the override with the typed type. */
export function planManualRead(ipRaw: string, unitRaw: string, typeCode: number | null, matches: EmsModbusMeter[], typeName: (c: number) => string): ManualPlan {
  const ip = ipRaw.trim();
  const none = (error: string): ManualPlan => ({ target: {}, circuits: [], typeNote: null, error });
  if (!ip) return none('נא למלא כתובת IP');
  if (!isIPv4(ip)) return none('כתובת IP לא תקינה (למשל 192.0.2.10)');
  const u = parseUnit(unitRaw);
  if (Number.isNaN(u)) return none('מספר ID הוא מספר שלם בין 1 ל-247');
  const unit = u ?? 1;
  const same = matches.filter(m => m.unit === unit);
  if (same.length) {
    const emsType = same[0].typeCode;
    const typeNote = typeCode != null && emsType != null && typeCode !== emsType ? `ב-EMS רשום ${typeName(emsType)} — הקריאה לפיו` : null;
    return { target: { meterId: same[0].id, ip, unit }, circuits: same, typeNote, error: null };
  }
  if (typeCode == null) return none('נא לבחור סוג מונה — ה-IP וה-ID האלה לא רשומים ב-EMS');
  return { target: { ip, unit, typeCode, ...(matches[0] ? { meterId: matches[0].id } : {}) }, circuits: [], typeNote: null, error: null };
}

// ───────────── circuits ─────────────

/** Every EMS meter on the same device (IP + unit) — one card each (עידן 23.9). */
export function circuitsOf(m: EmsModbusMeter, siteMeters: EmsModbusMeter[]): EmsModbusMeter[] {
  const same = siteMeters.filter(x => x.ip === m.ip && x.unit === m.unit);
  const list = same.some(x => x.id === m.id) ? same : [m, ...same];
  return [...list].sort((a, b) => a.serial.localeCompare(b.serial, 'he', { numeric: true }));
}

/** Pair the reply's entries with the circuits: one entry per circuit when the counts agree,
 *  otherwise the device's single reading is shown on every circuit's card. */
export function pairEntries(entries: QueryMessage[], circuits: Array<EmsModbusMeter | null>): Array<{ meter: EmsModbusMeter | null; entry: QueryMessage }> {
  if (!entries.length) return [];
  const cs = circuits.length ? circuits : [null];
  if (entries.length === cs.length) return cs.map((meter, i) => ({ meter, entry: entries[i] }));
  return cs.map(meter => ({ meter, entry: entries[0] }));
}

// ───────────── errors ─────────────

/** A thrown gateway error → one Hebrew sentence. */
export function errorText(e: unknown): string {
  const any = e as { code?: string; detail?: string; sessionLost?: boolean; message?: string } | null;
  if (any?.sessionLost) return 'החיבור ל-EMS פג — צריך להתחבר מחדש';
  const d = any?.detail || '';
  switch (any?.code) {
    case 'timeout': return 'המונה לא ענה בזמן (עד 2 דקות) — נסה שוב, או בדוק PING';
    case 'network': return 'אין חיבור לאינטרנט — בדוק את הרשת ונסה שוב';
    case 'ems-forbidden': return 'אין לך הרשאה לפעולות מונה ב-EMS';
    case 'not-found': return 'המונה לא נמצא ב-EMS';
    case 'ems-bad-request':
      if (/IP address/i.test(d)) return 'למונה אין כתובת IP ב-EMS';
      if (/type mapping/i.test(d)) return 'סוג המונה ב-EMS לא ממופה ל-ModbusClient';
      if (/not available/i.test(d)) return 'הפעולה לא זמינה למונה הזה ב-EMS';
      return 'EMS דחה את הבקשה' + (d ? ': ' + d : '');
    default:
      if (/forbidden/i.test(String(any?.code || any?.message || ''))) return 'הדף פתוח לצוות בלבד';
      return 'שגיאה בתקשורת' + (d || any?.message ? ': ' + (d || any?.message) : '');
  }
}
