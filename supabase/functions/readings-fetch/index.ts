// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: readings-fetch - daily meter-readings pull (SpeedNet + DataSense) -> 2 xlsx files.
// Spec: docs/superpowers/specs/2026-09-29-readings-pull-design.md   Tables: db/readings_pull.sql
//
// Supabase FREE plan: every invocation must end < 150 s, so a run fans out:
//   run -> (one self-call per source: mode 'source', acked at once, the work continues in waitUntil)
//       -> the LAST source to finish (atomic RPC readings_source_done) builds the files inline.
//
// MODES (body.mode)                                  AUTH
//   run          {kibbutz|site_id, date}              user or cron   -> {run_id}
//   source       {run_id, source_id}                  cron key only  (internal fan-out)
//   build        {run_id}                             cron key only  (internal; re-build a finished run)
//   emsCheck     {run_id, ems_token}                  user (JWT)     -> validates the upload rows against EMS, rebuilds files
//   sign         {run_id, kind:'readings'|'exceptions'} user or cron -> {url}
//   retrySource  {run_id, source_id}                  user or cron
//   markUploaded {run_id, uploaded}                   user
//   emsSync      {kibbutz|site_id, ems_token}         user (JWT)     -> marks runs whose readings are already in EMS
//   seen         {run_id}                             user
//   cron         {}                                   cron key only  (pg_cron, db/cron_readings_7am.sql)
//   probe        {date?, raw?}                        user or cron   (Phase 0 feasibility check)
// AUTH: X-Cron-Key == CRON_SECRET, or a bridge JWT (iss 'ems-bridge') carrying a staff `name` claim and not a viewer pass (canUseReadings).
// Secrets: <secret_prefix>_USER/_PASS per source, BROWSERLESS_TOKEN, CRON_SECRET, JWT_SECRET/EMS_BRIDGE_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMS_API_BASE. NEVER log or store credentials or the ems_token.
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// ponytail: npm build (0.18.5) — the Supabase bundler refuses cdn.sheetjs.com; bump if a newer npm release ships
import * as XLSX from "npm:xlsx@0.18.5";
import { appOrigin, cors, fetchT, json, timingSafeEqual } from "../_shared/http.ts";
import { canUseReadings } from "../_shared/readingsRoster.js";
import { datasense, type DsQuery, type Reading, ReadingsError, speednet, speednetViaBrowser } from "./adapters.ts";
import { applyEmsValidation, buildRun } from "./logic.js";
import {
  addDaysIso, badRunDate, cronDecision, cronWindowOpen, dedupeDecision, emsSyncDecision,
  errText, fileNames, israelNow, israelYesterday, retentionCutoff, runStatus, STUCK_MS, storagePaths, valuesCutoff,
} from "./helpers.js";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const EMS_BASE = () => Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
const env = (n: string) => Deno.env.get(n) || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Err = { code: string; message: string };
const errOf = (e: unknown): Err => {
  const code = e instanceof ReadingsError ? e.code : "DOWN";
  return { code, message: errText(code) };
};
class Fail extends Error {
  constructor(public status: number, public payload: Record<string, unknown>) { super("fail"); }
}

const fireHeaders = () => ({
  "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "x-cron-key": env("CRON_SECRET"),
});

/** Fire-and-forget: POST to this same function; the callee acks at once and works in its own waitUntil. */
function fireSource(run_id: string, source_id: string) {
  const p = fetch(`${SB_URL}/functions/v1/readings-fetch`, {
    method: "POST", headers: fireHeaders(), body: JSON.stringify({ mode: "source", run_id, source_id }),
  }).then((r) => r.body?.cancel()).catch(() => {});
  EdgeRuntime.waitUntil(p);
}

async function notifyDone(run_id: string) {
  try {
    const r = await fetchT(`${SB_URL}/functions/v1/push-send`, {
      method: "POST", headers: fireHeaders(), body: JSON.stringify({ mode: "readingsDone", run_id }),
    }, 20000);
    await r.body?.cancel();
  } catch { /* a missing push must never fail a run */ }
}

// ───────────────────────── sites / sources ─────────────────────────
async function getSite(body: any) {
  let q = sb.from("reading_sites").select("*");
  if (body.site_id && UUID.test(String(body.site_id))) q = q.eq("id", body.site_id);
  else if (body.kibbutz) q = q.eq("kibbutz", String(body.kibbutz));
  else throw new Fail(400, { error: "kibbutz or site_id required" });
  const { data } = await q.maybeSingle();
  if (!data) throw new Fail(404, { error: "site not found" });
  return data as any;
}
const getSources = async (siteId: string) =>
  ((await sb.from("reading_sources").select("*").eq("site_id", siteId).order("sort")).data || []) as any[];

async function getRun(id: unknown, cols = "*") {
  if (!UUID.test(String(id))) throw new Fail(400, { error: "bad run_id" });
  const { data } = await sb.from("reading_runs").select(cols).eq("id", id).maybeSingle();
  if (!data) throw new Fail(404, { error: "run not found" });
  return data as any;
}

// ───────────────────────── run / retry ─────────────────────────
async function startRun(site: any, date: string, trigger: "cron" | "manual", by: string | null) {
  const { data: running } = await sb.from("reading_runs").select("id,started_at")
    .eq("site_id", site.id).eq("reading_date", date).eq("status", "running");
  const dd = dedupeDecision(running || []);
  for (const id of dd.stale) {
    await sb.from("reading_runs").update({ status: "failed", error: "הריצה נתקעה", finished_at: new Date().toISOString() }).eq("id", id);
    EdgeRuntime.waitUntil(notifyDone(id));
  }
  if (dd.existing) return { run_id: dd.existing.id as string, existing: true };
  const sources = await getSources(site.id);
  const progress = Object.fromEntries(sources.map((s) => [s.name, { state: "pending" }]));
  const ins = await sb.from("reading_runs").insert({
    site_id: site.id, reading_date: date, trigger, started_by: by, progress,
    ...(sources.length ? {} : { status: "failed", error: "אין מקורות מוגדרים לאתר", finished_at: new Date().toISOString() }),
  }).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505") { // lost a race with another starter -> return theirs
      const { data: again } = await sb.from("reading_runs").select("id").eq("site_id", site.id).eq("reading_date", date).eq("status", "running").maybeSingle();
      if (again) return { run_id: again.id as string, existing: true };
    }
    throw new Fail(500, { error: "could not start run" });
  }
  const run_id = ins.data.id as string;
  for (const s of sources) fireSource(run_id, s.id);
  return { run_id, existing: false };
}

/** Re-run some sources of a finished run. sourceIds=null -> every source that is not ok. */
async function restart(run_id: string, sourceIds: string[] | null, bumpAttempt: boolean) {
  const run = await getRun(run_id);
  if (run.status === "running") throw new Fail(409, { error: "RUNNING", message: "הריצה עדיין פעילה" });
  const sources = await getSources(run.site_id);
  const pick = sources.filter((s) => sourceIds ? sourceIds.includes(s.id) : run.progress?.[s.name]?.state !== "ok");
  if (!pick.length) return { run_id, started: 0 };
  const progress = { ...(run.progress || {}) };
  for (const s of pick) progress[s.name] = { state: "pending" };
  const raw = { ...(run.raw || {}) };
  delete raw._claim;
  const { error } = await sb.from("reading_runs").update({
    status: "running", progress, raw, finished_at: null, error: null, started_at: new Date().toISOString(),
    attempt: (run.attempt || 1) + (bumpAttempt ? 1 : 0),
  }).eq("id", run_id).neq("status", "running");
  if (error) throw new Fail(409, { error: "RUNNING", message: "כבר רצה משיכה לאותו תאריך" });
  for (const s of pick) fireSource(run_id, s.id);
  return { run_id, started: pick.length };
}

// ───────────────────────── one source ─────────────────────────
async function pullSource(src: any, date: string): Promise<Reading[]> {
  const user = env(src.secret_prefix + "_USER"), pass = env(src.secret_prefix + "_PASS"), token = env("BROWSERLESS_TOKEN");
  if (!user || !pass) throw new ReadingsError("AUTH", "credentials not configured");
  const params = src.params || {};
  const t0 = Date.now();
  for (let i = 0;; i++) {
    try {
      if (src.type === "speednet") {
        if (!params.via_browser) return await speednet(user, pass, String(params.site_id), date);
        if (!token) throw new ReadingsError("DOWN", "no browserless token");
        const proxy = typeof params.proxy === "string" && /^(&\w+=[\w.-]+)*$/.test(params.proxy) ? params.proxy : undefined;
        return await speednetViaBrowser(user, pass, String(params.site_id), date, token, proxy);
      }
      if (!token) throw new ReadingsError("DOWN", "no browserless token");
      return (await datasense(user, pass, params.queries as DsQuery[], date, token)).flat();
    } catch (e) {
      // Browserless free plan may allow one concurrent session: the second source waits and retries on 429.
      if (e instanceof ReadingsError && e.code === "QUOTA" && /429/.test(e.message) && i < 2 && Date.now() - t0 < 50000) {
        await sleep(15000);
        continue;
      }
      throw e;
    }
  }
}

async function runSource(run_id: string, source_id: string) {
  const run = await getRun(run_id, "id,site_id,reading_date,status");
  if (run.status !== "running") return;
  const sources = await getSources(run.site_id);
  const src = sources.find((s) => s.id === source_id);
  if (!src) return;
  const names = sources.map((s) => s.name);
  await sb.rpc("readings_source_done", { p_run: run_id, p_source: src.name, p_progress: { state: "running" }, p_rows: null, p_names: names });
  let claimed = false;
  try {
    const rows = await pullSource(src, run.reading_date);
    const r = await sb.rpc("readings_source_done", { p_run: run_id, p_source: src.name, p_progress: { state: "ok", count: rows.length }, p_rows: rows, p_names: names });
    claimed = r.data === true;
  } catch (e) {
    const er = errOf(e);
    console.error("source failed", src.name, er.code);
    const r = await sb.rpc("readings_source_done", { p_run: run_id, p_source: src.name, p_progress: { state: "failed", error: er }, p_rows: null, p_names: names });
    claimed = r.data === true;
  }
  if (claimed) await buildFor(run_id);
}

// ───────────────────────── build ─────────────────────────
async function pageAll(make: (from: number, to: number) => PromiseLike<{ data: any[] | null }>) {
  const out: any[] = [];
  for (let from = 0;; from += 1000) {
    const { data } = await make(from, from + 999);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function loadHistory(siteId: string, date: string) {
  const rows = await pageAll((a, b) =>
    sb.from("reading_values").select("serial,reading_date,ft,f1,f2,f3")
      .eq("site_id", siteId).gte("reading_date", addDaysIso(date, -40)).lt("reading_date", date)
      .order("reading_date").order("serial").range(a, b)
  );
  const byDate = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const v = byDate.get(r.reading_date) || {};
    v[r.serial] = { ft: r.ft, f1: r.f1, f2: r.f2, f3: r.f3 };
    byDate.set(r.reading_date, v);
  }
  return [...byDate].map(([d, values]) => ({ date: d, values }));
}

const UPLOAD_HEAD = ["serialNumber", "energyTypeCode", "entryMode", "readingDate", "ft", "f1", "f2", "f3", "rt", "r1", "r2", "r3"];
const ALL_HEAD = ["מקור", "מונה באתר", "AMR", "מספר סידורי", "זמן קריאה", 'סה"כ (ft)', "פסגה (f1)", "גבע (f2)", "שפל (f3)", "סטטוס"];
const EXC_HEAD = ["מקור", "מונה באתר", "מספר סידורי", "זמן קריאה", 'סה"כ (ft)', "סוג", "סיבה"];
const SUM_HEAD = ["סוג", "סיבה", "כמות"];

function mkSheet(head: string[], rows: unknown[][]) {
  const aoa = [head, ...rows.map((r) => r.map((v) => (v === undefined ? null : v)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = head.map((h) => ({ wch: h === "סיבה" ? 60 : 16 }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: head.length - 1 } }) };
  return ws;
}
// RTL is a workbook-level view in SheetJS CE (applies to every sheet): on for the all-Hebrew exceptions file, off for
// the upload file (whose first sheet is machine-read by EMS).
function toBytes(sheets: [string, any][], rtl: boolean): Uint8Array {
  const wb: any = XLSX.utils.book_new();
  if (rtl) wb.Workbook = { Views: sheets.map(() => ({ RTL: true })) };
  for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
/** serialNumber / readingDate stay TEXT cells (strings); numbers stay numbers; null -> empty cell. */
const uploadRows = (upload: any[][]) => upload.map((r) => r.map((v, i) => (i === 0 || i === 3 ? String(v) : v)));

/** Build both xlsx from a buildRun/applyEmsValidation result, store them, and update the run row's result columns. */
async function publishFiles(run: any, site: any, built: any, extra: Record<string, unknown>, builtPatch: Record<string, unknown> = {}) {
  const paths = storagePaths(site.id, run.reading_date, run.id);
  const f1 = toBytes([["Upload Readings", mkSheet(UPLOAD_HEAD, uploadRows(built.upload))], ["קריאות", mkSheet(ALL_HEAD, built.all)]], false);
  const f2 = toBytes([["חריגות", mkSheet(EXC_HEAD, built.exceptions)], ["סיכום", mkSheet(SUM_HEAD, built.summary)]], true);
  for (const [p, b] of [[paths.readings, f1], [paths.exceptions, f2]] as [string, Uint8Array][]) {
    const { error } = await sb.storage.from("readings").upload(p, b, { contentType: XLSX_MIME, upsert: true });
    if (error) throw new Error("storage upload failed");
  }
  // `raw` (with _built = what emsCheck / emsSync need later) is not readable by clients
  const { data: cur } = await sb.from("reading_runs").select("raw").eq("id", run.id).single();
  const raw = { ...(cur?.raw || {}) } as Record<string, any>;
  raw._built = { ...(raw._built || {}), ...builtPatch, finalSerials: built.upload.map((r: any[]) => String(r[0])) };
  await sb.from("reading_runs").update({
    raw, n_ok: built.counts.ok, n_blocked: built.counts.blocked, n_warn: built.counts.warn,
    summary: built.summary, exceptions: built.exceptions, readings_file: paths.readings, exceptions_file: paths.exceptions, ...extra,
  }).eq("id", run.id);
}

/** reading_values snapshot of the uploaded rows: a re-run of D overwrites D (delete + insert). */
async function saveValues(site: any, run: any, built: any) {
  await sb.from("reading_values").delete().eq("site_id", site.id).eq("reading_date", run.reading_date);
  const rows = built.upload.map((r: any[], i: number) => ({
    site_id: site.id, serial: String(r[0]), reading_date: run.reading_date,
    ft: r[4], f1: r[5], f2: r[6], f3: r[7], taken_at: built.uploadMeta?.[i]?.[2] || null, run_id: run.id,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await sb.from("reading_values").upsert(rows.slice(i, i + 500), { onConflict: "site_id,serial,reading_date" });
  }
}

async function buildFor(run_id: string) {
  try {
    const run = await getRun(run_id);
    const site = (await sb.from("reading_sites").select("*").eq("id", run.site_id).single()).data as any;
    const sources = await getSources(site.id);
    const names = sources.map((s) => s.name);
    const progress = run.progress || {};
    const input = sources.map((s) => ({
      name: s.name, ok: progress[s.name]?.state === "ok", rows: run.raw?.[s.name] || [], error: progress[s.name]?.error,
    }));
    const built = buildRun({
      day: run.reading_date, sources: input, rules: site.rules || {},
      history: (await loadHistory(site.id, run.reading_date)) as any,
    });
    await publishFiles(run, site, built, {
      status: runStatus(progress, names), finished_at: new Date().toISOString(), error: null,
      ems_checked: false, ems_checked_by: null, ems_checked_at: null,
    }, { upload: built.upload, uploadMeta: built.uploadMeta, all: built.all, exceptions: built.exceptions });
    await saveValues(site, run, built);
  } catch (e) {
    console.error("build failed", (e as Error)?.message);
    await sb.from("reading_runs").update({ status: "failed", error: "שגיאה בבניית הקבצים", finished_at: new Date().toISOString() }).eq("id", run_id);
  }
  await notifyDone(run_id);
}

// ───────────────────────── EMS ─────────────────────────
const emsRow = (r: any[]) => {
  const o: Record<string, unknown> = {};
  UPLOAD_HEAD.forEach((k, i) => {
    if (r[i] !== null && r[i] !== undefined) o[k] = k === "serialNumber" || k === "readingDate" ? String(r[i]) : r[i];
  });
  return o;
};
const unwrap = (j: any) => (j && !Array.isArray(j) && j.data !== undefined ? j.data : j);
const EMS_AUTH = { error: "EMS_AUTH", message: "אין הרשאת EMS לבדיקה" };
const EMS_DOWN = { error: "EMS_DOWN", message: "EMS לא זמין כרגע" };

async function emsCheck(run_id: string, token: string, who: string) {
  if (!token) return EMS_AUTH;
  const run = await getRun(run_id);
  if (run.status === "running") throw new Fail(409, { error: "RUNNING", message: "הריצה עדיין פעילה" });
  const base = run.raw?._built;
  if (!base?.upload) throw new Fail(409, { error: "NOT_BUILT", message: "אין קבצים לבדיקה" });
  const site = (await sb.from("reading_sites").select("*").eq("id", run.site_id).single()).data as any;
  const auth = { Authorization: "Bearer " + token };
  let results: any;
  try {
    const r = await fetchT(EMS_BASE() + "/v1/upload-readings/validate", {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ rows: base.upload.map(emsRow) }),
    }, 60000);
    if (r.status === 401 || r.status === 403) { await r.body?.cancel(); return EMS_AUTH; }
    if (!r.ok) { await r.body?.cancel(); return EMS_DOWN; }
    results = unwrap(await r.json());
  } catch { return EMS_DOWN; }
  if (!Array.isArray(results)) return EMS_DOWN;
  let emsMeters: string[] | undefined;
  try {
    if (site.ems_site_id) {
      const m = await fetchT(`${EMS_BASE()}/v1/upload-readings/meters?siteId=${encodeURIComponent(site.ems_site_id)}&energyTypeCode=1`, { headers: auth }, 30000);
      if (m.ok) {
        const arr = unwrap(await m.json());
        if (Array.isArray(arr)) emsMeters = arr.map((x: any) => String(x.serialNumber));
      } else await m.body?.cancel();
    }
  } catch { /* without the meters list the validate results (METER_NOT_FOUND) still block unknown meters */ }
  const built = applyEmsValidation(
    { upload: base.upload, uploadMeta: base.uploadMeta, all: base.all, exceptions: base.exceptions }, results, { ...(emsMeters ? { emsMeters } : {}), kibbutz: site.kibbutz },
  );
  await publishFiles(run, site, built, { ems_checked: true, ems_checked_by: who, ems_checked_at: new Date().toISOString() });
  await saveValues(site, run, built);
  return { ok: true, n_ok: built.counts.ok, n_blocked: built.counts.blocked, n_warn: built.counts.warn };
}

async function emsSync(site: any, token: string) {
  if (!token) return EMS_AUTH;
  if (!site.ems_site_id) return { marked: [] };
  const m = await fetchT(`${EMS_BASE()}/v1/upload-readings/meters?siteId=${encodeURIComponent(site.ems_site_id)}&energyTypeCode=1`,
    { headers: { Authorization: "Bearer " + token } }, 30000).catch(() => null);
  if (!m) return EMS_DOWN;
  if (m.status === 401 || m.status === 403) { await m.body?.cancel(); return EMS_AUTH; }
  if (!m.ok) { await m.body?.cancel(); return EMS_DOWN; }
  const arr = unwrap(await m.json());
  if (!Array.isArray(arr)) return EMS_DOWN;
  const last: Record<string, string | null> = {};
  for (const x of arr) last[String(x.serialNumber)] = x.lastReadingDate || null;
  const { data: runs } = await sb.from("reading_runs").select("id,reading_date,serials:raw->_built->finalSerials")
    .eq("site_id", site.id).in("status", ["ok", "partial"]).eq("uploaded", false)
    .gte("reading_date", addDaysIso(israelNow().date, -35));
  const marked: string[] = [];
  for (const r of (runs || []) as any[]) {
    if (!Array.isArray(r.serials) || !emsSyncDecision(r.serials, last, r.reading_date)) continue;
    await sb.from("reading_runs").update({ uploaded: true, uploaded_source: "auto", uploaded_by: "EMS", uploaded_at: new Date().toISOString() }).eq("id", r.id);
    marked.push(r.reading_date);
  }
  return { marked };
}

// ───────────────────────── cron maintenance ─────────────────────────
async function maintenance(now: Date) {
  const cut = new Date(now.getTime() - STUCK_MS).toISOString();
  const { data: stuck } = await sb.from("reading_runs").select("id").eq("status", "running").lt("started_at", cut);
  for (const r of stuck || []) {
    await sb.from("reading_runs").update({ status: "failed", error: "הריצה נתקעה", finished_at: now.toISOString() }).eq("id", r.id).eq("status", "running");
    await notifyDone(r.id);
  }
  const { data: sites } = await sb.from("reading_sites").select("id,retention_days");
  let deleted = 0;
  for (const s of sites || []) {
    const { data: old } = await sb.from("reading_runs").select("id,readings_file,exceptions_file")
      .eq("site_id", s.id).lt("reading_date", retentionCutoff(now, s.retention_days || 35));
    if (!old?.length) continue;
    const files = old.flatMap((r: any) => [r.readings_file, r.exceptions_file]).filter(Boolean);
    if (files.length) await sb.storage.from("readings").remove(files);
    await sb.from("reading_runs").delete().in("id", old.map((r: any) => r.id));
    deleted += old.length;
  }
  await sb.from("reading_values").delete().lt("reading_date", valuesCutoff(now));
  return { stuck: (stuck || []).length, deleted };
}

async function cron() {
  const now = new Date();
  const maint = await maintenance(now);
  if (!cronWindowOpen(now)) return { ok: true, skipped: "outside 07:00-08:45 Israel", ...maint };
  const y = israelYesterday(now);
  const { data: sites } = await sb.from("reading_sites").select("*").eq("active", true);
  const acted: Record<string, string> = {};
  for (const site of sites || []) {
    const { data: runs } = await sb.from("reading_runs").select("id,trigger,status,attempt,started_at").eq("site_id", site.id).eq("reading_date", y);
    const d = cronDecision(runs || []);
    try {
      if (d.action === "run") await startRun(site, y, "cron", null);
      else if (d.action === "retry") await restart(d.run.id, null, true);
    } catch (e) { console.error("cron action failed", site.kibbutz, (e as any)?.payload?.error || (e as Error).message); }
    acted[site.kibbutz] = d.action;
  }
  return { ok: true, date: y, acted, ...maint };
}

// ───────────────────────── Phase 0 probe (counts only, no credentials) ─────────────────────────
async function probe(body: any, J: (b: unknown, s?: number) => Response) {
  const date = String(body.date || "2026-09-28");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return J({ error: "bad date" }, 400);
  const site = (await sb.from("reading_sites").select("*").eq("kibbutz", "חולדה").maybeSingle()).data as any;
  const sources = site ? await getSources(site.id) : [];
  const out: Record<string, any> = { date, sources: {} };
  await Promise.all(sources.map(async (s) => {
    const t = Date.now();
    try {
      const rows = await pullSource(s, date);
      out.sources[s.name] = { count: rows.length, ms: Date.now() - t, ...(body.raw === true ? { rows } : {}) };
    } catch (e) { out.sources[s.name] = { error: errOf(e), ms: Date.now() - t }; }
  }));
  return J(out);
}

// ───────────────────────── HTTP ─────────────────────────
Deno.serve(async (req) => {
  const reqOrigin = req.headers.get("origin") || "";
  const APP = appOrigin();
  const ORIGIN = (reqOrigin === APP || /^https:\/\/([a-z0-9-]+\.)?githack\.com$/.test(reqOrigin) || /^http:\/\/localhost(:\d+)?$/.test(reqOrigin)) ? reqOrigin : APP;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors(ORIGIN), "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-cron-key" } });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  const J = (b: unknown, s = 200) => json(b, s, ORIGIN);

  // ---- auth ----
  const secret = Deno.env.get("CRON_SECRET");
  const cronKey = req.headers.get("x-cron-key");
  const byCron = !!cronKey && !!secret && timingSafeEqual(cronKey, secret);
  let name: string | null = null;
  if (!byCron) {
    const jwtSecret = Deno.env.get("JWT_SECRET") || Deno.env.get("EMS_BRIDGE_SECRET") || "";
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwtSecret || !bearer) return J({ error: "unauthorized" }, 401);
    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const p = await verify(bearer, key) as Record<string, unknown>;
      if (p.iss !== "ems-bridge") return J({ error: "unauthorized" }, 401);
      if (!canUseReadings(p)) return J({ error: "forbidden" }, 403);
      name = String(p.name).trim();
    } catch { return J({ error: "unauthorized" }, 401); }
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const mode = String(body.mode || "");
  const cronOnly = () => { if (!byCron) throw new Fail(403, { error: "forbidden" }); };
  const userOnly = () => { if (!name) throw new Fail(403, { error: "forbidden" }); };

  try {
    switch (mode) {
      case "run": {
        const bad = badRunDate(body.date);
        if (bad) return J({ error: "BAD_DATE", message: bad }, 400);
        const site = await getSite(body);
        const r = await startRun(site, body.date, byCron ? "cron" : "manual", name);
        return J({ run_id: r.run_id, existing: r.existing });
      }
      case "source": {
        cronOnly();
        if (!UUID.test(String(body.run_id)) || !UUID.test(String(body.source_id))) return J({ error: "bad ids" }, 400);
        EdgeRuntime.waitUntil(runSource(body.run_id, body.source_id).catch((e) => console.error("runSource", (e as Error)?.message)));
        return J({ accepted: true }, 202);
      }
      case "build": {
        cronOnly();
        await getRun(body.run_id, "id");
        EdgeRuntime.waitUntil(buildFor(body.run_id));
        return J({ accepted: true }, 202);
      }
      case "emsCheck": {
        userOnly();
        return J(await emsCheck(body.run_id, String(body.ems_token || ""), name!));
      }
      case "sign": {
        const run = await getRun(body.run_id, "id,site_id,reading_date,readings_file,exceptions_file");
        const kind = body.kind === "exceptions" ? "exceptions" : body.kind === "readings" ? "readings" : null;
        if (!kind) return J({ error: "bad kind" }, 400);
        const path = kind === "readings" ? run.readings_file : run.exceptions_file;
        if (!path) return J({ error: "NO_FILE", message: "אין קובץ לריצה הזו" }, 404);
        const site = (await sb.from("reading_sites").select("kibbutz").eq("id", run.site_id).single()).data as any;
        const { data, error } = await sb.storage.from("readings").createSignedUrl(path, 3600, { download: fileNames(run.reading_date, site.kibbutz)[kind] });
        if (error || !data) return J({ error: "SIGN_FAILED", message: "לא ניתן להוריד את הקובץ" }, 500);
        return J({ url: data.signedUrl });
      }
      case "retrySource": {
        if (!UUID.test(String(body.source_id))) return J({ error: "bad source_id" }, 400);
        return J(await restart(body.run_id, [body.source_id], false));
      }
      case "markUploaded": {
        userOnly();
        await getRun(body.run_id, "id");
        const up = body.uploaded === true;
        await sb.from("reading_runs").update(up
          ? { uploaded: true, uploaded_by: name, uploaded_at: new Date().toISOString(), uploaded_source: "manual" }
          : { uploaded: false, uploaded_by: null, uploaded_at: null, uploaded_source: null }).eq("id", body.run_id);
        return J({ ok: true });
      }
      case "emsSync": {
        userOnly();
        return J(await emsSync(await getSite(body), String(body.ems_token || "")));
      }
      case "seen": {
        userOnly();
        const run = await getRun(body.run_id, "id,seen_by");
        const seen: string[] = run.seen_by || [];
        if (!seen.includes(name!)) await sb.from("reading_runs").update({ seen_by: [...seen, name] }).eq("id", run.id);
        return J({ ok: true });
      }
      case "cron": {
        cronOnly();
        return J(await cron());
      }
      case "probe":
        return await probe(body, J);
      default:
        return J({ error: "unknown mode" }, 400);
    }
  } catch (e) {
    if (e instanceof Fail) return J(e.payload, e.status);
    console.error("readings-fetch", mode, (e as Error)?.message);
    return J({ error: "SERVER", message: "שגיאה בשרת" }, 500);
  }
});
