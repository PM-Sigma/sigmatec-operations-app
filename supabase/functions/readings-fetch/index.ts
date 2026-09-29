// Supabase Edge Function: readings-fetch
// Phase 0: mode "probe" - logs in to SpeedNet + DataSense and returns COUNTS of meters for a day.
//   body: { mode:'probe', date?:'YYYY-MM-DD' (default 2026-09-28), raw?:true }
// AUTH: X-Cron-Key == CRON_SECRET, OR a bridge JWT (ems-auth, iss 'ems-bridge') whose `name`
//   claim is in READINGS_USERS. Secrets: HULDA_SPEEDNET_USER/PASS, HULDA_DATASENSE_USER/PASS,
//   BROWSERLESS_TOKEN (+ optional BROWSERLESS_URL), JWT_SECRET / EMS_BRIDGE_SECRET.
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { appOrigin, cors, json, timingSafeEqual } from "../_shared/http.ts";
import { canUseReadings } from "../_shared/readingsRoster.js";
import { datasense, type DsQuery, type Reading, ReadingsError, speednet, speednetViaBrowser } from "./adapters.ts";

const SPEEDNET_SITE_ID = "28";
const DS_QUERIES: DsQuery[] = [
  { name: "חולדה חשמל חדש", kind: "tou", site_id: 1926, entity: "DailyReadingQueryElectricityView",
    entity_uid: "C7A6P362T902HE_DailyReadingQueryElectricityView", date_field: "LayerDate",
    columns: "Device,AmrNumber,ReadingDateTime,Reading_T,Reading_T1,Reading_T3,Consumption_T,Consumption_T1,Consumption_T3" },
  { name: "חולדה - חשמל (אפליקציית מים)", kind: "simple", site_id: 28, entity: "DailyReadingQueryView",
    entity_uid: "C7A2P73T122HE_DailyReadingQueryView", date_field: "LayerDateTime",
    columns: "Device,AmrNumber,ReadingDateTime,Reading" },
];

type Err = { code: string; message: string };
const errOf = (e: unknown): Err => e instanceof ReadingsError ? { code: e.code, message: e.message } : { code: "DOWN", message: "unexpected error" };
const timed = async <T>(f: () => Promise<T>): Promise<{ v?: T; err?: Err; ms: number }> => {
  const t = Date.now();
  try { return { v: await f(), ms: Date.now() - t }; } catch (e) { return { err: errOf(e), ms: Date.now() - t }; }
};

Deno.serve(async (req) => {
  const reqOrigin = req.headers.get("origin") || "";
  const APP = appOrigin();
  const ORIGIN = (reqOrigin === APP || /^https:\/\/([a-z0-9-]+\.)?githack\.com$/.test(reqOrigin) || /^http:\/\/localhost(:\d+)?$/.test(reqOrigin)) ? reqOrigin : APP;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors(ORIGIN), "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-cron-key" } });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);

  // ---- auth ----
  const secret = Deno.env.get("CRON_SECRET");
  const cronKey = req.headers.get("x-cron-key");
  // ponytail: READINGS_PROBE_KEY = a one-time key for the Phase 0 probe; unset it after the check.
  const probeKey = Deno.env.get("READINGS_PROBE_KEY");
  const byCron = !!cronKey && ((!!secret && timingSafeEqual(cronKey, secret)) || (!!probeKey && timingSafeEqual(cronKey, probeKey)));
  if (!byCron) {
    const jwtSecret = Deno.env.get("JWT_SECRET") || Deno.env.get("EMS_BRIDGE_SECRET") || "";
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwtSecret || !bearer) return json({ error: "unauthorized" }, 401, ORIGIN);
    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const p = await verify(bearer, key) as Record<string, unknown>;
      if (p.iss !== "ems-bridge") return json({ error: "unauthorized" }, 401, ORIGIN);
      if (!canUseReadings(p.name)) return json({ error: "forbidden" }, 403, ORIGIN);
    } catch { return json({ error: "unauthorized" }, 401, ORIGIN); }
  }

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (body.mode !== "probe") return json({ error: "unknown mode" }, 400, ORIGIN);
  const date = String(body.date || "2026-09-28");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad date" }, 400, ORIGIN);

  const env = (n: string) => Deno.env.get(n) || "";
  const need = ["HULDA_SPEEDNET_USER", "HULDA_SPEEDNET_PASS", "HULDA_DATASENSE_USER", "HULDA_DATASENSE_PASS", "BROWSERLESS_TOKEN"];
  const missing = need.filter((n) => !env(n));
  const noSn = missing.some((m) => m.startsWith("HULDA_SPEEDNET") || m === "BROWSERLESS_TOKEN");
  const noDs = missing.some((m) => m.startsWith("HULDA_DATASENSE") || m === "BROWSERLESS_TOKEN");

  const [sn, ds] = await Promise.allSettled([
    noSn ? Promise.resolve(null) : timed(() => (body.snDirect ? speednet(env("HULDA_SPEEDNET_USER"), env("HULDA_SPEEDNET_PASS"), SPEEDNET_SITE_ID, date)
      : speednetViaBrowser(env("HULDA_SPEEDNET_USER"), env("HULDA_SPEEDNET_PASS"), SPEEDNET_SITE_ID, date, env("BROWSERLESS_TOKEN")))),
    noDs ? Promise.resolve(null) : timed(() => datasense(env("HULDA_DATASENSE_USER"), env("HULDA_DATASENSE_PASS"), DS_QUERIES, date, env("BROWSERLESS_TOKEN"))),
  ]);
  const fail: { v?: undefined; err?: Err; ms: number } = { err: { code: "DOWN", message: "unexpected error" }, ms: 0 };
  const snr = sn.status === "fulfilled" ? sn.value : fail;
  const dsr = ds.status === "fulfilled" ? ds.value : fail;

  const snRows: Reading[] = (snr?.v as Reading[] | undefined) || [];
  const dsRows: Reading[][] = (dsr?.v as Reading[][] | undefined) || [];
  const out: Record<string, unknown> = {
    ok: missing.length === 0 && !snr?.err && !dsr?.err,
    date,
    speednet: {
      count: snRows.length, ms: snr?.ms ?? 0, sampleSerials: snRows.slice(0, 3).map((r) => r.meter),
      ...(snr?.err ? { error: snr.err } : {}),
    },
    datasense: DS_QUERIES.map((q, i) => ({ name: q.name, count: dsRows[i]?.length ?? 0 })),
    datasenseMs: dsr?.ms ?? 0,
    ...(dsr?.err ? { error: dsr.err } : {}),
    ...(missing.length ? { missingSecrets: missing } : {}),
  };
  if (body.raw === true) out.raw = { speednet: snRows, datasense: dsRows };
  return json(out, 200, ORIGIN);
});
