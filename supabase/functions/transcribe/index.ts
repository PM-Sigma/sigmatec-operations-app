// Supabase Edge Function: transcribe
// Hebrew speech-to-text for the feedback box (spec §7 Part F) and, later, the free-text day
// log (§7i). The browser records with MediaRecorder, uploads to the PRIVATE Storage bucket
// `feedback-audio`, and posts { path } here; this function downloads the object with the
// service role, transcribes it, deletes the object on success, and logs one transcribe_log row.
//
// ENGINE CHAIN (chain.ts, unit-tested in app/src/lib/transcribeChain.test.ts):
//   1. the office server — SELF_WHISPER_URL + SELF_WHISPER_TOKEN, OpenAI-compatible
//      /v1/audio/transcriptions, model ivrit-ai/whisper-large-v3-turbo-ct2, language=he, 25 s.
//      Free. See docs/whisper-server.md for the runbook (the manual step, עידן's server).
//   2. Groq whisper-large-v3 — the paid insurance, skipped when GROQ_FALLBACK=off.
// Answers { text, engine:'self'|'groq', ms }; 502 { error } when the whole chain failed.
//
// AUTH (hardened, fix round 1): the caller must present a VALID EMS login (`token`), the same
// gate `github` and `calendar` use. Anon was allowed at first "because the payload is only a
// path in our bucket" — but that reasoning was wrong twice: a blocklist could not keep the path
// inside the bucket (see chain.ts `validAudioPath`), and an anonymous caller could spend Groq
// credit at will. The path must ALSO match the whitelist `<name>.<audio ext>`.
//
// Secrets: SELF_WHISPER_URL, SELF_WHISPER_TOKEN, GROQ_API_KEY, GROQ_FALLBACK (optional),
// EMS_API_BASE (already set).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { transcribeChain, validAudioPath, pollRefine, checkHealth, type ChainEnv } from "./chain.ts";

/** The office server's default base (spec §7i "Whisper server — live"); SELF_WHISPER_URL
 * overrides it, so a moved/renamed server never needs a code change. */
const DEFAULT_SELF_WHISPER_URL = "https://idanhomepc.tail9e880d.ts.net";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Our own audio bucket. `visit-audio` is NOT here until that bucket actually exists. */
const ALLOWED_BUCKETS = ["feedback-audio"];
const MAX_BYTES = 25 * 1024 * 1024;   // 25 MB — ~3 min of opus with room to spare

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** The EMS-login gate — the ONE copy, in ../_shared/http.ts (F14 ⑥). */
import { emsValid } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const env: ChainEnv = {
    SELF_WHISPER_URL: Deno.env.get("SELF_WHISPER_URL") || DEFAULT_SELF_WHISPER_URL,
    SELF_WHISPER_TOKEN: Deno.env.get("SELF_WHISPER_TOKEN") || "",
    GROQ_API_KEY: Deno.env.get("GROQ_API_KEY") || "",
    GROQ_FALLBACK: Deno.env.get("GROQ_FALLBACK") || "",
  };

  // `/health` mode — open, no EMS gate (spec §7i: "a later settings chip"). Never touches audio.
  if (body.health === true) {
    const h = await checkHealth(env, { fetch });
    return json(h);
  }

  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  if (!(await emsValid(EMS_API_BASE, String(body.token || "")))) {
    return json({ error: "unauthorized: valid EMS login required" }, 401);
  }

  // Poll mode — `{ token, job_id }`, no `path`. Proxies the self server's GET with our bearer
  // so the client never holds SELF_WHISPER_TOKEN (spec §7i). No transcribe_log row: this is a
  // status check on an attempt already logged, not a new attempt against the 120/h budget.
  if (body.job_id) {
    if (!env.SELF_WHISPER_TOKEN) return json({ error: "self server not configured" }, 502);
    try {
      const s = await pollRefine(String(body.job_id), env, { fetch });
      return json(s);
    } catch (e) {
      return json({ error: "poll failed: " + String((e as Error)?.message || e) }, 502);
    }
  }

  const bucket = String(body.bucket || "feedback-audio");
  const path = String(body.path || "");
  if (!ALLOWED_BUCKETS.includes(bucket)) return json({ error: "bucket not allowed" }, 400);
  if (!validAudioPath(path)) return json({ error: "bad path" }, 400);

  const audioSec = Number.isFinite(+body.audio_sec) ? Math.max(0, Math.round(+body.audio_sec)) : null;

  // one log row per attempt — the ⚙️ health panel (spec §7i) reads engine/ms/ok from here.
  // Never fatal: a missing table must not cost the user their transcription.
  const log = async (engine: string, ms: number, ok: boolean, error?: string) => {
    try {
      await sb.from("transcribe_log").insert({
        engine, ms: Math.round(ms), ok, audio_sec: audioSec, error: error ? error.slice(0, 400) : null,
      });
    } catch { /* ignore */ }
  };

  const dl = await sb.storage.from(bucket).download(path);
  if (dl.error || !dl.data) {
    await log("none", 0, false, "download: " + (dl.error?.message || "missing"));
    return json({ error: "לא נמצאה ההקלטה" }, 404);
  }
  const blob = dl.data as Blob;
  if (blob.size > MAX_BYTES) {
    await log("none", 0, false, "too large: " + blob.size);
    return json({ error: "ההקלטה גדולה מדי (מעל 25MB)" }, 413);
  }

  const t0 = Date.now();
  try {
    const r = await transcribeChain(blob, path, env, { fetch });
    await log(r.engine, r.ms, true);
    // Retention (spec §7i): the recording is deleted the moment we have the text; a FAILED
    // one stays for the 7-day retry window that db/feedback.sql documents.
    try { await sb.storage.from(bucket).remove([path]); } catch { /* the bucket's lifecycle will */ }
    return json({
      text: r.text, engine: r.engine, ms: r.ms,
      refined: r.refined ?? true, job_id: r.job_id, refine_eta_seconds: r.refine_eta_seconds,
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await log("failed", Date.now() - t0, false, msg);
    // The upstream error is LOGGED (transcribe_log.error) but not echoed: it can carry the
    // office server's own hostname / response text, which the client has no use for.
    return json({ error: "התמלול נכשל" }, 502);
  }
});
