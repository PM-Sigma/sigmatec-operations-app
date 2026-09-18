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
// AUTH: anon is allowed on purpose — the payload is a path inside OUR bucket and nothing else,
// and the whole app already sits behind the EMS login gate. The object must live in
// `feedback-audio` (or `visit-audio`), so this cannot be used to read other storage.
//
// Secrets: SELF_WHISPER_URL, SELF_WHISPER_TOKEN, GROQ_API_KEY, GROQ_FALLBACK (optional).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { transcribeChain, type ChainEnv } from "./chain.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Only our own audio buckets, and no traversal / absolute paths. */
const ALLOWED_BUCKETS = ["feedback-audio", "visit-audio"];
const MAX_BYTES = 25 * 1024 * 1024;   // 25 MB — ~3 min of opus with room to spare

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function badPath(p: string): boolean {
  return !p || p.length > 300 || p.startsWith("/") || p.includes("..") || /[\r\n]/.test(p);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const bucket = String(body.bucket || "feedback-audio");
  const path = String(body.path || "");
  if (!ALLOWED_BUCKETS.includes(bucket)) return json({ error: "bucket not allowed" }, 400);
  if (badPath(path)) return json({ error: "bad path" }, 400);

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

  const env: ChainEnv = {
    SELF_WHISPER_URL: Deno.env.get("SELF_WHISPER_URL") || "",
    SELF_WHISPER_TOKEN: Deno.env.get("SELF_WHISPER_TOKEN") || "",
    GROQ_API_KEY: Deno.env.get("GROQ_API_KEY") || "",
    GROQ_FALLBACK: Deno.env.get("GROQ_FALLBACK") || "",
  };

  const t0 = Date.now();
  try {
    const r = await transcribeChain(blob, path, env, { fetch });
    await log(r.engine, r.ms, true);
    // Retention (spec §7i): the recording is deleted the moment we have the text; a FAILED
    // one stays for the 7-day retry window that db/feedback.sql documents.
    try { await sb.storage.from(bucket).remove([path]); } catch { /* the bucket's lifecycle will */ }
    return json({ text: r.text, engine: r.engine, ms: r.ms });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await log("failed", Date.now() - t0, false, msg);
    return json({ error: "התמלול נכשל", detail: msg.slice(0, 300) }, 502);
  }
});
