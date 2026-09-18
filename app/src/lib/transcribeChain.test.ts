// The `transcribe` Edge Function's engine chain, unit-tested with fetch stubs.
// The chain lives in supabase/functions/transcribe/chain.ts — a Deno-free module on purpose,
// so the decision that matters (self-hosted Whisper first, Groq only as insurance) is tested
// here in the repo's one test runner instead of only in production.
import { describe, it, expect, vi } from 'vitest';
import {
  GROQ_MODEL, GROQ_URL, SELF_MODEL, SELF_TIMEOUT_MS, enginePlan, transcribeChain,
  pollRefine, checkHealth,
} from '../../../supabase/functions/transcribe/chain';

const SELF_ENV = { SELF_WHISPER_URL: 'https://whisper.example.com', SELF_WHISPER_TOKEN: 'tok' };
const GROQ_ENV = { GROQ_API_KEY: 'gsk_x' };
const audio = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

const okJson = (text: string) =>
  new Response(JSON.stringify({ text }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('enginePlan', () => {
  it('is self then groq when both are configured', () => {
    expect(enginePlan({ ...SELF_ENV, ...GROQ_ENV })).toEqual(['self', 'groq']);
  });

  it('is self only when Groq is switched off', () => {
    expect(enginePlan({ ...SELF_ENV, ...GROQ_ENV, GROQ_FALLBACK: 'off' })).toEqual(['self']);
  });

  it('is groq only while the office server has no secrets yet', () => {
    expect(enginePlan(GROQ_ENV)).toEqual(['groq']);
    expect(enginePlan({ ...GROQ_ENV, SELF_WHISPER_URL: 'https://x' })).toEqual(['groq']);   // url without a token
  });

  it('is empty when nothing is configured', () => {
    expect(enginePlan({})).toEqual([]);
  });

  it('accepts any GROQ_FALLBACK value other than off', () => {
    expect(enginePlan({ ...GROQ_ENV, GROQ_FALLBACK: 'on' })).toEqual(['groq']);
    expect(enginePlan({ ...GROQ_ENV, GROQ_FALLBACK: 'OFF' })).toEqual([]);   // case-insensitive
  });
});

describe('transcribeChain — self-hosted first', () => {
  it('calls the office server with the Hebrew fine-tune and returns engine:self', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson('שלום, זה מבחן'));
    const r = await transcribeChain(audio(), 'note.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });

    expect(r.text).toBe('שלום, זה מבחן');
    expect(r.engine).toBe('self');
    expect(typeof r.ms).toBe('number');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://whisper.example.com/v1/audio/transcriptions');
    expect((init.headers as any).Authorization).toBe('Bearer tok');
    const form = init.body as FormData;
    expect(form.get('model')).toBe(SELF_MODEL);
    expect(form.get('language')).toBe('he');
    expect(form.get('file')).toBeTruthy();
  });

  it('trims a trailing slash on SELF_WHISPER_URL instead of doubling it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson('א'));
    await transcribeChain(audio(), 'n.webm', { SELF_WHISPER_URL: 'https://w.example.com/', SELF_WHISPER_TOKEN: 't' },
      { fetch: fetchMock as any });
    expect(fetchMock.mock.calls[0][0]).toBe('https://w.example.com/v1/audio/transcriptions');
  });

  it('accepts a URL that already points at the endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson('א'));
    await transcribeChain(audio(), 'n.webm',
      { SELF_WHISPER_URL: 'https://w.example.com/v1/audio/transcriptions', SELF_WHISPER_TOKEN: 't' },
      { fetch: fetchMock as any });
    expect(fetchMock.mock.calls[0][0]).toBe('https://w.example.com/v1/audio/transcriptions');
  });

  it('aborts the office server after 25 s, retries once, and falls back to Groq', async () => {
    const abortOnce = (_u: string, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(new Error('aborted')));
    });
    const fetchMock = vi.fn()
      .mockImplementationOnce(abortOnce)   // self, attempt 1
      .mockImplementationOnce(abortOnce)   // self, retry (spec §7i: network error retries once)
      .mockResolvedValueOnce(okJson('מ-Groq'));

    vi.useFakeTimers();
    const p = transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    await vi.advanceTimersByTimeAsync(SELF_TIMEOUT_MS + 10);   // attempt 1 times out
    await vi.advanceTimersByTimeAsync(2_100);                  // 2 s retry delay
    await vi.advanceTimersByTimeAsync(SELF_TIMEOUT_MS + 10);   // retry times out too
    const r = await p;
    vi.useRealTimers();

    expect(SELF_TIMEOUT_MS).toBe(25_000);
    expect(r).toMatchObject({ text: 'מ-Groq', engine: 'groq' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(GROQ_URL);
  });
});

describe('transcribeChain — Groq fallback', () => {
  it('falls back when the office server answers 502 (after one retry)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('down', { status: 502 }))   // self, attempt 1
      .mockResolvedValueOnce(new Response('down', { status: 502 }))   // self, retry
      .mockResolvedValueOnce(okJson('טקסט מ-Groq'));
    vi.useFakeTimers();
    const p = transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    await vi.advanceTimersByTimeAsync(2_100);
    const r = await p;
    vi.useRealTimers();

    expect(r.engine).toBe('groq');
    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toBe(GROQ_URL);
    expect((init.headers as any).Authorization).toBe('Bearer gsk_x');
    expect((init.body as FormData).get('model')).toBe(GROQ_MODEL);
    expect((init.body as FormData).get('language')).toBe('he');
  }, 10_000);

  it('falls back when the office server throws (DNS / tunnel down), after one retry', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('dns'))
      .mockRejectedValueOnce(new Error('dns again'))
      .mockResolvedValueOnce(okJson('ok'));
    vi.useFakeTimers();
    const p = transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    await vi.advanceTimersByTimeAsync(2_100);
    const r = await p;
    vi.useRealTimers();
    expect(r.engine).toBe('groq');
  }, 10_000);

  it('does NOT call Groq when the fallback is off — retries once, then fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('down', { status: 502 }));
    vi.useFakeTimers();
    const p = expect(transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV, GROQ_FALLBACK: 'off' },
      { fetch: fetchMock as any })).rejects.toThrow(/self/);
    await vi.advanceTimersByTimeAsync(2_100);
    await p;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);   // attempt + retry, no Groq
  }, 10_000);

  it('reports every attempt when the whole chain fails (each engine retries once)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    vi.useFakeTimers();
    const p = expect(transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any }))
      .rejects.toThrow(/self.*groq|groq.*self/s);
    await vi.advanceTimersByTimeAsync(2_100);
    await vi.advanceTimersByTimeAsync(2_100);
    await p;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(4);   // self x2 + groq x2
  }, 10_000);

  it('fails loudly when no engine is configured at all', async () => {
    const fetchMock = vi.fn();
    await expect(transcribeChain(audio(), 'n.webm', {}, { fetch: fetchMock as any }))
      .rejects.toThrow(/no transcription engine/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an empty transcript as a failure and tries the next engine', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson('   '))
      .mockResolvedValueOnce(okJson('טקסט אמיתי'));
    const r = await transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    expect(r).toMatchObject({ text: 'טקסט אמיתי', engine: 'groq' });
  });

  it('accepts a plain-text response body (some servers answer text/plain)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('שלום עולם', { status: 200 }));
    expect((await transcribeChain(audio(), 'n.webm', SELF_ENV, { fetch: fetchMock as any })).text).toBe('שלום עולם');
  });
});

// ───────────── fix round 1, finding #1 (CRITICAL): the storage-path whitelist ─────────────
// `badPath` used to blocklist a literal ".." only. storage-js does not percent-encode the
// object path and Deno's fetch normalises dot segments, so "%2e%2e/<bucket>/<key>" walked out
// of the bucket and an ANON caller could have any object in the project transcribed back to
// them. The rule is now a WHITELIST: our paths are only ever `<uuid>.<ext>`.
describe('validAudioPath (whitelist)', () => {
  it('accepts exactly what the client writes — <uuid>.<ext>', async () => {
    const { validAudioPath } = await import('../../../supabase/functions/transcribe/chain');
    expect(validAudioPath('0b9c1f42-6d5e-4a77-9d2b-1f0e6a7c3b84.webm')).toBe(true);
    expect(validAudioPath('r2k9x1_note-3.m4a')).toBe(true);
    for (const ext of ['webm', 'm4a', 'mp4', 'ogg', 'wav']) expect(validAudioPath('abc.' + ext)).toBe(true);
  });

  it('rejects the percent-encoded traversal that the blocklist missed', async () => {
    const { validAudioPath } = await import('../../../supabase/functions/transcribe/chain');
    expect(validAudioPath('%2e%2e/avatars/secret.webm')).toBe(false);
    expect(validAudioPath('%2E%2E%2Fsecret.webm')).toBe(false);
    expect(validAudioPath('%2e%2e%2f%2e%2e%2fsecret.m4a')).toBe(false);
  });

  it('rejects a literal traversal, any slash, and an absolute path', async () => {
    const { validAudioPath } = await import('../../../supabase/functions/transcribe/chain');
    expect(validAudioPath('../secret.webm')).toBe(false);
    expect(validAudioPath('a/b.webm')).toBe(false);
    expect(validAudioPath('/a.webm')).toBe(false);
    expect(validAudioPath('a\b.webm')).toBe(false);
  });

  it('rejects empty, whitespace, a bare name, a foreign extension and CRLF', async () => {
    const { validAudioPath } = await import('../../../supabase/functions/transcribe/chain');
    expect(validAudioPath('')).toBe(false);
    expect(validAudioPath('   ')).toBe(false);
    expect(validAudioPath('note')).toBe(false);
    expect(validAudioPath('note.mp3')).toBe(false);
    expect(validAudioPath('note.webm\r\nx')).toBe(false);
    expect(validAudioPath('a'.repeat(300) + '.webm')).toBe(false);
  });

  it('is exactly the shape app/src/lib/speech.ts produces', async () => {
    const { validAudioPath } = await import('../../../supabase/functions/transcribe/chain');
    const { audioObjectPath } = await import('./speech');
    for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', '']) {
      expect(validAudioPath(audioObjectPath('0b9c1f42-6d5e-4a77-9d2b-1f0e6a7c3b84', mime))).toBe(true);
    }
  });
});

// ───────────── task 6b: live Whisper server — fast + refine, retry, poll, health ─────────────
describe('transcribeChain — retry-once (spec §7i ruling)', () => {
  it('retries once after a 5xx, then succeeds without falling back to Groq', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(okJson('אחרי ניסיון שני'));
    vi.useFakeTimers();
    const p = transcribeChain(audio(), 'n.webm', SELF_ENV, { fetch: fetchMock as any });
    await vi.advanceTimersByTimeAsync(2_100);
    const r = await p;
    vi.useRealTimers();
    expect(r).toMatchObject({ text: 'אחרי ניסיון שני', engine: 'self' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a network error, then falls back to Groq if the retry also fails', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('tunnel down'))
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValueOnce(okJson('מ-Groq'));
    vi.useFakeTimers();
    const p = transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    await vi.advanceTimersByTimeAsync(2_100);
    const r = await p;
    vi.useRealTimers();
    expect(r.engine).toBe('groq');
    expect(fetchMock).toHaveBeenCalledTimes(3);   // self x2 (retry) + groq x1
  });

  it('never retries a 4xx — goes straight to Groq', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('bad', { status: 400 }))
      .mockResolvedValueOnce(okJson('מ-Groq'));
    const r = await transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    expect(r.engine).toBe('groq');
    expect(fetchMock).toHaveBeenCalledTimes(2);   // self x1 (no retry) + groq x1
  });

  it('a 401 from the self server is not retried either', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(transcribeChain(audio(), 'n.webm', SELF_ENV, { fetch: fetchMock as any })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('transcribeChain — fast + refine passthrough (self only)', () => {
  const fastAnswer = (extra: object) =>
    new Response(JSON.stringify({ text: 'טקסט מהיר', refined: false, ...extra }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('carries job_id and refine_eta_seconds through for engine:self', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fastAnswer({ job_id: 'job-123', refine_eta_seconds: 8 }));
    const r = await transcribeChain(audio(), 'n.webm', SELF_ENV, { fetch: fetchMock as any });
    expect(r).toMatchObject({ text: 'טקסט מהיר', engine: 'self', refined: false, job_id: 'job-123', refine_eta_seconds: 8 });
  });

  it('does not attach job_id fields for engine:groq', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson('מ-Groq'));
    const r = await transcribeChain(audio(), 'n.webm', GROQ_ENV, { fetch: fetchMock as any });
    expect(r.job_id).toBeUndefined();
    expect(r.refined).toBeUndefined();
  });
});

describe('pollRefine', () => {
  it('reports refining with seconds_remaining', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: 'טקסט מהיר', status: 'refining', refined: false, seconds_remaining: 4 }),
      { status: 200 }));
    const s = await pollRefine('job-123', SELF_ENV, { fetch: fetchMock as any });
    expect(s).toMatchObject({ status: 'refining', refined: false, seconds_remaining: 4 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://whisper.example.com/v1/audio/transcriptions/job-123');
    expect((fetchMock.mock.calls[0][1].headers as any).Authorization).toBe('Bearer tok');
  });

  it('reports done with the refined text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: 'טקסט מתוקן', status: 'done', refined: true }), { status: 200 }));
    const s = await pollRefine('job-123', SELF_ENV, { fetch: fetchMock as any });
    expect(s).toMatchObject({ text: 'טקסט מתוקן', status: 'done', refined: true });
  });
});

describe('checkHealth', () => {
  it('is ok:true engine:self when the self server answers 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    expect(await checkHealth(SELF_ENV, { fetch: fetchMock as any })).toEqual({ ok: true, engine: 'self' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://whisper.example.com/health');
  });

  it('is ok:false engine:none when SELF_WHISPER_URL is unset', async () => {
    const fetchMock = vi.fn();
    expect(await checkHealth({}, { fetch: fetchMock as any })).toEqual({ ok: false, engine: 'none' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is ok:false engine:none on a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    expect(await checkHealth(SELF_ENV, { fetch: fetchMock as any })).toEqual({ ok: false, engine: 'none' });
  });
});
