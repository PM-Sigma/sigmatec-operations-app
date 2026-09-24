// The CORS / JSON / timeout / EMS-gate preamble every Edge Function in this project starts
// with. It was copy-pasted into four of them byte for byte (task 31 audit D, F14 ②/④/⑥) —
// which meant the allowed headers, the 8 s EMS probe and the abort budget could drift apart
// silently, and a fix to one of them was a fix to one of them.
//
// Deno resolves this by relative path at deploy time; nothing bundles it.

/** The response headers every function answers with, for the one origin the app runs on. */
export const cors = (o: string) => ({
  "Access-Control-Allow-Origin": o,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

/** A JSON reply, CORS included. */
export const json = (b: unknown, s = 200, o = "*") =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

/**
 * `fetch` with a hard timeout. A slow upstream (the EMS API, GitHub, Gemini) must never make
 * a function hang — that is what caused the multi-minute cold-start stalls. Worst case now is
 * a fast failure.
 */
export async function fetchT(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(id); }
}

/** The gate: is this EMS token a live session? Any failure answers "no". */
export async function emsValid(base: string, token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const r = await fetchT(base + "/v1/employee-tasks?take=1", { headers: { Authorization: "Bearer " + token } }, 8000);
    return r.ok;
  } catch { return false; }
}

/** The one place the allowed origin is decided. */
export const appOrigin = () => Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";

/**
 * Length-independent string compare, so a wrong secret cannot be measured character by
 * character (a timing side-channel — a naive `===` returns faster the earlier the strings
 * diverge). Originally ems-auth's VIEWER_PIN check only; audit fix (Opus 24.9) extends it to
 * every cron-key comparison in push-send, which used a plain `===` until now.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length === eb.length ? 0 : 1;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
