// Supabase Edge Function: clockify
// The ONLY holder of the Clockify credentials (Task 29, spec §6 + the §8b ruling). The app
// bundle never sees them — it asks this function, and this function talks to Clockify.
//
// Exactly three actions, nothing more:
//   {action:'tags'}                    → the workspace tag vocabulary (theirs, never hard-coded)
//   {action:'projects'}                → the projects, to map kibbutz → project
//   {action:'entry', entry:{…}}        → create ONE finished time entry
//
// Creating a project is deliberately OUT of scope: an unmatched kibbutz gets no project and
// keeps its name in the description, which a human can fix in Clockify. A background job that
// invents projects in someone else's workspace is not something a card button should do.
//
// Secrets to set (Edge Functions → Secrets) — handoff items for עידן:
//   CLOCKIFY_API_KEY       — workspace API key (Clockify → Profile settings → API)
//   CLOCKIFY_WORKSPACE_ID  — the workspace id
//   CLOCKIFY_USER_ID       — (optional) the user the entries are filed under. When it is not
//                            set the function resolves it once from /v1/user (the key's owner).
//   EMS_API_BASE           — (already set) https://api.sigmatec-ems.com
//   APP_ORIGIN             — allowed origin (default https://pm-sigma.github.io)
//
// Auth / errors are modelled on `supabase/functions/github/index.ts`: same EMS gate, same
// `{error}` JSON shape, same allowlisted-origin CORS, same hard fetch timeout.
const CLOCKIFY_BASE = "https://api.clockify.me/api/v1";

import { cors, emsValid, fetchT, json } from "../_shared/http.ts";

async function clockify(key: string, path: string, init: RequestInit = {}, ms = 12000): Promise<any> {
  const r = await fetchT(CLOCKIFY_BASE + path, {
    ...init,
    headers: { "X-Api-Key": key, "Content-Type": "application/json", ...(init.headers || {}) },
  }, ms);
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!r.ok) throw new Error("clockify " + r.status + ": " + String(data?.message || text).slice(0, 200));
  return data;
}

/**
 * The tag list is a slow-moving vocabulary that every card asks for. It is cached in the
 * instance for 10 minutes AND rate-limited per caller, so a card grid that mounts twenty
 * timers cannot turn into twenty upstream calls (Clockify answers 429 and then nobody gets
 * tags). The client caches it for an hour on top of this (app/src/lib/clockify.ts).
 */
const TAGS_TTL_MS = 10 * 60 * 1000;
let tagCache: { at: number; tags: Array<{ id: string; name: string }> } | null = null;
const RATE_MS = 3000;
const lastCall = new Map<string, number>();
function rateLimited(who: string, now: number): boolean {
  const prev = lastCall.get(who) || 0;
  if (now - prev < RATE_MS) return true;
  lastCall.set(who, now);
  if (lastCall.size > 500) lastCall.clear();   // no unbounded growth in a warm instance
  return false;
}

async function listAll(key: string, path: string): Promise<any[]> {
  let out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await clockify(key, `${path}${path.includes("?") ? "&" : "?"}page=${page}&page-size=200`);
    if (!Array.isArray(batch)) break;
    out = out.concat(batch);
    if (batch.length < 200) break;
  }
  return out;
}

async function fetchTags(key: string, ws: string, now: number) {
  if (tagCache && now - tagCache.at < TAGS_TTL_MS) return tagCache.tags;
  const raw = await listAll(key, `/workspaces/${ws}/tags`);
  const tags = raw
    .filter((t: any) => t && t.id && !t.archived)
    .map((t: any) => ({ id: String(t.id), name: String(t.name || "") }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  tagCache = { at: now, tags };
  return tags;
}

async function fetchProjects(key: string, ws: string) {
  const raw = await listAll(key, `/workspaces/${ws}/projects?archived=false`);
  return raw
    .filter((p: any) => p && p.id)
    .map((p: any) => ({ id: String(p.id), name: String(p.name || ""), billable: !!p.billable }));
}

let cachedUserId = "";
async function resolveUserId(key: string, fromEnv: string): Promise<string> {
  if (fromEnv) return fromEnv;
  if (cachedUserId) return cachedUserId;
  const me = await clockify(key, "/user");
  cachedUserId = String(me?.id || "");
  if (!cachedUserId) throw new Error("could not resolve the Clockify user id");
  return cachedUserId;
}

// Who may call `entry` — defence-in-depth. The EMS pass only proves "a valid EMS login exists"
// (`emsValid` below), not which EMS user is calling: `ems-auth`'s minted JWT carries no `name`/
// identity claim (see task-29-review.md Important #2), so this function cannot verify identity by
// itself. Requiring `body.person` to be one of the two people allowed to track time at all
// (mirrors `canTrackTime` in app/src/lib/clockify.ts and the `usageDigest` actor pattern) at least
// stops an arbitrary EMS-authenticated caller from writing entries — it does not stop עידן/מתניה
// impersonating each other, which needs a real identity claim to fix (tracked separately).
const ALLOWED_ENTRY_PERSONS = ["עידן", "מתניה"];
const MAX_DESCRIPTION_LEN = 300;
const MAX_DURATION_MS = 16 * 60 * 60 * 1000; // 16h
const FUTURE_SLACK_MS = 5 * 60 * 1000; // 5min clock-skew allowance

/**
 * Validates the entry the client sent against the server's OWN cached tag/project lists — never
 * the client's copy, which cannot be trusted. Mirrors app/src/lib/clockifyEntryValidate.ts
 * (kept node-testable there since Deno edge functions aren't runnable under vitest); keep both in
 * sync if the rules change. Returns an ASCII error code (no Hebrew), matching github/index.ts.
 */
function validateEntry(
  e: any,
  opts: { tags: Array<{ id: string }>; projects: Array<{ id: string }>; person: unknown; now: number },
): { ok: true; entry: Record<string, unknown> } | { ok: false; error: string } {
  if (!ALLOWED_ENTRY_PERSONS.includes(String(opts.person || ""))) return { ok: false, error: "forbidden_person" };

  const startMs = Date.parse(String(e?.start ?? ""));
  if (!Number.isFinite(startMs)) return { ok: false, error: "invalid_start" };
  const endMs = Date.parse(String(e?.end ?? ""));
  if (!Number.isFinite(endMs)) return { ok: false, error: "invalid_end" };
  if (!(startMs < endMs)) return { ok: false, error: "end_before_start" };
  if (endMs - startMs > MAX_DURATION_MS) return { ok: false, error: "duration_too_long" };
  if (endMs > opts.now + FUTURE_SLACK_MS) return { ok: false, error: "entry_in_future" };

  const description = String(e?.description ?? "").trim();
  if (description.length > MAX_DESCRIPTION_LEN) return { ok: false, error: "description_too_long" };

  let projectId: string | null = null;
  if (e?.projectId != null && e.projectId !== "") {
    const pid = String(e.projectId);
    if (!opts.projects.some((p) => p.id === pid)) return { ok: false, error: "invalid_project" };
    projectId = pid;
  }

  let tagIds: string[] = [];
  if (Array.isArray(e?.tagIds) && e.tagIds.length) {
    const known = new Set(opts.tags.map((t) => t.id));
    tagIds = e.tagIds.map(String).slice(0, 50);
    for (const id of tagIds) if (!known.has(id)) return { ok: false, error: "invalid_tag" };
  }

  return {
    ok: true,
    entry: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      description,
      billable: !!e?.billable,
      projectId,
      tagIds,
    },
  };
}

/**
 * One finished entry. The client builds the payload (`entryPayload` in app/src/lib/clockify.ts,
 * covered by goldens); `body` here has already passed `validateEntry` against the server's own
 * tag/project lists, so this only shapes the Clockify request.
 */
async function createEntry(key: string, ws: string, uid: string, body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    start: body.start,
    end: body.end,
    description: body.description,
    billable: body.billable,
  };
  if (body.projectId) payload.projectId = body.projectId;
  if (Array.isArray(body.tagIds) && body.tagIds.length) payload.tagIds = body.tagIds;
  const res = await clockify(key, `/workspaces/${ws}/user/${uid}/time-entries`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: String(res?.id || ""), description: payload.description, projectId: payload.projectId || null };
}

Deno.serve(async (req) => {
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const KEY = Deno.env.get("CLOCKIFY_API_KEY") || "";
  const WS = Deno.env.get("CLOCKIFY_WORKSPACE_ID") || "";
  const ENV_UID = Deno.env.get("CLOCKIFY_USER_ID") || "";
  const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";
  const reqOrigin = req.headers.get("origin") || "";
  const ORIGIN = (reqOrigin === APP_ORIGIN
    || /^https:\/\/([a-z0-9-]+\.)?githack\.com$/.test(reqOrigin)
    || /^http:\/\/localhost(:\d+)?$/.test(reqOrigin)) ? reqOrigin : APP_ORIGIN;

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!KEY || !WS) return json({ error: "CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID not set" }, 500, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  const action = String(body.action || "");
  const now = Date.now();

  try {
    if (action === "tags") {
      // Rate-limited per person: over the limit the caller is told to use what it has, which
      // is exactly what `tagsCached` does with a failed fetch (stale list, no empty picker).
      const who = String(body.person || req.headers.get("x-forwarded-for") || "anon");
      if (rateLimited(who, now) && !tagCache) return json({ error: "rate limited — try again in a moment" }, 429, ORIGIN);
      return json({ tags: await fetchTags(KEY, WS, now) }, 200, ORIGIN);
    }

    if (action === "projects") {
      return json({ projects: await fetchProjects(KEY, WS) }, 200, ORIGIN);
    }

    if (action === "entry") {
      const e = body.entry || {};
      // Validate against the server's OWN, freshly-fetched tag/project lists (never the client's
      // copy — see the review's Important #1: any string up to 50 tag ids and any projectId were
      // previously forwarded to Clockify as-is).
      const [tags, projects] = await Promise.all([fetchTags(KEY, WS, now), fetchProjects(KEY, WS)]);
      const v = validateEntry(e, { tags, projects, person: body.person, now });
      if (!v.ok) return json({ error: v.error }, 400, ORIGIN);
      const uid = await resolveUserId(KEY, ENV_UID);
      return json({ entry: await createEntry(KEY, WS, uid, v.entry) }, 200, ORIGIN);
    }

    return json({ error: "unknown action (tags | projects | entry)" }, 400, ORIGIN);
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 502, ORIGIN);
  }
});
