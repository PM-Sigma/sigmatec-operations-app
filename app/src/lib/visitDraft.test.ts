// The chapters ruling (spec §7p), pinned. Every branch here decides something a technician
// standing in a cowshed can feel: which chapter he lands on, whether 🚚 is even part of his
// summary, whether שלח is allowed, and how old the thing he is resuming is.
import { describe, expect, it } from 'vitest';
import {
  CHAPTERS, canSubmit, chapterState, draftAge, nextChapter, prevChapter, resumeChapter,
  type ChapterDraft,
} from '@/lib/visitDraft';

const d = (over: Partial<ChapterDraft> = {}): ChapterDraft => ({
  kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-19', summary: '', openItems: '',
  products: [], productsOther: '', ...over,
});

describe('CHAPTERS', () => {
  it('is the five of §7p, in order, in Hebrew', () => {
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

describe('nextChapter / prevChapter', () => {
  it('walks past a chapter that does not apply', () => {
    expect(nextChapter(d(), 3)).toBe(5);
    expect(prevChapter(d(), 5)).toBe(3);
  });

  it('stops at both ends instead of wrapping', () => {
    expect(nextChapter(d(), 5)).toBe(5);
    expect(prevChapter(d(), 1)).toBe(1);
  });

  it('includes 4 when there is something to deliver', () => {
    expect(nextChapter(d({ deliver: true }), 3)).toBe(4);
    expect(prevChapter(d({ deliver: true }), 5)).toBe(4);
  });

  it('an out-of-range chapter is clamped, never thrown', () => {
    expect(nextChapter(d(), 0 as never)).toBe(1);
    expect(prevChapter(d(), 9 as never)).toBe(5);
    // 4 with nothing to deliver is not in the flow: it resolves to its neighbours.
    expect(nextChapter(d(), 4)).toBe(5);
    expect(prevChapter(d(), 4)).toBe(3);
  });
});

describe('canSubmit', () => {
  it('refuses without "מה עשיתי" — that is the whole point of the summary', () => {
    const r = canSubmit(d());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('כתוב מה עשית — בלי זה אין סיכום');
  });

  it('a summary alone is enough when nothing was handed over', () => {
    expect(canSubmit(d({ summary: 'בדקתי תקשורת' }))).toEqual({ ok: true });
  });

  it('equipment handed over and no certificate → refused, with the next step named', () => {
    const r = canSubmit(d({ summary: 'הבאתי בקר', deliver: true, products: [{ name: 'אנטנה', qty: 2 }] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('סופק ציוד — קודם תעודת משלוח');
  });

  it('with the certificate issued it goes through', () => {
    expect(canSubmit(d({
      summary: 'הבאתי בקר', deliver: true, certIssued: true, products: [{ name: 'אנטנה', qty: 2 }],
    }))).toEqual({ ok: true });
  });

  it('products with nothing to deliver (chapter 4 does not apply) never raise the cert gate', () => {
    // `deliver` false = §7p's "only when there is something to deliver": the chapter is not
    // in the flow, so it cannot be the thing standing between him and שלח.
    expect(canSubmit(d({ summary: 'כן', products: [{ name: 'אנטנה', qty: 1 }] }))).toEqual({ ok: true });
  });

  it('already sent → nothing more to send (the second שלח is a no-op)', () => {
    const r = canSubmit(d({ summary: 'כן', submittedId: 'v_1' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('הסיכום כבר נשלח');
  });
});

describe('resumeChapter', () => {
  it('a draft nobody has walked yet opens at the beginning', () => {
    expect(resumeChapter(d())).toBe(1);
    expect(resumeChapter(null)).toBe(1);
  });

  it('comes back to the last chapter he was on', () => {
    expect(resumeChapter(d({ chapter: 3 }))).toBe(3);
  });

  it('a remembered chapter that no longer applies falls back to one that does', () => {
    expect(resumeChapter(d({ chapter: 4 }))).toBe(3);
    expect(resumeChapter(d({ chapter: 4, deliver: true }))).toBe(4);
  });

  it('nonsense in the stored chapter is clamped, never thrown', () => {
    expect(resumeChapter(d({ chapter: 99 as never }))).toBe(5);
    expect(resumeChapter(d({ chapter: -2 as never }))).toBe(1);
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
