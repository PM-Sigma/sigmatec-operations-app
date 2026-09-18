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

/** What this browser can do. `win` is injectable so the caps are testable. */
export function speechCaps(win?: any, search?: string): SpeechCapsShape {
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!w) return { speechRecognition: false, mediaRecorder: false, forceOffLive: false };
  return {
    speechRecognition: !!(w.SpeechRecognition || w.webkitSpeechRecognition),
    mediaRecorder: !!w.MediaRecorder,
    forceOffLive: forceOffLive(search ?? (typeof location !== 'undefined' ? location.search : '')),
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
  /** A finalised chunk — append it to the textarea. */
  onFinal: (text: string) => void;
  /** The in-flight guess — shown greyed, replaced on every event. */
  onInterim: (text: string) => void;
  /** 'not-allowed' / 'service-not-allowed' = denied; anything else = failed. */
  onError: (kind: 'denied' | 'failed', detail: string) => void;
  onEnd: () => void;
}

export interface LiveSession { stop: () => void }

/**
 * Start live he-IL recognition. Returns null when the API is absent, so the caller can fall
 * through to `startRecording` without duplicating the capability check.
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
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const txt = String(r[0]?.transcript || '');
      if (r.isFinal) h.onFinal(txt.trim()); else interim += txt;
    }
    h.onInterim(interim.trim());
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
  /** 0..1, ~20×/s — drives the Motion waveform. */
  onLevel?: (level: number) => void;
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

  // Level metering for the waveform. Best-effort: a browser without WebAudio still records,
  // the bars just animate on the timer instead of on the real signal.
  let audioCtx: any = null, raf = 0;
  if (h.onLevel) {
    try {
      const Ctx = w.AudioContext || w.webkitAudioContext;
      audioCtx = new Ctx();
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
        h.onLevel!(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } catch { audioCtx = null; }
  }

  const tick = h.onTick ? setInterval(() => h.onTick!(Date.now() - started), 200) : 0;

  const teardown = () => {
    if (tick) clearInterval(tick);
    if (raf) cancelAnimationFrame(raf);
    if (audioCtx) { try { audioCtx.close(); } catch { /* closed */ } }
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

export interface TranscribeResult { text: string; engine: string; ms: number; path: string }

/**
 * Upload the recording to the private bucket and ask `transcribe` for the text. The function
 * deletes the object once it succeeded (retention is 7 days for a failure, so a retry can
 * re-transcribe the same path — that is why the path is returned either way).
 */
export async function uploadAndTranscribe(
  audio: { blob: Blob; mime: string; ms: number },
  opts: { author?: string | null } = {},
): Promise<TranscribeResult> {
  const path = audioObjectPath(uuid(), audio.mime);
  const sb = await getSupabase();
  const up = await sb.storage.from(AUDIO_BUCKET).upload(path, audio.blob, {
    contentType: audio.mime || 'audio/webm', upsert: false,
  });
  if (up.error) throw new Error('העלאת ההקלטה נכשלה: ' + up.error.message);

  // The pass (when there is an EMS session) is what the bucket's RLS reads; anon works too —
  // the payload is just a path inside our own bucket.
  let bearer = SB_ANON;
  try {
    const pass = (window as any).sigma?.sbPass?.();
    if (pass?.token && (pass.exp || 0) > Date.now()) bearer = pass.token;
  } catch { /* no bridge */ }

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 60_000);
  let r: Response;
  try {
    r = await fetch(SB_URL + '/functions/v1/transcribe', {
      method: 'POST', signal: ac.signal,
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, audio_sec: Math.round(audio.ms / 1000), author: opts.author ?? null }),
    });
  } catch (e: any) {
    throw new Error(ac.signal.aborted ? 'התמלול לקח יותר מדי זמן — נסה שוב' : 'תקלת רשת בתמלול');
  } finally { clearTimeout(to); }

  const d = await r.json().catch(() => ({} as any));
  if (!r.ok || !d?.text) throw new Error(d?.error || ('התמלול נכשל (' + r.status + ')'));
  return { text: String(d.text).trim(), engine: String(d.engine || ''), ms: Number(d.ms || 0), path };
}
