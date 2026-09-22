// ישיבה → סיכום — the review DRAFT and everything that decides what a reviewed line becomes
// (company-process spec §1.3). PURE: no DOM, no network, no React, and — the contract a test
// enforces — **nothing from `supabase.ts`**. Not one function in this file can write, which
// is what makes "nothing is written before בצע" a property of the code rather than a promise
// in a comment.
//
// The shape of the screen, in one paragraph: the summary is parsed (lib/meetingNotes.ts) into
// per-kibbutz sentences; `draftFromParsed` turns that into a draft where every line carries a
// PROPOSED classification chip; עידן walks it, and every tap is one of the small pure
// mutators below, each returning a NEW draft (the input is never touched, so the screen keeps
// the original around and "בטל" costs nothing); `applyReview` turns the finished draft into
// the exact bundle the thin writer sends — the notes, the EMS tasks and the internal tasks.
//
// Why a draft and not "save as you go": the room is not watching this screen. The review is
// עידן alone, after the meeting, and a wrong tap that already created an EMS task inside a
// kibbutz is far more expensive than one that is undone before בצע. (The live ✏️ line in
// מצב ישיבה is the opposite case, and saves immediately — §1.2b.)
import {
  isQuiet, taskFromBullet,
  type MeetingKind, type NoteRow, type ParsedMeeting,
} from './meetingNotes';

// ───────────────────────────── the chip vocabulary ─────────────────────────────

/** §1.3, in the order the chips are offered. */
export type Chip = 'ems' | 'internal' | 'decision' | 'idea' | 'deferred' | 'chatter';

export const CHIP_LABELS: Record<Chip, string> = {
  ems: '📋 משימת EMS',
  internal: '🔒 פנימי',
  decision: '🧭 הכרעה',
  idea: '💡 רעיון',
  deferred: '⏭ נדחה',
  chatter: '— רק דיבורים',
};

export const CHIP_ORDER: Chip[] = ['ems', 'internal', 'decision', 'idea', 'deferred', 'chatter'];

/**
 * The chips this build can actually honour — the same rule the live ✏️ sheet obeys
 * (`liveChips` in meetingSession.ts): 🔒 פנימי is offered only where an internal-task write
 * path exists (lib/caps.ts `INTERNAL_TASKS_WRITABLE`, which Task 26 flips).
 */
export function reviewChips(caps: { internalTasks?: boolean } = {}): Array<{ id: Chip; label: string }> {
  return CHIP_ORDER
    .filter(id => id !== 'internal' || !!caps.internalTasks)
    .map(id => ({ id, label: CHIP_LABELS[id] }));
}

/** The prefix a chip leaves on the bullet's text, so the card still says what the line IS. */
export const CHIP_PREFIX: Partial<Record<Chip, string>> = {
  decision: '🧭 ',
  idea: '💡 ',
  deferred: '⏭ ',
};

// ───────────────────────────── the proposal ─────────────────────────────

/** "הוכרע / הוחלט / סוכם" — the sentence records a decision, not work. */
const DECISION_RE = /(הוכרע|הוחלט|החלטה|סוכם ש|ההכרעה|נקבע ש)/;
/** "רעיון / הצעה / שווה לשקול" — a direction, not an assignment. */
const IDEA_RE = /(רעיון|רעיונות|הצעה ל|שווה לשקול|כדאי לשקול|אפשר לחשוב)/;
/** "נדחה / אחרי החג / בהמשך" — real, but not now. */
const DEFERRED_RE = /(נדחה|נדחתה|לא עכשיו|אחרי החג|אחרי החגים|בהמשך|בשלב הבא|בגרסה הבאה|נחזור לזה)/;
/** "פנימי / בתוך החברה" — work no kibbutz should see. */
const INTERNAL_RE = /(פנימי|פנימית|בתוך החברה|נוהל פנימי|בינינו)/;
/**
 * An ACTION verb. Hebrew marks one with a ל־ infinitive far more reliably than any word list
 * could ("לבדוק", "להחליף", "לתאם"), so the infinitive is the rule, and the short list after
 * it only catches the phrasings that skip it ("נדרש X", "יש לוודא", "צריך").
 */
const ACTION_RE = /(^|[\s"'(])ל[א-ת]{2,}|נדרש|יש ל[א-ת]|צריך|נפתחה משימה|לפתוח משימה|באחריות/;

/**
 * One sentence → the chip the screen proposes. Pure and golden-tested: this is the only
 * judgement in the whole flow that nobody asked for, so it has to be boringly predictable.
 *
 *   · a "quiet" sentence ("ללא פערים", "אין חדש") is never work                → chatter
 *   · an explicit deferral / decision / idea / internal wording beats the verb, because
 *     "הוחלט לבדוק" is a decision that happens to contain a verb, not a task
 *   · an action verb — or an owner who was made responsible for it             → ems
 *   · anything else gets the default §1.3 asks for                             → chatter
 *   · `hadMarker` (📌 pressed on this kibbutz during the meeting) raises a would-be chatter
 *     to a decision — the marker means "this mattered", and nothing else downstream
 *     remembers that.
 */
export function proposeChip(text: string, owners: string[] = [], hadMarker = false): Chip {
  const s = String(text ?? '').trim();
  if (!s) return 'chatter';

  if (!isQuiet(s)) {
    if (DEFERRED_RE.test(s)) return 'deferred';
    if (DECISION_RE.test(s)) return 'decision';
    if (IDEA_RE.test(s)) return 'idea';
    if (INTERNAL_RE.test(s)) return 'internal';
    if (ACTION_RE.test(s) || (owners || []).length > 0) return 'ems';
  }
  return hadMarker ? 'decision' : 'chatter';
}

// ───────────────────────────── the draft ─────────────────────────────

export interface ReviewLine {
  /** Stable for the life of the draft, across edits and moves — React's key and the mover's handle. */
  key: string;
  text: string;
  owners: string[];
  chip: Chip;
  /** ✏️ rewrote the sentence. */
  edited: boolean;
  /** ➕ שורה משלי — never said aloud, so there is no transcript behind it. */
  added: boolean;
  /** The kibbutz the line sat under before it was moved here. */
  movedFrom?: string;
  /**
   * What the 📋 task modal changed about the prefill (title / description / assignee /
   * priority). It is an OVERRIDE, not a copy: whatever the modal did not touch still comes
   * from `taskFromBullet`, so editing the sentence afterwards still moves the task's title.
   * Nothing here is sent anywhere until בצע.
   */
  task?: TaskOverride;
}

export interface TaskOverride {
  title?: string;
  description?: string;
  assigneeName?: string;
  priority?: string;
}

export interface ReviewSection {
  kibbutz: string;
  lines: ReviewLine[];
}

export interface ReviewDraft {
  meeting_date: string;
  meeting_kind: MeetingKind;
  sections: ReviewSection[];
}

/** Kibbutzim that were 📌-marked during the meeting — raises their chatter lines to decisions. */
export interface DraftOptions { marked?: string[] }

const cloneLine = (l: ReviewLine): ReviewLine =>
  ({ ...l, owners: l.owners.slice(), ...(l.task ? { task: { ...l.task } } : {}) });
const cloneSection = (s: ReviewSection): ReviewSection => ({ ...s, lines: s.lines.map(cloneLine) });
const cloneDraft = (d: ReviewDraft): ReviewDraft => ({ ...d, sections: d.sections.map(cloneSection) });

/**
 * A parsed summary → the draft the review screen opens with. One section per CARD (a summary
 * section naming several kibbutzim is copied to each, exactly as `rowsFromParsed` does), and
 * a section whose name matched no card produces nothing — an unmatched name is dealt with in
 * the import preview, not here.
 */
export function draftFromParsed(parsed: ParsedMeeting, opts: DraftOptions = {}): ReviewDraft {
  const marked = new Set((opts.marked || []).map(String));
  const order: string[] = [];
  const byKibbutz = new Map<string, ReviewLine[]>();

  (parsed?.sections || []).forEach(sec => {
    (sec.kibbutzim || []).forEach(kibbutz => {
      if (!byKibbutz.has(kibbutz)) { byKibbutz.set(kibbutz, []); order.push(kibbutz); }
      const lines = byKibbutz.get(kibbutz)!;
      (sec.bullets || []).forEach(b => {
        lines.push({
          // NOT `b.seq`: two summary sections can name the same card, and the draft merges
          // them into one section — a key of (kibbutz, seq) would collide on the second.
          key: kibbutz + '#' + (lines.length + 1),
          text: b.text,
          owners: (b.owners || []).slice(),
          chip: proposeChip(b.text, b.owners || [], marked.has(kibbutz)),
          edited: false,
          added: false,
        });
      });
    });
  });

  return {
    meeting_date: parsed?.meeting_date || '',
    meeting_kind: (parsed?.meeting_kind || 'company') as MeetingKind,
    sections: order.map(kibbutz => ({ kibbutz, lines: byKibbutz.get(kibbutz)! })),
  };
}

/** Every per-line mutator goes through here: map the line that matched, copy everything else. */
function mapLine(d: ReviewDraft, key: string, fn: (l: ReviewLine) => ReviewLine): ReviewDraft {
  return {
    ...d,
    sections: d.sections.map(s => ({
      ...s,
      lines: s.lines.map(l => (l.key === key ? fn(cloneLine(l)) : cloneLine(l))),
    })),
  };
}

export function setChip(d: ReviewDraft, key: string, chip: Chip): ReviewDraft {
  return mapLine(d, key, l => ({ ...l, chip }));
}

export function setOwner(d: ReviewDraft, key: string, owners: string[]): ReviewDraft {
  return mapLine(d, key, l => ({ ...l, owners: (owners || []).slice() }));
}

/**
 * What the 📋 task modal decided about this line's EMS payload. Only the keys it actually
 * set are kept, so an empty field in the modal means "keep what the sentence gives".
 */
export function setTask(d: ReviewDraft, key: string, patch: TaskOverride): ReviewDraft {
  const clean: TaskOverride = {};
  (Object.keys(patch || {}) as Array<keyof TaskOverride>).forEach(k => {
    const v = String(patch[k] ?? '').trim();
    if (v) clean[k] = v;
  });
  return mapLine(d, key, l => (Object.keys(clean).length ? { ...l, task: clean } : { ...l, task: undefined }));
}

/** ✏️ עריכה. An empty edit is refused rather than silently emptying the bullet. */
export function editLine(d: ReviewDraft, key: string, text: string): ReviewDraft {
  const next = String(text ?? '').trim();
  if (!next) return cloneDraft(d);
  return mapLine(d, key, l => (l.text === next ? l : { ...l, text: next, edited: true }));
}

/**
 * ➕ שורה משלי — a sentence that was never said aloud. It joins the kibbutz's lines and gets
 * the same chips; the kibbutz gets a section if it had none, so a card nobody discussed can
 * still come out of the meeting with a line.
 */
export function addLine(d: ReviewDraft, kibbutz: string, text: string, owners: string[] = []): ReviewDraft {
  const body = String(text ?? '').trim();
  const name = String(kibbutz ?? '').trim();
  if (!body || !name) return cloneDraft(d);

  // A suffix taken over the WHOLE draft, so a key is never re-used after a removal.
  const used = d.sections.flatMap(s => s.lines.map(l => l.key));
  let n = used.length + 1;
  while (used.includes(name + '#+' + n)) n++;

  const line: ReviewLine = {
    key: name + '#+' + n,
    text: body,
    owners: (owners || []).slice(),
    chip: proposeChip(body, owners),
    edited: false,
    added: true,
  };
  const exists = d.sections.some(s => s.kibbutz === name);
  const sections = d.sections.map(s => (s.kibbutz === name
    ? { ...s, lines: [...s.lines.map(cloneLine), line] }
    : cloneSection(s)));
  return { ...d, sections: exists ? sections : [...sections, { kibbutz: name, lines: [line] }] };
}

/**
 * Drag a line onto another kibbutz's header (⋯ → "העבר לקיבוץ אחר" on a phone). The text, the
 * owners and the chip come with it — only the card it was filed under was wrong — and
 * `movedFrom` records where it sat, so the screen can show that it moved and the line count
 * across the draft is provably unchanged.
 */
export function moveLine(d: ReviewDraft, key: string, toKibbutz: string): ReviewDraft {
  const to = String(toKibbutz ?? '').trim();
  const from = d.sections.find(s => s.lines.some(l => l.key === key));
  if (!to || !from || from.kibbutz === to) return cloneDraft(d);
  const moved: ReviewLine = { ...cloneLine(from.lines.find(l => l.key === key)!), movedFrom: from.kibbutz };

  const exists = d.sections.some(s => s.kibbutz === to);
  const sections = d.sections.map(s => {
    if (s.kibbutz === from.kibbutz) return { ...s, lines: s.lines.filter(l => l.key !== key).map(cloneLine) };
    if (s.kibbutz === to) return { ...s, lines: [...s.lines.map(cloneLine), moved] };
    return cloneSection(s);
  });
  return { ...d, sections: exists ? sections : [...sections, { kibbutz: to, lines: [moved] }] };
}

/** Drop a line. A kibbutz left with none keeps its (empty) section — it WAS reviewed. */
export function removeLine(d: ReviewDraft, key: string): ReviewDraft {
  return {
    ...d,
    sections: d.sections.map(s => ({ ...s, lines: s.lines.filter(l => l.key !== key).map(cloneLine) })),
  };
}

export interface ReviewSummary { ems: number; internal: number; notes: number; chatter: number }

/** What בצע is about to do, for the button's own label. */
export function reviewSummary(d: ReviewDraft): ReviewSummary {
  const out: ReviewSummary = { ems: 0, internal: 0, notes: 0, chatter: 0 };
  (d?.sections || []).forEach(s => s.lines.forEach(l => {
    if (l.chip === 'ems') out.ems++;
    else if (l.chip === 'internal') out.internal++;
    else if (l.chip === 'chatter') out.chatter++;
    else out.notes++;                                   // decision · idea · deferred
  }));
  return out;
}

/** The בצע button's Hebrew label — one string, so the island and the test agree on it. */
export function summaryLabel(s: ReviewSummary): string {
  const parts: string[] = [];
  if (s.ems) parts.push(`${s.ems} משימות`);
  if (s.internal) parts.push(`${s.internal} פנימיות`);
  if (s.notes) parts.push(`${s.notes} הערות`);
  if (s.chatter) parts.push(`${s.chatter} דיבורים`);
  return parts.length ? `בצע: ${parts.join(' · ')}` : 'בצע';
}

// ───────────────────────────── the bundle ─────────────────────────────

/** A note row plus what the review decided about it. */
export interface ReviewNoteRow extends NoteRow {
  chip: Chip;
  /** "רק דיבורים" — kept so the card shows the kibbutz WAS reviewed, but muted. */
  quiet: boolean;
  /** ⏭ נדחה — real, revisited next meeting. */
  deferred: boolean;
}

export interface ReviewEmsTask {
  /** The draft line this came from — the writer PATCHes that note's `ems_task_id`. */
  key: string;
  kibbutz: string;
  /** (kibbutz, seq) is the note's unique key, so the writer can find the row it just wrote. */
  seq: number;
  task: ReturnType<typeof taskFromBullet>;
}

export interface ReviewInternalTask {
  /** The draft line this came from — mirrors `ReviewEmsTask.key`, so a retried בצע can skip a
   *  line already inserted (see `saveReview`'s `opts.createdInternal`). */
  key: string;
  title: string;
  owner: string | null;
  kibbutz: string | null;
}

export interface ReviewBundle {
  notes: ReviewNoteRow[];
  emsTasks: ReviewEmsTask[];
  internalTasks: ReviewInternalTask[];
}

/**
 * The finished draft → exactly what בצע sends. Still pure: it BUILDS the rows, it does not
 * write them. `seq` is the line's position inside its kibbutz after every edit and every
 * move, so the rows match the unique key `import_meeting_notes` merges on; the EMS payloads
 * come from `taskFromBullet` — the same prefill the card's ➕ and the live ✏️ sheet use, so a
 * task opened from the review looks like every other task opened from a bullet.
 */
export function applyReview(d: ReviewDraft, createdBy?: string): ReviewBundle {
  const notes: ReviewNoteRow[] = [];
  const emsTasks: ReviewEmsTask[] = [];
  const internalTasks: ReviewInternalTask[] = [];
  const kind = (d?.meeting_kind || 'company') as MeetingKind;

  (d?.sections || []).forEach(sec => {
    sec.lines.forEach((l, i) => {
      const seq = i + 1;
      notes.push({
        kibbutz: sec.kibbutz,
        meeting_date: d.meeting_date,
        meeting_kind: kind,
        seq,
        text: (CHIP_PREFIX[l.chip] || '') + l.text,
        owners: l.owners.slice(),
        chip: l.chip,
        quiet: l.chip === 'chatter',
        deferred: l.chip === 'deferred',
        ...(createdBy ? { created_by: createdBy } : {}),
      });
      if (l.chip === 'ems') {
        emsTasks.push({
          key: l.key,
          kibbutz: sec.kibbutz,
          seq,
          // The prefill first, the modal's overrides on top — so a sentence edited AFTER the
          // modal was opened still moves the parts the modal did not touch.
          task: {
            ...taskFromBullet({
              kibbutz: sec.kibbutz, text: l.text, owners: l.owners,
              meeting_date: d.meeting_date, meeting_kind: kind,
            }),
            ...(l.task || {}),
          },
        });
      }
      if (l.chip === 'internal') {
        internalTasks.push({ key: l.key, title: l.text, owner: l.owners[0] || null, kibbutz: sec.kibbutz || null });
      }
    });
  });

  return { notes, emsTasks, internalTasks };
}

/**
 * The `import_meeting_notes(jsonb)` payload for the bundle's notes — the SAME function and
 * the same (kibbutz, date, kind, seq) key the import uses, so reviewing a meeting that was
 * already imported REPLACES its bullets instead of doubling them, and keeps every
 * `ems_task_id` / `done_at` that was set in between.
 */
export function reviewPayload(
  bundle: ReviewBundle,
  meta: { meeting_date: string; meeting_kind: MeetingKind },
  createdBy?: string,
) {
  return {
    meeting_date: meta.meeting_date,
    meeting_kind: meta.meeting_kind,
    created_by: createdBy || null,
    rows: bundle.notes.map(n => ({
      kibbutz: n.kibbutz, seq: n.seq, text: n.text, owners: n.owners || [],
    })),
  };
}

/** Who may run the review: the admins who run the meeting (עידן, עמיחי). A viewer never can. */
export const canReview = (isAdmin: boolean, isViewer: boolean): boolean => !!isAdmin && !isViewer;
