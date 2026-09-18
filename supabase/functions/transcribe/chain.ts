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

export interface ChainResult { text: string; engine: Engine; ms: number }

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

/** OpenAI-compatible whisper responses are `{text}`; some servers answer text/plain. */
async function readTranscript(r: Response): Promise<string> {
  const raw = await r.text();
  try {
    const j = JSON.parse(raw);
    return String(j?.text ?? j?.transcript ?? '').trim();
  } catch { return raw.trim(); }
}

async function post(
  deps: ChainDeps, url: string, headers: Record<string, string>, form: FormData, timeoutMs: number,
): Promise<string> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await deps.fetch(url, { method: 'POST', headers, body: form, signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 160));
    const text = await readTranscript(r);
    if (!text) throw new Error('empty transcript');
    return text;
  } finally { clearTimeout(id); }
}

/**
 * Transcribe `audio`, trying each engine in `enginePlan` order. Throws with EVERY attempt's
 * error in the message (so the client — and transcribe_log — say which leg failed and why).
 */
export async function transcribeChain(
  audio: Blob, filename: string, env: ChainEnv, deps: ChainDeps,
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
    const t0 = now();
    try {
      const text = await post(
        deps,
        engine === 'self' ? selfEndpoint(env.SELF_WHISPER_URL!) : GROQ_URL,
        { Authorization: 'Bearer ' + (engine === 'self' ? env.SELF_WHISPER_TOKEN : env.GROQ_API_KEY) },
        form,
        engine === 'self' ? SELF_TIMEOUT_MS : GROQ_TIMEOUT_MS,
      );
      return { text, engine, ms: Math.max(0, now() - t0) };
    } catch (e) {
      errors.push(engine + ': ' + String((e as Error)?.message || e));
    }
  }
  throw new Error('transcription failed — ' + errors.join(' | '));
}
