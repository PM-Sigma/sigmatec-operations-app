// Goldens for 📝 יומן היום (spec §7i): five real-style Hebrew day logs through
// `normalizeDayLog`, plus the task-matching threshold cases and עידן's comment wording.
//
// What the goldens assert is STRUCTURE, not prose: how many cards, which kibbutz each one
// resolved to, which products landed on the catalog, and what stayed unmatched. The model's
// summary text is the model's — the app's job is to never let an invented name through.
import { describe, expect, it } from 'vitest';
import {
  cardReady, diceScore, emsCommentText, matchEmsTask, NAME_THRESHOLD, normalizeDayLog, normHe,
  resolveName, TASK_THRESHOLD, visitPayload,
  type DayLogCatalog, type GroundingTask,
} from '@/lib/daylog';

const CATALOG: DayLogCatalog = {
  kibbutzim: ['דפנה', 'חוקוק', 'כפר עזה', 'אור הנר', 'שדה אליהו', 'נצר סרני'],
  products: ['מונה Landis+Gyr E360PP', 'Satec EM133', 'PUSR Controller', 'Partner Sim', 'בקר 485', 'משנ"ז 250'],
  tasks: [
    { id: 'T1', title: 'החלפת מונה ראשי', kibbutz: 'דפנה' },
    { id: 'T2', title: 'בדיקת תקשורת בבקר', kibbutz: 'חוקוק' },
    { id: 'T3', title: 'התקנת סים חדש', kibbutz: 'כפר עזה' },
  ],
};

describe('normHe / diceScore', () => {
  it('folds niqqud, gershayim and punctuation', () => {
    expect(normHe('משנ"ז 250')).toBe(normHe('משנז 250'));
    expect(normHe('  כפר-עזה ')).toBe('כפר עזה');
  });
  it('scores identical strings 1 and unrelated strings low', () => {
    expect(diceScore('דפנה', 'דפנה')).toBe(1);
    expect(diceScore('דפנה', 'כפר עזה')).toBeLessThan(0.2);
  });
});

describe('resolveName', () => {
  it('resolves an exact name confidently', () => {
    expect(resolveName('חוקוק', CATALOG.kibbutzim)).toMatchObject({ name: 'חוקוק', confident: true });
  });
  it('resolves through a glued Hebrew preposition ("בדפנה")', () => {
    expect(resolveName('בדפנה', CATALOG.kibbutzim)).toMatchObject({ name: 'דפנה', confident: true });
  });
  it('refuses a name that is not in the catalog rather than guessing', () => {
    const r = resolveName('גשר הזיו', CATALOG.kibbutzim);
    expect(r.confident).toBe(false);
    expect(r.name).toBe('גשר הזיו');
    expect(r.score).toBeLessThan(NAME_THRESHOLD);
  });
});

// ───────────────────────────── the five day logs ─────────────────────────────

describe('normalizeDayLog — five Hebrew day logs', () => {
  it('1. three kibbutzim in one paragraph → three cards, all resolved', () => {
    const raw = {
      visits: [
        { kibbutz: 'דפנה', summary: 'החלפתי מונה ראשי בלול', open_items: 'צריך לחזור עם בקר', items: [{ product: 'מונה Landis+Gyr E360PP', qty: 1 }] },
        { kibbutz: 'חוקוק', did: 'בדקתי תקשורת, הכל תקין', open_items: '', products: [] },
        { kibbutz: 'כפר עזה', summary: 'התקנתי סים חדש', items: [{ name: 'Partner Sim', qty: 2 }] },
      ],
      unmatched: '',
    };
    const out = normalizeDayLog(raw, CATALOG);
    expect(out.visits).toHaveLength(3);
    expect(out.visits.map(v => v.kibbutz)).toEqual(['דפנה', 'חוקוק', 'כפר עזה']);
    expect(out.visits.every(v => v.kibbutzConfident)).toBe(true);
    expect(out.visits[0].items).toEqual([{ product: 'מונה Landis+Gyr E360PP', qty: 1, resolved: true }]);
    expect(out.visits[2].items[0].qty).toBe(2);
    expect(out.unmatched).toEqual([]);
  });

  // The MODEL is the one that maps "סים פרטנר" → "Partner Sim": the prompt ships the same
  // business glossary `parse-order` uses and tells it to copy the catalog string verbatim.
  // THIS layer only forgives near-misses in that string (a space, a quote, a typo) — it will
  // not translate, and it must not, because a translation nobody wrote down is a guess.
  it('2. a near-miss snaps to the catalog; an off-catalog product stays unresolved', () => {
    const raw = {
      visits: [{
        kibbutz: 'שדה אליהו',
        summary: 'השלמתי ציוד',
        items: [{ product: 'Satec EM 133', qty: 3 }, { product: 'משנז 250', qty: 1 }, { product: 'מטול לייזר', qty: 1 }],
      }],
    };
    const out = normalizeDayLog(raw, CATALOG);
    const items = out.visits[0].items;
    expect(items.find(i => i.product === 'Satec EM133')).toMatchObject({ qty: 3, resolved: true });
    expect(items.find(i => i.product === 'משנ"ז 250')).toMatchObject({ qty: 1, resolved: true });
    expect(items.find(i => i.product === 'מטול לייזר')?.resolved).toBe(false);
  });

  it('3. an unknown kibbutz is flagged, not invented', () => {
    const out = normalizeDayLog({ visits: [{ kibbutz: 'מעגן מיכאל', summary: 'סקר' }] }, CATALOG);
    expect(out.visits[0].kibbutzConfident).toBe(false);
    expect(out.visits[0].kibbutz).toBe('מעגן מיכאל');
    expect(cardReady(out.visits[0])).toBe(false);
  });

  it('4. the same kibbutz twice merges into one card, quantities summed', () => {
    const out = normalizeDayLog({
      visits: [
        { kibbutz: 'דפנה', summary: 'בוקר: מונה', items: [{ product: 'Satec EM133', qty: 1 }] },
        { kibbutz: 'דפנה', summary: 'אחה"צ: עוד מונה', open_items: 'לסגור מול אבי', items: [{ product: 'Satec EM133', qty: 2 }] },
      ],
    }, CATALOG);
    expect(out.visits).toHaveLength(1);
    expect(out.visits[0].items).toEqual([{ product: 'Satec EM133', qty: 3, resolved: true }]);
    expect(out.visits[0].summary.split('\n')).toHaveLength(2);
    expect(out.visits[0].open_items).toBe('לסגור מול אבי');
  });

  it('5. workday, date and leftover text survive; a hallucinated task id does not', () => {
    const out = normalizeDayLog({
      visits: [{
        kibbutz: 'אור הנר', date: '2026-09-18', workday: true, summary: 'יום שלם על הגז',
        task_matches: [{ task_id: 'T1', text: 'החלפתי את המונה הראשי' }, { task_id: 'T999', text: 'משימה שלא קיימת' }],
      }],
      unmatched_text: 'צריך להזמין עוד כבלים\nולדבר עם מתניה',
    }, CATALOG);
    const v = out.visits[0];
    expect(v).toMatchObject({ kibbutz: 'אור הנר', date: '2026-09-18', workday: true });
    expect(v.task_matches).toHaveLength(1);
    expect(v.task_matches[0]).toMatchObject({ task_id: 'T1', title: 'החלפת מונה ראשי' });
    expect(out.unmatched).toEqual(['צריך להזמין עוד כבלים', 'ולדבר עם מתניה']);
  });

  it('survives junk: null, a string, an empty object', () => {
    expect(normalizeDayLog(null, CATALOG)).toEqual({ visits: [], unmatched: [] });
    expect(normalizeDayLog({ visits: 'nope' }, CATALOG).visits).toEqual([]);
    expect(normalizeDayLog({ visits: [{}] }, CATALOG).visits).toEqual([]);
  });

  it('clamps a nonsense quantity to 1 instead of writing it to stock', () => {
    const out = normalizeDayLog({ visits: [{ kibbutz: 'דפנה', summary: 'x', items: [{ product: 'Partner Sim', qty: -4 }] }] }, CATALOG);
    expect(out.visits[0].items[0].qty).toBe(1);
  });
});

// ───────────────────────────── task matching thresholds ─────────────────────────────

const TASKS: GroundingTask[] = CATALOG.tasks!;

describe('matchEmsTask', () => {
  it('matches a sentence that repeats the title words', () => {
    const m = matchEmsTask('היום החלפתי את המונה הראשי בדפנה', TASKS, { kibbutz: 'דפנה' });
    expect(m?.task_id).toBe('T1');
    expect(m!.score!).toBeGreaterThanOrEqual(TASK_THRESHOLD);
  });

  it('returns null for an unrelated sentence rather than the least-bad task', () => {
    expect(matchEmsTask('אכלתי צהריים ונסעתי הביתה', TASKS)).toBeNull();
  });

  it('does not comment on an identically-worded task at another kibbutz', () => {
    const tasks: GroundingTask[] = [{ id: 'A', title: 'החלפת מונה ראשי', kibbutz: 'חוקוק' }];
    expect(matchEmsTask('החלפתי מונה ראשי', tasks, { kibbutz: 'דפנה' })).toBeNull();
    expect(matchEmsTask('החלפתי מונה ראשי', tasks, { kibbutz: 'חוקוק' })?.task_id).toBe('A');
  });

  it('honours a raised threshold (a borderline sentence stops matching)', () => {
    const sentence = 'בדקתי תקשורת';
    expect(matchEmsTask(sentence, TASKS)?.task_id).toBe('T2');
    expect(matchEmsTask(sentence, TASKS, { threshold: 0.95 })).toBeNull();
  });

  it('is empty-safe', () => {
    expect(matchEmsTask('', TASKS)).toBeNull();
    expect(matchEmsTask('משהו', [])).toBeNull();
  });
});

describe('emsCommentText', () => {
  it('is עידן’s exact wording', () => {
    expect(emsCommentText('אביאם', 'החלפתי מונה')).toBe('עדכון מאביאם על המשימה: החלפתי מונה');
  });
  it('trims without changing the shape', () => {
    expect(emsCommentText(' ניתאי ', '  בדקתי  ')).toBe('עדכון מניתאי על המשימה: בדקתי');
  });
});

describe('visitPayload', () => {
  const base = normalizeDayLog({
    visits: [{ kibbutz: 'דפנה', summary: 'ס', open_items: 'פ', items: [{ product: 'Partner Sim', qty: 2 }, { product: 'לא קיים', qty: 1 }] }],
  }, CATALOG).visits[0];

  it('keeps only catalog products — an unresolved line never reaches stock', () => {
    const p = visitPayload(base, 'אביאם', '2026-09-19');
    expect(p.products).toEqual([{ name: 'Partner Sim', qty: 2 }]);
    expect(p).toMatchObject({ kibbutz: 'דפנה', date: '2026-09-19', visitor: 'אביאם', workday: false, duration: 2 });
  });

  it('a workday card is stored as the 8-hour equivalent', () => {
    const p = visitPayload({ ...base, workday: true }, 'ניתאי', '2026-09-19');
    expect(p).toMatchObject({ workday: true, duration: 8 });
  });

  it('cardReady refuses an empty or unresolved card', () => {
    expect(cardReady(base)).toBe(true);
    expect(cardReady({ ...base, kibbutzConfident: false })).toBe(false);
    expect(cardReady({ ...base, summary: '', open_items: '', items: [] })).toBe(false);
  });
});
