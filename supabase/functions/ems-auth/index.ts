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
// Optional:  EMS_API_BASE (defaults to https://api.sigmatec-ems.com).
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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
    return json({ token, expiresIn: TTL_SECONDS });
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
      const pin = String((body as { pin?: string }).pin || "");
      // Length-independent compare, so a wrong code cannot be measured character by character.
      const a = new TextEncoder().encode(pin);
      const b = new TextEncoder().encode(VIEWER_PIN);
      let diff = a.length === b.length ? 0 : 1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
      if (diff !== 0) return json({ error: "קוד צפייה שגוי" }, 401);
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

    // 3) Mint a Supabase-compatible JWT (role=authenticated), valid 180 min.
    //
    // Was 60 min. Spec §7n ("session length >= 3 h"): a field day is a sequence of short
    // visits with the phone asleep in between, and a one-hour pass meant the first tap after
    // lunch hit a write it could not make. The client still re-mints every 50 min while the
    // EMS session lives (js/src/15-login-gate.js) and still caps the whole session at 12 h —
    // this only removes the cliff a sleeping tab used to fall off.
    return await mintPass(sub);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
