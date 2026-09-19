// Goldens for the ישיבת פיתוח core (Task 30, company-process spec §7). Every case runs over
// ONE board fixture, so a rule that changes shows up as a diff in a named expectation rather
// than as a screen that quietly looks different.
import { describe, expect, it } from 'vitest';
import {
  blockedOver, burndown, cardsInStage, cardsWithoutSpec, canRunDevMeeting, devPrep,
  isParentCard, parentLabel, parseTitle, proposeSprint, questionsForIdan, rankCard,
  sprintList, stageOf, touchesRed, walkOrder,
  type DevCard, type DevComment,
} from './sprintPrep';

const NOW = new Date('2026-09-19T09:00:00Z').getTime();
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();

/**
 * The board fixture: one Main Fields parent, cards in every column, one card with a real spec
 * and two without, two stale cards and one fresh one, and a backlog with a deliberate tie.
 */
const BOARD: DevCard[] = [
  { number: 1, title: 'קיבוצים | — | תחום ראשי', status: 'Main Fields', state: 'open', pos: 0, createdAt: ago(200), updatedAt: ago(200) },
  { number: 10, title: 'קיבוצים | קריאות | תיקון קריאה שלילית', status: 'In Progress', state: 'open', parent: 1, pos: 1, priority: 'גבוהה', createdAt: ago(30), updatedAt: ago(20), body: '## מטרה\nלתקן.' },
  { number: 11, title: 'קיבוצים | חיובים | מסך חיובים', status: 'In Progress', state: 'open', parent: 1, pos: 2, createdAt: ago(10), updatedAt: ago(1), body: '' },
  { number: 12, title: 'דוחות | ייצוא | ייצוא אקסל', status: 'In Review', state: 'open', parent: 1, pos: 3, createdAt: ago(60), updatedAt: ago(9), body: '## אפיון\nמשהו.' },
  { number: 13, title: 'דוחות | ייצוא | PDF', status: 'Ready', state: 'open', parent: 1, pos: 4, createdAt: ago(5), updatedAt: ago(2), body: 'שורה אחת בלי סעיפים' },
  { number: 14, title: 'תשתית | פריסה | שדרוג', status: 'Committed', state: 'closed', parent: 1, pos: 5, createdAt: ago(90), updatedAt: ago(3), body: '## מה\nבוצע.' },
  // ── backlog candidates ──
  { number: 20, title: 'קיבוצים | התראות | התראת מונה בחוקוק', status: 'Backlog', state: 'open', parent: 1, pos: 6, createdAt: ago(40), body: '## רקע\nחוקוק מתריע.' },
  { number: 21, title: 'דוחות | הדפסה | כותרת', status: 'Backlog', state: 'open', parent: 1, pos: 7, priority: 'קריטי', createdAt: ago(3), body: '## רקע\nדחוף.' },
  { number: 22, title: 'תשתית | ניטור | לוג', status: '', state: 'open', parent: 1, pos: 8, createdAt: ago(3), body: '## רקע\nא.' },
  { number: 23, title: 'תשתית | ניטור | מדדים', status: 'Backlog', state: 'open', parent: 1, pos: 9, createdAt: ago(3), body: '## רקע\nב.' },
];

const COMMENTS: DevComment[] = [
  { id: 'c1', issue_number: 10, author: 'מתניה', body: 'עידן, איזה תעריף לוקחים?', createdAt: ago(2) },
  { id: 'c2', issue_number: 12, author: 'אליה', body: 'עידן — לאשר את הפורמט', createdAt: ago(1) },
  { id: 'c3', issue_number: 12, author: 'מתניה', body: 'ממשיך לעבוד', createdAt: ago(1) },
  { id: 'c4', issue_number: 11, author: 'עידן', body: 'עידן כבר ענה לעצמו', createdAt: ago(0) },
];

describe('stageOf / the columns', () => {
  it('classifies each card into its board column', () => {
    expect(BOARD.map(c => [c.number, stageOf(c)])).toEqual([
      [1, 'fields'], [10, 'prog'], [11, 'prog'], [12, 'review'], [13, 'ready'],
      [14, 'committed'], [20, 'backlog'], [21, 'backlog'], [22, 'backlog'], [23, 'backlog'],
    ]);
  });

  it('a closed card with no status shipped; an empty status is backlog', () => {
    expect(stageOf({ number: 9, title: 'x', state: 'closed' })).toBe('committed');
    expect(stageOf({ number: 9, title: 'x', state: 'open' })).toBe('backlog');
    expect(stageOf(null)).toBe('backlog');
  });

  it('only the Main Fields card is a parent', () => {
    expect(BOARD.filter(isParentCard).map(c => c.number)).toEqual([1]);
  });

  it('cardsInStage sorts by board position then issue number', () => {
    expect(cardsInStage(BOARD, 'prog').map(c => c.number)).toEqual([10, 11]);
    expect(cardsInStage([{ number: 5, title: 'a' }, { number: 4, title: 'b' }], 'backlog').map(c => c.number))
      .toEqual([4, 5]);
  });

  it('walkOrder is בפיתוח עכשיו → שלבי בדיקות → ספרינט הקרוב, and never a parent', () => {
    expect(walkOrder(BOARD).map(c => c.number)).toEqual([10, 11, 12, 13]);
  });
});

describe('parseTitle / parentLabel', () => {
  it('splits `[מודול] | [תת-תחום] | [תיאור]`', () => {
    expect(parseTitle('קיבוצים | קריאות | תיקון')).toEqual({ module: 'קיבוצים', sub: 'קריאות', desc: 'תיקון' });
    expect(parseTitle('קיבוצים | תיקון')).toEqual({ module: 'קיבוצים', sub: '', desc: 'תיקון' });
    expect(parseTitle('תיקון')).toEqual({ module: 'אחר', sub: '', desc: 'תיקון' });
    expect(parseTitle(null)).toEqual({ module: 'אחר', sub: '', desc: '' });
  });

  it('names the parent card, or falls back to the card`s own module', () => {
    expect(parentLabel(BOARD[1], BOARD)).toBe('קיבוצים');
    expect(parentLabel({ number: 99, title: 'דוחות | א | ב' }, BOARD)).toBe('דוחות');
    expect(parentLabel({ number: 99, title: 'x', parent: 777 }, BOARD)).toBe('#777');
  });
});

describe('cardsWithoutSpec', () => {
  it('flags an empty body and a body with no `## ` section, and skips parents + shipped', () => {
    expect(cardsWithoutSpec(BOARD).map(c => c.number)).toEqual([11, 13]);
  });

  it('an empty board gives an empty list', () => {
    expect(cardsWithoutSpec([])).toEqual([]);
    expect(cardsWithoutSpec(null)).toEqual([]);
  });
});

describe('blockedOver', () => {
  it('only working columns, older than N days, oldest first', () => {
    expect(blockedOver(BOARD, 7, NOW).map(c => c.number)).toEqual([10, 12]);
  });

  it('the window is configurable and backlog is never "blocked"', () => {
    expect(blockedOver(BOARD, 30, NOW)).toEqual([]);
    expect(blockedOver(BOARD, 0, NOW).map(c => c.number)).toEqual([10, 12, 13, 11]);
  });

  it('a card with no updatedAt is not reported as stuck', () => {
    expect(blockedOver([{ number: 5, title: 'x', status: 'In Progress' }], 7, NOW)).toEqual([]);
  });

  it('an empty board gives an empty list', () => {
    expect(blockedOver([], 7, NOW)).toEqual([]);
    expect(blockedOver(undefined, 7, NOW)).toEqual([]);
  });
});

describe('questionsForIdan', () => {
  it('comments mentioning עידן, newest first, without his own', () => {
    expect(questionsForIdan(COMMENTS).map(c => c.id)).toEqual(['c2', 'c1']);
  });

  it('no comments → no questions', () => {
    expect(questionsForIdan([])).toEqual([]);
    expect(questionsForIdan(null)).toEqual([]);
  });
});

describe('burndown', () => {
  it('counts what shipped out of what entered the sprint', () => {
    expect(burndown(BOARD)).toEqual({ done: 1, total: 5, pct: 20 });
  });

  it('an empty board is 0/0 at 0% — never NaN', () => {
    expect(burndown([])).toEqual({ done: 0, total: 0, pct: 0 });
    expect(burndown(null)).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe('rankCard', () => {
  it('is a finite total for a bare card', () => {
    expect(rankCard({ number: 1, title: 'x' }, { now: NOW })).toBe(0);
    expect(rankCard(null)).toBe(0);
  });

  it('priority outranks age', () => {
    const urgent = rankCard(BOARD.find(c => c.number === 21)!, { now: NOW });
    const old = rankCard(BOARD.find(c => c.number === 20)!, { now: NOW });
    expect(urgent).toBeGreaterThan(old);
  });

  it('age is capped, so an ancient nice-to-have cannot pass a critical card', () => {
    const ancient = rankCard({ number: 9, title: 'x', createdAt: ago(3000) }, { now: NOW });
    expect(ancient).toBe(30);
  });

  it('the parent module`s weight is added when the caller supplies one', () => {
    const base = rankCard(BOARD.find(c => c.number === 22)!, { now: NOW });
    const weighted = rankCard(BOARD.find(c => c.number === 22)!, { now: NOW, modulePriority: { 'תשתית': 11 } });
    expect(weighted - base).toBe(11);
  });

  it('a red-health card gets the bonus, and a missing health list changes nothing', () => {
    const card = BOARD.find(c => c.number === 20)!;
    const plain = rankCard(card, { now: NOW });
    expect(rankCard(card, { now: NOW, redKibbutzim: null })).toBe(plain);
    expect(rankCard(card, { now: NOW, redKibbutzim: [] })).toBe(plain);
    expect(rankCard(card, { now: NOW, redKibbutzim: ['חוקוק'] })).toBe(plain + 25);
    expect(rankCard(card, { now: NOW, redKibbutzim: ['דגניה'] })).toBe(plain);
  });

  it('touchesRed looks at the title and the body', () => {
    expect(touchesRed({ number: 1, title: 'a', body: 'על דגניה' }, ['דגניה'])).toBe(true);
    expect(touchesRed({ number: 1, title: 'a' }, ['דגניה'])).toBe(false);
    expect(touchesRed(null, ['דגניה'])).toBe(false);
  });
});

describe('proposeSprint', () => {
  it('ranks the backlog, respects the cap and never proposes a parent', () => {
    const picked = proposeSprint(BOARD, { now: NOW, cap: 3 });
    expect(picked.map(c => c.number)).toEqual([21, 20, 22]);
    expect(picked.some(isParentCard)).toBe(false);
  });

  it('a tie breaks on issue number ascending, and the order is stable across re-runs', () => {
    // 22 and 23 are identical apart from their number.
    const once = proposeSprint(BOARD, { now: NOW }).map(c => c.number);
    const twice = proposeSprint(BOARD.slice().reverse(), { now: NOW }).map(c => c.number);
    expect(once).toEqual([21, 20, 22, 23]);
    expect(twice).toEqual(once);
  });

  it('never proposes a card that is already in the sprint', () => {
    expect(proposeSprint(BOARD, { now: NOW }).map(c => c.number)).not.toContain(13);
  });

  it('a cap of 0 proposes nothing; an empty board proposes nothing', () => {
    expect(proposeSprint(BOARD, { now: NOW, cap: 0 })).toEqual([]);
    expect(proposeSprint([], { now: NOW })).toEqual([]);
    expect(proposeSprint(null)).toEqual([]);
  });

  it('a board of nothing but parents proposes nothing', () => {
    expect(proposeSprint([BOARD[0]], { now: NOW })).toEqual([]);
  });
});

describe('sprintList', () => {
  it('is the ordered output: issue_number · title · parent · why', () => {
    const picked = proposeSprint(BOARD, { now: NOW, cap: 2, redKibbutzim: ['חוקוק'] });
    expect(sprintList(picked, BOARD, { now: NOW, redKibbutzim: ['חוקוק'] })).toEqual([
      {
        issue_number: 20,
        title: 'קיבוצים | התראות | התראת מונה בחוקוק',
        parent: 'קיבוצים',
        why: 'קשור לקיבוץ בעייתי · ממתין 5 שבועות',
      },
      {
        issue_number: 21,
        title: 'דוחות | הדפסה | כותרת',
        parent: 'קיבוצים',
        why: 'עדיפות קריטי',
      },
    ]);
  });

  it('an empty pick is an empty list', () => {
    expect(sprintList([], BOARD)).toEqual([]);
    expect(sprintList(null)).toEqual([]);
  });
});

describe('devPrep — the one object both surfaces read', () => {
  it('derives the walk and every prep list at once', () => {
    const prep = devPrep(BOARD, { now: NOW, cap: 3, comments: COMMENTS, redKibbutzim: ['חוקוק'] });
    expect(prep.burndown).toEqual({ done: 1, total: 5, pct: 20 });
    expect(prep.walk.map(c => c.number)).toEqual([10, 11, 12, 13]);
    expect(prep.cardsWithoutSpec.map(c => c.number)).toEqual([11, 13]);
    expect(prep.blocked.map(c => c.number)).toEqual([10, 12]);
    expect(prep.questions.map(c => c.id)).toEqual(['c2', 'c1']);
    expect(prep.proposed.map(c => c.number)).toEqual([20, 21, 22]);
    expect(prep.sprint.map(e => e.issue_number)).toEqual(prep.proposed.map(c => c.number));
  });

  it('an empty board gives empty lists and never throws', () => {
    const prep = devPrep([], { now: NOW });
    expect(prep).toEqual({
      burndown: { done: 0, total: 0, pct: 0 },
      cardsWithoutSpec: [], blocked: [], questions: [], proposed: [], sprint: [], walk: [],
    });
    expect(() => devPrep(null)).not.toThrow();
    expect(() => devPrep(undefined as any, {})).not.toThrow();
  });
});

describe('canRunDevMeeting', () => {
  it('the dev-page gate: עידן + the two developers, plus any admin', () => {
    expect(canRunDevMeeting('עידן')).toBe(true);
    expect(canRunDevMeeting('מתניה')).toBe(true);
    expect(canRunDevMeeting('אליה')).toBe(true);
    expect(canRunDevMeeting('עמיחי', { isAdmin: true })).toBe(true);
    expect(canRunDevMeeting('אביאם')).toBe(false);
    expect(canRunDevMeeting('')).toBe(false);
    expect(canRunDevMeeting(null)).toBe(false);
  });

  it('a viewer never runs the meeting, whatever else is true', () => {
    expect(canRunDevMeeting('עידן', { isViewer: true })).toBe(false);
    expect(canRunDevMeeting('עידן', { isAdmin: true, isViewer: true })).toBe(false);
  });
});
