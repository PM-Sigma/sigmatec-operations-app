// Supabase Edge Function: github
// Read-only proxy for the dev-tasks (פיתוח) view — fetches GitHub Issues from the company
// tickets repo with a read-only token, gated by a valid EMS login. View-only (phase 1).
//
// Secrets to set (Edge Functions → Secrets):
//   GH_TOKEN  — read-only GitHub token (fine-grained: Issues:Read on the repo, or classic `repo`).
//   GH_REPO   — owner/repo (default: Sigmatec-Energy/tasks).
//   EMS_API_BASE — (already set) https://api.sigmatec-ems.com
//   APP_ORIGIN   — allowed origin (default https://pm-sigma.github.io)
const cors = (o: string) => ({
  "Access-Control-Allow-Origin": o,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (b: unknown, s = 200, o = "*") =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

// fetch with a hard timeout — a slow upstream (EMS API / GitHub) must NOT make this function hang
// (that's what caused the multi-minute "cold/hanging" stall). Worst case now: it aborts and fails fast.
async function fetchT(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(id); }
}

async function emsValid(base: string, token: string): Promise<boolean> {
  if (!token) return false;
  try { const r = await fetchT(base + "/v1/employee-tasks?take=1", { headers: { Authorization: "Bearer " + token } }, 8000); return r.ok; }
  catch { return false; }
}

Deno.serve(async (req) => {
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const GH_TOKEN = Deno.env.get("GH_TOKEN") || "";
  const GH_REPO = Deno.env.get("GH_REPO") || "Sigmatec-Energy/tasks";
  const ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!GH_TOKEN) return json({ error: "GH_TOKEN not set" }, 500, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  try {
    const state = body.state === "all" ? "all" : (body.state === "closed" ? "closed" : "open");
    let items: any[] = [];
    for (let page = 1; page <= 10; page++) {   // paginate (GitHub caps per_page at 100)
      const r = await fetchT(
        `https://api.github.com/repos/${GH_REPO}/issues?state=${state}&per_page=100&page=${page}&sort=created&direction=desc`,
        { headers: { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "sigmatec-ops" } },
        12000,
      );
      if (!r.ok) return json({ error: "github " + r.status, detail: (await r.text()).slice(0, 200) }, 502, ORIGIN);
      const batch = await r.json();
      if (!Array.isArray(batch)) break;
      items = items.concat(batch);
      if (batch.length < 100) break;
    }
    const prRe = /##\s*עדיפות[^\n]*\r?\n+\s*([^\n]+)/;
    const tasks = (items || []).filter((it: any) => !it.pull_request).map((it: any) => {
      const b = it.body || "";
      const pm = b.match(prRe);
      return {
        number: it.number, title: it.title || "", state: it.state,
        labels: (it.labels || []).map((l: any) => typeof l === "string" ? l : l.name),
        priority: pm ? pm[1].trim() : "",
        assignee: it.assignee ? it.assignee.login : "",
        url: it.html_url, createdAt: it.created_at, updatedAt: it.updated_at,
        body: b.slice(0, 1200),
      };
    });
    return json({ tasks }, 200, ORIGIN);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500, ORIGIN);
  }
});
