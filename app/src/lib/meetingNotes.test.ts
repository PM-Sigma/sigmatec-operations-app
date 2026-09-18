// Goldens for the meeting-summary parser, against the THREE REAL company summaries
// (`__fixtures__/summary_{17.9,6.9,23.8}.26.md`, verbatim copies of
// `Sigmatec Management/Company Meeting/<date>/`). `expected_17.9.26.json` is the full parse
// of 17.9 and is compared field-by-field — a parser change that shifts one bullet fails here.
//
// Written BEFORE meetingNotes.ts (TDD): every case below comes from task-2-brief.md.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMeetingSummary, parseMeetingDate, parseMeetingKind, parseOwners, splitSentences,
  headingNames, resolveKibbutzName, titleFromBullet, descriptionFromBullet, taskFromBullet,
  notesForKibbutz, rowsFromParsed, countRowsToSave, normalizeName, isQuiet, dmy, chipDate,
  KIBBUTZ_ALIASES, type NoteRow,
  canImportNotes, importPayload, collapseBullets, type MeetingGroup,
} from './meetingNotes';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => readFileSync(resolve(here, '__fixtures__', n), 'utf8');

const md17 = fixture('summary_17.9.26.md');
const md6 = fixture('summary_6.9.26.md');
const md23 = fixture('summary_23.8.26.md');

/** The live `kibbutzim` card catalog (names + display_name), as of 18.9.26. */
const KNOWN = [
  { name: 'אגודת המים עמק הירדן' }, { name: 'אור הנר גז', display_name: 'אור הנר — גז' },
  { name: 'אור הנר חשמל', display_name: 'אור הנר — חשמל' }, { name: 'אלומות' }, { name: 'אלונים' },
  { name: 'אפיק' }, { name: 'אפיקים' }, { name: 'בית אריזה גלבוע' }, { name: 'בית זרע' },
  { name: 'גבים' }, { name: 'גבעת חיים מאוחד' }, { name: 'גברעם' }, { name: 'גבת' }, { name: 'גניגר' },
  { name: 'דביר' }, { name: 'דגניה', display_name: 'דגניה א' }, { name: 'דגניה ב', display_name: "דגניה ב'" },
  { name: 'דפנה' }, { name: 'חולדה' }, { name: 'חוצות יגור' }, { name: 'חוקוק' }, { name: 'יגור' },
  { name: 'יסעור' }, { name: 'כנרת' }, { name: 'כפר גלעדי' }, { name: 'כפר דניאל' }, { name: 'כפר מנחם' },
  { name: 'כפר מסריק' }, { name: 'כפר עזה' }, { name: 'לביא' }, { name: 'להב' }, { name: 'מגידו' },
  { name: 'מגן' }, { name: 'מעוז חיים' }, { name: 'מעלה גלבוע' }, { name: 'משואות יצחק' },
  { name: 'משמר השרון' }, { name: 'מתחם חינוך שער הנגב' }, { name: 'ניר עציון' }, { name: 'עין דור' },
  { name: 'עין המפרץ' }, { name: 'עין השופט' }, { name: 'עין חרוד איחוד' }, { name: 'עין חרוד מאוחד' },
  { name: 'פרחי אביב' }, { name: 'קבוצת יבנה' }, { name: 'קיבוץ גת' }, { name: 'קיבוץ ניצנים' },
  { name: 'רמות מנשה' }, { name: 'שדה אליהו' }, { name: 'שלוחות' }, { name: 'שער הגולן' },
  { name: 'שריד' }, { name: 'תל קציר' },
];

const parsed17 = parseMeetingSummary(md17, { known: KNOWN });
const sectionFor = (p: typeof parsed17, name: string) => p.sections.find(s => s.kibbutzim.includes(name))!;

describe('date + kind', () => {
  it('reads the date off the first line: **… — 17.9.26** → 2026-09-17', () => {
    expect(parseMeetingDate(md17)).toBe('2026-09-17');
    expect(parseMeetingDate(md6)).toBe('2026-09-06');
    expect(parseMeetingDate(md23)).toBe('2026-08-23');
  });

  it('classifies the kind from the title', () => {
    expect(parseMeetingKind(md17)).toBe('company');
    expect(parseMeetingKind('**סיכום ישיבת פיתוח — 1.1.26**')).toBe('dev');
    expect(parseMeetingKind('**פגישה עם קיבוץ דפנה — 1.1.26**')).toBe('client');
  });

  it('no date in the text → the caller-supplied fallback', () => {
    const p = parseMeetingSummary('**ישיבת חברה**\n\n**1. גבים**\n\nמשהו קרה כאן.', { known: KNOWN, date: '2026-01-05' });
    expect(p.meeting_date).toBe('2026-01-05');
  });

  it('dmy / chipDate render the Hebrew short forms', () => {
    expect(dmy('2026-09-17')).toBe('17.9.26');
    expect(chipDate('2026-09-17')).toBe('17.9');
  });
});

describe('17.9 golden', () => {
  it('parses every numbered section', () => {
    // The brief said 30; the real file (verbatim) carries 36 numbered sections — the fixture wins.
    expect(parsed17.sections).toHaveLength(36);
    expect(parsed17.meeting_date).toBe('2026-09-17');
    expect(parsed17.meeting_kind).toBe('company');
  });

  it('section "6. גבים" — 6 bullets, first one verbatim, owners on every bullet', () => {
    const gvim = parsed17.sections[5];
    expect(gvim.heading).toBe('גבים');
    expect(gvim.kibbutzim).toEqual(['גבים']);
    expect(gvim.bullets).toHaveLength(6);
    expect(gvim.bullets[0].text).toBe('מאזן אנרגיה: אובדן קבוע בראשי, יותר יציאה מכניסה — "לא הגיוני".');
    expect(gvim.bullets[0].seq).toBe(1);
    expect(gvim.bullets.map(b => b.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    gvim.bullets.forEach(b => expect(b.owners).toEqual(['אביאם', 'עידן']));
    // the אחריות clause itself never becomes a bullet
    expect(gvim.bullets.some(b => /אחריות/.test(b.text))).toBe(false);
  });

  it('section 27 resolves FOUR kibbutzim from one ` · `-joined heading', () => {
    const multi = parsed17.sections[26];
    expect(multi.kibbutzim).toEqual(['כפר עזה', 'יסעור', 'כפר מנחם', 'משואות יצחק']);
    expect(multi.unmatched).toEqual([]);
    expect(multi.bullets.length).toBeGreaterThan(0);
  });

  it('חוקוק — the last bullet is a quiet one ("ללא פערים")', () => {
    const b = sectionFor(parsed17, 'חוקוק').bullets;
    expect(b[b.length - 1].text).toBe('ללא פערים.');
    expect(b[b.length - 1].quiet).toBe(true);
    expect(b.slice(0, -1).every(x => x.quiet === false)).toBe(true);
  });

  it('דגניה א resolves to the card דגניה through the alias table', () => {
    const s = parsed17.sections[21];
    expect(s.heading).toBe('דגניה א');
    expect(s.kibbutzim).toEqual(['דגניה']);
    expect(s.bullets).toEqual([{ seq: 1, text: 'עדיין לא.', owners: [], quiet: true }]);
  });

  it('גשר השלום has no card → unmatched, and it is the ONLY unmatched name', () => {
    const s = parsed17.sections[7];
    expect(s.kibbutzim).toEqual([]);
    expect(s.unmatched).toEqual(['גשר השלום']);
    // a section line immediately followed by its body (no blank line) still parses
    expect(s.bullets[0].text).toBe('אין חדש.');
    const allUnmatched = parsed17.sections.flatMap(x => x.unmatched);
    expect(allUnmatched).toEqual(['גשר השלום']);
  });

  it('אור הנר fans out to BOTH cards (חשמל + גז)', () => {
    const s = parsed17.sections[12];
    expect(s.heading).toBe('אור הנר');
    expect(s.kibbutzim).toEqual(['אור הנר חשמל', 'אור הנר גז']);
  });

  it('the preamble (הנחיות רוחביות, הכרעות table) is NOT parsed as sections', () => {
    const texts = parsed17.sections.flatMap(s => s.bullets.map(b => b.text));
    expect(texts.some(t => /צריכות אוטומטיות/.test(t))).toBe(false);
    expect(texts.some(t => t.startsWith('|'))).toBe(false);
  });

  it('the closing "**קיבוצים שלא נתפסו כלל**" heading ends the last section', () => {
    const last = parsed17.sections[35];
    expect(last.bullets.map(b => b.text)).toEqual([
      'נסקרו ברצף בסוף הישיבה ללא פירוט שנתפס.',
      'מגן: מנסה הסבת מוני ארד לתקשורת ישירה.',
      'אין שינוי במשימות.',
    ]);
  });

  it('deepEqual against expected_17.9.26.json', () => {
    const path = resolve(here, '__fixtures__', 'expected_17.9.26.json');
    if (!existsSync(path) || process.env.UPDATE_GOLDEN) {
      writeFileSync(path, JSON.stringify(parsed17, null, 2) + '\n', 'utf8');
    }
    expect(parsed17).toStrictEqual(JSON.parse(readFileSync(path, 'utf8')));
  });
});

describe('6.9 + 23.8 fixtures', () => {
  const parsed6 = parseMeetingSummary(md6, { known: KNOWN });
  const parsed23 = parseMeetingSummary(md23, { known: KNOWN });

  it('a heading with a ` — ✅ 5 משימות` suffix resolves to the bare name דפנה', () => {
    const s = parsed6.sections[0];
    expect(s.heading).toBe('דפנה — ✅ 5 משימות');
    expect(s.kibbutzim).toEqual(['דפנה']);
    expect(s.bullets.length).toBeGreaterThan(1);
  });

  it('a heading whose suffix is an empty dash still resolves (`9. גשר השלום —`, `11. גברעם –`)', () => {
    expect(headingNames('גשר השלום —')).toEqual(['גשר השלום']);
    expect(headingNames('גברעם –')).toEqual(['גברעם']);
    expect(parsed6.sections[10].kibbutzim).toEqual(['גברעם']);
  });

  it('an UNBOLDED trailing "אחריות …" clause is owners too (6.9 writes some that way)', () => {
    const gvaram = parsed6.sections[10];                       // "… אחריות עמיחי ומתניה"
    expect(gvaram.bullets.every(b => b.owners.join(',') === 'עמיחי,מתניה')).toBe(true);
    expect(gvaram.bullets.some(b => /^אחריות/.test(b.text))).toBe(false);
  });

  it('`שדה אליהו - חקלאות` keeps its hyphen (only em/en dashes are suffix separators)', () => {
    expect(headingNames('שדה אליהו - חקלאות — 0 משימות')).toEqual(['שדה אליהו - חקלאות']);
    // 6.9 numbers TWO sections "11." (גברעם, עין המפרץ), so the index is 16, not 15.
    expect(parsed6.sections[16].heading).toBe('שדה אליהו - חקלאות — 0 משימות');
    expect(parsed6.sections[16].unmatched).toEqual(['שדה אליהו - חקלאות']);
  });

  it('23.8 parses all 44 sections and every bullet is non-empty', () => {
    expect(parsed23.sections).toHaveLength(44);
    expect(parsed23.meeting_date).toBe('2026-08-23');
    parsed23.sections.forEach(s => s.bullets.forEach(b => expect(b.text.trim().length).toBeGreaterThan(3)));
  });

  it('every section of every fixture numbers its bullets 1..n', () => {
    [parsed17, parsed6, parsed23].forEach(p =>
      p.sections.forEach(s =>
        expect(s.bullets.map(b => b.seq)).toEqual(s.bullets.map((_, i) => i + 1))));
  });
});

describe('sentence splitting', () => {
  it('a decimal / date point does not split (2.9, 11.06)', () => {
    expect(splitSentences('העצירה ב-2.9 נבעה מהגדרה זו. הכל משדר.'))
      .toEqual(['העצירה ב-2.9 נבעה מהגדרה זו.', 'הכל משדר.']);
    expect(splitSentences('תיקון מונים מ-11.06 עדיין פתוח.')).toEqual(['תיקון מונים מ-11.06 עדיין פתוח.']);
  });

  it('in_progress does not split', () => {
    expect(splitSentences('ההסבה עברה ל-in_progress אתמול.')).toEqual(['ההסבה עברה ל-in_progress אתמול.']);
  });

  it('does not split on `;` — one bullet per SENTENCE, not per clause', () => {
    expect(splitSentences('מונה 133 מציג מספרים לא הגיוניים; ככל הנראה לא מוזנים כופלים.'))
      .toEqual(['מונה 133 מציג מספרים לא הגיוניים; ככל הנראה לא מוזנים כופלים.']);
  });

  it('fragments of ≤ 3 chars are dropped', () => {
    expect(splitSentences('טופל. כן. הושלם היום.')).toEqual(['טופל.', 'הושלם היום.']);
  });

  it('an empty body yields no bullets', () => {
    expect(splitSentences('')).toEqual([]);
    expect(parseMeetingSummary('**ישיבת חברה — 1.1.26**\n\n**1. גבים**\n\n', { known: KNOWN }).sections[0].bullets)
      .toEqual([]);
  });
});

describe('owners', () => {
  it('parenthesised scopes are stripped from the owner, kept in the bullet text', () => {
    expect(parseOwners('אביאם (מאזן), עידן (כופלים)')).toEqual(['אביאם', 'עידן']);
    const gvim = parsed17.sections[5];
    expect(gvim.bullets[0].text).toContain('מאזן אנרגיה');     // the scope words stay in the prose
  });

  it('`ו` joins two owners', () => {
    expect(parseOwners('ניתאי ואביאם')).toEqual(['ניתאי', 'אביאם']);
    expect(parseOwners('עידן (סקירה) ואביאם (מונים)')).toEqual(['עידן', 'אביאם']);
  });

  it('a comma-less run of names splits on the whitelist', () => {
    expect(parseOwners('עידן עמיחי ומתניה')).toEqual(['עידן', 'עמיחי', 'מתניה']);
  });

  it('prose around a known name is dropped', () => {
    expect(parseOwners('ניתאי, אביאם בשטח')).toEqual(['ניתאי', 'אביאם']);
  });

  it('an unknown owner is kept verbatim instead of being dropped', () => {
    expect(parseOwners('ויקטוריה')).toEqual(['ויקטוריה']);
    expect(parseOwners('עידן, ויקטוריה')).toEqual(['עידן', 'ויקטוריה']);
  });

  it('no clause → no owners', () => {
    expect(parseOwners('')).toEqual([]);
    expect(parsed17.sections[0].bullets.every(b => b.owners.length === 0)).toBe(true);
  });
});

describe('name resolution', () => {
  it('the alias table is exported and covers the known drifts', () => {
    expect(KIBBUTZ_ALIASES['דגניה א']).toBe('דגניה');
    expect(KIBBUTZ_ALIASES['אור הנר']).toEqual(['אור הנר חשמל', 'אור הנר גז']);
    expect(KIBBUTZ_ALIASES['גת']).toBe('קיבוץ גת');
    expect(KIBBUTZ_ALIASES['ניצנים']).toBe('קיבוץ ניצנים');
    expect(KIBBUTZ_ALIASES['גשר השלום']).toBeUndefined();     // no card → must stay unmatched
  });

  it('resolves via alias, exact name and display_name', () => {
    expect(resolveKibbutzName('דגניה א', KNOWN)).toEqual(['דגניה']);
    expect(resolveKibbutzName('גבים', KNOWN)).toEqual(['גבים']);
    expect(resolveKibbutzName("דגניה ב'", KNOWN)).toEqual(['דגניה ב']);
    expect(resolveKibbutzName('גשר השלום', KNOWN)).toEqual([]);
  });

  it('a display_name never shadows a real card name', () => {
    // 'דגניה א' is דגניה's display_name; 'דגניה ב' is its OWN card.
    expect(resolveKibbutzName('דגניה ב', KNOWN)).toEqual(['דגניה ב']);
  });

  it('an alias pointing at an archived (absent) card falls through to unmatched', () => {
    expect(resolveKibbutzName('ניצנים', [{ name: 'גבים' }])).toEqual([]);
  });

  it('normalizeName collapses whitespace and bidi marks', () => {
    expect(normalizeName('  אור‏  הנר ')).toBe('אור הנר');
    expect(resolveKibbutzName('  גבים  ', KNOWN)).toEqual(['גבים']);
  });

  it('no catalog at all → everything unmatched (never invent a kibbutz)', () => {
    const p = parseMeetingSummary(md17, {});
    expect(p.sections.every(s => s.kibbutzim.length === 0)).toBe(true);
    expect(p.sections[5].unmatched).toEqual(['גבים']);
  });
});

describe('quiet bullets', () => {
  it('matches the four quiet openers and nothing else', () => {
    ['ללא פערים.', 'אין חדש.', 'עדיין לא.', 'ללא משימות.'].forEach(t => expect(isQuiet(t)).toBe(true));
    expect(isQuiet('אין בעיה.')).toBe(false);
    expect(isQuiet('נפתחה משימה.')).toBe(false);
  });
});

describe('rows to save', () => {
  it('a multi-kibbutz section is copied to every kibbutz with seq restarting at 1', () => {
    const rows = rowsFromParsed(
      { meeting_date: '2026-09-17', meeting_kind: 'company', sections: [parsed17.sections[26]] },
      'עידן',
    );
    const per = parsed17.sections[26].bullets.length;
    expect(rows).toHaveLength(per * 4);
    expect(rows.filter(r => r.kibbutz === 'יסעור').map(r => r.seq)).toEqual(parsed17.sections[26].bullets.map(b => b.seq));
    expect(rows[0].created_by).toBe('עידן');
    expect(rows[0].meeting_kind).toBe('company');
  });

  it('unmatched sections contribute no rows, and countRowsToSave agrees with rowsFromParsed', () => {
    const rows = rowsFromParsed(parsed17);
    expect(rows.some(r => r.kibbutz === 'גשר השלום')).toBe(false);
    expect(rows).toHaveLength(countRowsToSave(parsed17));
    expect(rows.length).toBeGreaterThan(100);
  });
});

describe('notesForKibbutz', () => {
  const rows: NoteRow[] = [
    { kibbutz: 'גבים', meeting_date: '2026-08-23', meeting_kind: 'company', seq: 1, text: 'ישן' },
    { kibbutz: 'גבים', meeting_date: '2026-09-17', meeting_kind: 'company', seq: 2, text: 'שני' },
    { kibbutz: 'גבים', meeting_date: '2026-09-17', meeting_kind: 'company', seq: 1, text: 'ראשון' },
    { kibbutz: 'גבים', meeting_date: '2026-09-06', meeting_kind: 'company', seq: 1, text: 'אמצע' },
    { kibbutz: 'דפנה', meeting_date: '2026-09-17', meeting_kind: 'company', seq: 1, text: 'אחר' },
  ];

  it('groups by date+kind, newest first, bullets by seq', () => {
    const g = notesForKibbutz(rows, 'גבים');
    expect(g.map(x => x.meeting_date)).toEqual(['2026-09-17', '2026-09-06', '2026-08-23']);
    expect(g[0].bullets.map(b => b.text)).toEqual(['ראשון', 'שני']);
  });

  it('two kinds on the same date are two groups', () => {
    const g = notesForKibbutz([...rows, { kibbutz: 'גבים', meeting_date: '2026-09-17', meeting_kind: 'dev', seq: 1, text: 'פיתוח' }], 'גבים');
    expect(g.filter(x => x.meeting_date === '2026-09-17')).toHaveLength(2);
  });

  it('a kibbutz with no rows → []', () => {
    expect(notesForKibbutz(rows, 'חוקוק')).toEqual([]);
    expect(notesForKibbutz(null, 'גבים')).toEqual([]);
  });
});

describe('EMS task prefill', () => {
  it('titleFromBullet cuts at the first clause delimiter', () => {
    expect(titleFromBullet('מאזן אנרגיה: אובדן קבוע בראשי, יותר יציאה מכניסה — "לא הגיוני".')).toBe('מאזן אנרגיה');
    expect(titleFromBullet('החלפת מונים גדולים לסאטק — נפתחה משימה.')).toBe('החלפת מונים גדולים לסאטק');
    expect(titleFromBullet('מונה 133 מציג מספרים לא הגיוניים; ככל הנראה לא מוזנים כופלים.'))
      .toBe('מונה 133 מציג מספרים לא הגיוניים');
  });

  it('no delimiter and 90 chars → 69 chars + …', () => {
    const long = 'א'.repeat(90);
    const t = titleFromBullet(long);
    expect(t).toBe('א'.repeat(69) + '…');
    expect(t.length).toBe(70);
  });

  it('a short bullet keeps its whole text, without the trailing period', () => {
    expect(titleFromBullet('ללא פערים.')).toBe('ללא פערים');
  });

  it('descriptionFromBullet appends the מקור line in the meeting kind wording', () => {
    expect(descriptionFromBullet('אובדן קבוע בראשי.', '2026-09-17'))
      .toBe('אובדן קבוע בראשי.\n\nמקור: ישיבת חברה 17.9.26');
    expect(descriptionFromBullet('משהו.', '2026-09-17', 'dev')).toContain('מקור: ישיבת פיתוח 17.9.26');
  });

  it('taskFromBullet builds the whole prefill, assignee = first owner', () => {
    expect(taskFromBullet({
      kibbutz: 'גבים', text: 'מאזן אנרגיה: אובדן קבוע בראשי.', owners: ['אביאם', 'עידן'],
      meeting_date: '2026-09-17', meeting_kind: 'company',
    })).toEqual({
      kibbutz: 'גבים',
      title: 'מאזן אנרגיה',
      description: 'מאזן אנרגיה: אובדן קבוע בראשי.\n\nמקור: ישיבת חברה 17.9.26',
      assigneeName: 'אביאם',
      priority: 'medium',
    });
  });

  it('no owner → no assigneeName key at all (EMS creates the task unassigned)', () => {
    const t = taskFromBullet({ kibbutz: 'גבים', text: 'משהו קרה.', owners: [], meeting_date: '2026-09-17', meeting_kind: 'company' });
    expect('assigneeName' in t).toBe(false);
  });
});

// The import's role gate lives with the island (it has no other logic), but it is a pure
// predicate, so it is tested here with the rest of the meeting-notes surface.
describe('import role gate', () => {
  it('admins only — a viewer is never an importer even if the admin flag says yes', () => {
    expect(canImportNotes(true, false)).toBe(true);
    expect(canImportNotes(false, false)).toBe(false);
    expect(canImportNotes(true, true)).toBe(false);
    expect(canImportNotes(false, true)).toBe(false);
  });
});

describe('import RPC payload', () => {
  it('is exactly what import_meeting_notes(jsonb) expects', () => {
    const parsed = { meeting_date: '2026-09-17', meeting_kind: 'company' as const, sections: [parsed17.sections[5]] };
    const p = importPayload(parsed, 'עידן');
    expect(Object.keys(p).sort()).toEqual(['created_by', 'meeting_date', 'meeting_kind', 'rows']);
    expect(p.created_by).toBe('עידן');
    expect(p.rows).toHaveLength(6);
    // (kibbutz, seq) is the merge key — a row missing either silently does nothing server-side.
    expect(Object.keys(p.rows[0]).sort()).toEqual(['kibbutz', 'owners', 'seq', 'text']);
    expect(p.rows[0]).toEqual({
      kibbutz: 'גבים', seq: 1,
      text: 'מאזן אנרגיה: אובדן קבוע בראשי, יותר יציאה מכניסה — "לא הגיוני".',
      owners: ['אביאם', 'עידן'],
    });
  });

  it('no user → created_by null (not the string "undefined")', () => {
    expect(importPayload({ meeting_date: '2026-09-17', meeting_kind: 'company', sections: [] }).created_by).toBeNull();
  });

  it('a multi-kibbutz section is expanded to one row per card, seq restarting at 1', () => {
    const p = importPayload({ meeting_date: '2026-09-17', meeting_kind: 'company', sections: [parsed17.sections[26]] });
    expect([...new Set(p.rows.map(r => r.kibbutz))]).toEqual(['כפר עזה', 'יסעור', 'כפר מנחם', 'משואות יצחק']);
    const per = parsed17.sections[26].bullets.map(b => b.seq);
    ['כפר עזה', 'יסעור', 'כפר מנחם', 'משואות יצחק'].forEach(k =>
      expect(p.rows.filter(r => r.kibbutz === k).map(r => r.seq)).toEqual(per));
  });

  it('an unmatched section contributes no rows — nothing is written under a name with no card', () => {
    const p = importPayload({ meeting_date: '2026-09-17', meeting_kind: 'company', sections: [parsed17.sections[7]] });
    expect(p.rows).toEqual([]);
  });
});

describe('collapseBullets (§7k #7 — the card shows the latest lines only)', () => {
  const g = (date: string, texts: string[]): MeetingGroup => ({
    meeting_date: date, meeting_kind: 'company',
    bullets: texts.map((t, i) => ({ id: date + i, seq: i, text: t } as NoteRow)),
  });

  it('shows the first N and counts the rest across every meeting', () => {
    const r = collapseBullets([g('2026-09-17', ['a', 'b', 'c']), g('2026-09-10', ['d'])], 2);
    expect(r.shown.map(b => b.text)).toEqual(['a', 'b']);
    expect(r.hidden).toBe(2);
    expect(r.total).toBe(4);
  });

  it('nothing hidden when the card already shows everything — no "עוד 0"', () => {
    const r = collapseBullets([g('2026-09-17', ['a'])], 2);
    expect(r.shown).toHaveLength(1);
    expect(r.hidden).toBe(0);
  });

  it('empty and missing input are safe', () => {
    expect(collapseBullets(undefined, 2)).toEqual({ shown: [], hidden: 0, total: 0 });
    expect(collapseBullets([], 2).hidden).toBe(0);
  });

  it('max 0 hides everything (a caller that wants only the disclosure)', () => {
    const r = collapseBullets([g('2026-09-17', ['a', 'b'])], 0);
    expect(r.shown).toEqual([]);
    expect(r.hidden).toBe(2);
  });
});
