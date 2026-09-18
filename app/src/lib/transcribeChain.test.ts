// The `transcribe` Edge Function's engine chain, unit-tested with fetch stubs.
// The chain lives in supabase/functions/transcribe/chain.ts — a Deno-free module on purpose,
// so the decision that matters (self-hosted Whisper first, Groq only as insurance) is tested
// here in the repo's one test runner instead of only in production.
import { describe, it, expect, vi } from 'vitest';
import {
  GROQ_MODEL, GROQ_URL, SELF_MODEL, SELF_TIMEOUT_MS, enginePlan, transcribeChain,
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

  it('aborts the office server after 25 s and falls back to Groq', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce((_u: string, init: any) => new Promise((_res, rej) => {
        init.signal.addEventListener('abort', () => rej(new Error('aborted')));
      }))
      .mockResolvedValueOnce(okJson('מ-Groq'));

    vi.useFakeTimers();
    const p = transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });
    await vi.advanceTimersByTimeAsync(SELF_TIMEOUT_MS + 10);
    const r = await p;
    vi.useRealTimers();

    expect(SELF_TIMEOUT_MS).toBe(25_000);
    expect(r).toMatchObject({ text: 'מ-Groq', engine: 'groq' });
    expect(fetchMock.mock.calls[1][0]).toBe(GROQ_URL);
  });
});

describe('transcribeChain — Groq fallback', () => {
  it('falls back when the office server answers 502', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('down', { status: 502 }))
      .mockResolvedValueOnce(okJson('טקסט מ-Groq'));
    const r = await transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any });

    expect(r.engine).toBe('groq');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(GROQ_URL);
    expect((init.headers as any).Authorization).toBe('Bearer gsk_x');
    expect((init.body as FormData).get('model')).toBe(GROQ_MODEL);
    expect((init.body as FormData).get('language')).toBe('he');
  });

  it('falls back when the office server throws (DNS / tunnel down)', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('dns'))
      .mockResolvedValueOnce(okJson('ok'));
    expect((await transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any })).engine)
      .toBe('groq');
  });

  it('does NOT call Groq when the fallback is off — it fails instead', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('down', { status: 502 }));
    await expect(transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV, GROQ_FALLBACK: 'off' },
      { fetch: fetchMock as any })).rejects.toThrow(/self/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports every attempt when the whole chain fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(transcribeChain(audio(), 'n.webm', { ...SELF_ENV, ...GROQ_ENV }, { fetch: fetchMock as any }))
      .rejects.toThrow(/self.*groq|groq.*self/s);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

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
