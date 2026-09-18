// #sigma-feedback — 📣 רעיון / באג / תלונה (spec §7 Part F). Open to EVERY role, the viewer
// included: this is the one write surface a viewer has, and it is deliberate.
//
// Voice is a LADDER, not platform detection (app/src/lib/feedback.ts speechLadder):
//   live    Web Speech API he-IL, transcript straight into the textarea, nothing uploaded
//   record  MediaRecorder → private bucket `feedback-audio` → Edge Fn `transcribe` → text
// The fallback is taken when Web Speech is missing, when the mic is refused, when recognition
// errors — and when 3 s of listening produced nothing (Android on a weak signal looks exactly
// like iOS Safari from here, and both are better served by the server path than by a spinner).
import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Loader2, Mic, Square } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite, SB_ANON, SB_URL } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';
import {
  KINDS, KIND_LABEL, RECORD_CAP_MS, canSubmitFeedback, feedbackPreview, feedbackRow,
  feedbackValidate, speechLadder, type FeedbackKind, type FeedbackRow, type VoicePhase,
} from '@/lib/feedback';
import { speechCaps, startLive, startRecording, uploadAndTranscribe, type RecordSession } from '@/lib/speech';

/** Bus event every feedback surface listens to (the inbox refetches on it). */
export const FEEDBACK_CHANGED = 'feedback-changed';
export const FEEDBACK_QUERY_KEY = ['feedback'] as const;

export function emitFeedbackChanged(detail?: Record<string, unknown>): void {
  try { (window as any).sigmaEmit?.(FEEDBACK_CHANGED, detail || {}); } catch { /* no bridge */ }
}

// ───────────────────────── the opener (no shared global) ─────────────────────────

let opener: ((kind?: FeedbackKind) => void) | null = null;

/** Open the feedback sheet from anywhere in the React bundle. */
export function openFeedback(kind?: FeedbackKind): void {
  if (opener) opener(kind);
  else toast.error('תיבת הרעיונות עוד לא נטענה — רענן את העמוד');
}

// ───────────────────────────── the write ─────────────────────────────

/** Insert the feedback and notify the inbox owners. The push is best-effort — never blocks. */
export async function sendFeedback(row: FeedbackRow): Promise<{ id: string }> {
  const sb = await getSupabase();
  const saved = await sbWrite<{ id: string }>(() =>
    sb.from('feedback').insert(row).select('id').single() as any);

  // Fire-and-forget: the feedback is already saved, and a failed push must not read as a
  // failed send. Recipients + titles are fixed SERVER-SIDE (push-send mode feedbackNew), and
  // the author is never sent — an anonymous feedback must stay anonymous in the notification.
  try {
    void fetch(SB_URL + '/functions/v1/push-send', {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'feedbackNew', kind: row.kind, preview: feedbackPreview(row.text) }),
    }).catch(() => {});
  } catch { /* offline */ }

  emitFeedbackChanged({ kind: row.kind });
  return saved || { id: '' };
}

// ───────────────────────────── the waveform ─────────────────────────────

const BARS = 12;

/** The mockup's 12-bar waveform. `level` (0..1) is the live mic signal; reduced motion → static. */
function Waveform({ level, active }: { level: number; active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => {
        // A fixed per-bar profile times the live level — the bars differ from each other
        // without re-randomising on every render (which reads as noise, not as a voice).
        const profile = 0.35 + 0.65 * Math.abs(Math.sin((i + 1) * 1.7));
        const h = active ? Math.max(0.12, Math.min(1, level * profile * 1.6)) : 0.12;
        return (
          <motion.i
            key={i}
            className="block w-[3px] rounded-full bg-brand-grad"
            style={{ height: '100%', originY: 0.5 }}
            animate={{ scaleY: h }}
            transition={reduce ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
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
  transcribing: 'מתמלל בשרת…',
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
  const [level, setLevel] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [audioPath, setAudioPath] = React.useState<string | null>(null);

  const caps = React.useMemo(() => speechCaps(), []);
  const live = React.useRef<{ stop: () => void } | null>(null);
  const rec = React.useRef<RecordSession | null>(null);
  // Nothing arrived within LIVE_NO_RESULT_MS of speaking → the ladder says `record`.
  const noResult = React.useRef<number | null>(null);
  const results = React.useRef(0);

  React.useEffect(() => {
    opener = (k?: FeedbackKind) => {
      if (!canSubmitFeedback(role || sigma?.getRole?.() || '')) { toast.error('יש להתחבר כדי לשלוח'); return; }
      if (k) setKind(k);
      setOpen(true);
    };
    return () => { opener = null; };
  }, [role]);

  const stopVoice = React.useCallback(() => {
    if (noResult.current) { clearTimeout(noResult.current); noResult.current = null; }
    live.current?.stop(); live.current = null;
    rec.current?.cancel(); rec.current = null;
    setInterim(''); setLevel(0); setElapsed(0);
  }, []);

  // Leaving the sheet with a hot microphone is the one thing that must never happen.
  React.useEffect(() => () => stopVoice(), [stopVoice]);
  React.useEffect(() => { if (!open) { stopVoice(); setPhase('idle'); } }, [open, stopVoice]);

  const reset = () => {
    setText(''); setInterim(''); setKind('idea'); setAnon(false);
    setPhase('idle'); setAudioPath(null); setLevel(0); setElapsed(0);
  };

  const append = (chunk: string) => {
    const t = chunk.trim();
    if (!t) return;
    setText(prev => (prev ? prev.replace(/\s+$/, '') + ' ' + t : t));
  };

  // ── the record → upload → transcribe leg ─────────────────────────────────
  const startRecordPath = React.useCallback(async () => {
    setPhase('recording'); setElapsed(0);
    const session = await startRecording({
      onLevel: setLevel,
      onTick: setElapsed,
      onCap: () => toast.info('ההקלטה נעצרה אחרי ' + Math.round(RECORD_CAP_MS / 60000) + ' דקות'),
      onError: (k, detail) => {
        setPhase('failed');
        toast.error(k === 'denied' ? 'אין הרשאה למיקרופון — אפשר להקליד' : 'ההקלטה נכשלה: ' + detail);
      },
    });
    if (!session) return;
    rec.current = session;
  }, []);

  const finishRecordPath = React.useCallback(async () => {
    const session = rec.current;
    rec.current = null;
    if (!session) { setPhase('idle'); return; }
    const audio = await session.stop();
    setLevel(0);
    if (!audio || audio.ms < 600) { setPhase('idle'); toast.info('ההקלטה קצרה מדי'); return; }
    setPhase('transcribing');
    try {
      const r = await uploadAndTranscribe(audio, { author: anon ? null : user });
      append(r.text);
      setAudioPath(r.path);            // kept on the row for the 7-day retry window
      setPhase('idle');
    } catch (e: any) {
      setPhase('failed');
      toast.error(e?.message || 'התמלול נכשל');
    }
  }, [anon, user]);

  // ── the live leg ─────────────────────────────────────────────────────────
  const startLivePath = React.useCallback(() => {
    results.current = 0;
    const session = startLive({
      onFinal: t => { results.current++; append(t); setInterim(''); },
      onInterim: t => { if (t) results.current++; setInterim(t); },
      onError: (k) => {
        live.current = null;
        setInterim('');
        // Denied / failed → the ladder's own answer is `record`, so take it silently rather
        // than telling the user a browser detail they cannot act on.
        if (caps.mediaRecorder) { void startRecordPath(); }
        else { setPhase('failed'); toast.error(k === 'denied' ? 'אין הרשאה למיקרופון — אפשר להקליד' : 'זיהוי הדיבור נכשל'); }
      },
      onEnd: () => { live.current = null; setInterim(''); setPhase(p => (p === 'listening' ? 'idle' : p)); },
    });
    if (!session) { void startRecordPath(); return; }
    live.current = session;
    setPhase('listening');
    const startedAt = Date.now();
    noResult.current = window.setTimeout(() => {
      const next = speechLadder(
        { phase: 'listening', liveResults: results.current, msSinceStart: Date.now() - startedAt },
        caps,
      );
      if (next === 'record') {
        live.current?.stop(); live.current = null;
        toast.info('לא נשמע כלום — עוברים להקלטה ותמלול בשרת');
        void startRecordPath();
      }
    }, 3000);
  }, [caps, startRecordPath]);

  const micTap = () => {
    if (phase === 'listening') { stopVoice(); setPhase('idle'); return; }
    if (phase === 'recording') { void finishRecordPath(); return; }
    if (phase === 'transcribing') return;
    const path = speechLadder({ phase: 'idle' }, caps);
    if (path === 'none') { toast.error('הדפדפן הזה לא תומך בהקלטה — אפשר להקליד'); return; }
    if (path === 'live') startLivePath(); else void startRecordPath();
  };

  const send = async () => {
    const errs = feedbackValidate({ kind, text });
    if (errs.length) { toast.error(errs[0]); return; }
    setSending(true);
    try {
      await sendFeedback(feedbackRow({ kind, text, anon, user, audioPath }));
      toast.success(anon ? 'נשלח אנונימית — תודה!' : 'נשלח לעידן ולעמיחי — תודה!');
      setOpen(false); reset();
    } catch (e: any) {
      toast.error(e?.message || 'השליחה נכשלה');
    } finally { setSending(false); }
  };

  const voiceActive = phase === 'listening' || phase === 'recording';
  const busy = phase === 'transcribing';

  return (
    <Sheet open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>📣 רעיון או תלונה</SheetTitle>
          <SheetDescription>
            מגיע לעידן ולעמיחי. אפשר להקליד או ללחוץ על המיקרופון.
            {isViewer ? ' גם בצפייה אפשר לשלוח.' : ''}
          </SheetDescription>
        </SheetHeader>

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
                         data-[state=on]:border-transparent data-[state=on]:bg-brand-grad data-[state=on]:text-white"
            >
              {KIND_LABEL[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {(voiceActive || busy || phase === 'failed') && (
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
          onChange={e => { setText(e.target.value); setInterim(''); }}
          dir="rtl"
          rows={6}
          placeholder="מה קרה / מה היה עוזר לך?"
          className="mt-2 min-h-[130px] text-[15px]"
        />

        <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-2">
          <button
            type="button"
            onClick={micTap}
            disabled={busy}
            aria-label={voiceActive ? 'עצור הקלטה' : 'הקלט'}
            className={'grid h-11 w-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-50 '
              + (voiceActive ? 'bg-destructive' : 'bg-brand-grad')}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" />
              : voiceActive ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <Waveform level={level} active={voiceActive} />
          <span className="w-[42px] text-end text-[13px] font-bold tabular-nums text-muted-foreground">
            <bdi>{mmss(phase === 'recording' ? elapsed : 0)}</bdi>
          </span>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[14px] font-semibold">
          <Switch checked={anon} onCheckedChange={setAnon} aria-label="שלח אנונימי" />
          שלח אנונימי
        </label>

        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || busy}
          className="mt-3 min-h-[48px] w-full rounded-xl bg-brand-grad text-[15px] font-bold text-white disabled:opacity-40"
        >
          {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'שלח'}
        </button>
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
    label: '📣 רעיון / באג / תלונה',
    icon: 'MessageSquarePlus',
    // No `roles` on purpose: all three roles may submit (spec §7). The live predicate only
    // keeps it hidden before anyone has picked who they are.
    visible: () => canSubmitFeedback(sigma?.getRole?.() || ''),
    onSelect: () => openFeedback(),
  });
  return ok;
}
