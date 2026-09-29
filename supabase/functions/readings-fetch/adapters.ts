// Meter-reading source adapters (SpeedNet, DataSense). Port of miltel_daily.py.
// Errors are ReadingsError with a code; messages never contain credentials.

export type ErrCode = "AUTH" | "DOWN" | "CHANGED" | "QUOTA" | "STALE";
export class ReadingsError extends Error {
  constructor(public code: ErrCode, message: string) { super(message); this.name = "ReadingsError"; }
}

export interface Reading {
  meter: string; when: string; expect: string[];
  ft?: number | null; f1?: number | null; f2?: number | null; f3?: number | null;
  amr?: string; query?: string; day_split_gap?: number; day_ct?: number;
}

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- SpeedNet ----------
const SN = "https://www.myspeednet.net/Scripts9/mgrqispi94.dll";

function decode(buf: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1255").decode(buf); }
}

/** Minimal cookie jar (Deno fetch has none). */
class Jar {
  private c = new Map<string, string>();
  add(res: Response) {
    // deno-lint-ignore no-explicit-any
    const list: string[] = (res.headers as any).getSetCookie?.() ?? [];
    for (const s of list) {
      const [kv] = s.split(";");
      const i = kv.indexOf("=");
      if (i > 0) this.c.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
}

async function snFetch(jar: Jar, url: string, init: RequestInit = {}, ms = 60000): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try {
    const headers = new Headers(init.headers);
    const ck = jar.header();
    if (ck) headers.set("Cookie", ck);
    const res = await fetch(url, { ...init, headers, signal: ac.signal, redirect: "manual" });
    jar.add(res);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      return snFetch(jar, new URL(res.headers.get("location")!, url).toString(), { method: "GET", headers: init.headers }, ms);
    }
    if (res.status >= 500) throw new ReadingsError("DOWN", `SpeedNet HTTP ${res.status}`);
    return res;
  } catch (e) {
    if (e instanceof ReadingsError) throw e;
    throw new ReadingsError("DOWN", "SpeedNet unreachable");
  } finally { clearTimeout(id); }
}

const form = (o: Record<string, string>) => ({
  method: "POST", body: new URLSearchParams(o),
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
});

async function snLogin(user: string, pass: string): Promise<Jar> {
  const jar = new Jar();
  const r = await snFetch(jar, SN, form({
    AppName: "MySpeedNet", PrgName: "login", Arguments: "ID,pws,type,ipaddress",
    ID: user, pws: pass, type: "W", ipaddress: "",
  }));
  const t = decode(await r.arrayBuffer());
  if (!/name="MG_UserID"\s*>\s*(\d+)/.test(t)) {
    if (t.includes("Invalid User ID")) throw new ReadingsError("AUTH", "SpeedNet: bad user/password");
    throw new ReadingsError("CHANGED", "SpeedNet: sites page not returned");
  }
  return jar;
}

const ymd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const p2 = (n: number) => String(n).padStart(2, "0");
const us = (d: Date) => `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${d.getUTCFullYear()}`; // MM/DD/YYYY
const dmy = (d: Date) => `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCFullYear() % 100)}`; // DD-MM-YY

function parseCsv(text: string): string[][] {
  // Simple CSV with optional double quotes (matches python csv.reader for this export).
  return text.split(/\r?\n/).filter((l) => l.length).map((l) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

/**
 * End-of-day readings for `day`. The export of D+1 carries the ~00:30 reading = end of day D.
 * Deviation from Python: retry sleeps are 2+3*attempt s (Python 3+5*attempt) so the worst case
 * stays inside the Edge Function wall-clock budget (~100 s incl. requests).
 */
export async function speednet(user: string, pass: string, siteId: string, day: string): Promise<Reading[]> {
  const jar = await snLogin(user, pass);
  const d = ymd(day), nxt = addDays(d, 1);
  const want = new Set([dmy(d), dmy(nxt)]);
  let text = "", fresh = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    // POST + a FromDate that changes every attempt: an identical GET is served from Sucuri's cache.
    const from = addDays(nxt, -(31 + attempt + (Math.floor(Date.now() / 1000) % 7)));
    const r = await snFetch(jar, SN, form({
      APPNAME: "MySpeedNet", PrgName: "meterReading", Arguments: "SiteID,FromDate,ToDate,ExportDate,Button",
      SiteID: siteId, FromDate: us(from), ToDate: us(nxt), ExportDate: us(nxt), Button: "E",
    }), 90000);
    const m = /url=([^"'>\s]+)/i.exec(decode(await r.arrayBuffer()));
    if (!m) throw new ReadingsError("CHANGED", "SpeedNet: no export url returned for site " + siteId);
    await sleep(2000 + 3000 * attempt);
    const u = new URL(m[1], SN);
    u.searchParams.set("nocache", String(Date.now() / 1000));
    const g = await snFetch(jar, u.toString(), { headers: { "Cache-Control": "no-cache" } }, 60000);
    text = decode(await g.arrayBuffer());
    const dates = parseCsv(text).filter((c) => c.length > 4).map((c) => c[2].trim());
    if (dates.length && dates.filter((x) => want.has(x)).length > dates.length / 2) { fresh = true; break; }
  }
  if (!fresh) throw new ReadingsError("STALE", "SpeedNet export never became fresh for " + day);
  const band: Record<string, "ft" | "f1" | "f2" | "f3"> = { T: "ft", T1: "f3", T2: "f2", T3: "f1" };
  const out = new Map<string, Reading>();
  for (const raw of parseCsv(text)) {
    const row = raw.map((c) => c.trim());
    if (row.length < 5 || !(row[4] in band)) continue;
    let rec = out.get(row[0]);
    if (!rec) { rec = { meter: row[0], when: row[2] + " " + row[3], expect: ["f1", "f2", "f3"] }; out.set(row[0], rec); }
    rec[band[row[4]]] = num(row[1]);
  }
  return [...out.values()];
}

// ---------- DataSense (via Browserless) ----------
export interface DsQuery {
  name: string; kind: "tou" | "simple"; site_id: number; entity: string; entity_uid: string;
  date_field: string; columns: string;
}

const dsWhere = (q: DsQuery, day: string) => [
  { f: "UserId", d: { t: "float", c: "eq", v: "U1SER" } }, // placeholders - required, else other customers' data
  { f: "CustomerId", d: { t: "float", c: "eq", v: "C3UST" } },
  { f: "SiteId", d: { t: "float", c: "EQ", v: q.site_id } },
  { f: q.date_field, d: { t: "date", c: "EQ", v: day + "T00:00:00" }, dbType: "DATE" },
];

// Runs inside Browserless' Chromium. Credentials arrive only via `context`.
const BROWSER_CODE = `export default async function ({ page, context }) {
  const { user, pass, jobs } = context;
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      await page.goto('https://datasense.net/', { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('input[name=UserName]', { timeout: 15000 });
      await page.type('input[name=UserName]', user);
      await page.type('input[name=UserPassword]', pass);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.href.includes('DataEntityAccess'), { timeout: 30000 });
      ok = true;
    } catch (e) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (!ok) return { data: { error: 'login' }, type: 'application/json' };
  const results = [];
  for (const j of jobs) {
    const res = await page.evaluate(async ([w, q]) => {
      const p = new URLSearchParams({ EntityName: q.entity, EntityUniqueId: q.entity_uid, whereJSON: JSON.stringify(w),
        orderJSON: '[]', selectColumns: q.columns, params: '', page: 1, start: 0, limit: 100000 });
      const r = await fetch('/DataEntityAccess/GetData?' + p, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      return [r.status, await r.text()];
    }, [j.where, j.q]);
    if (res[0] !== 200) { results.push({ status: res[0], rows: [] }); continue; }
    let rows = [];
    try { const parsed = JSON.parse(res[1]); rows = Object.values(parsed).find(v => Array.isArray(v)) || []; }
    catch (e) { results.push({ status: 'parse', rows: [] }); continue; }
    results.push({ status: 200, rows });
  }
  return { data: { results }, type: 'application/json' };
}`;

const dsWhen = (v: unknown): string => {
  const m = /\d+/.exec(String(v ?? ""));
  if (!m) return "";
  // Python used the box's local time; format in Asia/Jerusalem so Deno (UTC) matches.
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(Number(m[0]))).reduce((a, x) => (a[x.type] = x.value, a), {} as Record<string, string>);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
};

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export async function datasense(
  user: string, pass: string, queries: DsQuery[], day: string, browserlessToken: string,
): Promise<Reading[][]> {
  const base = Deno.env.get("BROWSERLESS_URL") || "https://production-sfo.browserless.io";
  const jobs = queries.map((q) => ({ where: dsWhere(q, day), q }));
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), 110000);
  let res: Response;
  try {
    res = await fetch(`${base}/function?token=${encodeURIComponent(browserlessToken)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ac.signal,
      body: JSON.stringify({ code: BROWSER_CODE, context: { user, pass, jobs } }),
    });
  } catch { throw new ReadingsError("DOWN", "Browserless unreachable"); }
  finally { clearTimeout(id); }
  if ([401, 402, 403, 429].includes(res.status)) {
    await res.body?.cancel();
    throw new ReadingsError("QUOTA", "Browserless rejected the request (HTTP " + res.status + ")");
  }
  if (!res.ok) { await res.body?.cancel(); throw new ReadingsError("DOWN", "Browserless HTTP " + res.status); }
  // deno-lint-ignore no-explicit-any
  let j: any;
  try { j = await res.json(); } catch { throw new ReadingsError("CHANGED", "Browserless returned non-JSON"); }
  if (j?.error === "login") throw new ReadingsError("AUTH", "DataSense: login failed 3 times (bad user/password or site down)");
  if (!Array.isArray(j?.results)) throw new ReadingsError("CHANGED", "Browserless: unexpected response shape");
  return queries.map((q, i) => {
    const r = j.results[i];
    if (!r || r.status !== 200) throw new ReadingsError(r?.status === "parse" ? "CHANGED" : "DOWN", `DataSense query "${q.name}" failed (${r?.status})`);
    return (r.rows as Row[]).map((row): Reading => {
      const rec: Reading = { meter: String(row.Device ?? ""), amr: String(row.AmrNumber ?? ""), when: dsWhen(row.ReadingDateTime), query: q.name, expect: [] };
      if (q.kind === "tou") {
        // T=total, T1=low (f3), T3=peak (f1); no shoulder -> f2 empty.
        Object.assign(rec, { ft: num(row.Reading_T), f3: num(row.Reading_T1), f1: num(row.Reading_T3), expect: ["f1", "f3"] });
        const ct = num(row.Consumption_T), c1 = num(row.Consumption_T1), c3 = num(row.Consumption_T3);
        if (ct !== null && c1 !== null && c3 !== null) {
          rec.day_split_gap = Math.round((ct - c1 - c3) * 1000) / 1000;
          rec.day_ct = ct;
        }
      } else rec.ft = num(row.Reading);
      return rec;
    });
  });
}
