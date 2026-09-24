// Supabase Edge Function: github
// Proxy for the dev-tasks (פיתוח) view — fetches GitHub Issues from the company tickets repo,
// gated by a valid EMS login. Reads (default), Projects-v2 writes (setStatus / setPriority) and
// ticket creation (createIssue / listParents, for the 📣 feedback inbox's 🐙 button, spec §7).
//
// Secrets to set (Edge Functions → Secrets):
//   GH_TOKEN  — GitHub token. Needs repo Issues:Read AND the **project** scope. Reading the Projects-v2
//               fields (Priority/Status/…) works with read:project, but WRITING Status (the sprint-board
//               push, mode:"setStatus") requires the full **project** (write) scope. Classic token: tick `repo` + `project`.
//   GH_REPO   — owner/repo (default: Sigmatec-Energy/tasks).
//   GH_PROJECT_OWNER / GH_PROJECT_NUMBER — the Projects-v2 board (default: Sigmatec-Energy / 1).
//   EMS_API_BASE — (already set) https://api.sigmatec-ems.com
//   APP_ORIGIN   — allowed origin (default https://pm-sigma.github.io)
//   JWT_SECRET / EMS_BRIDGE_SECRET — the same secret supabase/functions/ems-auth signs the
//                 bridge pass with; verified here (X-L8) to gate the write modes by person.
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { cors, emsValid, fetchT, json } from "../_shared/http.ts";
import { chainOf } from "./lineage.js";
import { canWrite } from "./gate.js";

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

/** One ancestor as `chainOf` returns it: nearest parent first. */
type ParentChainLink = { number: number; title: string; state: "OPEN" | "CLOSED" };

// Sub-issue hierarchy (GitHub native sub-issues): each issue's FULL parent chain (up to 4 levels,
// nearest first), with title + state, via `chainOf` (lineage.js — shared, cycle-safe). Only GraphQL
// exposes `parent` reliably (the REST issue payload often omits it), and the nested field needs the
// `sub_issues` feature header (gqlCall already sends it; this call didn't). Returns
// { childNumber: ParentChainLink[] }. GRACEFUL: any failure → {} so every card lands in "ללא אפיון"
// with the page still working.
async function fetchParentLinks(token: string, owner: string, name: string): Promise<Record<number, ParentChainLink[]>> {
  const out: Record<number, ParentChainLink[]> = {};
  const q = `query($owner:String!,$name:String!,$after:String){ repository(owner:$owner,name:$name){ issues(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ number parent { number title state parent { number title state parent { number title state parent { number title state } } } } } } } }`;
  let after: string | null = null;
  try {
    for (let p = 0; p < 10; p++) {
      const r = await fetchT("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "sigmatec-ops", "GraphQL-Features": "sub_issues" },
        body: JSON.stringify({ query: q, variables: { owner, name, after } }),
      }, 12000);
      if (!r.ok) break;
      const d = await r.json();
      const issues = d?.data?.repository?.issues;
      if (!issues) break;
      for (const node of (issues.nodes || [])) {
        if (node?.number) out[node.number] = chainOf(node);
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
/**
 * The last few comments of every OPEN issue, by issue number. One paginated GraphQL query for
 * the whole repo — the REST alternative is one request per issue, which for a 200-card board
 * is 200 round trips and a rate-limit.
 *
 * Only fetched when the caller asks (`{ comments: true }`): ▶ ישיבת פיתוח needs them for
 * "שאלות פתוחות לעידן" and the per-card comment list, and the ordinary 💻 פיתוח board render
 * does not — it should not pay for them. Until the Task 18 sweep the read mode returned no
 * comments at all, so both of those surfaces were permanently empty with no error to show for it.
 * Failure is graceful: an empty map, never a 502 — comments are an enrichment, not the board.
 */
async function fetchIssueComments(token: string, owner: string, name: string): Promise<Record<number, any[]>> {
  const out: Record<number, any[]> = {};
  const q = `query($owner:String!,$name:String!,$after:String){ repository(owner:$owner,name:$name){ issues(first:50, after:$after, states:[OPEN]){ pageInfo{ hasNextPage endCursor } nodes{ number comments(last:20){ nodes{ id author{ login } body createdAt url } } } } } }`;
  let after: string | null = null;
  try {
    for (let page = 0; page < 10; page++) {
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
        const n = node?.number;
        if (!n) continue;
        const list = (node.comments?.nodes || []).map((c: any) => ({
          id: c?.id,
          issue_number: n,
          author: c?.author?.login || "",
          // The board is read on a phone; a 4 kB comment is not a thing anyone reads there.
          body: String(c?.body || "").slice(0, 2000),
          createdAt: c?.createdAt || null,
          url: c?.url || "",
        }));
        if (list.length) out[n] = list;
      }
      if (!issues.pageInfo?.hasNextPage) break;
      after = issues.pageInfo.endCursor;
    }
  } catch { /* comments are an enrichment — the board still renders without them */ }
  return out;
}

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
// same idea for the Priority single-select (Hebrew tiers → whatever the project actually named its options)
function priorityRegexFor(target: string): RegExp {
  const t = String(target).toLowerCase();
  if (/קריטי|דחוף|critical|urgent/.test(t)) return /קריטי|דחוף|critical|urgent|highest/i;
  if (/גבוה|high/.test(t))                  return /גבוה|high/i;
  if (/בינונ|medium|normal/.test(t))        return /בינונ|medium|normal/i;
  if (/נמוכ|low/.test(t))                    return /נמוכ|low/i;
  return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
// Generic single-select writer: finds the field by name regex, matches the target option by keyword, and
// sets (or CLEARS, when targetName is empty) it for each issue — adding the issue to the board if needed.
async function setProjectField(token: string, owner: string, num: number, repo: string, numbers: number[], fieldNameRe: RegExp, targetName: string, optionReFor: (s: string) => RegExp) {
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
  const field = (proj.fields?.nodes || []).find((f: any) => f && f.options && fieldNameRe.test(f.name || ""));
  if (!field) throw new Error("target field not found on the project");
  const optionNames = field.options.map((o: any) => o.name);
  const clear = !String(targetName).trim();   // empty target → clear the field value
  let opt: any = null;
  if (!clear) {
    const re = optionReFor(targetName);
    const tn = String(targetName).toLowerCase();
    opt = field.options.find((o: any) => re.test(o.name))
      || field.options.find((o: any) => o.name.toLowerCase() === tn)
      || field.options.find((o: any) => o.name.toLowerCase().includes(tn));
    if (!opt) return { updated: [], failed: numbers.map((n) => ({ number: n, error: "no option matches '" + targetName + "' (have: " + optionNames.join(", ") + ")" })), statusOptions: optionNames };
  }
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
  // 3) set (or clear) the field for each requested issue (adding it to the board first if needed)
  const updated: number[] = [], failed: any[] = [];
  for (const n of numbers) {
    try {
      const itemId = await ensureItem(n);
      if (!itemId) { failed.push({ number: n, error: "issue not found / couldn't add to the project board" }); continue; }
      if (clear) {
        await gql(
          `mutation($p:ID!,$i:ID!,$f:ID!){ clearProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f}){ projectV2Item{ id } } }`,
          { p: proj.id, i: itemId, f: field.id },
        );
      } else {
        await gql(
          `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }`,
          { p: proj.id, i: itemId, f: field.id, o: opt.id },
        );
      }
      updated.push(n);
    } catch (e) { failed.push({ number: n, error: String((e as Error)?.message || e) }); }
  }
  return { updated, failed, statusOptions: optionNames, target: clear ? "" : opt.name };
}

// ───────────────────── ticket creation (📣 feedback inbox → dev board) ─────────────────────
// The Git Ticket System rules (C:\Users\idann\Projects\Git Ticket System For EMS): a two-level
// board — **Main Fields** parents and their children — every card is a CHILD of an existing
// parent, titled `[מודול] | [תת-תחום] | [תיאור]`, and lands in **Backlog**. A new PARENT is
// never created from the app: עידן picks the parent in the inbox from `listParents` below.
const MAIN_FIELDS_RE = /main\s*fields|תחומים ראשיים/i;

async function ghJson(token: string, url: string, init: RequestInit = {}, ms = 12000) {
  const r = await fetchT(url, {
    ...init,
    headers: {
      Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
      "User-Agent": "sigmatec-ops", "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  }, ms);
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!r.ok) throw new Error("github " + r.status + ": " + String(data?.message || text).slice(0, 200));
  return data;
}

async function gqlCall(token: string, query: string, variables: any) {
  const r = await fetchT("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token, "Content-Type": "application/json",
      "User-Agent": "sigmatec-ops", "GraphQL-Features": "sub_issues",
    },
    body: JSON.stringify({ query, variables }),
  }, 12000);
  const d = await r.json();
  if (d.errors) throw new Error(d.errors.map((e: any) => e.message).join("; "));
  return d.data;
}

/** The Main Fields parents, for the inbox's parent picker: [{number, title}] by board order. */
async function listParents(token: string, repo: string, projOwner: string, projNum: number) {
  let items: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await ghJson(token, `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) break;
    items = items.concat(batch);
    if (batch.length < 100) break;
  }
  const pf = await fetchProjectFields(token, projOwner, projNum);
  return (items || [])
    .filter((it: any) => !it.pull_request && MAIN_FIELDS_RE.test(String(pf[it.number]?.status || "")))
    .map((it: any) => ({ number: it.number, title: String(it.title || ""), url: it.html_url }))
    .sort((a: any, b: any) => (pf[a.number]?.pos ?? 1e9) - (pf[b.number]?.pos ?? 1e9));
}

/**
 * Create one ticket: the issue, then the parent link (native sub-issue), then the board with
 * Status=Backlog. The issue is the only step that may fail hard — a missing parent link or a
 * project without a Backlog option is reported as a `warning` next to a real issue number,
 * because losing the ticket over a board detail would be worse than an imperfect card.
 */
async function createIssue(
  token: string, repo: string, projOwner: string, projNum: number,
  t: { title: string; body: string; labels: string[]; parent?: number },
) {
  const issue = await ghJson(token, `https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: t.title, body: t.body, labels: t.labels }),
  });
  const warnings: string[] = [];

  if (t.parent) {
    try {
      const [o, n] = repo.split("/");
      const p = await gqlCall(token, `query($o:String!,$n:String!,$num:Int!){ repository(owner:$o,name:$n){ issue(number:$num){ id } } }`,
        { o, n, num: t.parent });
      const parentId = p?.repository?.issue?.id;
      if (!parentId) throw new Error("parent #" + t.parent + " not found");
      await gqlCall(token, `mutation($p:ID!,$c:ID!){ addSubIssue(input:{issueId:$p, subIssueId:$c}){ issue{ number } } }`,
        { p: parentId, c: issue.node_id });
    } catch (e) { warnings.push("parent: " + String((e as Error)?.message || e)); }
  }

  let status = "";
  try {
    const r = await setProjectField(token, projOwner, projNum, repo, [issue.number], /status|סטטוס/i, "Backlog", optionRegexFor);
    status = r.target || "";
    for (const f of (r.failed || [])) warnings.push("board #" + f.number + ": " + f.error);
  } catch (e) { warnings.push("board: " + String((e as Error)?.message || e)); }

  return { number: issue.number, url: issue.html_url, title: issue.title, parent: t.parent || null, status, warnings };
}

// ───────────────────── X-L8: the write gate ─────────────────────
// setStatus / setPriority / createIssue used to need only a valid EMS login — any staff
// account could move cards or open tickets. עידן's ruling (23.9): those three write modes are
// עידן / עמיחי / מתניה only; reads (the default path, listParents) stay open to every EMS login,
// unchanged. The name comes from the VERIFIED bridge pass (the same JWT ems-auth mints, signed
// with this same secret) — never from anything the request body claims.
async function signingKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
}

/**
 * 403 for a verified-but-unlisted staff pass; 401 for a missing or invalid one. `null` means
 * the caller may proceed.
 */
async function requireWriter(req: Request): Promise<{ error: string; status: number } | null> {
  const auth = req.headers.get("authorization") || "";
  const pass = auth.replace(/^Bearer\s+/i, "").trim();
  const secret = Deno.env.get("JWT_SECRET") || Deno.env.get("EMS_BRIDGE_SECRET") || "";
  if (!pass || !secret) return { error: "unauthorized: missing pass", status: 401 };
  try {
    const payload = await verify(pass, await signingKey(secret));
    const name = typeof (payload as Record<string, unknown>)?.name === "string" ? (payload as { name: string }).name : null;
    if (!canWrite(name)) return { error: "forbidden", status: 403 };
    return null;
  } catch {
    return { error: "unauthorized: invalid pass", status: 401 };
  }
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
    const gate = await requireWriter(req);
    if (gate) return json({ error: gate.error }, gate.status, ORIGIN);
    const numbers = Array.isArray(body.numbers) ? body.numbers.map(Number).filter(Boolean) : [];
    const target = String(body.status || "").trim();
    if (!numbers.length || !target) return json({ error: "numbers[] and status are required" }, 400, ORIGIN);
    try {
      const res = await setProjectField(GH_TOKEN, GH_PROJECT_OWNER, GH_PROJECT_NUMBER, GH_REPO, numbers, /status|סטטוס/i, target, optionRegexFor);
      return json(res, 200, ORIGIN);
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502, ORIGIN);
    }
  }

  // WRITE: set the Priority field for selected issues (empty string → clear). EMS-gated; needs project write scope.
  if (body.mode === "setPriority") {
    const gate = await requireWriter(req);
    if (gate) return json({ error: gate.error }, gate.status, ORIGIN);
    const numbers = Array.isArray(body.numbers) ? body.numbers.map(Number).filter(Boolean) : [];
    if (!numbers.length) return json({ error: "numbers[] is required" }, 400, ORIGIN);
    const target = String(body.priority || "").trim();   // "" clears the priority
    try {
      const res = await setProjectField(GH_TOKEN, GH_PROJECT_OWNER, GH_PROJECT_NUMBER, GH_REPO, numbers, /priority|עדיפות/i, target, priorityRegexFor);
      return json(res, 200, ORIGIN);
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502, ORIGIN);
    }
  }

  // READ: the Main Fields parents, for the 📣 inbox's parent picker (a card is always a child).
  if (body.mode === "listParents") {
    try {
      return json({ parents: await listParents(GH_TOKEN, GH_REPO, GH_PROJECT_OWNER, GH_PROJECT_NUMBER) }, 200, ORIGIN);
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502, ORIGIN);
    }
  }

  // WRITE: create one ticket (feedback bug → dev board). Title/body are built client-side by
  // app/src/lib/feedback.ts (issueTitle/issueBody) so they are covered by goldens; the parent
  // is required unless the caller explicitly says there is none.
  if (body.mode === "createIssue") {
    const gate = await requireWriter(req);
    if (gate) return json({ error: gate.error }, gate.status, ORIGIN);
    const title = String(body.title || "").trim().slice(0, 240);
    if (!title) return json({ error: "title is required" }, 400, ORIGIN);
    const labels = Array.isArray(body.labels) ? body.labels.map(String).slice(0, 10) : [];
    // The board is two-level BY RULE: a card is always a child of an existing Main Fields
    // parent, and the app never creates a parent. Enforced server-side, not only in the UI.
    const parent = Number(body.parent) || 0;
    if (!parent) return json({ error: "parent is required (a card is always a child of a Main Fields parent)" }, 400, ORIGIN);
    // A feedback body is a person typing or dictating; 20k characters is far more than any real
    // report and still well under GitHub's own 65k limit.
    const issueBody = String(body.body || "").slice(0, 20000);
    try {
      const res = await createIssue(GH_TOKEN, GH_REPO, GH_PROJECT_OWNER, GH_PROJECT_NUMBER, {
        title, body: issueBody, labels, parent,
      });
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

    // merge sub-issue parent linkage (GitHub native sub-issues) → t.parentChain (nearest first, up
    // to 4 levels, titles included) + t.parent (nearest parent's number, kept for old clients).
    // Graceful if unavailable: chains default to [] and every card lands in "ללא אפיון".
    const [ghOwner, ghName] = GH_REPO.split("/");
    const chains = await fetchParentLinks(GH_TOKEN, ghOwner, ghName);
    for (const t of tasks) {
      const chain = chains[t.number] || [];
      (t as any).parentChain = chain;
      if (chain.length) t.parent = chain[0].number;
    }

    // …and the comments, only for a caller that asked for them (▶ ישיבת פיתוח).
    if (body.comments) {
      const byIssue = await fetchIssueComments(GH_TOKEN, ghOwner, ghName);
      for (const t of tasks) { const c = byIssue[t.number]; if (c && c.length) (t as any).comments = c; }
    }

    return json({ tasks }, 200, ORIGIN);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500, ORIGIN);
  }
});
