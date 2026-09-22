import { describe, it, expect } from 'vitest';
import {
  audioExt, audioObjectPath, forceOffLive, parseRecognitionEvent, pickAudioMime, speechCaps,
  type RecognitionEventLike,
} from './speech';

/** A fake SpeechRecognition result, shaped exactly like the browser's. */
const result = (transcript: string, isFinal: boolean) => ({ isFinal, 0: { transcript } });
const event = (resultIndex: number, results: ReturnType<typeof result>[]): RecognitionEventLike =>
  ({ resultIndex, results });

describe('forceOffLive (?speech=0)', () => {
  it('is on for ?speech=0 — the smoke path that simulates iOS', () => {
    expect(forceOffLive('?speech=0')).toBe(true);
    expect(forceOffLive('?login=0&speech=0&sb=0')).toBe(true);
  });

  it('is off otherwise', () => {
    expect(forceOffLive('')).toBe(false);
    expect(forceOffLive('?speech=1')).toBe(false);
    expect(forceOffLive('?login=0')).toBe(false);
  });
});

describe('pickAudioMime', () => {
  it('prefers webm/opus where it is supported (Chrome, Android)', () => {
    expect(pickAudioMime(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to mp4 on Safari, which supports neither webm variant', () => {
    expect(pickAudioMime(t => t === 'audio/mp4')).toBe('audio/mp4');
  });

  it('falls back to plain webm when only that is supported', () => {
    expect(pickAudioMime(t => t === 'audio/webm')).toBe('audio/webm');
  });

  it('answers empty when nothing is supported — MediaRecorder then picks its own default', () => {
    expect(pickAudioMime(() => false)).toBe('');
  });

  it('survives an isTypeSupported that throws', () => {
    expect(pickAudioMime(() => { throw new Error('no'); })).toBe('');
  });
});

describe('audioExt / audioObjectPath', () => {
  it('maps the mime types we actually record to real extensions', () => {
    expect(audioExt('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExt('audio/webm')).toBe('webm');
    expect(audioExt('audio/mp4')).toBe('m4a');
    expect(audioExt('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(audioExt('audio/ogg;codecs=opus')).toBe('ogg');
    expect(audioExt('')).toBe('webm');
  });

  it('builds a flat object path in the bucket', () => {
    expect(audioObjectPath('abc-123', 'audio/mp4')).toBe('abc-123.m4a');
  });
});

describe('parseRecognitionEvent — interim REPLACES, final APPENDS (round 2, Package D item 2)', () => {
  // Reproduces the reported bug: "זו זו זו בדיקה" — a live transcript that kept growing with
  // repeated words because a stale interim segment from an earlier event lingered instead of
  // being replaced by the current one. This sequence mirrors real continuous-recognition
  // events: the interim guess is re-sent whole on every tick (not just the new word), and a
  // browser occasionally re-announces an already-finalised result at the START of a later
  // event's `results` array while still giving the correct `resultIndex` for what is NEW.
  it('never lets an old interim survive into a newer event — only the CURRENT interim shows', () => {
    // Tick 1: "זו" is still being recognised.
    let e = event(0, [result('זו', false)]);
    expect(parseRecognitionEvent(e)).toEqual({ finals: [], interim: 'זו' });

    // Tick 2: recognition revised its guess to "זו זו" (still interim) — replaces, not appends.
    e = event(0, [result('זו זו', false)]);
    expect(parseRecognitionEvent(e)).toEqual({ finals: [], interim: 'זו זו' });

    // Tick 3: "זו" finalises (index 0 changed → resultIndex 0); a NEW interim ("בדיקה")
    // starts right after it in the same event. The caller must see exactly one final chunk
    // and one fresh interim — never the old interim text glued onto it.
    e = event(0, [result('זו', true), result('בדיקה', false)]);
    expect(parseRecognitionEvent(e)).toEqual({ finals: ['זו'], interim: 'בדיקה' });

    // Tick 4: "בדיקה" finalises too — only index 1 changed, so resultIndex is 1 and the
    // already-reported "זו" at index 0 is never re-walked. Simulating the assembling caller
    // (append-on-final, replace-on-interim, exactly like the island does) must land on
    // "זו בדיקה" — never the duplicated "זו זו זו בדיקה זו בדיקה" the bug report described.
    e = event(1, [result('זו', true), result('בדיקה', true)]);
    expect(parseRecognitionEvent(e)).toEqual({ finals: ['בדיקה'], interim: '' });

    let text = '';
    let interim = '';
    const append = (t: string) => { text = (text ? text + ' ' : '') + t; };
    for (const ev of [
      event(0, [result('זו', false)]),
      event(0, [result('זו זו', false)]),
      event(0, [result('זו', true), result('בדיקה', false)]),
      event(1, [result('זו', true), result('בדיקה', true)]),
    ]) {
      const { finals, interim: i } = parseRecognitionEvent(ev);
      for (const f of finals) append(f);
      interim = i;
    }
    expect(text).toBe('זו בדיקה');
    expect(interim).toBe('');
  });

  it('never re-emits an already-finalised result as a later final (no double-append)', () => {
    const e1 = event(0, [result('בדיקה ראשונה', true)]);
    const e2 = event(1, [result('בדיקה ראשונה', true), result('עוד משפט', true)]); // resultIndex=1 → only the NEW one
    expect(parseRecognitionEvent(e1).finals).toEqual(['בדיקה ראשונה']);
    expect(parseRecognitionEvent(e2).finals).toEqual(['עוד משפט']);
  });
});

describe('speechCaps', () => {
  const win = (o: Record<string, unknown>) => o as any;

  it('sees the live path on Chrome (webkit-prefixed) and on standards-compliant browsers', () => {
    expect(speechCaps(win({ webkitSpeechRecognition: function () {} }), '').speechRecognition).toBe(true);
    expect(speechCaps(win({ SpeechRecognition: function () {} }), '').speechRecognition).toBe(true);
  });

  it('sees no live path on iOS Safari', () => {
    expect(speechCaps(win({ MediaRecorder: function () {} }), '')).toMatchObject({
      speechRecognition: false, mediaRecorder: true,
    });
  });

  it('reports forceOffLive from the query string', () => {
    expect(speechCaps(win({ webkitSpeechRecognition: function () {} }), '?speech=0').forceOffLive).toBe(true);
  });

  it('is all-false in a non-browser (tests, SSR)', () => {
    expect(speechCaps(undefined, '')).toEqual({ speechRecognition: false, mediaRecorder: false, forceOffLive: false });
  });

  // Microphone PERMISSION is deliberately not a capability: it can only be learned by asking,
  // and a denial is handled by the ladder (deniedLive → record → failed), not by hiding the mic.
  it('reports the recorder path from MediaRecorder alone', () => {
    expect(speechCaps(win({ MediaRecorder: function () {} }), '').mediaRecorder).toBe(true);
    expect(speechCaps(win({}), '').mediaRecorder).toBe(false);
  });
});
