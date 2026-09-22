// ═══════════════════════════════════════════════════════════════════════════
// The visit summary, in chapters (spec §7p).
//
// A summary used to be one long form with one save at the end, so a technician who was
// interrupted — and in the field he always is — either finished it in one sitting or lost
// the lot. §7p breaks it into five short chapters with one **שמור וסגור** over all of them,
// and keeps **שלח** for the bottom. Ruling 22.9 evening: the chapters are not a stepper any
// more, they are one scrolling form. Nothing here writes: this file answers three questions —
//
//   · which chapters are even part of THIS visit (4 only when there is something to deliver),
//   · may he press שלח yet, and why not,
//   · how old is the draft he left.
//
// Goldens: app/src/lib/visitDraft.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { visitReasonRequired, visitReasonValid } from './field';

export type ChapterId = 1 | 2 | 3 | 4 | 5;

export interface Chapter {
  id: ChapterId;
  /** What he reads at the top of the chapter. §7p fixes these words. */
  title: string;
}

/** The five of §7p, in the order they are stacked in the sheet. */
export const CHAPTERS: Chapter[] = [
  { id: 1, title: 'מה עשיתי' },
  { id: 2, title: 'מה נשאר לי פתוח' },
  { id: 3, title: 'מוצרים/מלאי' },
  { id: 4, title: 'תעודת משלוח' },
  { id: 5, title: 'שליחה' },
];

export interface DraftProduct { name: string; qty: number }

/** A row of "🔧 ציוד שהוחזר מהקיבוץ" (QA round 2, C5). One clean line at 360 px. */
export interface ReturnedItem { name: string; qty: number; note?: string }

/**
 * What a chapters draft holds. It is the legacy `visit_drafts` payload (js/src/09-visits.js
 * `visitDraftPayload`) plus the three fields the stepper adds — `chapter`, `deliver` and
 * `submittedId` — which ride in the same jsonb column, so there is no migration.
 */
export interface ChapterDraft {
  kibbutz?: string;
  visitor?: string;
  /** yyyy-mm-dd */
  date?: string;
  summary?: string;
  openItems?: string;
  products?: DraftProduct[];
  productsOther?: string;
  contact?: string;
  duration?: string;
  workday?: boolean;
  /** Is there anything to hand over? Decides whether chapter 4 exists for this visit. */
  deliver?: boolean;
  /** A delivery certificate is already linked to this (pre-minted) visit id. */
  certIssued?: boolean;
  /** Set ONCE, by a successful שלח. Its presence is what makes a second שלח a no-op. */
  submittedId?: string;
  updated_at?: string;

  // ── QA round 2, Package C ────────────────────────────────────────────────────────────
  /** 🔧 what he took BACK from the kibbutz (C5). */
  returned?: ReturnedItem[];
  /** EMS tasks this summary is posted to as a comment (C6). Never preselected. */
  emsTaskIds?: string[];
  /** Internal tasks this summary closes (C6). */
  internalTaskIds?: string[];
  /** One of `VISIT_REASONS`, asked for only when nothing at all was linked (C6). */
  reasonId?: string;
  /** The free text of the `אחר` chip. */
  reasonOther?: string;
}

export interface ChapterStatus extends Chapter {
  /** Is this chapter part of THIS visit at all? Only 4 is ever false. */
  applies: boolean;
  /** Does it hold something? A hint for the reader, never a gate. */
  done: boolean;
}

const txt = (v: unknown): string => String(v ?? '').trim();

/** Chapter 4 is in the flow only when there is something to hand over (§7p, "🚚 only when"). */
function deliverApplies(d: ChapterDraft | null | undefined): boolean {
  return !!d?.deliver;
}

/** Per-chapter: does it apply, and does it hold anything yet? */
export function chapterState(d: ChapterDraft | null | undefined): ChapterStatus[] {
  const products = d?.products || [];
  const done: Record<ChapterId, boolean> = {
    1: !!txt(d?.summary),
    2: !!txt(d?.openItems),
    3: products.length > 0 || !!txt(d?.productsOther),
    4: !!d?.certIssued,
    // שליחה is never "done": it is done when the visit exists, and then the sheet is gone.
    // A tick here would say "sent" about something that was not.
    5: false,
  };
  return CHAPTERS.map(c => ({
    ...c,
    applies: c.id === 4 ? deliverApplies(d) : true,
    done: done[c.id],
  }));
}

export interface SubmitVerdict { ok: boolean; reason?: string }

/** The required things, in the order the sheet walks them. `key` is what the red mark hangs on. */
export interface MissingField { key: string; chapter: ChapterId; reason: string }

const hasHours = (d: ChapterDraft | null | undefined): boolean =>
  !!d?.workday || parseFloat(String(d?.duration ?? '')) > 0;

/**
 * QA round 2 · C3: REQUIRED is exactly four things — מי ביקר · משך ותאריך · מה עשיתי ·
 * איש קשר מלווה — plus C6's סיבת הביקור when the summary was attached to nothing at all.
 * EVERYTHING else on this sheet is optional.
 *
 * What is NOT here any more: the delivery-certificate gate. C7 moved the certificate to
 * AFTER the save (saving a visit with supplied products lands on the certificate screen),
 * so a certificate can no longer stand between a technician and a filed summary.
 *
 * Returned in walking order, so the caller marks them all and scrolls to the first.
 */
export function missingFields(d: ChapterDraft | null | undefined): MissingField[] {
  const out: MissingField[] = [];
  if (!txt(d?.visitor)) out.push({ key: 'visitor', chapter: 5, reason: 'מי ביקר?' });
  if (!txt(d?.summary)) out.push({ key: 'summary', chapter: 1, reason: 'כתוב מה עשית. בלי זה אין סיכום' });
  if (!hasHours(d)) out.push({ key: 'hours', chapter: 5, reason: 'כמה זמן היית שם?' });
  if (!txt(d?.date)) out.push({ key: 'date', chapter: 5, reason: 'באיזה תאריך היית שם?' });
  if (!txt(d?.contact)) out.push({ key: 'contact', chapter: 5, reason: 'מי ליווה אותך בביקור?' });
  if (visitReasonRequired({ emsTaskIds: d?.emsTaskIds, internalTaskIds: d?.internalTaskIds })
    && !visitReasonValid(d?.reasonId, d?.reasonOther)) {
    out.push({ key: 'reason', chapter: 5, reason: 'למה הגעת? בחר סיבה, או קשר משימה' });
  }
  return out;
}

/**
 * May he press שלח? A draft that was already sent answers no, which is what makes a
 * double-tap harmless; otherwise the first missing REQUIRED field speaks for itself.
 */
export function canSubmit(d: ChapterDraft | null | undefined): SubmitVerdict {
  if (d?.submittedId) return { ok: false, reason: 'הסיכום כבר נשלח' };
  const miss = missingFields(d);
  return miss.length ? { ok: false, reason: miss[0].reason } : { ok: true };
}

export interface DraftAge {
  /** "טיוטה מ-14:02" — the hour he stopped, in his own clock. */
  label: string;
  /** Older than 7 days. Asks a question; NEVER deletes anything (§7p). */
  stale: boolean;
  /** "עדיין רלוונטי?" when stale, otherwise empty. */
  note: string;
}

const NONE: DraftAge = { label: '', stale: false, note: '' };
const WEEK_MS = 7 * 24 * 3600_000;

/** How old is what he left, in the only two terms that matter to him. */
export function draftAge(d: ChapterDraft | null | undefined, now: Date = new Date()): DraftAge {
  const t = new Date(String(d?.updated_at || ''));
  if (!d?.updated_at || isNaN(t.getTime())) return NONE;
  const p = (n: number) => String(n).padStart(2, '0');
  const stale = now.getTime() - t.getTime() > WEEK_MS;
  return {
    label: `טיוטה מ-${p(t.getHours())}:${p(t.getMinutes())}`,
    stale,
    note: stale ? 'עדיין רלוונטי?' : '',
  };
}
