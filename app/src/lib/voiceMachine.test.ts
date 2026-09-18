// The voice state machine (fix round 1, finding #2).
//
// The island used to drive the ladder with ad-hoc callbacks, and two of those paths could start
// a SECOND recorder while the first was still live: a live-recognition error started the
// recorder WITHOUT cancelling the pending 3 s no-result timer (which then started another one),
// and stopping while `startRecording` was still awaiting getUserMedia left the resolved stream
// orphaned — the microphone stayed hot until the 180 s cap. `voiceNext` is now the single source
// of truth for every transition, so both are impossible by construction: the machine knows a
// start is `pending`, and it answers `none` to any event that no longer applies to its phase.
import { describe, it, expect } from 'vitest';
import { LIVE_NO_RESULT_MS, RECORD_CAP_MS, voiceIdle, voiceNext } from './feedback';

const caps = { speechRecognition: true, mediaRecorder: true };
const noLive = { speechRecognition: false, mediaRecorder: true };
const noRecorder = { speechRecognition: true, mediaRecorder: false };
const noVoice = { speechRecognition: false, mediaRecorder: false };

describe('voiceNext — starting', () => {
  it('starts live on the first tap', () => {
    const r = voiceNext(voiceIdle(), 'mic-tap', caps, 1000);
    expect(r.action).toBe('start-live');
    expect(r.machine).toMatchObject({ phase: 'listening', pending: false, startedAt: 1000 });
  });

  it('starts the recorder where Web Speech is missing, and marks the start pending', () => {
    const r = voiceNext(voiceIdle(), 'mic-tap', noLive, 0);
    expect(r.action).toBe('start-record');
    expect(r.machine).toMatchObject({ phase: 'recording', pending: true });
  });

  it('answers "unsupported" instead of starting anything with no voice path at all', () => {
    const r = voiceNext(voiceIdle(), 'mic-tap', noVoice, 0);
    expect(r.action).toBe('none');
    expect(r.notice).toBe('unsupported');
    expect(r.machine.phase).toBe('idle');
  });

  it('stops live on a second tap', () => {
    const listening = voiceNext(voiceIdle(), 'mic-tap', caps, 0).machine;
    const r = voiceNext(listening, 'mic-tap', caps, 500);
    expect(r.action).toBe('stop-all');
    expect(r.machine.phase).toBe('idle');
  });
});

describe('voiceNext — the double-start regression', () => {
  it('ignores the no-result timeout once a live error already moved us to recording', () => {
    const listening = voiceNext(voiceIdle(), 'mic-tap', caps, 0).machine;
    const afterError = voiceNext(listening, 'live-denied', caps, 100);
    expect(afterError.action).toBe('start-record');
    expect(afterError.machine).toMatchObject({ phase: 'recording', pending: true, deniedLive: true });

    const late = voiceNext(afterError.machine, 'no-result-timeout', caps, 3000);
    expect(late.action).toBe('none');                      // NOT a second start-record
    expect(late.machine.phase).toBe('recording');
  });

  it('ignores a live error that arrives after we already left listening', () => {
    let m = voiceNext(voiceIdle(), 'mic-tap', caps, 0).machine;
    m = voiceNext(m, 'no-result-timeout', caps, LIVE_NO_RESULT_MS).machine;   // now recording
    const late = voiceNext(m, 'live-failed', caps, 3200);
    expect(late.action).toBe('none');
    expect(late.machine.phase).toBe('recording');
  });

  it('ignores a tap while a recorder start is still pending, instead of starting another', () => {
    const pending = voiceNext(voiceIdle(), 'mic-tap', noLive, 0).machine;
    const second = voiceNext(pending, 'mic-tap', noLive, 10);
    expect(second.action).toBe('cancel-record');            // the pending session is thrown away
    expect(second.machine).toMatchObject({ phase: 'idle', pending: false });
  });
});

describe('voiceNext — the stop-while-pending regression', () => {
  it('cancels a recorder that resolves after the user already stopped', () => {
    const pending = voiceNext(voiceIdle(), 'mic-tap', noLive, 0).machine;
    const stopped = voiceNext(pending, 'mic-tap', noLive, 10).machine;
    const late = voiceNext(stopped, 'record-ready', noLive, 20);
    expect(late.action).toBe('cancel-record');
    expect(late.machine.phase).toBe('idle');
  });

  it('keeps a recorder that resolves while we are still recording', () => {
    const pending = voiceNext(voiceIdle(), 'mic-tap', noLive, 0).machine;
    const ready = voiceNext(pending, 'record-ready', noLive, 20);
    expect(ready.action).toBe('none');
    expect(ready.machine).toMatchObject({ phase: 'recording', pending: false });
  });

  it('cancels a pending recorder when the sheet closes mid-start', () => {
    const pending = voiceNext(voiceIdle(), 'mic-tap', noLive, 0).machine;
    const closed = voiceNext(pending, 'close', noLive, 5);
    expect(closed.action).toBe('stop-all');
    expect(closed.machine).toMatchObject({ phase: 'idle', pending: false });
  });

  it('never leaves `pending` set after a terminal event', () => {
    const pending = voiceNext(voiceIdle(), 'mic-tap', noLive, 0).machine;
    for (const ev of ['record-error', 'close', 'transcribe-failed', 'transcribed'] as const) {
      expect(voiceNext(pending, ev, noLive, 5).machine.pending).toBe(false);
    }
  });
});

describe('voiceNext — finishing', () => {
  const running = () => {
    const m = voiceNext(voiceIdle(), 'mic-tap', noLive, 0).machine;
    return voiceNext(m, 'record-ready', noLive, 20).machine;
  };

  it('finishes the recording on a tap and moves to transcribing', () => {
    const r = voiceNext(running(), 'mic-tap', noLive, 4000);
    expect(r.action).toBe('finish-record');
    expect(r.machine.phase).toBe('transcribing');
  });

  it('finishes on the 3-minute cap too', () => {
    const r = voiceNext(running(), 'record-cap', noLive, RECORD_CAP_MS);
    expect(r.action).toBe('finish-record');
    expect(r.machine.phase).toBe('transcribing');
    expect(r.notice).toBe('cap');
  });

  it('ignores a tap while transcribing', () => {
    const t = voiceNext(running(), 'mic-tap', noLive, 4000).machine;
    expect(voiceNext(t, 'mic-tap', noLive, 4100).action).toBe('none');
  });

  it('records the transcription outcome', () => {
    const t = voiceNext(running(), 'mic-tap', noLive, 4000).machine;
    expect(voiceNext(t, 'transcribed', noLive, 5000).machine.phase).toBe('idle');
    expect(voiceNext(t, 'transcribe-failed', noLive, 5000).machine.phase).toBe('failed');
  });
});

describe('voiceNext — the ladder inside the machine', () => {
  it('switches to the recorder after 3 silent seconds, stopping live first', () => {
    const listening = voiceNext(voiceIdle(), 'mic-tap', caps, 0).machine;
    const r = voiceNext(listening, 'no-result-timeout', caps, LIVE_NO_RESULT_MS);
    expect(r.action).toBe('switch-to-record');
    expect(r.machine).toMatchObject({ phase: 'recording', pending: true });
  });

  it('does not switch once live produced a result', () => {
    let m = voiceNext(voiceIdle(), 'mic-tap', caps, 0).machine;
    m = voiceNext(m, 'live-result', caps, 800).machine;
    expect(m.liveResults).toBe(1);
    const r = voiceNext(m, 'no-result-timeout', caps, LIVE_NO_RESULT_MS);
    expect(r.action).toBe('none');
    expect(r.machine.phase).toBe('listening');
  });

  it('fails with a retry when live dies and there is no recorder to fall back to', () => {
    const listening = voiceNext(voiceIdle(), 'mic-tap', noRecorder, 0).machine;
    const r = voiceNext(listening, 'live-denied', noRecorder, 10);
    expect(r.action).toBe('stop-all');
    expect(r.machine.phase).toBe('failed');
    expect(r.notice).toBe('denied');
  });

  it('retries from the failed state — and never tries live again once it was refused', () => {
    const listening = voiceNext(voiceIdle(), 'mic-tap', noRecorder, 0).machine;
    const failed = voiceNext(listening, 'live-denied', noRecorder, 10).machine;
    const retry = voiceNext(failed, 'mic-tap', caps, 30);
    expect(retry.action).toBe('start-record');
  });

  it('goes idle when live ends by itself', () => {
    const listening = voiceNext(voiceIdle(), 'mic-tap', caps, 0).machine;
    expect(voiceNext(listening, 'live-end', caps, 900).machine.phase).toBe('idle');
  });

  it('closing always stops everything, from every phase', () => {
    for (const phase of ['idle', 'listening', 'recording', 'transcribing', 'failed'] as const) {
      const r = voiceNext({ ...voiceIdle(), phase }, 'close', caps, 0);
      expect(r.action).toBe('stop-all');
      expect(r.machine).toMatchObject({ phase: 'idle', pending: false });
    }
  });
});
