// The transcription engine chain, as a Deno-free module: no Deno.*, no imports, `fetch`
// injected. index.ts wires it to the runtime; app/src/lib/transcribeChain.test.ts covers the
// decision that matters — the FREE self-hosted server first, Groq only as insurance (spec §7i
// "Free-first decision", עידן 18.9).
export const SELF_MODEL = 'ivrit-ai/whisper-large-v3-turbo-ct2';
export const GROQ_MODEL = 'whisper-large-v3';
export const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
/** The office server sits behind a home/office uplink — 25 s, then Groq (spec §7i). */
export const SELF_TIMEOUT_MS = 25_000;
export const GROQ_TIMEOUT_MS = 60_000;

export type Engine = 'self' | 'groq';

/**
 * The ONLY object paths this function will touch: `<name>.<audio ext>`, nothing else.
 *
 * This is a WHITELIST on purpose. The first version blocklisted a literal ".." — but storage-js
 * does not percent-encode the object path and Deno's fetch normalises dot segments, so
 * `%2e%2e/<bucket>/<key>` walked straight out of our bucket and let an anonymous caller have any
 * object in the project transcribed back to them. Our client only ever writes
 * `crypto.randomUUID() + "." + ext` (app/src/lib/speech.ts `audioObjectPath`), so anything else
 * is refused.
 */
export function validAudioPath(p: string): boolean {
  const s = String(p ?? "");
  return s.length <= 120 && /^[A-Za-z0-9_-]+\.(webm|m4a|mp4|ogg|wav)$/.test(s);
}


export interface ChainEnv {
  SELF_WHISPER_URL?: string;
  SELF_WHISPER_TOKEN?: string;
  GROQ_API_KEY?: string;
  /** 'off' disables the paid insurance entirely (the flag spec §7i asks for). */
  GROQ_FALLBACK?: string;
}

export interface ChainDeps {
  fetch: typeof fetch;
  now?: () => number;
}

export interface ChainResult {
  text: string; engine: Engine; ms: number;
  /** Self-server "fast + refine" fields (spec §7i). Groq answers are always refined:true-shaped
   * for the client (there is nothing to poll), so we only set these for engine:'self'. */
  refined?: boolean; job_id?: string; refine_eta_seconds?: number;
}

/** One network/5xx retry, 2 s apart, before giving up on THIS engine (spec §7i ruling). A 4xx
 * (bad request, auth, payload-too-large, rate-limited) is never retried — it will fail again. */
const RETRY_DELAY_MS = 2_000;

/** Which engines are available, in order. An engine with no secrets is simply not in the plan. */
export function enginePlan(env: ChainEnv): Engine[] {
  const plan: Engine[] = [];
  if (env.SELF_WHISPER_URL && env.SELF_WHISPER_TOKEN) plan.push('self');
  if (env.GROQ_API_KEY && String(env.GROQ_FALLBACK || '').toLowerCase() !== 'off') plan.push('groq');
  return plan;
}

/** `https://whisper.example.com` → `…/v1/audio/transcriptions`, idempotently. */
export function selfEndpoint(url: string): string {
  const base = String(url || '').replace(/\/+$/, '');
  return /\/v1\/audio\/transcriptions$/.test(base) ? base : base + '/v1/audio/transcriptions';
}

interface RawAnswer { text: string; refined?: boolean; job_id?: string; refine_eta_seconds?: number }

/** OpenAI-compatible whisper responses are `{text}`; some servers answer text/plain. The self
 * server additionally answers `{text, refined:false, job_id, refine_eta_seconds}` (spec §7i). */
async function readTranscript(r: Response): Promise<RawAnswer> {
  const raw = await r.text();
  try {
    const j = JSON.parse(raw);
    return {
      text: String(j?.text ?? j?.transcript ?? '').trim(),
      refined: typeof j?.refined === 'boolean' ? j.refined : undefined,
      job_id: j?.job_id ? String(j.job_id) : undefined,
      refine_eta_seconds: Number.isFinite(+j?.refine_eta_seconds) ? +j.refine_eta_seconds : undefined,
    };
  } catch { return { text: raw.trim() }; }
}

/** A single attempt: throws `Error` tagged `.status` (HTTP code) when the server answered, or
 * untagged for a network/timeout failure — `postWithRetry` uses that to decide whether to retry. */
async function postOnce(
  deps: ChainDeps, url: string, headers: Record<string, string>, form: FormData, timeoutMs: number,
): Promise<RawAnswer> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await deps.fetch(url, { method: 'POST', headers, body: form, signal: ac.signal });
    if (!r.ok) {
      const err = new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 160)) as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    const answer = await readTranscript(r);
    if (!answer.text) {
      // Not a network/5xx problem — retrying won't help, so this is NOT retryable (status 0
      // is a defined, non-5xx sentinel; only `undefined` [network] or >=500 retries).
      const err = new Error('empty transcript') as Error & { status?: number };
      err.status = 0;
      throw err;
    }
    return answer;
  } finally { clearTimeout(id); }
}

/** Retries ONCE, 2 s later, on a network error or 5xx — never on a 4xx (spec §7i ruling). */
async function post(
  deps: ChainDeps, url: string, headers: Record<string, string>, form: FormData, timeoutMs: number,
): Promise<RawAnswer> {
  try {
    return await postOnce(deps, url, headers, form, timeoutMs);
  } catch (e) {
    const status = (e as Error & { status?: number })?.status;
    const retryable = status === undefined || status >= 500;
    if (!retryable) throw e;
    await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    return await postOnce(deps, url, headers, form, timeoutMs);
  }
}

/**
 * Transcribe `audio`, trying each engine in `enginePlan` order. Throws with EVERY attempt's
 * error in the message (so the client — and transcribe_log — say which leg failed and why).
 */
export async function transcribeChain(
  audio: Blob, filename: string, env: ChainEnv, deps: ChainDeps,
  /** OpenAI-style vocabulary hint (app/src/lib/speech.ts `buildWhisperPrompt`) — forwarded to
   * BOTH backends as-is, since both `/v1/audio/transcriptions` endpoints accept `prompt`. */
  prompt?: string,
): Promise<ChainResult> {
  const now = deps.now || (() => Date.now());
  const plan = enginePlan(env);
  if (!plan.length) throw new Error('no transcription engine configured (SELF_WHISPER_URL/_TOKEN or GROQ_API_KEY)');

  const errors: string[] = [];
  for (const engine of plan) {
    const form = new FormData();
    form.append('file', audio, filename || 'audio.webm');
    form.append('model', engine === 'self' ? SELF_MODEL : GROQ_MODEL);
    form.append('language', 'he');
    form.append('response_format', 'json');
    if (prompt) form.append('prompt', prompt);
    const t0 = now();
    try {
      const answer = await post(
        deps,
        engine === 'self' ? selfEndpoint(env.SELF_WHISPER_URL!) : GROQ_URL,
        { Authorization: 'Bearer ' + (engine === 'self' ? env.SELF_WHISPER_TOKEN : env.GROQ_API_KEY) },
        form,
        engine === 'self' ? SELF_TIMEOUT_MS : GROQ_TIMEOUT_MS,
      );
      return {
        text: answer.text, engine, ms: Math.max(0, now() - t0),
        ...(engine === 'self' ? {
          refined: answer.refined ?? false, job_id: answer.job_id, refine_eta_seconds: answer.refine_eta_seconds,
        } : {}),
      };
    } catch (e) {
      errors.push(engine + ': ' + String((e as Error)?.message || e));
    }
  }
  throw new Error('transcription failed — ' + errors.join(' | '));
}

export interface RefineStatus { text: string; status: 'refining' | 'done' | 'failed'; refined: boolean; seconds_remaining?: number }

/** GET /v1/audio/transcriptions/{job_id} on the self server — the poll leg of "fast + refine"
 * (spec §7i). Only meaningful when SELF_WHISPER_URL/_TOKEN are set; the caller (index.ts) checks. */
export async function pollRefine(jobId: string, env: ChainEnv, deps: ChainDeps): Promise<RefineStatus> {
  const base = selfEndpoint(env.SELF_WHISPER_URL!).replace(/\/v1\/audio\/transcriptions$/, '');
  const url = base + '/v1/audio/transcriptions/' + encodeURIComponent(jobId);
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), SELF_TIMEOUT_MS);
  try {
    const r = await deps.fetch(url, { headers: { Authorization: 'Bearer ' + env.SELF_WHISPER_TOKEN }, signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return {
      text: String(j?.text ?? '').trim(),
      status: j?.status === 'done' || j?.status === 'failed' ? j.status : 'refining',
      refined: !!j?.refined,
      seconds_remaining: Number.isFinite(+j?.seconds_remaining) ? +j.seconds_remaining : undefined,
    };
  } finally { clearTimeout(id); }
}

/** GET /health on the self server — open, no auth (spec §7i, for a later settings chip). */
export async function checkHealth(env: ChainEnv, deps: ChainDeps): Promise<{ ok: boolean; engine: Engine | 'none' }> {
  if (!env.SELF_WHISPER_URL) return { ok: false, engine: 'none' };
  const base = String(env.SELF_WHISPER_URL).replace(/\/+$/, '');
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), 8_000);
  try {
    const r = await deps.fetch(base + '/health', { signal: ac.signal });
    return { ok: r.ok, engine: 'self' };
  } catch { return { ok: false, engine: 'none' }; }
  finally { clearTimeout(id); }
}
