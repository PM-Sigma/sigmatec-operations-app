// field-ops — the logic behind supabase/functions/field-ops/index.ts (פעולות שטח → קריאת מודבוס).
// Spec: docs/superpowers/specs/2026-09-23-field-ops-modbus-design.md §8 + "עידן's rulings".
//
// A thin, strict proxy to the EMS meter-operations API. It NEVER talks to ModbusClient itself
// (Supabase cannot reach the AWS VPC), never scales and never reshapes the ModbusClient reply —
// the app parses and scales it in app/src/lib/fieldops/modbusScale.ts, the one scaling place.
//
// Modes (all POST {token, mode, …}):
//   meters  {siteId}                      the site's Modbus meters (raw EMS rows, trimmed)
//   lookup  {ip}                          every EMS Modbus meter on that IP (manual mode's table)
//   read    {meterId} | {ip, unit, typeCode[, meterId]}   modbus_read through EMS
//   ping    {meterId} | {ip[, meterId]}   modbus_ping through EMS
//   history {meterId}                     the last 5 EMS operations on that meter
//
// Manual entry of ANY IP (עידן, 27.9): EMS has no ad-hoc read, so the only way to aim a read at
// an IP that is not the meter's PG value is EMS's existing params override (`...dto.params`
// spreads over meterIpAddress/meterDeviceId/meterModbusType — EMS finding F1). The function
// sends ONLY the keys that differ from the carrier meter's PG row, and only those three. The
// EMS audit log then records the read under the carrier meter — a known gap, recorded in the spec.
//
// Pure: every side effect (fetch, the pass check, env) is injected, so handler.test.ts runs the
// whole thing offline.
import { cors, json } from "../_shared/http.ts";
import { ROSTER } from "../ems-auth/identity.js";

/** EMS meter_types.code → the legacy ModbusClient MeterType (EMS operation-registry.ts, read-only mirror). */
export const LEGACY_MODBUS_TYPE: Record<number, number> = {
  10: 9, 11: 17, 12: 19, 13: 30, 14: 32, 15: 8, 20: 36, 21: 35, 22: 33, 23: 34, 24: 43,
  25: 37, 40: 41, 41: 38, 42: 39, 43: 40, 126: 44,
};
export const MODBUS_TYPE_CODES = Object.keys(LEGACY_MODBUS_TYPE).map(Number);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict dotted-quad IPv4: four 0–255 octets, no leading zeros, nothing else. */
export function isIPv4(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 15) return false;
  const p = s.split(".");
  return p.length === 4 && p.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255);
}

/** Modbus unit id: an integer 1–247 (0 is broadcast, 248+ reserved). */
export function isUnit(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 247;
}

export type Mode = "meters" | "lookup" | "read" | "ping" | "history";
const ALLOWED: Record<Mode, string[]> = {
  meters: ["siteId"],
  lookup: ["ip"],
  read: ["meterId", "ip", "unit", "typeCode"],
  ping: ["meterId", "ip"],
  history: ["meterId"],
};

export type Req =
  | { mode: "meters"; siteId: string }
  | { mode: "lookup"; ip: string }
  | { mode: "history"; meterId: string }
  | { mode: "read"; meterId?: string; ip?: string; unit?: number; typeCode?: number }
  | { mode: "ping"; meterId?: string; ip?: string };

/** The one input gate. Anything not spelled out here is a 400 — no free-form params ever reach EMS. */
export function validate(body: any): { ok: true; req: Req } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body must be an object" };
  const mode = body.mode as Mode;
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, mode)) return { ok: false, error: "unknown mode" };
  for (const k of Object.keys(body)) {
    if (k !== "token" && k !== "mode" && !ALLOWED[mode].includes(k)) return { ok: false, error: "unexpected field: " + k };
  }
  const has = (k: string) => body[k] !== undefined && body[k] !== null;
  if (has("meterId") && !(typeof body.meterId === "string" && UUID.test(body.meterId))) return { ok: false, error: "meterId must be a UUID" };
  if (has("siteId") && !(typeof body.siteId === "string" && UUID.test(body.siteId))) return { ok: false, error: "siteId must be a UUID" };
  if (has("ip") && !isIPv4(body.ip)) return { ok: false, error: "ip must be an IPv4 address" };
  if (has("unit") && !isUnit(body.unit)) return { ok: false, error: "unit must be an integer 1-247" };
  if (has("typeCode") && !(typeof body.typeCode === "number" && LEGACY_MODBUS_TYPE[body.typeCode] !== undefined)) {
    return { ok: false, error: "typeCode is not a Modbus meter type" };
  }
  switch (mode) {
    case "meters": return has("siteId") ? { ok: true, req: { mode, siteId: body.siteId } } : { ok: false, error: "siteId required" };
    case "lookup": return has("ip") ? { ok: true, req: { mode, ip: body.ip } } : { ok: false, error: "ip required" };
    case "history": return has("meterId") ? { ok: true, req: { mode, meterId: body.meterId } } : { ok: false, error: "meterId required" };
    case "ping":
      if (!has("meterId") && !has("ip")) return { ok: false, error: "meterId or ip required" };
      return { ok: true, req: { mode, meterId: body.meterId ?? undefined, ip: body.ip ?? undefined } };
    case "read":
      if (!has("meterId") && !has("ip")) return { ok: false, error: "meterId or ip required" };
      if (has("unit") && !has("ip")) return { ok: false, error: "unit needs ip" };
      if (has("typeCode") && !has("ip")) return { ok: false, error: "typeCode needs ip" };
      if (has("ip") && !has("meterId") && !has("typeCode")) return { ok: false, error: "typeCode required for an unregistered ip" };
      return { ok: true, req: { mode, meterId: body.meterId ?? undefined, ip: body.ip ?? undefined, unit: body.unit ?? undefined, typeCode: body.typeCode ?? undefined } };
  }
}

/** Staff only: a verified ems-bridge pass carrying a roster `name`. The viewer (sub "viewer", no name) is refused. */
export function staffGate(payload: Record<string, unknown> | null): { status: number; error: string } | null {
  if (!payload || payload.iss !== "ems-bridge") return { status: 401, error: "unauthorized: invalid pass" };
  if (payload.sub === "viewer") return { status: 403, error: "forbidden: viewer" };
  const name = typeof payload.name === "string" ? payload.name : "";
  if (!(ROSTER as string[]).includes(name)) return { status: 403, error: "forbidden: staff only" };
  return null;
}

/** The fields of an EMS meter row the app uses. Everything else (clients, tags, parents) is dropped. */
export function pickMeter(r: any) {
  if (!r || typeof r !== "object") return null;
  return {
    id: r.id ?? null,
    serialNumber: r.serialNumber ?? null,
    address: r.address ?? null,
    ipAddress: r.ipAddress ?? null,
    deviceNumber: r.deviceNumber ?? null,
    currentMultiplier: r.currentMultiplier ?? null,
    voltageMultiplier: r.voltageMultiplier ?? null,
    powerMultiplier: r.powerMultiplier ?? null,
    site: r.site ? { id: r.site.id ?? null, name: r.site.name ?? null } : null,
    type: r.type ? { code: r.type.code ?? null, key: r.type.key ?? null, name: r.type.name ?? null, powerMultiplier: r.type.powerMultiplier ?? null } : null,
    role: r.role ? { code: r.role.code ?? null } : null,
    lastTransmission: r.lastTransmission ? { callDate: r.lastTransmission.callDate ?? null, goodRow: r.lastTransmission.goodRow ?? null } : null,
  };
}

const unwrapList = (d: any): any[] => Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.items) ? d.items : []));
const unwrapOne = (d: any): any => (d && d.data && !Array.isArray(d.data)) ? d.data : d;

/** The EMS operation log, reduced to what the page shows. `responseData` passes through untouched. */
export function pickLog(l: any) {
  if (!l || typeof l !== "object") return null;
  return {
    id: l.id ?? null,
    operationCode: l.operationCode ?? null,
    status: l.status ?? null,
    responseData: l.responseData ?? null,
    errorMessage: l.errorMessage ?? null,
    requestParams: l.requestParams ?? null,
    createdAt: l.createdAt ?? null,
    completedAt: l.completedAt ?? null,
    executedBy: l.executedBy ? [l.executedBy.firstName, l.executedBy.lastName].filter(Boolean).join(" ") : null,
  };
}

/** The params override for a manual target: only keys that differ from the carrier's PG row. */
export function overrideParams(
  carrier: { ipAddress?: string | null; deviceNumber?: string | null; type?: { code?: number | null } | null },
  target: { ip?: string; unit?: number; typeCode?: number },
  op: "read" | "ping",
): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  if (target.ip && target.ip !== carrier.ipAddress) p.meterIpAddress = target.ip;
  if (op === "ping") return p;
  const pgUnit = parseInt(String(carrier.deviceNumber ?? ""), 10) || 1;
  const unit = target.unit ?? 1;
  if (target.ip && unit !== pgUnit) p.meterDeviceId = unit;
  const tc = target.typeCode ?? carrier.type?.code ?? null;
  if (target.ip && tc != null && tc !== carrier.type?.code) p.meterModbusType = String(LEGACY_MODBUS_TYPE[tc]);
  return p;
}

/** Is `m` exactly the device the user aimed at (same IP, same unit)? Only then do its multipliers apply. */
export function isSameDevice(m: any, ip: string, unit: number): boolean {
  return !!m && m.ipAddress === ip && (parseInt(String(m.deviceNumber ?? ""), 10) || 1) === unit;
}

export interface Deps {
  fetch: (url: string, init: RequestInit, ms: number) => Promise<Response>;
  /** Verifies the Supabase bridge pass (HS256, JWT_SECRET). null = missing/invalid. */
  verifyPass: (pass: string) => Promise<Record<string, unknown> | null>;
  emsBase: string;
  appOrigin: string;
  now?: () => number;
}

export const TIMEOUT = { meta: 20_000, read: 125_000, ping: 65_000 };

class EmsError extends Error { constructor(public status: number, public detail: string) { super(detail); } }

function originFor(req: Request, app: string): string {
  const o = req.headers.get("origin") || "";
  return (o === app || /^https:\/\/([a-z0-9-]+\.)?githack\.com$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o)) ? o : app;
}

// Per-isolate cache of the all-Modbus-meters index (lookup mode), keyed by the EMS token —
// an EMS user only ever sees the meters EMS lets that token see.
const indexCache = new Map<string, { at: number; rows: any[] }>();
export function clearIndexCache() { indexCache.clear(); }

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const ORIGIN = originFor(req, deps.appOrigin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);

  let body: any = null;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400, ORIGIN); }
  const v = validate(body);
  if (!v.ok) return json({ error: v.error }, 400, ORIGIN);
  const token = typeof body.token === "string" ? body.token : "";
  if (!token || token.length > 4096) return json({ error: "unauthorized: EMS login required" }, 401, ORIGIN);

  const pass = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const gate = staffGate(pass ? await deps.verifyPass(pass) : null);
  if (gate) return json({ error: gate.error }, gate.status, ORIGIN);

  const base = deps.emsBase.replace(/\/+$/, "");
  const now = deps.now ?? Date.now;
  const auth = { Authorization: "Bearer " + token };

  async function ems(path: string, init: RequestInit, ms: number): Promise<any> {
    let r: Response;
    try {
      r = await deps.fetch(base + path, { ...init, headers: { ...auth, ...(init.headers || {}) } }, ms);
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError" || /abort/i.test(String(e));
      throw new EmsError(aborted ? 504 : 502, aborted ? "timeout" : "EMS unreachable");
    }
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = typeof d?.message === "string" ? d.message : Array.isArray(d?.message) ? d.message.join("; ") : "";
      throw new EmsError(r.status, msg || ("EMS " + r.status));
    }
    return d;
  }
  const get = (path: string) => ems(path, { method: "GET" }, TIMEOUT.meta);
  const TYPES = MODBUS_TYPE_CODES.join(",");

  async function allModbusMeters(): Promise<any[]> {
    const hit = indexCache.get(token);
    if (hit && now() - hit.at < 5 * 60_000) return hit.rows;
    const TAKE = 200;
    const first = await get(`/v1/meters?typeCodes=${TYPES}&take=${TAKE}&page=1`);
    const rows = unwrapList(first).map(pickMeter);
    const total = Number(first?.meta?.itemCount ?? first?.meta?.total ?? first?.meta?.count ?? NaN);
    const pages = Number.isFinite(total) ? Math.min(60, Math.ceil(total / TAKE)) : (rows.length === TAKE ? 60 : 1);
    for (let p = 2; p <= pages; p += 6) {
      const batch = [];
      for (let q = p; q < p + 6 && q <= pages; q++) batch.push(get(`/v1/meters?typeCodes=${TYPES}&take=${TAKE}&page=${q}`));
      const got = (await Promise.all(batch)).map((d) => unwrapList(d).map(pickMeter));
      for (const g of got) rows.push(...g);
      if (!Number.isFinite(total) && got.some((g) => g.length < TAKE)) break;
    }
    indexCache.set(token, { at: now(), rows });
    return rows;
  }

  async function carrierFor(req: { meterId?: string; ip?: string }): Promise<any> {
    if (req.meterId) return pickMeter(unwrapOne(await get(`/v1/meters/${req.meterId}`)));
    // No EMS meter on that IP: any Modbus meter with an IPv4 carries the override (EMS needs a
    // meter row for the role check and the audit log — the recorded gap).
    const d = await get(`/v1/meters?typeCodes=${TYPES}&take=20&page=1`);
    const c = unwrapList(d).map(pickMeter).find((m) => m && isIPv4(m.ipAddress));
    if (!c) throw new EmsError(409, "no carrier meter");
    return c;
  }

  try {
    const r = v.req;
    if (r.mode === "meters") {
      const out: any[] = [];
      for (let p = 1; p <= 10; p++) {
        const rows = unwrapList(await get(`/v1/meters?siteId=${r.siteId}&typeCodes=${TYPES}&take=200&page=${p}`));
        out.push(...rows.map(pickMeter));
        if (rows.length < 200) break;
      }
      return json({ meters: out }, 200, ORIGIN);
    }
    if (r.mode === "lookup") {
      const rows = (await allModbusMeters()).filter((m) => m && m.ipAddress === r.ip);
      return json({ meters: rows }, 200, ORIGIN);
    }
    if (r.mode === "history") {
      const d = await get(`/v1/meters/${r.meterId}/operations/history?take=5`);
      return json({ logs: unwrapList(d).map(pickLog) }, 200, ORIGIN);
    }
    // read / ping
    const carrier = await carrierFor(r);
    if (!carrier) return json({ error: "meter not found" }, 404, ORIGIN);
    const params = r.ip ? overrideParams(carrier, r, r.mode) : {};
    const opCode = r.mode === "read" ? "modbus_read" : "modbus_ping";
    const payload = Object.keys(params).length ? { params } : {};
    const log = unwrapOne(await ems(`/v1/meters/${carrier.id}/operations/${opCode}/execute`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }, r.mode === "read" ? TIMEOUT.read : TIMEOUT.ping));
    // The meter context (multipliers) only when the device read IS that EMS meter.
    const unit = r.mode === "read" ? (r.unit ?? 1) : undefined;
    const same = !r.ip || (r.mode === "ping" ? carrier.ipAddress === r.ip : isSameDevice(carrier, r.ip, unit!));
    return json({
      meter: same ? carrier : null,
      override: Object.keys(params),
      log: pickLog(log),
    }, 200, ORIGIN);
  } catch (e) {
    if (e instanceof EmsError) {
      const code = e.status === 401 ? "ems-session" : e.status === 403 ? "ems-forbidden" : e.status === 504 ? "timeout"
        : e.status === 404 ? "not-found" : e.status === 400 ? "ems-bad-request" : "ems-error";
      const status = [400, 401, 403, 404, 409, 504].includes(e.status) ? e.status : 502;
      return json({ error: code, detail: e.detail.slice(0, 300) }, status, ORIGIN);
    }
    return json({ error: "ems-error", detail: String((e as Error)?.message || e).slice(0, 300) }, 502, ORIGIN);
  }
}
