// The strip that appears when a recording could not be transcribed (עידן's ruling 20.9).
//
// The home Whisper server is a SERVICE. The app does not probe it, does not report on it and
// does not explain it — the only contract is `transcribe`'s own reply. When that reply is a
// failure (the self server unreachable AND the Groq fallback did not answer), the person gets
// one plain Hebrew line and a ↻ that re-sends THE SAME recording.
//
// Two things make this worth a component rather than a toast:
//   · a toast disappears, and with it the only hint that thirty seconds of speech still exist;
//   · the retry has to re-send the recording, so the blob must survive the failure. The islands
//     hold it (`pendingAudio`) until the transcription succeeds or the person discards it.
// Whatever was already typed is never touched by any of this — the failure path adds nothing
// to the field and removes nothing from it.
import { RefreshCw } from 'lucide-react';

/** The one line. Deliberately the same text in both islands — it is the same situation. */
export const TRANSCRIBE_UNAVAILABLE = 'התמלול לא זמין כרגע — נסה שוב מאוחר יותר';

export function TranscribeRetry({
  seconds, busy, onRetry, onDiscard,
}: {
  /** Length of the recording being held, in seconds — so the person knows what the ↻ will send. */
  seconds: number;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      data-testid="transcribe-retry"
      role="status"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-[color:var(--sigma-warn)]/40 bg-[color:var(--sigma-warn)]/10 px-2.5 py-2"
    >
      <span className="text-[12.5px] font-semibold">{TRANSCRIBE_UNAVAILABLE}</span>
      <span className="text-[12px] text-muted-foreground">
        ההקלטה נשמרה (<bdi>{Math.max(1, Math.round(seconds))}</bdi> שנ׳)
      </span>
      <button
        type="button"
        data-testid="transcribe-retry-btn"
        disabled={busy}
        onClick={onRetry}
        className="ms-auto inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[12px] font-bold disabled:opacity-60"
      >
        <RefreshCw className={'h-3.5 w-3.5' + (busy ? ' animate-spin' : '')} />
        {busy ? 'מתמלל…' : 'נסה שוב'}
      </button>
      <button
        type="button"
        data-testid="transcribe-discard"
        onClick={onDiscard}
        className="min-h-8 rounded-full px-2 text-[12px] font-semibold text-muted-foreground"
      >
        מחק הקלטה
      </button>
    </div>
  );
}
