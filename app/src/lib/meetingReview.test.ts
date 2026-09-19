// Goldens for ישיבה → סיכום (company-process spec §1.3). Written BEFORE the screen, over the
// REAL 17.9 company summary (`__fixtures__/summary_17.9.26.md`), so the whole judgement
// surface of the review is pinned without a DOM.
//
// Three things are asserted here that no rendering test could:
//   · `applyReview` against `__fixtures__/review_17.9.26.json` — a change that shifts one
//     line's chip, seq or EMS payload fails here, loudly;
//   · EVERY mutator is immutable — the input draft is deep-equal to a frozen copy afterwards.
//     The screen keeps the original draft so "בטל" can throw the edits away; a mutator that
//     wrote through would make cancel a lie;
//   · the module imports NOTHING from `supabase.ts` (a source sweep). "Nothing is written
//     before בצע" is a property of that file, and this is what keeps it one.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMeetingSummary } from './meetingNotes';
import {
  addLine, applyReview, canReview, CHIP_LABELS, CHIP_ORDER, draftFromParsed, editLine, moveLine,
  proposeChip, removeLine, reviewChips, reviewPayload, reviewSummary, setChip, setOwner, setTask,
  summaryLabel, type ReviewDraft,
} from './meetingReview';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => readFileSync(resolve(here, '__fixtures__', n), 'utf8');

/** The live card catalog, as of 18.9.26 — the same list meetingNotes.test.ts resolves against. */
const KNOWN = [
  'אור הנר גז', 'אור הנר חשמל', 'אלומות', 'אלונים', 'אפיק', 'אפיקים', 'בית זרע', 'גבים',
  'גברעם', 'גבת', 'גניגר', 'דביר', 'דגניה', 'דגניה ב', 'דפנה', 'חולדה', 'חוקוק', 'יגור',
  'יסעור', 'כנרת', 'כפר גלעדי', 'כפר מסריק', 'כפר עזה', 'לביא', 'להב', 'מגידו', 'מגן',
  'מעוז חיים', 'משמר השרון', 'מתחם חינוך שער הנגב', 'עין דור', 'עין המפרץ', 'עין השופט',
  'עין חרוד איחוד', 'עין חרוד מאוחד', 'קבוצת יבנה', 'קיבוץ גת', 'קיבוץ ניצנים', 'רמות מנשה',
  'שדה אליהו', 'שלוחות', 'שער הגולן', 'תל קציר', 'משואות יצחק', 'מעלה גלבוע', 'ניר עציון',
  'חוצות יגור', 'גבעת חיים מאוחד', 'כפר דניאל', 'כפר מנחם', 'פרחי אביב', 'בית אריזה גלבוע',
  'אגודת המים עמק הירדן',
].map(name => ({ name }));

const parsed17 = parseMeetingSummary(fixture('summary_17.9.26.md'), { known: KNOWN });

/** A tiny hand-made draft — the mutator cases read better against four known lines. */
function tiny(): ReviewDraft {
  return draftFromParsed({
    meeting_date: '2026-09-17',
    meeting_kind: 'company',
    sections: [
      {
        heading: 'דפנה', kibbutzim: ['דפנה'], unmatched: [],
        bullets: [
          { seq: 1, text: 'להחליף את המונה הראשי מול הגזבר.', owners: ['אביאם'], quiet: false },
          { seq: 2, text: 'ללא פערים.', owners: [], quiet: true },
        ],
      },
      {
        heading: 'חוקוק', kibbutzim: ['חוקוק'], unmatched: [],
        bullets: [
          { seq: 1, text: 'הוחלט שהקריאות הידניות קובעות.', owners: ['עידן'], quiet: false },
          { seq: 2, text: 'הנושא נדחה לאחרי החג.', owners: [], quiet: false },
        ],
      },
    ],
  });
}

const frozen = (d: ReviewDraft) => JSON.parse(JSON.stringify(d));

describe('proposeChip', () => {
  it('an action verb is work', () => {
    expect(proposeChip('לבדוק את מוני הנצר בשבוע הבא.')).toBe('ems');
    expect(proposeChip('נדרש לוודא שהפונקציה מוכנה לגרסה.')).toBe('ems');
    expect(proposeChip('יש להחליף את ה-SIM.')).toBe('ems');
  });

  it('an owner alone is enough — someone was made responsible', () => {
    expect(proposeChip('המאזן של אוגוסט.', ['אביאם'])).toBe('ems');
  });

  it('"ללא פערים" is not work', () => {
    expect(proposeChip('ללא פערים.')).toBe('chatter');
    expect(proposeChip('אין חדש.')).toBe('chatter');
    // …even with an owner on the paragraph: quiet wins.
    expect(proposeChip('ללא פערים.', ['עידן'])).toBe('chatter');
  });

  it('a sentence with no action verb is the default', () => {
    expect(proposeChip('הקיבוץ קטן יחסית.')).toBe('chatter');
  });

  it('a decision beats the verb inside it', () => {
    expect(proposeChip('הוחלט לבדוק את הנושא מול פז.')).toBe('decision');
    expect(proposeChip('הוכרע שהקריאות הידניות קובעות.')).toBe('decision');
  });

  it('idea · deferral · internal have their own wording', () => {
    expect(proposeChip('עלה רעיון לנהל מלאי ציוד.')).toBe('idea');
    expect(proposeChip('הנושא נדחה לאחרי החג.')).toBe('deferred');
    expect(proposeChip('נוהל פנימי לסגירת חודש.')).toBe('internal');
  });

  it('a marker raises a would-be chatter to a decision, and leaves work alone', () => {
    expect(proposeChip('הקיבוץ קטן יחסית.', [], true)).toBe('decision');
    expect(proposeChip('ללא פערים.', [], true)).toBe('decision');
    expect(proposeChip('לבדוק את המונה.', [], true)).toBe('ems');
  });

  it('empty text never proposes work', () => {
    expect(proposeChip('')).toBe('chatter');
    expect(proposeChip('   ', ['עידן'], true)).toBe('chatter');
  });
});

describe('the chip vocabulary', () => {
  it('is the six §1.3 names, with their labels', () => {
    expect(CHIP_ORDER).toEqual(['ems', 'internal', 'decision', 'idea', 'deferred', 'chatter']);
    expect(CHIP_LABELS.ems).toBe('📋 משימת EMS');
    expect(CHIP_LABELS.chatter).toBe('— רק דיבורים');
  });

  it('hides the internal chip until an internal-task write path exists', () => {
    expect(reviewChips().map(c => c.id)).not.toContain('internal');
    expect(reviewChips({ internalTasks: true }).map(c => c.id)).toContain('internal');
  });
});

describe('draftFromParsed', () => {
  it('one section per CARD, every line with a proposal', () => {
    const d = tiny();
    expect(d.sections.map(s => s.kibbutz)).toEqual(['דפנה', 'חוקוק']);
    expect(d.sections[0].lines.map(l => l.chip)).toEqual(['ems', 'chatter']);
    expect(d.sections[1].lines.map(l => l.chip)).toEqual(['decision', 'deferred']);
    expect(d.sections[0].lines.every(l => !l.edited && !l.added)).toBe(true);
  });

  it('keys are unique across the whole draft', () => {
    const keys = draftFromParsed(parsed17).sections.flatMap(s => s.lines.map(l => l.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a section with no card produces nothing (the import preview owns that)', () => {
    const d = draftFromParsed({
      meeting_date: '2026-09-17', meeting_kind: 'company',
      sections: [{
        heading: 'גשר השלום', kibbutzim: [], unmatched: ['גשר השלום'],
        bullets: [{ seq: 1, text: 'לבדוק.', owners: [], quiet: false }],
      }],
    });
    expect(d.sections).toEqual([]);
  });

  it('a card named by two sections gets ONE merged section', () => {
    const sec = (text: string) => ({
      heading: 'דפנה', kibbutzim: ['דפנה'], unmatched: [],
      bullets: [{ seq: 1, text, owners: [], quiet: false }],
    });
    const d = draftFromParsed({
      meeting_date: '2026-09-17', meeting_kind: 'company', sections: [sec('לבדוק א.'), sec('לבדוק ב.')],
    });
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].lines.map(l => l.key)).toEqual(['דפנה#1', 'דפנה#2']);
  });

  it('a marked kibbutz has its chatter raised', () => {
    const d = draftFromParsed(
      {
        meeting_date: '2026-09-17', meeting_kind: 'company', sections: [{
          heading: 'דפנה', kibbutzim: ['דפנה'], unmatched: [],
          bullets: [{ seq: 1, text: 'הקיבוץ קטן יחסית.', owners: [], quiet: false }],
        }],
      },
      { marked: ['דפנה'] },
    );
    expect(d.sections[0].lines[0].chip).toBe('decision');
  });
});

describe('the mutators', () => {
  it('setChip · setOwner · editLine change exactly one line', () => {
    const d = tiny();
    const a = setChip(d, 'דפנה#2', 'idea');
    expect(a.sections[0].lines[1].chip).toBe('idea');
    expect(a.sections[0].lines[0].chip).toBe('ems');

    const b = setOwner(a, 'דפנה#1', ['ניתאי', 'עידן']);
    expect(b.sections[0].lines[0].owners).toEqual(['ניתאי', 'עידן']);

    const c = editLine(b, 'דפנה#1', '  להחליף את המונה הראשי — מול הגזבר  ');
    expect(c.sections[0].lines[0].text).toBe('להחליף את המונה הראשי — מול הגזבר');
    expect(c.sections[0].lines[0].edited).toBe(true);
    expect(c.sections[0].lines[1].edited).toBe(false);
  });

  it('an empty edit is refused', () => {
    const d = tiny();
    expect(editLine(d, 'דפנה#1', '   ')).toEqual(d);
  });

  it('addLine marks the line as added and can open a new section', () => {
    const d = addLine(tiny(), 'דפנה', 'לשלוח מייל מסכם.', ['עידן']);
    const last = d.sections[0].lines[2];
    expect(last.added).toBe(true);
    expect(last.chip).toBe('ems');
    expect(last.owners).toEqual(['עידן']);

    const fresh = addLine(tiny(), 'יגור', 'לתאם ביקור.');
    expect(fresh.sections.map(s => s.kibbutz)).toEqual(['דפנה', 'חוקוק', 'יגור']);
  });

  it('addLine refuses an empty line or a nameless kibbutz', () => {
    const d = tiny();
    expect(addLine(d, 'דפנה', '  ')).toEqual(d);
    expect(addLine(d, '', 'לבדוק.')).toEqual(d);
  });

  it('moveLine keeps text + chip, records movedFrom, and keeps the line COUNT', () => {
    const d = tiny();
    const before = d.sections.reduce((n, s) => n + s.lines.length, 0);
    const m = moveLine(d, 'דפנה#1', 'חוקוק');
    const after = m.sections.reduce((n, s) => n + s.lines.length, 0);
    expect(after).toBe(before);
    expect(m.sections[0].lines.map(l => l.key)).toEqual(['דפנה#2']);
    const moved = m.sections[1].lines[2];
    expect(moved.key).toBe('דפנה#1');
    expect(moved.movedFrom).toBe('דפנה');
    expect(moved.chip).toBe('ems');
    expect(moved.text).toBe('להחליף את המונה הראשי מול הגזבר.');
  });

  it('moveLine to a kibbutz with no section opens one; a no-op move is a no-op', () => {
    const d = tiny();
    expect(moveLine(d, 'דפנה#1', 'יגור').sections.map(s => s.kibbutz)).toEqual(['דפנה', 'חוקוק', 'יגור']);
    expect(moveLine(d, 'דפנה#1', 'דפנה')).toEqual(d);
    expect(moveLine(d, 'לא-קיים', 'חוקוק')).toEqual(d);
  });

  it('removeLine drops the line and keeps the (now empty) section', () => {
    const d = removeLine(removeLine(tiny(), 'דפנה#1'), 'דפנה#2');
    expect(d.sections[0]).toEqual({ kibbutz: 'דפנה', lines: [] });
  });

  it('setTask keeps only the fields the task modal actually set, and clearing removes it', () => {
    const d = setTask(tiny(), 'דפנה#1', { title: '  החלפת מונה ראשי ', description: '   ', priority: 'high' });
    expect(d.sections[0].lines[0].task).toEqual({ title: 'החלפת מונה ראשי', priority: 'high' });
    expect(setTask(d, 'דפנה#1', {}).sections[0].lines[0].task).toBeUndefined();
  });

  it('every mutator is immutable — the input is untouched', () => {
    const d = tiny();
    const copy = frozen(d);
    setChip(d, 'דפנה#1', 'idea');
    setOwner(d, 'דפנה#1', ['מתניה']);
    editLine(d, 'דפנה#1', 'אחרת לגמרי');
    setTask(d, 'דפנה#1', { title: 'משהו אחר' });
    addLine(d, 'דפנה', 'שורה משלי');
    addLine(d, 'יגור', 'שורה בקיבוץ חדש');
    moveLine(d, 'דפנה#1', 'חוקוק');
    removeLine(d, 'חוקוק#1');
    expect(JSON.parse(JSON.stringify(d))).toStrictEqual(copy);
  });

  it('a mutated draft shares no line object with its input', () => {
    const d = tiny();
    const m = setChip(d, 'דפנה#1', 'idea');
    expect(m.sections[0].lines[1]).not.toBe(d.sections[0].lines[1]);
    expect(m.sections[0].lines[0].owners).not.toBe(d.sections[0].lines[0].owners);
  });
});

describe('reviewSummary', () => {
  it('counts the four buckets the בצע button names', () => {
    const d = setChip(addLine(tiny(), 'דפנה', 'נוהל פנימי לסגירת חודש.'), 'דפנה#+5', 'internal');
    expect(reviewSummary(d)).toEqual({ ems: 1, internal: 1, notes: 2, chatter: 1 });
    expect(summaryLabel(reviewSummary(d))).toBe('בצע — 1 משימות · 1 פנימיות · 2 הערות · 1 דיבורים');
    expect(summaryLabel({ ems: 0, internal: 0, notes: 0, chatter: 0 })).toBe('בצע');
  });
});

describe('applyReview', () => {
  it('seq follows the line order after a move', () => {
    const d = moveLine(tiny(), 'דפנה#1', 'חוקוק');
    const { notes } = applyReview(d);
    expect(notes.filter(n => n.kibbutz === 'דפנה').map(n => n.seq)).toEqual([1]);
    expect(notes.filter(n => n.kibbutz === 'חוקוק').map(n => n.seq)).toEqual([1, 2, 3]);
  });

  it('chips become the row the card shows: quiet · deferred · the prefix', () => {
    const { notes } = applyReview(tiny());
    const dafna = notes.filter(n => n.kibbutz === 'דפנה');
    expect(dafna[1]).toMatchObject({ chip: 'chatter', quiet: true, deferred: false, text: 'ללא פערים.' });
    const hukok = notes.filter(n => n.kibbutz === 'חוקוק');
    expect(hukok[0].text).toBe('🧭 הוחלט שהקריאות הידניות קובעות.');
    expect(hukok[1]).toMatchObject({ chip: 'deferred', deferred: true, text: '⏭ הנושא נדחה לאחרי החג.' });
  });

  it('an EMS line carries the taskFromBullet prefill and its note key', () => {
    const { emsTasks } = applyReview(tiny());
    expect(emsTasks).toHaveLength(1);
    expect(emsTasks[0]).toMatchObject({ key: 'דפנה#1', kibbutz: 'דפנה', seq: 1 });
    expect(emsTasks[0].task).toMatchObject({
      kibbutz: 'דפנה', title: 'להחליף את המונה הראשי מול הגזבר', assigneeName: 'אביאם', priority: 'medium',
    });
    expect(emsTasks[0].task.description).toContain('מקור: ישיבת חברה 17.9.26');
    // …and the title follows the EDITED sentence, not the transcript's.
    const edited = applyReview(editLine(tiny(), 'דפנה#1', 'להזמין מונה חדש'));
    expect(edited.emsTasks[0].task.title).toBe('להזמין מונה חדש');
  });

  it('a task override wins over the prefill; the untouched fields still follow the sentence', () => {
    const d = editLine(setTask(tiny(), 'דפנה#1', { title: 'החלפת מונה ראשי' }), 'דפנה#1', 'להזמין מונה חדש');
    const { task } = applyReview(d).emsTasks[0];
    expect(task.title).toBe('החלפת מונה ראשי');
    expect(task.description).toContain('להזמין מונה חדש');
  });

  it('an internal line becomes an internal task, owner first', () => {
    const d = setChip(setOwner(tiny(), 'דפנה#2', ['מתניה']), 'דפנה#2', 'internal');
    expect(applyReview(d).internalTasks).toEqual([{ title: 'ללא פערים.', owner: 'מתניה', kibbutz: 'דפנה' }]);
  });

  it('created_by rides along only when there is one', () => {
    expect(applyReview(tiny()).notes[0].created_by).toBeUndefined();
    expect(applyReview(tiny(), 'עידן').notes[0].created_by).toBe('עידן');
  });

  it('reviewPayload is the import function’s exact argument shape', () => {
    const d = tiny();
    const p = reviewPayload(applyReview(d), d, 'עידן');
    expect(p.meeting_date).toBe('2026-09-17');
    expect(p.meeting_kind).toBe('company');
    expect(p.created_by).toBe('עידן');
    expect(Object.keys(p.rows[0]).sort()).toEqual(['kibbutz', 'owners', 'seq', 'text']);
  });

  it('golden: the whole 17.9 summary, reviewed as proposed', () => {
    const bundle = applyReview(draftFromParsed(parsed17), 'עידן');
    const path = resolve(here, '__fixtures__', 'review_17.9.26.json');
    const actual = JSON.parse(JSON.stringify(bundle));
    if (!existsSync(path) || process.env.UPDATE_FIXTURES) {
      writeFileSync(path, JSON.stringify(actual, null, 2) + '\n', 'utf8');
    }
    expect(actual).toStrictEqual(JSON.parse(readFileSync(path, 'utf8')));
  });
});

describe('the role gate', () => {
  it('admins only, never a viewer', () => {
    expect(canReview(true, false)).toBe(true);
    expect(canReview(true, true)).toBe(false);
    expect(canReview(false, false)).toBe(false);
  });
});

describe('contract', () => {
  it('imports nothing from supabase.ts — no mutator can write', () => {
    const src = readFileSync(resolve(here, 'meetingReview.ts'), 'utf8');
    const imports = Array.from(src.matchAll(/from\s+'([^']+)'/g)).map(m => m[1]);
    expect(imports).toEqual(['./meetingNotes']);
    // Comments are stripped first: the file's own header SAYS "nothing from supabase.ts",
    // and a sweep that cannot tell a promise from a call would fail on the promise.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/supabase|sbWrite|fetch\(|document\.|window\./);
  });
});
