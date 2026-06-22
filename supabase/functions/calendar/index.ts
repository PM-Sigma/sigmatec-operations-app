// Supabase Edge Function: calendar
// Office-calendar backend (read + add events) via a Google service account.
//
// SECURITY (zero-tolerance design):
//   • Every request requires a VALID EMS login, verified live against the EMS API.
//   • Least privilege: the service account only accesses the ONE calendar shared with it
//     (no domain-wide delegation); scope is calendar.events only.
//   • The calendar id is fixed server-side (GCAL_ID) — the client cannot target another calendar.
//   • Secrets (GCAL_SA_EMAIL, GCAL_SA_KEY) live only in Supabase's encrypted store; never in the
//     client bundle, the repo, or logs.
//   • Input is validated + length-capped; CORS is locked to the app origin.
//
// Secrets to set (Edge Functions → Secrets):
//   GCAL_SA_EMAIL  — service-account client_email
//   GCAL_SA_KEY    — service-account private_key (full PEM, multi-line ok)
//   GCAL_ID        — calendar id (default: information@sigmatec-energy.com)
//   APP_ORIGIN     — allowed origin (default: https://pm-sigma.github.io)
//   EMS_API_BASE   — (already set) https://api.sigmatec-ems.com

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (b: unknown, s = 200, origin = "*") =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(origin), "Content-Type": "application/json" } });

function b64url(bytes: Uint8Array): string {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Cached Google access token (per isolate).
let _tok: { v: string; exp: number } | null = null;
async function googleToken(saEmail: string, saKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_tok && _tok.exp > now + 60) return _tok.v;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(saKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({
    iss: saEmail, scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const assertion = head + "." + claim + "." + b64url(new Uint8Array(sig));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + encodeURIComponent(assertion),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("google token: " + JSON.stringify(d).slice(0, 160));
  _tok = { v: d.access_token, exp: now + (d.expires_in || 3600) };
  return _tok.v;
}

async function emsValid(base: string, token: string): Promise<boolean> {
  if (!token) return false;
  try { const r = await fetch(base + "/v1/employee-tasks?take=1", { headers: { Authorization: "Bearer " + token } }); return r.ok; }
  catch { return false; }
}

Deno.serve(async (req) => {
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const SA_EMAIL = Deno.env.get("GCAL_SA_EMAIL") || "";
  const SA_KEY = Deno.env.get("GCAL_SA_KEY") || "";
  const CAL_ID = Deno.env.get("GCAL_ID") || "information@sigmatec-energy.com";
  const ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!SA_EMAIL || !SA_KEY) return json({ error: "service account not configured (set GCAL_SA_EMAIL + GCAL_SA_KEY)" }, 500, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  const calUrl = (suffix = "") =>
    "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(CAL_ID) + "/events" + suffix;

  try {
    const access = await googleToken(SA_EMAIL, SA_KEY);
    const auth = { Authorization: "Bearer " + access };

    if (body.action === "list") {
      const days = Math.min(Math.max(parseInt(body.days) || 90, 1), 365);
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + days * 86400000).toISOString();
      const r = await fetch(calUrl("?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=" +
        encodeURIComponent(timeMin) + "&timeMax=" + encodeURIComponent(timeMax)), { headers: auth });
      const d = await r.json();
      if (!r.ok) return json({ error: "calendar list failed", detail: d.error && d.error.message }, 502, ORIGIN);
      const calendar = (d.items || []).map((ev: any) => ({
        id: ev.id, title: ev.summary || "(ללא כותרת)",
        start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
        end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
        allDay: !!(ev.start && ev.start.date), location: ev.location || "", description: ev.description || "",
      }));
      return json({ calendar }, 200, ORIGIN);
    }

    if (body.action === "add") {
      const title = String(body.title || "").trim().slice(0, 300);
      if (!title) return json({ error: "title required" }, 400, ORIGIN);
      const start = new Date(body.start);
      if (isNaN(start.getTime())) return json({ error: "bad start date" }, 400, ORIGIN);
      const ev: any = {
        summary: title,
        description: String(body.description || "").slice(0, 4000),
        location: String(body.location || "").slice(0, 300),
      };
      if (body.allDay) {
        const ymd = (d: Date) => d.toISOString().slice(0, 10);
        ev.start = { date: ymd(start) }; ev.end = { date: ymd(new Date(start.getTime() + 86400000)) };
      } else {
        const end = body.end ? new Date(body.end) : new Date(start.getTime() + 3600000);
        if (isNaN(end.getTime())) return json({ error: "bad end date" }, 400, ORIGIN);
        ev.start = { dateTime: start.toISOString() }; ev.end = { dateTime: end.toISOString() };
      }
      const r = await fetch(calUrl(), { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(ev) });
      const d = await r.json();
      if (!r.ok) return json({ error: "calendar add failed", detail: d.error && d.error.message }, 502, ORIGIN);
      return json({ ok: true, id: d.id }, 200, ORIGIN);
    }

    return json({ error: "unknown action: " + (body.action || "(none)") }, 400, ORIGIN);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500, ORIGIN);
  }
});
