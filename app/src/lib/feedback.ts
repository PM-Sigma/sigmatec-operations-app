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
