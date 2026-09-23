// Supabase Edge Function: ems-auth
// Validates an EMS login token (by calling an authenticated EMS endpoint) and, if valid,
// mints a short-lived Supabase JWT (role=authenticated) signed with the project's JWT secret.
// The app sends its EMS token here right after login; the returned token is then used as the
// Authorization bearer for all DB calls, so the public anon key alone can no longer pass RLS.
//
// Two ways in, one kind of pass out:
//   { emsToken }               an EMS sign-in — the token is validated against the EMS API
//   { mode: "viewer", pin }    the view-only entry, which has NO EMS account by design. The
//                              access code is compared HERE, against the VIEWER_PIN secret, so
//                              it is no longer a constant in the client bundle — and a viewer
//                              now holds the same bridge pass as everyone else (sub "viewer"),
//                              which is what lets the app gate every screen on "has a pass".
//
// Secrets to set (Edge Functions → Secrets):
//   JWT_SECRET  (Settings → JWT Keys → legacy secret)
//   VIEWER_PIN  the view-only access code. Until it is set the viewer entry FAILS CLOSED with a
//               message that says so — it never falls back to a code in the client.
// Provided by the platform (no setup): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, used ONLY to
// count failed viewer attempts in `auth_attempts` (see the rate limit below).
// Optional:  EMS_API_BASE (defaults to https://api.sigmatec-ems.com).
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { resolveName } from "./identity.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ───────────────────── the view-only rate limit (fix round 2) ─────────────────────
// A short access code behind a PUBLIC function is only as strong as the number of guesses it
// allows, so the function counts them: every FAILED viewer attempt is one row in
// `auth_attempts` (service role; deny-all for anon and authenticated), five failures from the
// same address inside 15 minutes are refused, and a successful sign-in clears that address.
// The rules are mirrored — and unit-tested — in app/src/lib/authThrottle.ts.
const THROTTLE_MAX_FAILURES = 5;
const THROTTLE_WINDOW_MS = 15 * 60_000;
/** A constant pause on every failure: the same cost per guess, and no timing hint. */
const THROTTLE_FAIL_DELAY_MS = 300;
const THROTTLE_MESSAGE = "יותר מדי ניסיונות. נסה שוב בעוד 15 דקות";

/** The caller's address: the FIRST hop of x-forwarded-for (the later hops are forgeable). */
function firstHop(xff: string | null): string {
  const first = String(xff || "").split(",")[0].trim();
  return first || "unknown";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function attemptsApi() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return null;
  return {
    base: url.replace(/\/$/, "") + "/rest/v1/auth_attempts",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
  };
}

/**
 * How many failures this address has inside the window. A table that cannot be reached returns
 * 0 — the limit must never become an outage of the sign-in itself.
 */
async function recentFailures(ip: string): Promise<number> {
  const api = attemptsApi();
  if (!api) return 0;
  try {
    const since = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString();
    const r = await fetch(
      `${api.base}?select=at&ip=eq.${encodeURIComponent(ip)}&at=gte.${encodeURIComponent(since)}`,
      { headers: api.headers },
    );
    if (!r.ok) return 0;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}

async function recordFailure(ip: string): Promise<void> {
  const api = attemptsApi();
  if (!api) return;
  try {
    await fetch(api.base, {
      method: "POST",
      headers: { ...api.headers, Prefer: "return=minimal" },
      body: JSON.stringify({ ip }),
    });
  } catch { /* the refusal already happened; losing the count is not worth failing on */ }
}

async function clearAttempts(ip: string): Promise<void> {
  const api = attemptsApi();
  if (!api) return;
  try {
    await fetch(`${api.base}?ip=eq.${encodeURIComponent(ip)}`, {
      method: "DELETE", headers: { ...api.headers, Prefer: "return=minimal" },
    });
  } catch { /* the person is in; a stale row expires with the window anyway */ }
}

// ───────────────────── X-L1: the trusted per-person name claim ─────────────────────
// staff_identities is service-role-only (db/staff_identities.sql) — no client, however
// privileged, can read or write it. The claim it produces is the ONLY thing that lets a
// person-scoped policy (db/rls_person_scoped.sql, applied only after X-L3) tell one member of
// staff from another.
function identitiesApi() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return null;
  return {
    base: url.replace(/\/$/, "") + "/rest/v1/staff_identities",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
  };
}

/** The stored name for this EMS user id, or null (no row yet, or the table can't be reached). */
async function lookupIdentity(sub: string): Promise<string | null> {
  const api = identitiesApi();
  if (!api) return null;
  try {
    const r = await fetch(`${api.base}?select=name&ems_user_id=eq.${encodeURIComponent(sub)}`, { headers: api.headers });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.name ? String(rows[0].name) : null;
  } catch { return null; }
}

/** Learn a name once, so the next sign-in never has to ask EMS /users again. Best-effort. */
async function learnIdentity(sub: string, name: string, email: string | null): Promise<void> {
  const api = identitiesApi();
  if (!api) return;
  try {
    await fetch(`${api.base}?on_conflict=ems_user_id`, {
      method: "POST",
      headers: { ...api.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ems_user_id: sub, name, email }),
    });
  } catch { /* learning is best-effort; the claim for THIS sign-in is unaffected */ }
}

/**
 * The EMS `/v1/users` roster, read with the SIGNED-IN person's own token. Not every account has
 * admin rights there — a 403 just means "nothing learned this time", never a sign-in failure.
 */
async function emsUserEmail(emsToken: string, emsBase: string, sub: string): Promise<string | null> {
  try {
    const r = await fetch(`${emsBase}/v1/users?take=200`, { headers: { Authorization: `Bearer ${emsToken}` } });
    if (!r.ok) return null;
    const list = await r.json().catch(() => []);
    const rows = Array.isArray(list) ? list : (Array.isArray((list as { data?: unknown[] })?.data) ? (list as { data: unknown[] }).data : []);
    const me = (rows as Array<Record<string, unknown>>).find((u) => String(u?.id ?? u?.userId ?? "") === sub);
    return me?.email ? String(me.email) : null;
  } catch { return null; }
}

async function signingKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Read secrets per-request (not at module load) so a fresh deploy/secret is always picked up.
  const JWT_SECRET = Deno.env.get("JWT_SECRET") || Deno.env.get("EMS_BRIDGE_SECRET") || "";
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";

  // Self-diagnostic: if the signing secret is missing/empty, report which env vars the function
  // can actually see — NAMES + LENGTHS only, never the values. This tells us if the secret is
  // simply not reaching the function vs. set to an empty value.
  if (!JWT_SECRET) {
    const names = ["JWT_SECRET", "EMS_BRIDGE_SECRET", "EMS_API_BASE",
                   "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
    const env_lengths: Record<string, number> = {};
    for (const n of names) { const v = Deno.env.get(n); env_lengths[n] = v ? v.length : 0; }
    return json({ error: "JWT_SECRET not visible to function", env_lengths }, 500);
  }

  // The pass is 180 min for everyone (spec §7n) — see the note at the mint below.
  const TTL_SECONDS = 180 * 60;
  const mintPass = async (sub: string, extra: Record<string, unknown> = {}) => {
    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        role: "authenticated", aud: "authenticated", iss: "ems-bridge", sub,
        exp: getNumericDate(TTL_SECONDS), ...extra,
      },
      await signingKey(JWT_SECRET),
    );
    // `expiresIn` (seconds) lets the client hold the pass for as long as it is really valid
    // instead of guessing; an older client that ignores it keeps working unchanged.
    // `name`, when minted, rides along in the body too — so the client can compare it with
    // getCurrentUser() and log a mismatch instead of silently trusting whichever one it likes.
    return json({
      token, expiresIn: TTL_SECONDS,
      ...(typeof extra.name === "string" ? { name: extra.name } : {}),
    });
  };

  try {
    const body = await req.json().catch(() => ({}));
    const { emsToken } = body as { emsToken?: string };

    // ── the view-only entry ───────────────────────────────────────────────────
    // Same pass, different subject. A viewer has no EMS account (by design), so without this
    // he could never hold a pass — and with the business tables authenticated-only he would
    // see empty screens and a re-login sheet he could not satisfy.
    if ((body as { mode?: string }).mode === "viewer") {
      const VIEWER_PIN = Deno.env.get("VIEWER_PIN") || "";
      if (!VIEWER_PIN) {
        return json({ error: "כניסת הצפייה עוד לא הופעלה — עידן צריך להגדיר את קוד הצפייה", setup: "VIEWER_PIN" }, 503);
      }
      // Out of guesses? Refused before the code is even looked at.
      const ip = firstHop(req.headers.get("x-forwarded-for"));
      if ((await recentFailures(ip)) >= THROTTLE_MAX_FAILURES) {
        return json({ error: THROTTLE_MESSAGE, retryAfterMinutes: 15 }, 429);
      }

      const pin = String((body as { pin?: string }).pin || "");
      // Length-independent compare, so a wrong code cannot be measured character by character.
      const a = new TextEncoder().encode(pin);
      const b = new TextEncoder().encode(VIEWER_PIN);
      let diff = a.length === b.length ? 0 : 1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
      if (diff !== 0) {
        await recordFailure(ip);
        await sleep(THROTTLE_FAIL_DELAY_MS);
        return json({ error: "קוד צפייה שגוי" }, 401);
      }
      // In — so this address starts from zero again.
      await clearAttempts(ip);
      return await mintPass("viewer", { viewer: true });
    }

    if (!emsToken) return json({ error: "missing emsToken" }, 400);

    // 1) Validate the EMS token: any authenticated EMS endpoint returning 200 proves it's genuine.
    // 8s abort — a hung EMS API must not stall the whole login sequence to the platform limit.
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 8000);
    let check: Response;
    try {
      check = await fetch(`${EMS_API_BASE}/v1/employee-tasks?take=1`, {
        headers: { Authorization: `Bearer ${emsToken}` },
        signal: ac.signal,
      });
    } catch {
      return json({ error: "EMS API timeout — try again" }, 504);
    } finally { clearTimeout(tid); }
    if (!check.ok) return json({ error: "invalid EMS token", emsStatus: check.status }, 401);

    // 2) Best-effort user id from the EMS JWT (for per-user RLS later).
    let sub = "ems-user";
    try {
      const p = JSON.parse(atob(emsToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      sub = String(p.id || p.sub || p.userId || "ems-user");
    } catch { /* keep default */ }

    // 2b) The trusted name claim (X-L1). staff_identities is looked up first; a person not yet
    // in it is learned once from the EMS /users roster (using the CALLER's own token — no
    // elevated EMS access is asked for). Neither lookup can ever fail the sign-in: no name is a
    // valid outcome (a new hire, or an EMS account with no admin rights on /users), it just
    // means the person-scoped policies (X-L2/X-L3) cannot yet tell this person apart from
    // another, exactly like today.
    let name: string | null = await lookupIdentity(sub);
    if (!name) {
      const email = await emsUserEmail(emsToken, EMS_API_BASE, sub);
      name = resolveName(null, email);
      if (name) await learnIdentity(sub, name, email);
      else console.warn("[ems-auth] identity-missing", { sub });
    }

    // 3) Mint a Supabase-compatible JWT (role=authenticated), valid 180 min.
    //
    // Was 60 min. Spec §7n ("session length >= 3 h"): a field day is a sequence of short
    // visits with the phone asleep in between, and a one-hour pass meant the first tap after
    // lunch hit a write it could not make. The client still re-mints every 50 min while the
    // EMS session lives (js/src/15-login-gate.js) and still caps the whole session at 12 h —
    // this only removes the cliff a sleeping tab used to fall off.
    return await mintPass(sub, name ? { name } : {});
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
