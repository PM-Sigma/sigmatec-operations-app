import { describe, it, expect } from 'vitest';
import { audioExt, audioObjectPath, forceOffLive, pickAudioMime, speechCaps } from './speech';

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
