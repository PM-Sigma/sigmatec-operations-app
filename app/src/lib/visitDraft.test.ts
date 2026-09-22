// The chapters ruling (spec §7p), pinned. Every branch here decides something a technician
// standing in a cowshed can feel: whether 🚚 is even part of his summary, whether שלח is
// allowed, and how old the thing he is resuming is.
import { describe, expect, it } from 'vitest';
import {
  CHAPTERS, canSubmit, chapterState, draftAge, missingFields, type ChapterDraft,
} from '@/lib/visitDraft';

const d = (over: Partial<ChapterDraft> = {}): ChapterDraft => ({
  kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-19', summary: '', openItems: '',
  products: [], productsOther: '', ...over,
});

/** A draft that satisfies every REQUIRED field of C3 + C6 — the "otherwise fine" baseline. */
const full = (over: Partial<ChapterDraft> = {}): ChapterDraft => d({
  summary: 'בדקתי תקשורת', duration: '2', contact: 'יוסי', reasonId: 'fault', ...over,
});

describe('CHAPTERS', () => {
  it('is the five of §7p, in the order they are stacked, in Hebrew', () => {
    expect(CHAPTERS.map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(CHAPTERS.map(c => c.title)).toEqual([
      'מה עשיתי', 'מה נשאר לי פתוח', 'מוצרים/מלאי', 'תעודת משלוח', 'שליחה',
    ]);
  });
});

describe('chapterState', () => {
  it('chapter 4 is skipped entirely when there is nothing to deliver', () => {
    const st = chapterState(d());
    expect(st.find(c => c.id === 4)!.applies).toBe(false);
    expect(st.filter(c => c.applies).map(c => c.id)).toEqual([1, 2, 3, 5]);
  });

  it('chapter 4 applies once something is ticked to hand over', () => {
    const st = chapterState(d({ deliver: true }));
    expect(st.find(c => c.id === 4)!.applies).toBe(true);
    expect(st.filter(c => c.applies).map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a chapter is done when it holds something, never before', () => {
    const st = chapterState(d({ summary: 'החלפתי מונה', products: [{ name: 'אנטנה', qty: 1 }] }));
    expect(st.find(c => c.id === 1)!.done).toBe(true);
    expect(st.find(c => c.id === 2)!.done).toBe(false);
    expect(st.find(c => c.id === 3)!.done).toBe(true);
    // שליחה is only ever done once it was sent — not by being looked at.
    expect(st.find(c => c.id === 5)!.done).toBe(false);
  });

  it('whitespace is not content', () => {
    expect(chapterState(d({ summary: '   \n ' })).find(c => c.id === 1)!.done).toBe(false);
  });

  it('chapter 4 counts as done only when a certificate was actually issued', () => {
    expect(chapterState(d({ deliver: true })).find(c => c.id === 4)!.done).toBe(false);
    expect(chapterState(d({ deliver: true, certIssued: true })).find(c => c.id === 4)!.done).toBe(true);
  });
});

describe('canSubmit — the REQUIRED four, plus the reason (QA round 2, C3 + C6)', () => {
  it('a draft with all four and a reason goes through', () => {
    expect(canSubmit(full())).toEqual({ ok: true });
  });

  it('refuses without "מה עשיתי" — that is the whole point of the summary', () => {
    const r = canSubmit(full({ summary: '' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('כתוב מה עשית. בלי זה אין סיכום');
  });

  it('refuses without hours, and a יום שלם counts as hours', () => {
    expect(canSubmit(full({ duration: '' })).reason).toBe('כמה זמן היית שם?');
    expect(canSubmit(full({ duration: '', workday: true }))).toEqual({ ok: true });
    expect(canSubmit(full({ duration: '0' })).reason).toBe('כמה זמן היית שם?');
  });

  it('refuses without a date, a visitor or an איש קשר מלווה', () => {
    expect(canSubmit(full({ date: '' })).reason).toBe('באיזה תאריך היית שם?');
    expect(canSubmit(full({ visitor: '' })).reason).toBe('מי ביקר?');
    expect(canSubmit(full({ contact: '  ' })).reason).toBe('מי ליווה אותך בביקור?');
  });

  it('a linked task IS the reason, so the chips are not asked for', () => {
    expect(canSubmit(full({ reasonId: '', emsTaskIds: ['T-1'] }))).toEqual({ ok: true });
    expect(canSubmit(full({ reasonId: '', internalTaskIds: ['i-1'] }))).toEqual({ ok: true });
    expect(canSubmit(full({ reasonId: '' })).reason).toBe('למה הגעת? בחר סיבה, או קשר משימה');
  });

  it('אחר needs its text before it counts as an answer', () => {
    expect(canSubmit(full({ reasonId: 'other', reasonOther: '' })).ok).toBe(false);
    expect(canSubmit(full({ reasonId: 'other', reasonOther: 'קפצתי בדרך' }))).toEqual({ ok: true });
  });

  it('C7: supplied equipment NO LONGER blocks שלח — the certificate comes after the save', () => {
    const supplied = full({ deliver: true, products: [{ name: 'אנטנה', qty: 2 }], certIssued: false });
    expect(canSubmit(supplied)).toEqual({ ok: true });
  });

  it('everything else on the sheet stays optional', () => {
    expect(canSubmit(full({ openItems: '', productsOther: '', returned: [] }))).toEqual({ ok: true });
  });

  it('already sent → nothing more to send (the second שלח is a no-op)', () => {
    const r = canSubmit(full({ submittedId: 'v_1' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('הסיכום כבר נשלח');
  });
});

describe('missingFields', () => {
  it('names every miss in walking order, so all of them can be marked at once', () => {
    expect(missingFields(d()).map(m => m.key)).toEqual(['summary', 'hours', 'contact', 'reason']);
  });

  it('carries the chapter each miss lives on, so the sheet can scroll to the first', () => {
    const miss = missingFields(d());
    expect(miss[0]).toEqual({ key: 'summary', chapter: 1, reason: 'כתוב מה עשית. בלי זה אין סיכום' });
    expect(miss.every(m => m.chapter === 1 || m.chapter === 5)).toBe(true);
  });

  it('is empty for a complete draft', () => {
    expect(missingFields(full())).toEqual([]);
  });
});

describe('draftAge', () => {
  const NOW = new Date('2026-09-19T16:40:00');

  it('names the hour he stopped, and nothing else', () => {
    const a = draftAge(d({ updated_at: '2026-09-19T14:02:00' }), NOW);
    expect(a.label).toBe('טיוטה מ-14:02');
    expect(a.stale).toBe(false);
    expect(a.note).toBe('');
  });

  it('after a week it asks, and still never deletes', () => {
    const a = draftAge(d({ updated_at: '2026-09-10T09:15:00' }), NOW);
    expect(a.label).toBe('טיוטה מ-09:15');
    expect(a.stale).toBe(true);
    expect(a.note).toBe('עדיין רלוונטי?');
  });

  it('exactly seven days is not yet stale', () => {
    expect(draftAge(d({ updated_at: '2026-09-12T16:40:00' }), NOW).stale).toBe(false);
    expect(draftAge(d({ updated_at: '2026-09-12T16:39:00' }), NOW).stale).toBe(true);
  });

  it('no draft, or a broken timestamp, reads as nothing rather than as NaN', () => {
    expect(draftAge(null, NOW)).toEqual({ label: '', stale: false, note: '' });
    expect(draftAge(d({ updated_at: 'לא תאריך' }), NOW)).toEqual({ label: '', stale: false, note: '' });
  });
});
