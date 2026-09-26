// Voice input for the feedback box (spec §7 Part F, accepted UX rec #9). Two paths, chosen at
// runtime by `speechLadder` (app/src/lib/feedback.ts), never by sniffing the user agent:
//
//   live    Web Speech API, lang he-IL, continuous — free, instant, nothing leaves the device.
//   record  MediaRecorder → private Storage bucket `feedback-audio` → Edge Fn `transcribe`
//           (self-hosted Whisper first, Groq as insurance) → text back, recording deleted.
//
// Everything decidable without a microphone is a pure function here and has goldens
// (speech.test.ts); the browser glue below is what the island drives.
import { AUDIO_BUCKET, RECORD_CAP_MS } from './feedback';
import { getSupabase, SB_ANON, SB_URL } from './supabase';
import type { SpeechCapsShape } from './feedback';

// ───────────────────────────── pure ─────────────────────────────

/** `?speech=0` — force the server path on a browser that has Web Speech (the iOS smoke). */
export function forceOffLive(search: string): boolean {
  return new URLSearchParams(String(search || '')).get('speech') === '0';
}

/** `?speech=live` — force LIVE Web Speech even though `record` is now the default whenever
 * MediaRecorder exists (testing override, added alongside the record-first default). */
export function forceLive(search: string): boolean {
  return new URLSearchParams(String(search || '')).get('speech') === 'live';
}

/** What this browser can do. `win` is injectable so the caps are testable. */
export function speechCaps(win?: any, search?: string): SpeechCapsShape {
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!w) return { speechRecognition: false, mediaRecorder: false, forceOffLive: false, forceLive: false };
  const s = search ?? (typeof location !== 'undefined' ? location.search : '');
  return {
    speechRecognition: !!(w.SpeechRecognition || w.webkitSpeechRecognition),
    mediaRecorder: !!w.MediaRecorder,
    forceOffLive: forceOffLive(s),
    forceLive: forceLive(s),
  };
}

const MIME_ORDER = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** The best container this browser can record. '' = let MediaRecorder decide (Safari ≤ 14). */
export function pickAudioMime(isTypeSupported: (t: string) => boolean): string {
  for (const t of MIME_ORDER) {
    try { if (isTypeSupported(t)) return t; } catch { return ''; }
  }
  return '';
}

export function audioExt(mime: string): string {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';                                  // '' included: Chrome/Android default
}

export function audioObjectPath(id: string, mime: string): string {
  return `${id}.${audioExt(mime)}`;
}

function uuid(): string {
  try { return crypto.randomUUID(); }
  catch { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
}

// ───────────────────────────── live recognition ─────────────────────────────

export interface LiveHandlers {
  /**
   * The finalised transcript for THIS SESSION SO FAR — REPLACES whatever the caller has shown
   * from this session, it never appends. (Round 3, Android S24: `resultIndex` cannot be
   * trusted — see `parseRecognitionEvent`.) The caller is responsible for keeping whatever
   * text existed BEFORE this live session started (a session-scoped prefix) and gluing this
   * value onto it.
   */
  onFinal: (text: string) => void;
  /** The in-flight guess for this session — shown greyed, replaced on every event. */
  onInterim: (text: string) => void;
  /** 'not-allowed' / 'service-not-allowed' = denied; anything else = failed. */
  onError: (kind: 'denied' | 'failed', detail: string) => void;
  onEnd: () => void;
}

export interface LiveSession { stop: () => void }

/** The bits of a SpeechRecognition result event this module actually reads — shaped so a
 * fake event object (a plain array of `{isFinal, 0:{transcript}}`) is enough to test with,
 * no real `SpeechRecognitionEvent` required. */
export interface RecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
export interface RecognitionEventLike { resultIndex: number; results: ArrayLike<RecognitionResultLike> }

/**
 * Pure: turn one `onresult` event into the FULL finalised transcript for this session so far
 * (`finalText`) and the CURRENT interim guess (`interimText`).
 *
 * Round 2 (desktop Chrome) trusted `resultIndex` — the first result index this event changed —
 * to avoid re-walking already-reported results. Round 3 (עידן's Galaxy S24, Android Chrome)
 * showed that assumption is desktop-only: with `continuous=true`, Android re-delivers the
 * WHOLE utterance on every tick, sometimes marking results `isFinal:true` repeatedly, and
 * `resultIndex` often just sits at 0. Trusting it there is exactly how "אני הייתי אני הייתי
 * היום…" happened — every re-announced final got appended again on top of the last.
 *
 * The fix: never trust `resultIndex`, and never APPEND. `e.results` is the browser's own
 * cumulative state for this recognition session (index 0..n, growing over time) — so
 * rebuilding `finalText`/`interimText` from index 0 on EVERY event, unconditionally, is
 * naturally idempotent: the same finalised result at the same index contributes to the output
 * exactly once no matter how many events re-announce it, and a duplicate re-announcement
 * simply rebuilds the identical string instead of a longer one. The caller then REPLACES
 * (never appends) whatever it is showing for this session with the rebuilt value.
 */
export function parseRecognitionEvent(e: RecognitionEventLike): { finalText: string; interimText: string } {
  const finals: string[] = [];
  const interims: string[] = [];
  for (let i = 0; i < e.results.length; i++) {
    const r = e.results[i];
    const txt = String(r[0]?.transcript || '').trim();
    if (!txt) continue;
    if (r.isFinal) finals.push(txt); else interims.push(txt);
  }
  return { finalText: collapseCumulativeFinals(finals).join(' ').trim(), interimText: interims.join(' ').trim() };
}

/**
 * Defense in depth for the Android bug (round: עידן's Galaxy S24 real-world test): with
 * `continuous=true`, Android Chrome has been seen delivering each final result as the
 * CUMULATIVE phrase so far at a given index — "אני" then "אני רוצה" then "אני רוצה לבדוק" …,
 * every one marked `isFinal:true` — rather than one final per index. Joining those verbatim
 * glues every prefix onto the front of the sentence ("אני אני רוצה אני רוצה לבדוק …").
 *
 * `record` is now the DEFAULT path whenever MediaRecorder exists (see `speechLadder` in
 * feedback.ts), so this only still matters on the few devices/tests that use live Web Speech.
 * The rule: walk the finals in order, and drop any final that is a case-sensitive PREFIX of (or
 * identical to) a LATER final — keep only the last, longest member of each growing chain. A
 * normal desktop sequence of unrelated, distinct finals is unaffected (none is a prefix of the
 * next) and still joins as before.
 */
function collapseCumulativeFinals(finals: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < finals.length; i++) {
    const cur = finals[i];
    // Is `cur` a prefix of (or equal to) any LATER final? If so, it's a stale cumulative
    // snapshot of a phrase that keeps growing — skip it, the later one will be kept instead.
    const supersededLater = finals.slice(i + 1).some(later => later.startsWith(cur));
    if (supersededLater) continue;
    // Is `cur` a prefix of (or equal to) something ALREADY kept? Same idea, other direction —
    // guards a final that re-announces the head of a chain out of strict order.
    if (out.some(kept => kept.startsWith(cur))) continue;
    // `cur` may itself supersede earlier kept entries (it's a longer continuation of them) —
    // those were already skipped above by the forward check, so nothing to drop here.
    out.push(cur);
  }
  return out;
}

/**
 * Start live he-IL recognition. Returns null when the API is absent, so the caller can fall
 * through to `startRecording` without duplicating the capability check.
 *
 * Stays `continuous=true` rather than switching to `continuous=false` + auto-restart-on-`onend`
 * (the other Android-proof option considered for this fix): a restart tears the recognizer down
 * and re-opens the mic, which on Android leaves an audible gap and has been observed to drop the
 * first word or two of the next phrase — worse for a dictated visit summary than any duplication
 * risk, and unnecessary now that `parseRecognitionEvent` rebuilds the whole session transcript
 * on every event instead of trusting deltas.
 */
export function startLive(h: LiveHandlers): LiveSession | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  let stopped = false;
  const rec = new Ctor();
  rec.lang = 'he-IL';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e: any) => {
    const { finalText, interimText } = parseRecognitionEvent(e);
    // Both REPLACE this session's contribution — never append — so a re-announced final
    // (Android) or a revised interim (any browser) never duplicates onto what is shown.
    h.onFinal(finalText);
    h.onInterim(interimText);
  };
  rec.onerror = (e: any) => {
    const err = String(e?.error || '');
    // 'no-speech' is not a failure the user should see — the ladder's 3 s timer already
    // handles "nothing arrived"; anything else is reported so the ladder can drop to record.
    if (err === 'no-speech' || err === 'aborted') return;
    h.onError(/not-allowed/.test(err) ? 'denied' : 'failed', err);
  };
  rec.onend = () => { if (!stopped) { stopped = true; h.onEnd(); } };
  try { rec.start(); }
  catch (e) { h.onError('failed', String((e as Error)?.message || e)); return null; }
  return {
    stop: () => {
      stopped = true;
      try { rec.stop(); } catch { /* already stopped */ }
      h.onEnd();
    },
  };
}

// ───────────────────────────── record → transcribe ─────────────────────────────

export interface RecordHandlers {
  /** Elapsed milliseconds, ~5×/s — drives the 0:42 timer. */
  onTick?: (ms: number) => void;
  /** The cap was reached; the recording stopped by itself. */
  onCap?: () => void;
  onError: (kind: 'denied' | 'failed', detail: string) => void;
}

export interface RecordSession {
  /** Stop and resolve with the recorded audio (null when nothing was captured). */
  stop: () => Promise<{ blob: Blob; mime: string; ms: number } | null>;
  /** Stop and throw the audio away. */
  cancel: () => void;
}

/**
 * Start recording. Rejects (via `onError('denied')`) when the microphone is refused — the
 * island then shows the failed state with a retry, exactly like a failed transcription.
 */
export async function startRecording(h: RecordHandlers): Promise<RecordSession | null> {
  const w = window as any;
  if (!w.MediaRecorder || !navigator?.mediaDevices?.getUserMedia) {
    h.onError('failed', 'no MediaRecorder');
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e: any) {
    h.onError(/NotAllowed|Permission|SecurityError/i.test(String(e?.name || e)) ? 'denied' : 'failed',
      String(e?.name || e?.message || e));
    return null;
  }

  const mime = pickAudioMime(t => w.MediaRecorder.isTypeSupported(t));
  const rec: MediaRecorder = new w.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const started = Date.now();
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  // No level metering here on purpose (round 2, Package D item 2): the waveform it used to
  // drive animated on the RECORD leg only and sat flat at 0 on the far more common LIVE leg
  // (Web Speech gives no signal level at all) — a meter that mostly does nothing is worse
  // than none. The 0:42 elapsed timer below is the recording's only visible feedback now.
  const tick = h.onTick ? setInterval(() => h.onTick!(Date.now() - started), 200) : 0;

  const teardown = () => {
    if (tick) clearInterval(tick);
    for (const t of stream.getTracks()) { try { t.stop(); } catch { /* gone */ } }
  };

  let settle: ((v: { blob: Blob; mime: string; ms: number } | null) => void) | null = null;
  rec.onstop = () => {
    teardown();
    const ms = Date.now() - started;
    const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }) : null;
    settle?.(blob ? { blob, mime: rec.mimeType || mime || 'audio/webm', ms } : null);
  };
  rec.start(250);

  // The 3-minute cap is enforced here, not in the UI: a backgrounded tab whose timer throttles
  // must still not upload a 40-minute file.
  const capTimer = setTimeout(() => {
    if (rec.state !== 'inactive') { h.onCap?.(); try { rec.stop(); } catch { /* */ } }
  }, RECORD_CAP_MS);

  return {
    stop: () => new Promise(res => {
      clearTimeout(capTimer);
      settle = res;
      if (rec.state === 'inactive') { teardown(); res(null); return; }
      try { rec.stop(); } catch { teardown(); res(null); }
    }),
    cancel: () => {
      clearTimeout(capTimer);
      settle = () => {};
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* */ }
      teardown();
    },
  };
}

// ───────────────────────────── whisper vocabulary hint ─────────────────────────────

/** Product/domain words Whisper otherwise mishears ("בגבעת" for גבת, "להנדיס" for לנדיס). */
export const WHISPER_DOMAIN_WORDS = [
  'לנדיס', 'Landis+Gyr', 'מונה', 'מונים', 'תלת-פאזי', 'משנה זרם', 'בקר', 'ריכוז', 'קורא',
  'גנרטור', 'צריבה', 'EMS', 'סיגמטק', 'תעודת משלוח', 'אספקה',
];

const WHISPER_PROMPT_CAP = 800;

/**
 * Build the OpenAI-style `prompt` sent to both Whisper backends to bias vocabulary (§transcribe
 * bug 2, עידן's S24: "בגבעת" instead of "גבת", "להנדיס" instead of "לנדיס"). Whisper only
 * weighs roughly its last 224 tokens of the prompt, so the fixed product/domain words go
 * LAST (always kept in full) and the current visit's kibbutz goes FIRST (most specific, and
 * short enough that it never gets truncated either); only the free-form `names` list — every
 * other kibbutz, which can be long — gets trimmed to fit the cap.
 */
export function buildWhisperPrompt(
  kibbutz: string | undefined | null,
  names: string[],
  words: string[] = WHISPER_DOMAIN_WORDS,
): string {
  const uniq = (arr: string[]) => Array.from(new Set((arr || []).map(s => String(s || '').trim()).filter(Boolean)));
  const k = String(kibbutz || '').trim();
  const otherNames = uniq(names).filter(n => n !== k);
  const wordsPart = uniq(words).join(', ');

  const fixedLen = (k ? k.length + 2 : 0) + (wordsPart ? wordsPart.length + 2 : 0);
  const budget = Math.max(0, WHISPER_PROMPT_CAP - fixedLen);
  let namesPart = '';
  for (const n of otherNames) {
    const next = namesPart ? namesPart + ', ' + n : n;
    if (next.length > budget) break;
    namesPart = next;
  }

  return [k, namesPart, wordsPart].filter(Boolean).join(', ').slice(0, WHISPER_PROMPT_CAP);
}

export interface TranscribeResult {
  text: string; engine: string; ms: number; path: string;
  /** "fast + refine" (spec §7i): when `engine==='self'`, the fast pass answers refined:false
   * with a job_id to poll; Groq has nothing to refine, so these are absent/refined:true. */
  refined: boolean; jobId?: string; refineEtaSeconds?: number;
}

export interface RefinePollResult { text: string; status: 'refining' | 'done' | 'failed'; refined: boolean; secondsRemaining?: number }

export const EMS_LOGIN_REQUIRED_VOICE = 'ההתחברות פגה, אי אפשר לתמלל עכשיו. אפשר להקליד';

/**
 * The bearer the `transcribe` function is called with: the EMS-derived Supabase pass when
 * there is a live session, the anon key otherwise — the payload is only a path inside our own
 * bucket either way. Written out twice in this file before fix round 3 (F14 ⑬).
 */
function transcribeBearer(): string {
  try {
    const pass = (window as any).sigma?.sbPass?.();
    if (pass?.token && (pass.exp || 0) > Date.now()) return pass.token as string;
  } catch { /* no bridge */ }
  return SB_ANON;
}

/**
 * Upload the recording to the private bucket and ask `transcribe` for the text. The function
 * deletes the object once it succeeded (retention is 7 days for a failure, so a retry can
 * re-transcribe the same path — that is why the path is returned either way).
 */
export async function uploadAndTranscribe(
  audio: { blob: Blob; mime: string; ms: number },
  /** Vocabulary hint (`buildWhisperPrompt`) — omitted/empty just means no bias. */
  hint?: string,
): Promise<TranscribeResult> {
  // The function is EMS-gated (it downloads with the service role and spends Groq credit), and
  // the bucket only accepts the EMS-minted pass anyway — so fail here with something the user
  // can act on instead of a 401 from two calls later.
  const ems = (() => { try { return (window as any).sigma?.emsToken?.() || ''; } catch { return ''; } })();
  // Not a transcription failure — a precondition. The islands must NOT offer "try again
  // later" for it: retrying without a sign-in fails identically, forever.
  if (!ems) throw Object.assign(new Error(EMS_LOGIN_REQUIRED_VOICE), { precondition: true });

  const path = audioObjectPath(uuid(), audio.mime);
  const sb = await getSupabase();
  const up = await sb.storage.from(AUDIO_BUCKET).upload(path, audio.blob, {
    contentType: audio.mime || 'audio/webm', upsert: false,
  });
  if (up.error) throw new Error('העלאת ההקלטה נכשלה: ' + up.error.message);

  // The pass (when there is an EMS session) is what the bucket's RLS reads; anon works too —
  // the payload is just a path inside our own bucket.
  const bearer = transcribeBearer();

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 60_000);
  let r: Response;
  try {
    r = await fetch(SB_URL + '/functions/v1/transcribe', {
      method: 'POST', signal: ac.signal,
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: ems, path, audio_sec: Math.round(audio.ms / 1000),
        ...(hint ? { prompt: hint } : {}),
      }),
    });
  } catch (e: any) {
    throw new Error(ac.signal.aborted ? 'התמלול לקח יותר מדי זמן. נסה שוב' : 'תקלת רשת בתמלול');
  } finally { clearTimeout(to); }

  const d = await r.json().catch(() => ({} as any));
  if (!r.ok || !d?.text) throw new Error(d?.error || ('התמלול נכשל (' + r.status + ')'));
  return {
    text: String(d.text).trim(), engine: String(d.engine || ''), ms: Number(d.ms || 0), path,
    refined: d.refined !== false, jobId: d.job_id ? String(d.job_id) : undefined,
    refineEtaSeconds: Number.isFinite(+d.refine_eta_seconds) ? +d.refine_eta_seconds : undefined,
  };
}

/**
 * Poll the refine job once. The island calls this every `min(secondsRemaining, 5)` s while the
 * field is open and untouched, and stops on close/unmount/1 h (spec §7i) — none of that timing
 * lives here, so it stays testable as a single fetch instead of a fake-timer dance.
 */
export async function pollRefineStatus(jobId: string): Promise<RefinePollResult> {
  const ems = (() => { try { return (window as any).sigma?.emsToken?.() || ''; } catch { return ''; } })();
  const bearer = transcribeBearer();

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 25_000);
  let r: Response;
  try {
    r = await fetch(SB_URL + '/functions/v1/transcribe', {
      method: 'POST', signal: ac.signal,
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ems, job_id: jobId }),
    });
  } finally { clearTimeout(to); }

  const d = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(d?.error || ('שגיאת עדכון (' + r.status + ')'));
  return {
    text: String(d.text || '').trim(),
    status: d.status === 'done' || d.status === 'failed' ? d.status : 'refining',
    refined: !!d.refined,
    secondsRemaining: Number.isFinite(+d.seconds_remaining) ? +d.seconds_remaining : undefined,
  };
}

/**
 * Is this failure worth holding the recording for? A transcription that could not be reached
 * (the self server down, the Groq fallback silent, a timeout, a 5xx) is — it will very likely
 * work later, with the same audio. A PRECONDITION failure is not: with no EMS session the
 * retry fails identically, forever, and offering "נסה שוב מאוחר יותר" for it would be a lie.
 */
export function isRetriableTranscribeError(e: unknown): boolean {
  return !(e && typeof e === 'object' && (e as { precondition?: boolean }).precondition === true);
}
