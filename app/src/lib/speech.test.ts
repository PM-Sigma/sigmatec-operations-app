import { describe, it, expect } from 'vitest';
import {
  audioExt, audioObjectPath, buildWhisperPrompt, forceOffLive, parseRecognitionEvent,
  pickAudioMime, speechCaps, WHISPER_DOMAIN_WORDS,
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

describe('parseRecognitionEvent — full session rebuild, never a delta (round 3, Android S24)', () => {
  // Desktop-style sequence: resultIndex is trusted-looking but we ignore it entirely and
  // still land on the right thing, because we rebuild from index 0 every time.
  it('rebuilds interim as it revises, and finalises once — desktop-style events', () => {
    let e = event(0, [result('זו', false)]);
    expect(parseRecognitionEvent(e)).toEqual({ finalText: '', interimText: 'זו' });

    e = event(0, [result('זו זו', false)]);
    expect(parseRecognitionEvent(e)).toEqual({ finalText: '', interimText: 'זו זו' });

    e = event(0, [result('זו', true), result('בדיקה', false)]);
    expect(parseRecognitionEvent(e)).toEqual({ finalText: 'זו', interimText: 'בדיקה' });

    e = event(1, [result('זו', true), result('בדיקה', true)]);
    expect(parseRecognitionEvent(e)).toEqual({ finalText: 'זו בדיקה', interimText: '' });
  });

  // The actual bug report (round 3, עידן's Galaxy S24, Android Chrome): "הייתי היום בגבת
  // וסיפקתי שלושה מוני לנדיס" came back as "אני אני הייתי אני הייתי היום אני הייתי היום…".
  // `results` grows monotonically and Android re-announces the SAME finalised results as
  // `isFinal:true` again on later events, with `resultIndex` sitting at 0 throughout — the
  // opposite of "the first result this event changed". A caller that appended each event's
  // finals (as the old resultIndex-trusting code did) would duplicate every word; rebuilding
  // from scratch every time must not.
  it('never duplicates when Android re-announces the whole utterance with resultIndex stuck at 0', () => {
    const words = ['הייתי', 'היום', 'בגבת', 'וסיפקתי', 'שלושה', 'מוני', 'לנדיס'];
    let last = { finalText: '', interimText: '' };
    for (let n = 1; n <= words.length; n++) {
      // Android replays every already-finalised word as isFinal:true again, on EVERY event,
      // resultIndex always 0 — exactly the malformed sequence from the field report.
      const results = words.slice(0, n).map(w => result(w, true));
      const e = event(0, results);
      last = parseRecognitionEvent(e);
      // Rebuilding from scratch is naturally idempotent: this event's answer is always the
      // sentence-so-far exactly once, never the sentence-so-far duplicated.
      expect(last.finalText).toBe(words.slice(0, n).join(' '));
    }
    expect(last.finalText).toBe('הייתי היום בגבת וסיפקתי שלושה מוני לנדיס');
    expect(last.interimText).toBe('');

    // The SAME final event fired twice in a row (a real Android quirk — two onresult calls for
    // one settled utterance) must still answer identically, not doubled.
    const finalEvent = event(0, words.map(w => result(w, true)));
    expect(parseRecognitionEvent(finalEvent).finalText).toBe(parseRecognitionEvent(finalEvent).finalText);
    expect(parseRecognitionEvent(finalEvent).finalText).toBe('הייתי היום בגבת וסיפקתי שלושה מוני לנדיס');
  });

  // The real Android bug (עידן's device, 26.9, live test): "אני רוצה לבדוק, אני הייתי היום
  // בדפנה…" came out as a pile of growing prefixes ("אני", "אני אני רוצה", …). Unlike the
  // S24 report above (each result entry is a NEW word, growing the array), here Android
  // delivered SEVERAL `isFinal:true` results in one event where each one IS the cumulative
  // phrase so far at increasing indices — joining them verbatim glues every prefix onto the
  // final sentence. The fix: drop any final that is a prefix of (or equal to) a later one.
  it('collapses cumulative-phrase finals (the exact Android sequence from the growing-prefix bug) into the full sentence once', () => {
    const e = event(0, [
      result('אני', true),
      result('אני רוצה', true),
      result('אני רוצה לבדוק', true),
      result('אני רוצה לבדוק, אני הייתי היום', true),
      result('אני רוצה לבדוק, אני הייתי היום בדפנה', true),
    ]);
    expect(parseRecognitionEvent(e)).toEqual({
      finalText: 'אני רוצה לבדוק, אני הייתי היום בדפנה',
      interimText: '',
    });
  });

  it('still joins a normal desktop sequence of distinct, unrelated finals (none is a prefix of another)', () => {
    const e = event(0, [result('זו', true), result('בדיקה', true), result('רגילה', true)]);
    expect(parseRecognitionEvent(e)).toEqual({ finalText: 'זו בדיקה רגילה', interimText: '' });
  });

  it('caller REPLACES its session text with finalText — never appends — so a session-scoped prefix stays intact', () => {
    const prefix = 'טקסט שהוקלד קודם.';
    const apply = (sessionFinal: string) => (prefix + ' ' + sessionFinal).trim();
    let e = event(0, [result('הייתי', true)]);
    expect(apply(parseRecognitionEvent(e).finalText)).toBe('טקסט שהוקלד קודם. הייתי');
    e = event(0, [result('הייתי', true), result('היום', true)]);
    expect(apply(parseRecognitionEvent(e).finalText)).toBe('טקסט שהוקלד קודם. הייתי היום');
  });
});

describe('buildWhisperPrompt — vocabulary hint for the two Whisper backends', () => {
  it('puts the current visit kibbutz first, other names next, fixed domain words last', () => {
    const p = buildWhisperPrompt('גבת', ['דפנה', 'גבת', 'חוקוק']);
    expect(p.startsWith('גבת, ')).toBe(true);
    expect(p).toContain('דפנה');
    expect(p).toContain('חוקוק');
    for (const w of WHISPER_DOMAIN_WORDS) expect(p).toContain(w);
    expect(p.endsWith(WHISPER_DOMAIN_WORDS[WHISPER_DOMAIN_WORDS.length - 1])).toBe(true);
  });

  it('works with no kibbutz (general feedback) — names then the fixed words', () => {
    const p = buildWhisperPrompt('', ['דפנה', 'חוקוק']);
    expect(p.startsWith('דפנה')).toBe(true);
    expect(p).toContain('לנדיס');
  });

  it('never exceeds the 800-char cap and always keeps the fixed words when it must trim', () => {
    const manyNames = Array.from({ length: 200 }, (_, i) => 'קיבוץ' + i);
    const p = buildWhisperPrompt('גבת', manyNames);
    expect(p.length).toBeLessThanOrEqual(800);
    for (const w of WHISPER_DOMAIN_WORDS) expect(p).toContain(w);
    expect(p.startsWith('גבת, ')).toBe(true);
  });

  it('dedupes and ignores blanks', () => {
    const p = buildWhisperPrompt('גבת', ['גבת', '', '  ', 'גבת']);
    expect(p.split(', ').filter(s => s === 'גבת').length).toBe(1);
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

  it('reports forceLive from ?speech=live (testing override for the record-first default)', () => {
    expect(speechCaps(win({ webkitSpeechRecognition: function () {} }), '?speech=live').forceLive).toBe(true);
    expect(speechCaps(win({ webkitSpeechRecognition: function () {} }), '?speech=0').forceLive).toBe(false);
    expect(speechCaps(win({ webkitSpeechRecognition: function () {} }), '').forceLive).toBe(false);
  });

  it('is all-false in a non-browser (tests, SSR)', () => {
    expect(speechCaps(undefined, '')).toEqual({
      speechRecognition: false, mediaRecorder: false, forceOffLive: false, forceLive: false,
    });
  });

  // Microphone PERMISSION is deliberately not a capability: it can only be learned by asking,
  // and a denial is handled by the ladder (deniedLive → record → failed), not by hiding the mic.
  it('reports the recorder path from MediaRecorder alone', () => {
    expect(speechCaps(win({ MediaRecorder: function () {} }), '').mediaRecorder).toBe(true);
    expect(speechCaps(win({}), '').mediaRecorder).toBe(false);
  });
});
