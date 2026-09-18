// 📣 Feedback box — the pure logic (spec §7 Part F). Everything decidable without a browser
// lives here so it is covered by goldens: validation, the 80-char push preview, the insert
// payload, the voice ladder, the Git-ticket title, and the role matrix.
//
// The role matrix in one line: EVERY role may SUBMIT (the viewer included — spec §7 "all
// roles"), only an admin (canManageStaff = עידן + עמיחי) may open the INBOX.
import type { SigmaRole } from '@/bridge';

export type FeedbackKind = 'idea' | 'bug' | 'complaint';
export type FeedbackStatus = 'new' | 'seen' | 'done';

export const KINDS: FeedbackKind[] = ['idea', 'bug', 'complaint'];

/** The toggle labels — עידן's wording from the mockup ("💡 רעיון · 🐞 דיווח באג · 😠 תלונה"). */
export const KIND_LABEL: Record<FeedbackKind, string> = {
  idea: '💡 רעיון',
  bug: '🐞 דיווח באג',
  complaint: '😠 תלונה',
};

/** Push title per kind (push-send mode `feedbackNew` builds the same strings server-side). */
export const KIND_PUSH_TITLE: Record<FeedbackKind, string> = {
  idea: '📣 רעיון חדש',
  bug: '🐞 באג חדש',
  complaint: '😠 תלונה חדשה',
};

/** The `[תת-תחום]` used when the chosen parent has no sub-field of its own. */
export const KIND_SUB: Record<FeedbackKind, string> = {
  idea: 'רעיון',
  bug: 'באג',
  complaint: 'תלונה',
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'חדש', seen: 'נראה', done: 'טופל',
};

/** Shortest text we accept — below it the box is empty in practice ("ok", a stray space). */
export const FEEDBACK_MIN = 3;
/** The push body / inbox teaser length (spec: 80-char preview). */
export const PREVIEW_MAX = 80;
/** Live recognition that produced nothing for this long → drop to record+transcribe. */
export const LIVE_NO_RESULT_MS = 3000;
/** Hard cap on one recording (spec §7: 3 minutes). */
export const RECORD_CAP_MS = 180_000;
/**
 * How long we wait for getUserMedia to settle before giving up on the microphone.
 * A permission prompt the OS swallows (seen for real: an embedded webview simply never resolves
 * the promise) would otherwise leave "מקליט…" on screen forever with nothing recording.
 */
export const MIC_START_TIMEOUT_MS = 10_000;
/** The private Storage bucket for fallback recordings. */
export const AUDIO_BUCKET = 'feedback-audio';
/** Default `[מודול]` when no parent was picked (never used once עידן picks one). */
export const DEFAULT_MODULE = 'אפליקציית תפעול';

// ───────────────────────────── validation ─────────────────────────────

export function feedbackValidate(d: { kind: string; text: string }): string[] {
  const errs: string[] = [];
  if (!KINDS.includes(d.kind as FeedbackKind)) errs.push('בחר סוג: רעיון / באג / תלונה');
  if (String(d.text ?? '').trim().length < FEEDBACK_MIN) errs.push('כתוב או הקלט משהו');
  return errs;
}

// ───────────────────────────── preview ─────────────────────────────

/**
 * ≤ `max` characters, cut on a word boundary — a dictated sentence chopped mid-word reads as
 * a bug in the push, not as a teaser. Newlines collapse first: a push body is one line.
 */
export function feedbackPreview(text: string, max = PREVIEW_MAX): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max - 1);                 // leave room for the ellipsis
  const at = head.lastIndexOf(' ');
  // No space at all (one long word / a wall of characters) → hard cut, still ≤ max.
  return (at > 0 ? head.slice(0, at).trimEnd() : head) + '…';
}

// ───────────────────────────── the insert payload ─────────────────────────────

export interface FeedbackRow {
  author: string | null;
  kind: FeedbackKind;
  text: string;
  audio_path: string | null;
  status: FeedbackStatus;
}

export function feedbackRow(i: {
  kind: FeedbackKind; text: string; anon: boolean; user: string; audioPath?: string | null;
}): FeedbackRow {
  return {
    // Anonymous means anonymous: the column is null, not "אנונימי" — nothing in the row can
    // be walked back to the person, not even by an admin reading the table directly.
    author: i.anon ? null : (String(i.user || '').trim() || null),
    kind: i.kind,
    text: String(i.text ?? '').trim(),
    audio_path: i.audioPath || null,
    status: 'new',
  };
}

// ───────────────────────────── the role matrix ─────────────────────────────

/** Every logged-in role may submit — the viewer included (spec §7: "all roles"). */
export function canSubmitFeedback(role: SigmaRole | string): boolean {
  return role === 'idan' || role === 'team' || role === 'viewer';
}

/** The inbox is admins only (עידן + עמיחי), and never a viewer whatever the bridge says. */
export function canSeeFeedbackInbox(isAdmin: boolean, isViewer: boolean): boolean {
  return !!isAdmin && !isViewer;
}

// ───────────────────────────── GitHub ticket ─────────────────────────────

const TITLE_DESC_MAX = 70;

function firstLine(text: string): string {
  return String(text ?? '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
}

/**
 * `[מודול] | [תת-תחום] | [תיאור]` — the Git Ticket System rule (two-level board: every card
 * is a child of a Main Fields parent). The module + sub-field come from the PARENT עידן picks
 * in the inbox, so a bug never invents a new field; the description is the feedback's first
 * line, clipped on a word boundary.
 */
export function issueTitle(kind: FeedbackKind, text: string, parentTitle?: string): string {
  const parts = String(parentTitle || '')
    .replace(/^\s*#\d+\s*/, '')                  // "#104 התראות | …" → "התראות | …"
    .split('|').map(s => s.trim()).filter(Boolean);
  const mod = parts[0] || DEFAULT_MODULE;
  const sub = parts[1] || KIND_SUB[kind];
  return `${mod} | ${sub} | ${feedbackPreview(firstLine(text), TITLE_DESC_MAX)}`;
}

const dmy = (iso: string) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[3]}.${+m[2]}.${m[1].slice(2)}` : String(iso || '');
};

/** The issue body: the feedback verbatim, who sent it (or אנונימי), and when. */
export function issueBody(i: {
  kind: FeedbackKind; text: string; author: string | null; createdAt: string;
}): string {
  return [
    `**מתוך תיבת הרעיונות והתלונות באפליקציה** (${KIND_LABEL[i.kind]})`,
    '',
    String(i.text ?? '').trim(),
    '',
    `— ${i.author || 'אנונימי'} · ${dmy(i.createdAt)}`,
  ].join('\n');
}

// ───────────────────────────── the voice ladder ─────────────────────────────

export type VoicePhase = 'idle' | 'listening' | 'recording' | 'transcribing' | 'failed';
export type VoicePath = 'live' | 'record' | 'none';

export interface SpeechCapsShape {
  /** Web Speech API present (`SpeechRecognition` / `webkitSpeechRecognition`). */
  speechRecognition: boolean;
  /** `MediaRecorder` present → the record → Storage → `transcribe` path can run. */
  mediaRecorder: boolean;
  /** `?speech=0` — the smoke override that simulates an iOS PWA on a desktop browser. */
  forceOffLive?: boolean;
}

export interface VoiceLadderState {
  phase: VoicePhase;
  /** The user (or the OS) refused the microphone for live recognition. */
  deniedLive?: boolean;
  /** Live recognition errored out (`no-speech`, `network`, `service-not-allowed`…). */
  liveFailed?: boolean;
  /** How many results live recognition has produced so far. */
  liveResults?: number;
  /** Milliseconds since live recognition started listening. */
  msSinceStart?: number;
}

/**
 * Which voice path to use RIGHT NOW. Deliberately not platform detection (accepted UX rec #9):
 * a browser that claims Web Speech but never answers — Android on a weak signal, a locked-down
 * corporate Chrome — looks identical to iOS Safari after 3 silent seconds, and both deserve the
 * server path rather than a spinner.
 */
export function speechLadder(state: VoiceLadderState, caps: SpeechCapsShape): VoicePath {
  const record = (): VoicePath => (caps.mediaRecorder ? 'record' : 'none');
  if (caps.forceOffLive) return record();
  if (!caps.speechRecognition) return record();
  if (state.deniedLive || state.liveFailed) return record();
  if (state.phase === 'listening'
      && !(state.liveResults ?? 0)
      && (state.msSinceStart ?? 0) >= LIVE_NO_RESULT_MS) {
    // Only worth switching if there IS a fallback; otherwise keep listening.
    return caps.mediaRecorder ? 'record' : 'live';
  }
  return 'live';
}

// ───────────────────────── the voice state machine ─────────────────────────
// ONE reducer for every voice transition (fix round 1, finding #2). The island holds a
// `VoiceMachine` and does nothing but hand events to `voiceNext` and perform the single action
// it answers with; it never decides a phase on its own. That is what makes two classes of bug
// impossible rather than merely fixed:
//   • `pending` is true while `startRecording` is awaiting getUserMedia, so a second tap (or a
//     late live error, or the 3 s timer) can never start a second recorder over the first;
//   • an event that no longer applies to the current phase answers `none`, so a timer that was
//     scheduled before a transition cannot act after it.
// `speechLadder` above stays the pure "which path" rule; the machine is the "when" around it.

export type VoiceEvent =
  | 'mic-tap'
  | 'live-result'          // live recognition produced interim or final text
  | 'live-denied'          // the mic was refused for live recognition
  | 'live-failed'          // recognition errored for any other reason
  | 'live-end'             // recognition ended by itself
  | 'no-result-timeout'    // LIVE_NO_RESULT_MS passed with nothing heard
  | 'start-timeout'        // getUserMedia never settled (MIC_START_TIMEOUT_MS)
  | 'record-ready'         // startRecording resolved with a session
  | 'record-error'         // startRecording failed / the mic was refused
  | 'record-cap'           // the 180 s cap stopped the recording
  | 'transcribed'
  | 'transcribe-failed'
  | 'close';               // the sheet closed / the component unmounted

export type VoiceAction =
  | 'none'
  | 'start-live'
  | 'start-record'
  | 'switch-to-record'     // stop live, then start the recorder
  | 'finish-record'        // stop the recorder and transcribe what it captured
  | 'cancel-record'        // throw the recording away (incl. a session still being created)
  | 'stop-all';

export type VoiceNotice = 'unsupported' | 'denied' | 'failed' | 'cap' | 'mic-timeout';

export interface VoiceMachine {
  phase: VoicePhase;
  /** A recorder start is in flight. No new start may be issued while this is true. */
  pending: boolean;
  /** How many results live recognition produced (the 3 s rule reads this). */
  liveResults: number;
  /** When the current leg started, for the no-result rule. */
  startedAt: number;
  deniedLive: boolean;
  liveFailed: boolean;
}

export function voiceIdle(): VoiceMachine {
  return { phase: 'idle', pending: false, liveResults: 0, startedAt: 0, deniedLive: false, liveFailed: false };
}

export interface VoiceStep { machine: VoiceMachine; action: VoiceAction; notice?: VoiceNotice }

const stay = (m: VoiceMachine): VoiceStep => ({ machine: m, action: 'none' });

/** Pure: (state, event) → (state, ONE action to perform). `now` is injected so it is testable. */
export function voiceNext(m: VoiceMachine, ev: VoiceEvent, caps: SpeechCapsShape, now: number): VoiceStep {
  // Closing always wins, from every phase, pending or not — a hot microphone must never
  // survive the sheet.
  if (ev === 'close') return { machine: voiceIdle(), action: 'stop-all' };

  const startRecord = (from: VoiceMachine, action: VoiceAction): VoiceStep => ({
    machine: { ...from, phase: 'recording', pending: true, startedAt: now },
    action,
  });

  switch (ev) {
    case 'mic-tap': {
      if (m.phase === 'transcribing') return stay(m);
      // A tap during a pending start means "never mind": the session that is still being
      // created is cancelled the moment it resolves (see 'record-ready').
      if (m.pending) return { machine: { ...m, phase: 'idle', pending: false }, action: 'cancel-record' };
      if (m.phase === 'listening') return { machine: { ...voiceIdle(), deniedLive: m.deniedLive, liveFailed: m.liveFailed }, action: 'stop-all' };
      if (m.phase === 'recording') return { machine: { ...m, phase: 'transcribing' }, action: 'finish-record' };
      // idle / failed → start whichever path the ladder allows RIGHT NOW (a refusal earlier in
      // this session is remembered, so a retry does not ask live again).
      const path = ladderFor(m, caps);
      if (path === 'live') {
        return { machine: { ...m, phase: 'listening', pending: false, liveResults: 0, startedAt: now }, action: 'start-live' };
      }
      if (path === 'record') return startRecord({ ...m, liveResults: 0 }, 'start-record');
      return { machine: { ...m, phase: 'idle' }, action: 'none', notice: 'unsupported' };
    }

    case 'live-result':
      return m.phase === 'listening' ? stay({ ...m, liveResults: m.liveResults + 1 }) : stay(m);

    case 'live-denied':
    case 'live-failed': {
      // Late arrival: we already left listening (the 3 s timer fired, or the user stopped) —
      // acting now would start a second recorder over the live one.
      if (m.phase !== 'listening') return stay(m);
      const flagged = { ...m, deniedLive: m.deniedLive || ev === 'live-denied', liveFailed: m.liveFailed || ev === 'live-failed' };
      if (caps.mediaRecorder) return startRecord(flagged, 'start-record');
      return {
        machine: { ...flagged, phase: 'failed', pending: false },
        action: 'stop-all',
        notice: ev === 'live-denied' ? 'denied' : 'failed',
      };
    }

    case 'live-end':
      return m.phase === 'listening' ? { machine: { ...m, phase: 'idle' }, action: 'stop-all' } : stay(m);

    case 'no-result-timeout': {
      if (m.phase !== 'listening') return stay(m);           // the timer outlived its phase
      const path = ladderFor(m, caps, { listening: true, msSinceStart: now - m.startedAt });
      if (path !== 'record') return stay(m);
      return startRecord(m, 'switch-to-record');
    }

    case 'start-timeout':
      // Only meaningful while a start is STILL in flight: once the session arrived (or the leg
      // was left) the timer is stale, and a stale timer must never tear a live recording down.
      if (!m.pending) return stay(m);
      return {
        machine: { ...m, phase: 'failed', pending: false },
        action: 'cancel-record',                             // also releases a session that lands later
        notice: 'mic-timeout',
      };

    case 'record-ready':
      // The session arrived; if we are no longer recording the user changed their mind while
      // getUserMedia was still resolving, and the stream must be released at once.
      if (m.phase !== 'recording') return { machine: { ...m, pending: false }, action: 'cancel-record' };
      return stay({ ...m, pending: false });

    case 'record-error':
      return { machine: { ...m, phase: 'failed', pending: false }, action: 'stop-all', notice: 'failed' };

    case 'record-cap':
      if (m.phase !== 'recording') return stay(m);
      return { machine: { ...m, phase: 'transcribing', pending: false }, action: 'finish-record', notice: 'cap' };

    case 'transcribed':
      return { machine: { ...voiceIdle(), deniedLive: m.deniedLive, liveFailed: m.liveFailed }, action: 'none' };

    case 'transcribe-failed':
      return { machine: { ...m, phase: 'failed', pending: false }, action: 'none' };

    default:
      return stay(m);
  }
}

function ladderFor(
  m: VoiceMachine, caps: SpeechCapsShape, live?: { listening: boolean; msSinceStart: number },
): VoicePath {
  return speechLadder({
    phase: live?.listening ? 'listening' : 'idle',
    deniedLive: m.deniedLive,
    liveFailed: m.liveFailed,
    liveResults: m.liveResults,
    msSinceStart: live?.msSinceStart ?? 0,
  }, caps);
}
