// Supabase Edge Function: ems-auth
// Validates an EMS login token (by calling an authenticated EMS endpoint) and, if valid,
// mints a short-lived Supabase JWT (role=authenticated) signed with the project's JWT secret.
// The app sends its EMS token here right after login; the returned token is then used as the
// Authorization bearer for all DB calls, so the public anon key alone can no longer pass RLS.
//
// Secret to set (Edge Functions → Secrets):  JWT_SECRET (Settings → JWT Keys → legacy secret).
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

  try {
    const { emsToken } = await req.json().catch(() => ({}));
    if (!emsToken) return json({ error: "missing emsToken" }, 400);

    // 1) Validate the EMS token: any authenticated EMS endpoint returning 200 proves it's genuine.
    const check = await fetch(`${EMS_API_BASE}/v1/employee-tasks?take=1`, {
      headers: { Authorization: `Bearer ${emsToken}` },
    });
    if (!check.ok) return json({ error: "invalid EMS token", emsStatus: check.status }, 401);

    // 2) Best-effort user id from the EMS JWT (for per-user RLS later).
    let sub = "ems-user";
    try {
      const p = JSON.parse(atob(emsToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      sub = String(p.id || p.sub || p.userId || "ems-user");
    } catch { /* keep default */ }

    // 3) Mint a Supabase-compatible JWT (role=authenticated), valid 1h.
    const token = await create(
      { alg: "HS256", typ: "JWT" },
      { role: "authenticated", aud: "authenticated", iss: "ems-bridge", sub, exp: getNumericDate(60 * 60) },
      await signingKey(JWT_SECRET),
    );
    return json({ token });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
