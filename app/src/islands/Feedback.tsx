// #sigma-feedback — 📣 רעיון / באג (spec §7 Part F). Open to EVERY role, the viewer
// included: this is the one write surface a viewer has, and it is deliberate.
//
// Voice is a LADDER, not platform detection (app/src/lib/feedback.ts speechLadder):
//   live    Web Speech API he-IL, transcript straight into the textarea, nothing uploaded
//   record  MediaRecorder → private bucket `feedback-audio` → Edge Fn `transcribe` → text
// The fallback is taken when Web Speech is missing, when the mic is refused, when recognition
// errors — and when 3 s of listening produced nothing (Android on a weak signal looks exactly
// like iOS Safari from here, and both are better served by the server path than by a spinner).
import * as React from 'react';
import { toast } from 'sonner';
import { Loader2, Mic, Square } from 'lucide-react';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { toastFailure } from '@/lib/pending';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { mount } from '@/islands';
import { track } from '@/lib/track';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite, SB_ANON, SB_URL } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';
import {
  FEEDBACK_DRAFT_KEY,
  KINDS, KIND_LABEL, LIVE_NO_RESULT_MS, MIC_START_TIMEOUT_MS, RECORD_CAP_MS,
  canSubmitFeedback, feedbackDraftPayload, feedbackDraftWorthSaving, feedbackPreview,
  feedbackRow, feedbackValidate, parseFeedbackDraft, refineMerge, refinePollDelayMs, refinePollDeadlineMs,
  voiceIdle, voiceNext,
  type FeedbackKind, type FeedbackRow, type RefineFieldState, type VoiceEvent, type VoicePhase,
} from '@/lib/feedback';
import {
  buildWhisperPrompt, speechCaps, startLive, startRecording, uploadAndTranscribe, pollRefineStatus,
  type RecordSession,
} from '@/lib/speech';
import { TranscribeRetry } from '@/components/TranscribeRetry';

/**
 * A PRECONDITION failure (no EMS session) is not a service outage: retrying it fails the same
 * way forever, so it keeps its toast and the recording is not held. Read off the error object
 * rather than imported from @/lib/speech on purpose — the unit tests mock that whole module,
 * and a classifier that a mock can silently turn into `undefined` is a classifier that decides
 * nothing. `speech.ts` stamps `precondition: true`; everything else is worth a retry.
 */
function heldForRetry(e: unknown): boolean {
  return !(e && typeof e === 'object' && (e as { precondition?: boolean }).precondition === true);
}

import { EmsGate } from '@/components/EmsGate';

/** Bus event every feedback surface listens to (the inbox refetches on it). */
export const FEEDBACK_CHANGED = 'feedback-changed';
export const FEEDBACK_QUERY_KEY = ['feedback'] as const;

export function emitFeedbackChanged(detail?: Record<string, unknown>): void {
  try { (window as any).sigmaEmit?.(FEEDBACK_CHANGED, detail || {}); } catch { /* no bridge */ }
}

// ───────────────────────── the opener (no shared global) ─────────────────────────

let opener: ((kind?: FeedbackKind, prefill?: string) => void) | null = null;

/** The window event the command bar / `runAdd('feedback')` dispatch to open this sheet. */
export const FEEDBACK_OPEN_EVENT = 'sigma-open-feedback';

/** Open the feedback sheet from anywhere in the React bundle. */
export function openFeedback(kind?: FeedbackKind, prefill?: string): void {
  if (opener) opener(kind, prefill);
  else toast.error('תיבת הרעיונות עוד לא נטענה. רענן את העמוד');
}

// ───────────────────────────── the write ─────────────────────────────

/** Insert the feedback and notify the inbox owners. The push is best-effort — never blocks. */
export async function sendFeedback(row: FeedbackRow): Promise<{ id: string }> {
  const sb = await getSupabase();
  const saved = await sbWrite<{ id: string }>(() =>
    sb.from('feedback').insert(row).select('id').single() as any);

  // Fire-and-forget: the feedback is already saved, and a failed push must not read as a
  // failed send. Recipients + titles are fixed SERVER-SIDE (push-send mode feedbackNew), the
  // mode is EMS-gated (so the public anon key alone cannot push to anyone's phone), and the
  // author is never sent — an anonymous feedback must stay anonymous in the notification too.
  try {
    const token = (() => { try { return sigma?.emsToken?.() || ''; } catch { return ''; } })();
    void fetch(SB_URL + '/functions/v1/push-send', {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'feedbackNew', token, kind: row.kind, preview: feedbackPreview(row.text) }),
    }).catch(() => {});
  } catch { /* offline */ }

  emitFeedbackChanged({ kind: row.kind });
  return saved || { id: '' };
}

// ───────────────────────────── the draft store ─────────────────────────────
// Thin, defensive wrappers — a private tab, a full quota or `?sb=0` in a locked-down webview
// can all throw on a plain `localStorage.setItem`, and a draft save must never be the thing
// that crashes the sheet it exists to protect.
function safeStorageGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeStorageSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* quota / private mode */ }
}
function safeStorageRemove(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* nothing to clear */ }
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ───────────────────────────── the sheet ─────────────────────────────

const STATE_TEXT: Record<VoicePhase, string> = {
  idle: '',
  listening: 'מקליט ומתמלל…',
  recording: 'מקליט…',
  transcribing: 'מתמלל…',
  failed: 'ההקלטה נכשלה',
};

function FeedbackSheet() {
  const { name: user, role, isViewer } = useCurrentUser();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<FeedbackKind>('idea');
  const [text, setText] = React.useState('');
  const [interim, setInterim] = React.useState('');
  const [anon, setAnon] = React.useState(false);
  const [phase, setPhase] = React.useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [audioPath, setAudioPath] = React.useState<string | null>(null);
  // The recording a failed transcription left behind, and whether a retry is in flight.
  const [pendingAudio, setPendingAudio] = React.useState<{ blob: Blob; mime: string; ms: number } | null>(null);
  const [transcribing, setTranscribing] = React.useState(false);
  // Task 6b "fast + refine": once the fast transcript lands with a job_id, we poll for the
  // slower, more accurate pass and — only while the field is still untouched — swap the text
  // in silently with a small "עודכן" chip + undo (spec §7i). `fieldState` tracks real keystrokes
  // (never the voice-append text) so a poll landing after the user started typing never clobbers
  // what they wrote.
  const fieldState = React.useRef<RefineFieldState>('untouched');
  const pollTimer = React.useRef<number | null>(null);
  const [refineChip, setRefineChip] = React.useState(false);
  // F18: the refine poll used to run with no visible state and no cancel.
  const [refining, setRefining] = React.useState(false);
  const undoText = React.useRef<string | null>(null);
  // A poll tick fires well after the render that scheduled it, so it must read the LIVE text —
  // a value captured in the tick's own closure would be stale the moment the user typed a key.
  const textRef = React.useRef('');
  React.useEffect(() => { textRef.current = text; }, [text]);
  // The draft flush on close (below) reads these — a ref, not the `kind`/`anon` state
  // themselves, because the callback that flushes is memoized once and would otherwise close
  // over whatever `kind`/`anon` were on the render that created it.
  const kindRef = React.useRef<FeedbackKind>('idea');
  const anonRef = React.useRef(false);
  React.useEffect(() => { kindRef.current = kind; }, [kind]);
  React.useEffect(() => { anonRef.current = anon; }, [anon]);

  const caps = React.useMemo(() => speechCaps(), []);
  const live = React.useRef<{ stop: () => void } | null>(null);
  const rec = React.useRef<RecordSession | null>(null);
  const noResult = React.useRef<number | null>(null);
  // Watchdog on getUserMedia: an OS/webview that swallows the permission prompt never settles
  // the promise, and without this the sheet would sit on "מקליט…" forever with nothing recording.
  const micStart = React.useRef<number | null>(null);
  // The machine lives in a REF, not in state: every handler below (a recognition callback, a
  // timer, a resolved getUserMedia) must read the phase as it is at that instant, and a state
  // value captured in a closure is exactly how the double-start bug happened. `phase` state is
  // only a mirror for rendering.
  const machine = React.useRef(voiceIdle());
  // What was in the box before THIS live session started — `onFinal` now hands back the whole
  // session's transcript on every event (round 3, Android duplication fix), so it REPLACES
  // rather than appends; this prefix is what it glues that onto.
  const liveSessionPrefix = React.useRef('');

  React.useEffect(() => {
    const open = (k?: FeedbackKind, prefill?: string) => {
      if (!canSubmitFeedback(role || sigma?.getRole?.() || '')) { toast.error('יש להתחבר כדי לשלוח'); return; }
      if (k) setKind(k);
      // The crash card (js/src/00-guard.js sigmaCrash) hands the error + the last actions in as
      // the bug's text; a box the person already typed into is never overwritten.
      if (prefill) {
        setText(prev => (prev.trim() ? prev : prefill));
      } else {
        // Round 2, Package D item 1: closing the sheet (the X, a backdrop tap, a crash, a
        // reload mid-draft) must never lose what was typed or dictated. The draft is loaded
        // ONLY when there is nothing already in the box — a live in-memory draft (the sheet
        // reopened without a page reload) always wins over the stored one.
        setText(prevText => {
          if (prevText.trim()) return prevText;
          const draft = parseFeedbackDraft(safeStorageGet(FEEDBACK_DRAFT_KEY));
          if (draft) { setKind(draft.kind); setAnon(draft.anon); }
          return draft?.text ?? prevText;
        });
      }
      setOpen(true);
    };
    opener = open;
    // The command bar and `runAdd('feedback')` reach the sheet by EVENT rather than by
    // importing this module (app/src/islands/CommandBar.tsx dispatches 'sigma-open-feedback'),
    // so without this listener both of those did nothing at all. Caught by the Playwright
    // backfill, Task 22.
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail as { kind?: FeedbackKind; text?: string } | undefined;
      open(d?.kind, d?.text);
    };
    window.addEventListener(FEEDBACK_OPEN_EVENT, onEvent as EventListener);
    return () => {
      window.removeEventListener(FEEDBACK_OPEN_EVENT, onEvent as EventListener);
      opener = null;
    };
  }, [role]);

  const append = (chunk: string) => {
    const t = chunk.trim();
    if (!t) return;
    setText(prev => (prev ? prev.replace(/\s+$/, '') + ' ' + t : t));
  };

  const NOTICE: Record<string, string> = {
    unsupported: 'הדפדפן הזה לא תומך בהקלטה. אפשר להקליד',
    denied: 'אין הרשאה למיקרופון. אפשר להקליד',
    failed: 'ההקלטה נכשלה. אפשר להקליד או לנסות שוב',
    cap: 'ההקלטה נעצרה אחרי ' + Math.round(RECORD_CAP_MS / 60_000) + ' דקות',
    'mic-timeout': 'המיקרופון לא נפתח. נסה שוב או הקלד',
  };

  // ── ONE dispatch for every voice transition (fix round 1) ───────────────────
  // `voiceNext` (app/src/lib/feedback.ts, goldens in voiceMachine.test.ts) decides the next
  // phase and the ONE action to perform; this function only carries that action out. Timers and
  // sessions are torn down at the TOP of every transition, so nothing scheduled before a
  // transition can act after it — that is what makes a second recorder impossible.
  const dispatch = React.useCallback((ev: VoiceEvent) => {
    const step = voiceNext(machine.current, ev, caps, Date.now());
    const before = machine.current;
    machine.current = step.machine;

    const clearTimer = () => {
      if (noResult.current) { clearTimeout(noResult.current); noResult.current = null; }
      if (micStart.current) { clearTimeout(micStart.current); micStart.current = null; }
    };
    const stopLive = () => { const s = live.current; live.current = null; s?.stop(); };
    const dropRecorder = () => { const s = rec.current; rec.current = null; s?.cancel(); };

    if (step.action !== 'none') clearTimer();

    switch (step.action) {
      case 'stop-all':
        stopLive(); dropRecorder();
        setInterim(''); setElapsed(0);
        break;

      case 'cancel-record':
        // Either the user changed their mind while getUserMedia was resolving, or the session
        // has just arrived for a leg we already left. Both must release the microphone.
        dropRecorder();
        setElapsed(0);
        break;

      case 'start-live':
        setInterim('');
        liveSessionPrefix.current = textRef.current;
        startLiveLeg();
        break;

      case 'switch-to-record':
        stopLive();
        setInterim('');
        toast.info('לא נשמע כלום. מקשיב שוב, עוד רגע');
        startRecordLeg();
        break;

      case 'start-record':
        if (before.phase === 'listening') stopLive();      // live died → recorder takes over
        setInterim('');
        startRecordLeg();
        break;

      case 'finish-record':
        finishRecordLeg();
        break;
    }

    if (step.notice) {
      const msg = NOTICE[step.notice];
      if (step.notice === 'cap') toast.info(msg); else toast.error(msg);
    }
    setPhase(step.machine.phase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps]);

  // ── the legs the actions drive. None of them decides a phase. ───────────────
  const startLiveLeg = () => {
    const session = startLive({
      // `t` is the WHOLE session transcript so far (round 3) — replace, glued onto the
      // untouched prefix, never appended chunk-by-chunk (that is how "אני אני הייתי…" happened
      // on Android, which re-delivers already-finalised results as new final events).
      onFinal: t => {
        dispatch('live-result');
        const prefix = liveSessionPrefix.current.replace(/\s+$/, '');
        setText(t ? (prefix ? prefix + ' ' + t : t) : prefix);
        setInterim('');
      },
      onInterim: t => { if (t) dispatch('live-result'); setInterim(t); },
      onError: kindOfError => dispatch(kindOfError === 'denied' ? 'live-denied' : 'live-failed'),
      onEnd: () => { live.current = null; dispatch('live-end'); },
    });
    if (!session) { dispatch('live-failed'); return; }        // no API after all → the ladder falls through
    live.current = session;
    noResult.current = window.setTimeout(() => dispatch('no-result-timeout'), LIVE_NO_RESULT_MS);
  };

  const startRecordLeg = () => {
    setElapsed(0);
    // Armed BEFORE the call, cleared by the next transition (a resolved session dispatches
    // 'record-ready', which clears it); if neither happens the watchdog fires.
    micStart.current = window.setTimeout(() => dispatch('start-timeout'), MIC_START_TIMEOUT_MS);
    void startRecording({
      onTick: setElapsed,
      onCap: () => dispatch('record-cap'),
      onError: k => dispatch(k === 'denied' ? 'record-denied' : 'record-error'),
    }).then(session => {
      if (!session) return;                                  // onError already dispatched
      rec.current = session;
      dispatch('record-ready');                              // cancels itself if we already stopped
    });
  };

  // A recording whose transcription failed is HELD, not dropped (עידן 20.9). The ↻ in
  // <TranscribeRetry> re-sends this exact blob; it lives until a transcription succeeds or
  // the person discards it. Nothing here writes to the field on failure, so whatever was
  // typed — before the recording or during it — is untouched.
  const transcribeAudio = async (audio: { blob: Blob; mime: string; ms: number }) => {
    setTranscribing(true);
    try {
      // No kibbutz context here (general feedback, not a visit) — still biases the fixed
      // domain words and every kibbutz name, just without one preferred first.
      const names = (() => { try { return sigma?.kibbutzNames?.() || []; } catch { return []; } })();
      const r = await uploadAndTranscribe(audio, buildWhisperPrompt('', names));
      // A fresh recording resets "did the user touch this?" — the text the recording itself
      // added is not a hand-edit, so the refine chip stays eligible for THIS transcript.
      fieldState.current = 'untouched';
      append(r.text);
      setAudioPath(r.path);          // kept on the row for the 7-day retry window
      setPendingAudio(null);
      if (r.refined === false && r.jobId) startRefinePoll(r.jobId, r.refineEtaSeconds);
      return true;
    } catch (e: any) {
      // A precondition (no EMS session) is not a service outage: the retry would fail the same
      // way forever, so it keeps the toast and the recording is not held.
      if (!heldForRetry(e)) { toast.error(e?.message || 'התמלול נכשל'); return false; }
      // Otherwise: no toast. A toast disappears, and with it the only sign that the speech
      // still exists; the strip stays on screen with the ↻ until the person decides.
      setPendingAudio(audio);
      return false;
    } finally { setTranscribing(false); }
  };

  const finishRecordLeg = () => {
    const session = rec.current;
    rec.current = null;
    if (!session) { dispatch('transcribed'); return; }
    void session.stop().then(async audio => {
      if (!audio || audio.ms < 600) { toast.info('ההקלטה קצרה מדי'); dispatch('transcribed'); return; }
      const ok = await transcribeAudio(audio);
      // Either way the machine leaves the recording leg — the retry is a plain button on the
      // form from here, not another state of the recorder.
      dispatch(ok ? 'transcribed' : 'transcribe-failed');
    });
  };

  // ── the refine poll loop (task 6b) ──────────────────────────────────────────
  const stopRefinePoll = () => {
    if (pollTimer.current) { window.clearTimeout(pollTimer.current); pollTimer.current = null; }
    setRefining(false);
  };

  const startRefinePoll = (jobId: string, etaSeconds?: number) => {
    stopRefinePoll();
    setRefining(true);   // F18: the poll is visible from here until it ends, one way or another
    const deadline = Date.now() + refinePollDeadlineMs(etaSeconds);
    let attempt = 0;
    const tick = async () => {
      pollTimer.current = null;
      if (Date.now() >= deadline) { setRefining(false); return; }   // gave up — the fast text stands
      try {
        const res = await pollRefineStatus(jobId);
        if (res.status === 'done' && res.refined) {
          const before = textRef.current;
          const merged = refineMerge({ fieldState: fieldState.current, text: before }, res.text);
          if (merged.chip) {
            undoText.current = before;
            setText(merged.text);
            setRefineChip(true);
          }
          setRefining(false);
          return;                                          // job finished either way — stop polling
        }
        if (res.status === 'failed') { setRefining(false); return; }   // fast text stands
      } catch { /* a failed poll just tries again on the next tick */ }
      attempt += 1;
      pollTimer.current = window.setTimeout(() => { void tick(); }, refinePollDelayMs(attempt));
    };
    pollTimer.current = window.setTimeout(() => { void tick(); }, refinePollDelayMs(0));
  };

  const undoRefine = () => {
    if (undoText.current !== null) { setText(undoText.current); undoText.current = null; }
    setRefineChip(false);
  };

  // Save (or clear) the draft RIGHT NOW, from the refs — never from `kind`/`anon`/`text`
  // state directly, since this is called from callbacks that must not close over a stale
  // render. Used both by the debounce below and by the guaranteed flush on close.
  const flushDraft = React.useCallback(() => {
    if (feedbackDraftWorthSaving(textRef.current)) {
      safeStorageSet(FEEDBACK_DRAFT_KEY, JSON.stringify(
        feedbackDraftPayload({ kind: kindRef.current, text: textRef.current, anon: anonRef.current }, new Date().toISOString())));
    } else {
      safeStorageRemove(FEEDBACK_DRAFT_KEY);
    }
  }, []);

  // Leaving the sheet — or the page — with a hot microphone is the one thing that must never
  // happen, so 'close' is dispatched from both the unmount and the open→closed transition. The
  // refine poll loop gets the same treatment (spec §7i: "stop … when the field is closed").
  // The draft gets a GUARANTEED flush here too (round 2, Package D item 1): closing fast right
  // after typing used to race the debounce below — the effect that owns the pending timer
  // re-runs on `open` flipping to false and cancels it before it ever fires, so the half-second
  // of "unsaved" window was actually every close. Flushing synchronously on the way out closes
  // that gap outright. Every step is wrapped: a teardown that throws must never surface as an
  // uncaught error (Package D item 1 — "closing the sheet crashes").
  const safeCloseTeardown = React.useCallback(() => {
    try { dispatch('close'); } catch { /* teardown must never throw */ }
    try { stopRefinePoll(); } catch { /* ditto */ }
    try { flushDraft(); } catch { /* ditto */ }
  }, [dispatch, flushDraft]);
  React.useEffect(() => () => safeCloseTeardown(), [safeCloseTeardown]);
  // Only a real open→closed TRANSITION runs the teardown here — `open` starts `false` on
  // first mount, and firing on that initial render flushed an EMPTY textRef and wiped out
  // any draft from a previous session before `openFeedback()` ever got to read it back.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !open) safeCloseTeardown();
    wasOpen.current = open;
  }, [open, safeCloseTeardown]);

  // The background debounce: while the sheet is OPEN, a half-second after the last
  // keystroke/dictated word, so a tab kill or an OS-level crash (nothing left to run the
  // guaranteed close-flush above) still only costs that half second.
  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(flushDraft, 500);
    return () => window.clearTimeout(id);
  }, [open, kind, text, anon, flushDraft]);

  const reset = () => {
    setText(''); setInterim(''); setKind('idea'); setAnon(false);
    setAudioPath(null);
    stopRefinePoll();
    fieldState.current = 'untouched';
    undoText.current = null;
    setRefineChip(false);
    safeStorageRemove(FEEDBACK_DRAFT_KEY);
  };

  const micTap = () => dispatch('mic-tap');

  const send = async () => {
    const errs = feedbackValidate({ kind, text });
    if (errs.length) { toast.error(errs[0]); return; }
    setSending(true);
    fieldState.current = 'sent';
    stopRefinePoll();
    try {
      await sendFeedback(feedbackRow({ kind, text, anon, user, audioPath }));
      // The KIND only — never the text, and never who sent it when it was anonymous.
      track('feedback-sent', kind);   // 📈 שימוש (spec §7j)
      toast.success(anon ? 'נשלח אנונימית. תודה!' : 'נשלח לעידן ולעמיחי. תודה!');
      setOpen(false); reset();
    } catch (e: any) {
      // Rule 3 (F5/F10): Hebrew, with נסה שוב — and the text stays in the box to retry with.
      toastFailure(e, () => void send(), 'השליחה נכשלה');
    } finally { setSending(false); }
  };

  const voiceActive = phase === 'listening' || phase === 'recording';
  const busy = phase === 'transcribing';

  // §7p / F2. This sheet used to `reset()` on EVERY dismiss, so a backdrop tap or a stray Esc
  // wiped a dictated idea with no way back — the probe found the field empty on reopen. Now a
  // dismiss with text in it asks לשמור / לבטל / להמשיך לערוך, and the ONLY paths that clear
  // the draft are a successful send and an explicit לבטל.
  const guard = useUnsavedGuard({
    dirty: () => text.trim() !== '' || interim.trim() !== '',
    onSave: () => send(),
    onDiscard: reset,
    onClose: () => setOpen(false),
  });

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(setOpen)}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader>
          <SheetTitle>📣 תיבת רעיונות ובאגים</SheetTitle>
          <SheetDescription>
            אפשר להקליד או לדבר.
            {isViewer ? ' גם בצפייה אפשר לשלוח.' : ''}
          </SheetDescription>
        </SheetHeader>
        <EmsGate>

        <ToggleGroup
          type="single"
          value={kind}
          onValueChange={v => { if (v) setKind(v as FeedbackKind); }}
          className="mt-3 grid grid-cols-3 gap-2"
        >
          {KINDS.map(k => (
            <ToggleGroupItem
              key={k}
              value={k}
              aria-label={KIND_LABEL[k]}
              className="min-h-[56px] rounded-xl border border-border bg-muted text-[15px] font-bold
                         data-[state=on]:border-transparent data-[state=on]:s-brand"
            >
              {KIND_LABEL[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* When a recording is HELD (the transcription could not be reached, עידן 20.9), the
            strip below owns the retry and says the true thing: the recording is fine, the
            transcription is not. Showing "ההקלטה נכשלה" + a second נסה שוב next to it would be
            both wrong and a second button competing for the same tap. */}
        {(voiceActive || busy || (phase === 'failed' && !pendingAudio)) && (
          <div className="mt-2 flex items-center gap-2 text-[13px] font-semibold">
            <span
              className={'inline-block h-2.5 w-2.5 rounded-full '
                + (phase === 'failed' ? 'bg-destructive' : 'bg-destructive animate-pulse')}
              aria-hidden
            />
            <span className={phase === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
              {STATE_TEXT[phase]}
            </span>
            {phase === 'failed' && (
              <button type="button" onClick={micTap}
                      className="rounded-lg border border-border px-2 py-0.5 text-[12px] font-bold hover:bg-muted">
                נסה שוב
              </button>
            )}
          </div>
        )}

        <Textarea
          value={text + (interim ? (text ? ' ' : '') + interim : '')}
          onChange={e => { fieldState.current = 'edited'; setRefineChip(false); setText(e.target.value); setInterim(''); }}
          dir="rtl"
          rows={6}
          placeholder="מה קרה / מה היה עוזר לך?"
          className="mt-2 min-h-[130px] text-[15px]"
        />

        {pendingAudio && (
          <TranscribeRetry
            seconds={pendingAudio.ms / 1000}
            busy={transcribing}
            onRetry={() => void transcribeAudio(pendingAudio)}
            onDiscard={() => setPendingAudio(null)}
          />
        )}

        {refining && (
          <div data-testid="feedback-refining"
               className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>משתפר…</span>
            <button type="button" data-testid="feedback-refine-cancel" onClick={stopRefinePoll}
                    className="underline underline-offset-2 hover:text-foreground">
              בטל
            </button>
          </div>
        )}

        {refineChip && (
          <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">עודכן</span>
            <button type="button" onClick={undoRefine} className="underline underline-offset-2 hover:text-foreground">
              ↩ בטל
            </button>
          </div>
        )}

        {/* ONE voice button, not a record-vs-live pair — the ladder (speechLadder in feedback.ts)
            picks Web Speech whenever it exists and drops to record→upload→transcribe only as
            the fallback, so the person never chooses between them (round 2, Package D item 2). */}
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-2">
          <button
            type="button"
            onClick={micTap}
            disabled={busy}
            aria-label={voiceActive ? 'עצור הקלטה' : 'הקלט'}
            className={'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg text-[14px] font-bold text-white disabled:opacity-50 '
              + (voiceActive ? 'bg-destructive' : 'bg-brand-grad')}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : voiceActive ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
            <span>{voiceActive ? 'עצור' : '🎤 דיבור לטקסט'}</span>
          </button>
          {phase === 'recording' && (
            <span className="w-[42px] text-end text-[13px] font-bold tabular-nums text-muted-foreground">
              <bdi>{mmss(elapsed)}</bdi>
            </span>
          )}
        </div>

        <label className="mt-3 flex items-center gap-2 text-[14px] font-semibold">
          <Switch checked={anon} onCheckedChange={setAnon} aria-label="שלח אנונימי" />
          שלח אנונימי
        </label>

        {/* F11 / pattern rule 4: the label STAYS while sending. It used to be replaced by a
            bare Loader2, which dropped the button's accessible name and made the pending state
            impossible to assert — the delayed-mock probe could not see it at all. */}
        <button
          type="button"
          data-testid="feedback-send"
          onClick={() => void send()}
          disabled={sending || busy}
          aria-busy={sending || undefined}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl s-brand text-[15px] font-bold disabled:opacity-40"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          שלח
        </button>
        </EmsGate>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

export function Feedback() {
  return (
    <SigmaProviders>
      <FeedbackSheet />
    </SigmaProviders>
  );
}

/** Mounted from main.tsx. Registers its own ⋯ עוד entry — for every role, viewer included. */
export function mountFeedback(): boolean {
  const ok = mount('sigma-feedback', Feedback);
  if (!ok) return false;
  registerMoreItem({
    id: 'feedback',
    label: '📣 רעיון / באג',
    icon: 'MessageSquarePlus',
    // No `roles` on purpose: all three roles may submit (spec §7). The live predicate only
    // keeps it hidden before anyone has picked who they are.
    visible: () => canSubmitFeedback(sigma?.getRole?.() || ''),
    onSelect: () => openFeedback(),
  });
  return ok;
}
