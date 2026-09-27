// Deno unit tests for field-ops (offline: fetch + pass verifier are fakes).
//   deno test supabase/functions/field-ops/handler.test.ts
// IPs are documentation-range (RFC 5737) only — the repo is public.
import { clearIndexCache, handle, isIPv4, overrideParams, staffGate, validate, type Deps } from "./handler.ts";

function eq(a: unknown, b: unknown, msg = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}\n  got:  ${x}\n  want: ${y}`);
}
function ok(c: unknown, msg = "") { if (!c) throw new Error("assertion failed " + msg); }

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const SITE = "33333333-3333-4333-8333-333333333333";
const STAFF = { iss: "ems-bridge", sub: "u1", name: "עידן" };

const meter = (id: string, ip: string, unit: string, code = 12) => ({
  id, serialNumber: "S-" + id.slice(0, 4), address: "מבנה " + id.slice(0, 1), ipAddress: ip, deviceNumber: unit,
  currentMultiplier: "1.0000", voltageMultiplier: "1.0000", powerMultiplier: "1.0000",
  site: { id: SITE, name: "קיבוץ דוגמה" }, type: { code, key: "k", name: "Satec PM135", powerMultiplier: "1" },
  clients: [{ secret: "dropped" }],
});

type Call = { url: string; init: RequestInit; ms: number };
function fakeDeps(routes: (url: string, init: RequestInit) => Response | Promise<Response> | "abort", pass: Record<string, unknown> | null = STAFF) {
  const calls: Call[] = [];
  const deps: Deps = {
    emsBase: "https://ems.example",
    appOrigin: "https://app.example",
    verifyPass: () => Promise.resolve(pass),
    fetch: async (url, init, ms) => {
      calls.push({ url, init, ms });
      const r = await routes(url, init);
      if (r === "abort") { const e = new Error("The signal has been aborted"); e.name = "AbortError"; throw e; }
      return r;
    },
  };
  return { deps, calls };
}
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const post = (body: unknown, headers: Record<string, string> = { Authorization: "Bearer pass" }) =>
  new Request("https://fn.example/field-ops", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const LOG = { id: "L1", status: "completed", responseData: [{ FT: 1 }], createdAt: "2026-09-27T10:00:00Z", completedAt: "2026-09-27T10:00:04Z", executedBy: { firstName: "עידן", lastName: "" } };

Deno.test("isIPv4 is strict", () => {
  for (const s of ["192.0.2.1", "198.51.100.254", "0.0.0.0", "255.255.255.255"]) ok(isIPv4(s), s);
  for (const s of ["192.0.2", "192.0.2.1.5", "192.0.2.01", "256.1.1.1", "1451510", "::1", "192.0.2.1 ", "a.b.c.d", "", 7]) ok(!isIPv4(s), String(s));
});

Deno.test("validate: modes, UUIDs, ranges, no extra fields", () => {
  ok(validate({ mode: "read", meterId: M1, token: "t" }).ok);
  ok(validate({ mode: "read", ip: "192.0.2.10", unit: 3, typeCode: 12 }).ok);
  eq(validate({ mode: "read", meterId: "not-a-uuid" }), { ok: false, error: "meterId must be a UUID" });
  eq(validate({ mode: "read", meterId: M1, params: { meterIpAddress: "192.0.2.9" } }), { ok: false, error: "unexpected field: params" });
  eq(validate({ mode: "dlms_disconnect", meterId: M1 }), { ok: false, error: "unknown mode" });
  eq(validate({ mode: "read", ip: "192.0.2.10", unit: 0, typeCode: 12 }).ok, false);
  eq(validate({ mode: "read", ip: "192.0.2.10", unit: 248, typeCode: 12 }).ok, false);
  eq(validate({ mode: "read", ip: "192.0.2.10", unit: 1.5, typeCode: 12 }).ok, false);
  eq(validate({ mode: "read", ip: "192.0.2.10", unit: "3", typeCode: 12 }).ok, false);
  eq(validate({ mode: "read", ip: "192.0.2.10", typeCode: 99 }), { ok: false, error: "typeCode is not a Modbus meter type" });
  eq(validate({ mode: "read", ip: "192.0.2.10" }), { ok: false, error: "typeCode required for an unregistered ip" });
  eq(validate({ mode: "read", meterId: M1, unit: 2 }), { ok: false, error: "unit needs ip" });
  eq(validate({ mode: "ping", ip: "192.0.2.10", unit: 2 }), { ok: false, error: "unexpected field: unit" });
  eq(validate({ mode: "lookup", ip: "10.0.0.x" }).ok, false);
  eq(validate({ mode: "meters", siteId: "x" }).ok, false);
  eq(validate([]).ok, false);
});

Deno.test("staffGate: roster names only, viewer refused", () => {
  eq(staffGate(STAFF), null);
  eq(staffGate({ iss: "ems-bridge", sub: "viewer" })?.status, 403);
  eq(staffGate({ iss: "ems-bridge", sub: "u", name: "PM" })?.status, 403);
  eq(staffGate({ iss: "other", name: "עידן" })?.status, 401);
  eq(staffGate(null)?.status, 401);
});

Deno.test("overrideParams sends only what differs, only the three keys", () => {
  const c = { ipAddress: "192.0.2.10", deviceNumber: "3", type: { code: 12 } };
  eq(overrideParams(c, { ip: "192.0.2.10", unit: 3 }, "read"), {});
  eq(overrideParams(c, { ip: "192.0.2.10", unit: 4 }, "read"), { meterDeviceId: 4 });
  eq(overrideParams(c, { ip: "198.51.100.7", unit: 1, typeCode: 25 }, "read"), { meterIpAddress: "198.51.100.7", meterDeviceId: 1, meterModbusType: "37" });
  eq(overrideParams(c, { ip: "198.51.100.7" }, "ping"), { meterIpAddress: "198.51.100.7" });
});

Deno.test("list read: forwards {} to modbus_read with the user's token, 125 s, meter context trimmed", async () => {
  const { deps, calls } = fakeDeps((url) => {
    if (url.endsWith(`/v1/meters/${M1}`)) return J(meter(M1, "192.0.2.10", "3"));
    if (url.endsWith(`/v1/meters/${M1}/operations/modbus_read/execute`)) return J(LOG);
    return J({}, 404);
  });
  const r = await handle(post({ token: "ems-tok", mode: "read", meterId: M1 }), deps);
  eq(r.status, 200);
  const d = await r.json();
  const exec = calls.find((c) => c.url.includes("/execute"))!;
  eq(exec.init.body, "{}");
  eq((exec.init.headers as Record<string, string>).Authorization, "Bearer ems-tok");
  eq(exec.ms, 125_000);
  eq(d.meter.serialNumber, "S-1111");
  ok(!("clients" in d.meter), "trimmed");
  eq(d.log.responseData, [{ FT: 1 }]);
  eq(d.log.executedBy, "עידן");
  eq(d.override, []);
});

Deno.test("manual read of an unregistered IP: carrier meter + override, no meter context", async () => {
  const { deps, calls } = fakeDeps((url) => {
    if (url.includes("/v1/meters?typeCodes=") && url.includes("take=20")) return J({ data: [meter(M2, "1451510", "1"), meter(M1, "192.0.2.10", "1")] });
    if (url.includes(`/v1/meters/${M1}/operations/modbus_read/execute`)) return J(LOG);
    return J({}, 404);
  });
  const r = await handle(post({ token: "t", mode: "read", ip: "198.51.100.7", unit: 2, typeCode: 22 }), deps);
  eq(r.status, 200);
  const d = await r.json();
  eq(d.meter, null);
  eq(d.override, ["meterIpAddress", "meterDeviceId", "meterModbusType"]);
  const exec = calls.find((c) => c.url.includes("/execute"))!;
  eq(JSON.parse(String(exec.init.body)), { params: { meterIpAddress: "198.51.100.7", meterDeviceId: 2, meterModbusType: "33" } });
});

Deno.test("manual read of a registered IP+unit through its meter: no override, context returned", async () => {
  const { deps, calls } = fakeDeps((url) => {
    if (url.endsWith(`/v1/meters/${M1}`)) return J({ data: meter(M1, "192.0.2.10", "3") });
    if (url.includes("/execute")) return J(LOG);
    return J({}, 404);
  });
  const d = await (await handle(post({ token: "t", mode: "read", meterId: M1, ip: "192.0.2.10", unit: 3 }), deps)).json();
  eq(d.meter.id, M1);
  eq(calls.find((c) => c.url.includes("/execute"))!.init.body, "{}");
});

Deno.test("ping: 65 s, only the IP overridden", async () => {
  const { deps, calls } = fakeDeps((url) => url.endsWith(`/v1/meters/${M1}`) ? J(meter(M1, "192.0.2.10", "3")) : J(LOG));
  await handle(post({ token: "t", mode: "ping", meterId: M1, ip: "198.51.100.7" }), deps);
  const exec = calls.find((c) => c.url.includes("modbus_ping/execute"))!;
  eq(exec.ms, 65_000);
  eq(JSON.parse(String(exec.init.body)), { params: { meterIpAddress: "198.51.100.7" } });
});

Deno.test("lookup: every Modbus meter on the IP, across pages, cached", async () => {
  clearIndexCache();
  let listCalls = 0;
  const { deps } = fakeDeps((url) => {
    listCalls++;
    const page = Number(new URL(url).searchParams.get("page"));
    const rows = page === 1 ? [meter(M1, "192.0.2.10", "1"), ...Array.from({ length: 199 }, (_, i) => meter(M2, "203.0.113." + (i % 250), "1"))]
      : page === 2 ? [meter(M2, "192.0.2.10", "2")] : [];
    return J({ data: rows, meta: { itemCount: 201 } });
  });
  const d = await (await handle(post({ token: "t", mode: "lookup", ip: "192.0.2.10" }), deps)).json();
  eq(d.meters.map((m: any) => m.deviceNumber), ["1", "2"]);
  eq(listCalls, 2);
  await handle(post({ token: "t", mode: "lookup", ip: "192.0.2.10" }), deps);
  eq(listCalls, 2, "second lookup served from cache");
});

Deno.test("history: take=5, logs reduced", async () => {
  const { deps, calls } = fakeDeps(() => J({ data: [LOG], meta: {} }));
  const d = await (await handle(post({ token: "t", mode: "history", meterId: M1 }), deps)).json();
  ok(calls[0].url.endsWith(`/v1/meters/${M1}/operations/history?take=5`));
  eq(d.logs[0].status, "completed");
});

Deno.test("errors: EMS 401/403/400, timeout, gate, bad input, CORS", async () => {
  const at = async (status: number) => {
    const { deps } = fakeDeps(() => J({ message: "Operation is not available for this meter" }, status));
    return handle(post({ token: "t", mode: "read", meterId: M1 }), deps);
  };
  eq((await (await at(401)).json()).error, "ems-session");
  eq((await at(403)).status, 403);
  const b = await (await at(400)).json();
  eq([b.error, b.detail], ["ems-bad-request", "Operation is not available for this meter"]);
  eq((await at(500)).status, 502);

  const { deps: slow } = fakeDeps(() => "abort");
  const t = await handle(post({ token: "t", mode: "read", meterId: M1 }), slow);
  eq([t.status, (await t.json()).error], [504, "timeout"]);

  const { deps: viewer, calls } = fakeDeps(() => J({}), { iss: "ems-bridge", sub: "viewer" });
  eq((await handle(post({ token: "t", mode: "read", meterId: M1 }), viewer)).status, 403);
  eq(calls.length, 0, "viewer never reaches EMS");
  const { deps: none } = fakeDeps(() => J({}), null);
  eq((await handle(post({ token: "t", mode: "read", meterId: M1 }), none)).status, 401);
  const { deps: d0 } = fakeDeps(() => J({}));
  eq((await handle(post({ mode: "read", meterId: M1 }), d0)).status, 401, "no EMS token");
  eq((await handle(post({ token: "t", mode: "read", meterId: M1, params: {} }), d0)).status, 400);
  eq((await handle(new Request("https://fn.example", { method: "GET" }), d0)).status, 405);
  const pre = await handle(new Request("https://fn.example", { method: "OPTIONS", headers: { origin: "http://localhost:8430" } }), d0);
  eq(pre.headers.get("Access-Control-Allow-Origin"), "http://localhost:8430");
  const evil = await handle(new Request("https://fn.example", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), d0);
  eq(evil.headers.get("Access-Control-Allow-Origin"), "https://app.example");
});
