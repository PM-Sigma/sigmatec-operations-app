// Supabase Edge Function: github
// Read-only proxy for the dev-tasks (פיתוח) view — fetches GitHub Issues from the company
// tickets repo with a read-only token, gated by a valid EMS login. View-only (phase 1).
//
// Secrets to set (Edge Functions → Secrets):
//   GH_TOKEN  — GitHub token. Needs repo Issues:Read AND the **project** scope. Reading the Projects-v2
//               fields (Priority/Status/…) works with read:project, but WRITING Status (the sprint-board
//               push, mode:"setStatus") requires the full **project** (write) scope. Classic token: tick `repo` + `project`.
//   GH_REPO   — owner/repo (default: Sigmatec-Energy/tasks).
//   GH_PROJECT_OWNER / GH_PROJECT_NUMBER — the Projects-v2 board (default: Sigmatec-Energy / 1).
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

// Projects-v2 fields (Priority/Status/type/sprint) live on the PROJECT, not the issue — only the
// GraphQL API exposes them. Returns { issueNumber: {priority,status,type,sprint} }. GRACEFUL: any
// failure (e.g. the token lacks the `project` scope) → {} so tickets still load without these fields.
async function fetchProjectFields(token: string, owner: string, num: number): Promise<Record<number, any>> {
  const out: Record<number, any> = {};
  const q = `query($owner:String!,$num:Int!,$after:String){ organization(login:$owner){ projectV2(number:$num){ items(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ content{ ... on Issue { number } } fieldValues(first:20){ nodes{ __typename ... on ProjectV2ItemFieldSingleSelectValue { name field{ ... on ProjectV2FieldCommon { name } } } ... on ProjectV2ItemFieldIterationValue { title field{ ... on ProjectV2FieldCommon { name } } } } } } } } } }`;
  let after: string | null = null;
  let pos = 0;   // running index across pages = the project board's item order (closest API proxy for "board order")
  try {
    for (let p = 0; p < 10; p++) {
      const r = await fetchT("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "sigmatec-ops" },
        body: JSON.stringify({ query: q, variables: { owner, num, after } }),
      }, 12000);
      if (!r.ok) break;
      const d = await r.json();
      const proj = d?.data?.organization?.projectV2;
      if (!proj) break;
      for (const node of (proj.items?.nodes || [])) {
        const number = node?.content?.number;
        if (!number) continue;
        const f: any = { pos: pos++ };
        for (const fv of (node.fieldValues?.nodes || [])) {
          const fn = String(fv?.field?.name || "").toLowerCase();
          const val = fv?.name || fv?.title || "";
          if (!fn || !val) continue;
          if (/priority|עדיפות/.test(fn)) f.priority = val;
          else if (/status|סטטוס/.test(fn)) f.status = val;
          else if (/type|סוג/.test(fn)) f.type = val;
          else if (/sprint|iteration|ספרינט|איטרצ/.test(fn)) f.sprint = val;
        }
        out[number] = f;
      }
      if (!proj.items?.pageInfo?.hasNextPage) break;
      after = proj.items.pageInfo.endCursor;
    }
  } catch { /* graceful: no project fields */ }
  return out;
}

// Sub-issue hierarchy (GitHub native sub-issues): each issue's parent. Only GraphQL exposes `parent`
// reliably (the REST issue payload often omits it). Returns { childNumber: parentNumber }. GRACEFUL:
// any failure → {} so the tree just falls back to a flat/topic grouping.
async function fetchParentLinks(token: string, owner: string, name: string): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  const q = `query($owner:String!,$name:String!,$after:String){ repository(owner:$owner,name:$name){ issues(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ number parent { number } } } } }`;
  let after: string | null = null;
  try {
    for (let p = 0; p < 10; p++) {
      const r = await fetchT("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "sigmatec-ops" },
        body: JSON.stringify({ query: q, variables: { owner, name, after } }),
      }, 12000);
      if (!r.ok) break;
      const d = await r.json();
      const issues = d?.data?.repository?.issues;
      if (!issues) break;
      for (const node of (issues.nodes || [])) {
        if (node?.number && node?.parent?.number) out[node.number] = node.parent.number;
      }
      if (!issues.pageInfo?.hasNextPage) break;
      after = issues.pageInfo.endCursor;
    }
  } catch { /* graceful: no hierarchy */ }
  return out;
}

// WRITE: set the Projects-v2 Status field for a set of issues to a target stage (e.g. "Ready" / "Committed").
// Robust: matches the target against the project's actual option names by KEYWORD (so English targets hit
// Hebrew-named columns), and AUTO-ADDS an issue to the board if it isn't a project item yet (push from backlog).
// Needs a token with project WRITE scope (classic PAT `project`). Returns { updated, failed[{number,error}], statusOptions, target }.
function optionRegexFor(target: string): RegExp {
  const t = String(target).toLowerCase();
  if (/ready|מוכן|ספרינט/.test(t))                                   return /ready|מוכן|ספרינט|next|planned/i;
  if (/commit|עלה|deployed|\blive\b|released|production|פרוד/.test(t)) return /commit|deployed|\blive\b|released|production|עלה ?לאוויר|פרוד|אונליין/i;
  if (/progress|בעבודה|פיתוח|doing|wip/.test(t))                     return /progress|בעבודה|פיתוח|doing|wip|בתהליך|active/i;
  if (/review|בדיק|qa/.test(t))                                      return /review|בדיק|qa/i;
  if (/done|הושלם|בוצע|גמר|complete/.test(t))                        return /done|בוצע|הושלם|complete|merged|גמר/i;
  if (/backlog|ממתין|todo/.test(t))                                  return /backlog|ממתין|todo|new/i;
  return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
async function setProjectStatus(token: string, owner: string, num: number, repo: string, numbers: number[], targetName: string) {
  const gql = async (query: string, variables: any) => {
    const r = await fetchT("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "sigmatec-ops" },
      body: JSON.stringify({ query, variables }),
    }, 12000);
    const d = await r.json();
    if (d.errors) throw new Error(d.errors.map((e: any) => e.message).join("; "));
    return d.data;
  };
  // 1) project node id + the Status single-select field (id + its options)
  const meta = await gql(
    `query($owner:String!,$num:Int!){ organization(login:$owner){ projectV2(number:$num){ id fields(first:30){ nodes{ ... on ProjectV2SingleSelectField { id name options{ id name } } } } } } }`,
    { owner, num },
  );
  const proj = meta?.organization?.projectV2;
  if (!proj) throw new Error("project not found");
  const statusField = (proj.fields?.nodes || []).find((f: any) => f && f.options && /status|סטטוס/i.test(f.name || ""));
  if (!statusField) throw new Error("Status field not found on the project");
  const optionNames = statusField.options.map((o: any) => o.name);
  const re = optionRegexFor(targetName);
  const tn = String(targetName).toLowerCase();
  const opt = statusField.options.find((o: any) => re.test(o.name))
    || statusField.options.find((o: any) => o.name.toLowerCase() === tn)
    || statusField.options.find((o: any) => o.name.toLowerCase().includes(tn));
  if (!opt) return { updated: [], failed: numbers.map((n) => ({ number: n, error: "no Status option matches '" + targetName + "' (have: " + optionNames.join(", ") + ")" })), statusOptions: optionNames };
  // 2) map issue number → project item id (paginate the board)
  const itemByNumber: Record<number, string> = {};
  let after: string | null = null;
  for (let p = 0; p < 10; p++) {
    const d = await gql(
      `query($owner:String!,$num:Int!,$after:String){ organization(login:$owner){ projectV2(number:$num){ items(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ id content{ ... on Issue { number } } } } } } }`,
      { owner, num, after },
    );
    const items = d?.organization?.projectV2?.items;
    if (!items) break;
    for (const node of (items.nodes || [])) { const n = node?.content?.number; if (n) itemByNumber[n] = node.id; }
    if (!items.pageInfo?.hasNextPage) break;
    after = items.pageInfo.endCursor;
  }
  const [repoOwner, repoName] = String(repo).split("/");
  // ensure the issue is a project item — add it if it's a backlog repo-issue not on the board yet
  const ensureItem = async (n: number): Promise<string | null> => {
    if (itemByNumber[n]) return itemByNumber[n];
    const iq = await gql(`query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issue(number:$n){ id } } }`, { o: repoOwner, r: repoName, n });
    const contentId = iq?.repository?.issue?.id;
    if (!contentId) return null;
    const add = await gql(`mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item{ id } } }`, { p: proj.id, c: contentId });
    const id = add?.addProjectV2ItemById?.item?.id;
    if (id) itemByNumber[n] = id;
    return id || null;
  };
  // 3) set the Status for each requested issue (adding it to the board first if needed)
  const updated: number[] = [], failed: any[] = [];
  for (const n of numbers) {
    try {
      const itemId = await ensureItem(n);
      if (!itemId) { failed.push({ number: n, error: "issue not found / couldn't add to the project board" }); continue; }
      await gql(
        `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }`,
        { p: proj.id, i: itemId, f: statusField.id, o: opt.id },
      );
      updated.push(n);
    } catch (e) { failed.push({ number: n, error: String((e as Error)?.message || e) }); }
  }
  return { updated, failed, statusOptions: optionNames, target: opt.name };
}

Deno.serve(async (req) => {
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const GH_TOKEN = Deno.env.get("GH_TOKEN") || "";
  const GH_REPO = Deno.env.get("GH_REPO") || "Sigmatec-Energy/tasks";
  const GH_PROJECT_OWNER = Deno.env.get("GH_PROJECT_OWNER") || "Sigmatec-Energy";
  const GH_PROJECT_NUMBER = parseInt(Deno.env.get("GH_PROJECT_NUMBER") || "1", 10);
  // Allow the production app, the dev-preview hosts (raw/gist.githack.com), and localhost.
  // Function is already EMS-login-gated + read-only, so reflecting an allowlisted origin is safe.
  const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";
  const reqOrigin = req.headers.get("origin") || "";
  const ORIGIN = (reqOrigin === APP_ORIGIN
    || /^https:\/\/([a-z0-9-]+\.)?githack\.com$/.test(reqOrigin)
    || /^http:\/\/localhost(:\d+)?$/.test(reqOrigin)) ? reqOrigin : APP_ORIGIN;

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!GH_TOKEN) return json({ error: "GH_TOKEN not set" }, 500, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  // WRITE: move selected issues to a target Status (e.g. "Ready" / "Committed"). EMS-gated; needs project write scope.
  if (body.mode === "setStatus") {
    const numbers = Array.isArray(body.numbers) ? body.numbers.map(Number).filter(Boolean) : [];
    const target = String(body.status || "").trim();
    if (!numbers.length || !target) return json({ error: "numbers[] and status are required" }, 400, ORIGIN);
    try {
      const res = await setProjectStatus(GH_TOKEN, GH_PROJECT_OWNER, GH_PROJECT_NUMBER, GH_REPO, numbers, target);
      return json(res, 200, ORIGIN);
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502, ORIGIN);
    }
  }

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
        number: it.number, title: it.title || "", state: it.state, parent: null as number | null,
        labels: (it.labels || []).map((l: any) => typeof l === "string" ? l : l.name),
        priority: pm ? pm[1].trim() : "",
        status: "", ptype: "", sprint: "", pos: 1e9,
        assignee: it.assignee ? it.assignee.login : "",
        url: it.html_url, createdAt: it.created_at, updatedAt: it.updated_at,
        body: b.slice(0, 1200),
      };
    });

    // merge Projects-v2 fields (priority/status/type/sprint) by issue number (graceful if unavailable)
    const pf = await fetchProjectFields(GH_TOKEN, GH_PROJECT_OWNER, GH_PROJECT_NUMBER);
    for (const t of tasks) {
      const f = pf[t.number];
      if (!f) continue;
      if (f.priority) t.priority = f.priority;   // project Priority wins over the body field
      if (f.status) t.status = f.status;
      if (f.type) t.ptype = f.type;
      if (f.sprint) t.sprint = f.sprint;
      if (typeof f.pos === "number") t.pos = f.pos;   // board order
    }

    // merge sub-issue parent linkage (GitHub native sub-issues) → t.parent (graceful if unavailable)
    const [ghOwner, ghName] = GH_REPO.split("/");
    const links = await fetchParentLinks(GH_TOKEN, ghOwner, ghName);
    for (const t of tasks) { const p = links[t.number]; if (p) t.parent = p; }

    return json({ tasks }, 200, ORIGIN);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500, ORIGIN);
  }
});
