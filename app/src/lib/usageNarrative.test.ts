// Goldens for the weekly usage narrative (spec §7j + adoption §5.4). The sentences are what
// עידן reads on a Sunday morning, so they are pinned CHARACTER BY CHARACTER here — a reword
// is a deliberate change to a golden, never a silent drift.
import { describe, expect, it } from 'vitest';
import {
  digestBody, PAGE_KEYS, usageNarrative, weekTag, ymd, type UsageEvent,
} from './usageNarrative';

const ev = (person: string, action: string, at: string, page?: string, target?: string): UsageEvent =>
  ({ person, action, at, page: page ?? null, target: target ?? null });

// One week, Sun 13.9.2026 → Fri 18.9.2026 (Israel). 13.9.2026 is a Sunday.
const D = (d: number, h = 9) => `2026-09-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00+03:00`;

const PEOPLE = ['אביאם', 'ניתאי', 'עמיחי'];
const PAGES = ['kibbutz', 'inventory', 'mytasks', 'calendar'];

describe('ymd', () => {
  it('buckets on the Israel day, not the runner timezone', () => {
    // 22:30 UTC on the 13th is already the 14th in Israel (+03:00).
    expect(ymd('2026-09-13T22:30:00Z')).toBe('2026-09-14');
    expect(ymd('2026-09-13T20:30:00Z')).toBe('2026-09-13');
  });
});

describe('usageNarrative', () => {
  it('says so plainly when nothing happened', () => {
    expect(usageNarrative([], [], PEOPLE, PAGES)).toEqual(['לא נרשמה שום פעילות באפליקציה השבוע.']);
  });

  it('leads with system health, then behaviour per person', () => {
    const week: UsageEvent[] = [
      // אביאם — 3 days, kibbutz + calendar, 2 visits saved
      ev('אביאם', 'view', D(13), 'kibbutz'),
      ev('אביאם', 'visit-saved', D(13, 10), 'kibbutz', 'גבת'),
      ev('אביאם', 'view', D(14), 'kibbutz'),
      ev('אביאם', 'visit-saved', D(14, 11), 'kibbutz', 'דפנה'),
      ev('אביאם', 'view', D(14, 12), 'calendar'),
      ev('אביאם', 'view', D(15), 'kibbutz'),
      // ניתאי — 1 day, kibbutz only (never opened משימות, which אביאם did not open either)
      ev('ניתאי', 'view', D(15, 8), 'kibbutz'),
      ev('ניתאי', 'cert-issued', D(15, 9), 'kibbutz', '1041'),
      // עמיחי — never showed up
      // system-health signals
      ev('אביאם', 'search-no-results', D(13, 8), 'kibbutz', 'גשר'),
      ev('אביאם', 'search-no-results', D(13, 8), 'kibbutz', 'שלוחות ב'),
      ev('ניתאי', 'search-no-results', D(15, 8), 'kibbutz', 'גשר'),
    ];
    const prevWeek: UsageEvent[] = [
      ev('אביאם', 'visit-saved', D(6), 'kibbutz'),
      ev('אביאם', 'visit-saved', D(7), 'kibbutz'),
      ev('אביאם', 'visit-saved', D(8), 'kibbutz'),
    ];

    expect(usageNarrative(week, prevWeek, PEOPLE, PAGES)).toEqual([
      'דפים ללא שימוש השבוע: מלאי, משימות.',
      'החיפוש בקיבוצים נכשל 3 פעמים (לא נמצאו: "גשר", "שלוחות ב").',
      'אביאם נכנס 3 ימים מתוך 3; סיכום ביקור נשמר אצלו 2 פעמים (שבוע שעבר 3).',
      'ניתאי נכנס יום אחד מתוך 3; תעודת משלוח הופקה אצלו פעם אחת (שבוע שעבר 0).',
      'ניתאי לא השתמש בעמוד יומן כלל השבוע.',
      'עמיחי לא נכנס לאפליקציה כלל השבוע.',
    ]);
  });

  it('names a single dead page in the singular and omits the last-week compare with no history', () => {
    const week: UsageEvent[] = [
      ev('אביאם', 'view', D(13), 'kibbutz'),
      ev('אביאם', 'view', D(13, 10), 'inventory'),
      ev('אביאם', 'view', D(13, 11), 'calendar'),
      ev('אביאם', 'stock-report', D(13, 12), 'inventory', 'מסנן'),
    ];
    expect(usageNarrative(week, [], ['אביאם'], PAGES)).toEqual([
      'עמוד משימות לא נפתח על ידי אף אחד השבוע.',
      'אביאם נכנס יום אחד מתוך 1; דיווח מלאי אצלו פעם אחת.',
    ]);
  });

  it('reports repeated abandoned sheets, and never a one-off', () => {
    const base = PAGE_KEYS.map(p => ev('אביאם', 'view', D(13), p));
    const once = usageNarrative([...base, ev('אביאם', 'sheet-dismissed', D(13, 10), 'kibbutz', 'kibbutz-sheet')], [], ['אביאם']);
    expect(once.some(s => s.includes('בלי שמירה'))).toBe(false);

    const twice = usageNarrative([
      ...base,
      ev('אביאם', 'sheet-dismissed', D(13, 10), 'kibbutz', 'kibbutz-sheet'),
      ev('אביאם', 'sheet-dismissed', D(13, 11), 'kibbutz', 'kibbutz-sheet'),
    ], [], ['אביאם']);
    expect(twice[0]).toBe('טופס נפתח ונסגר בלי שמירה 2 פעמים.');
  });

  it('never ranks people and never uses a failure adverb (adoption §5.4)', () => {
    const week: UsageEvent[] = [
      ev('אביאם', 'view', D(13), 'kibbutz'), ev('אביאם', 'visit-saved', D(13, 10), 'kibbutz'),
      ev('ניתאי', 'view', D(14), 'kibbutz'),
    ];
    const lines = usageNarrative(week, week, PEOPLE, PAGES).join(' ');
    for (const banned of ['הכי', 'שוב לא', 'עדיין לא', 'יותר מ', 'פחות מ', 'לעומת']) {
      expect(lines).not.toContain(banned);
    }
  });

  it('writes a single day as "יום אחד", never "1 ימים"', () => {
    const week = [ev('מתניה', 'view', D(13), 'kibbutz')];
    expect(usageNarrative(week, [], ['מתניה'], ['kibbutz'])[0]).toBe('מתניה נכנס יום אחד מתוך 1.');
  });

  it('excludes Saturday from the "out of N days" denominator', () => {
    // 19.9.2026 is a Saturday; it must not inflate the denominator.
    const week: UsageEvent[] = [
      ev('אביאם', 'view', D(17), 'kibbutz'),
      ev('אביאם', 'view', D(18), 'kibbutz'),
      ev('ניתאי', 'view', D(19), 'kibbutz'),
    ];
    const lines = usageNarrative(week, [], ['אביאם'], ['kibbutz']);
    expect(lines[0]).toBe('אביאם נכנס 2 ימים מתוך 2.');
  });
});

describe('digestBody', () => {
  it('is the first three sentences plus the pointer to the page', () => {
    expect(digestBody(['א.', 'ב.', 'ג.', 'ד.'])).toBe('א. ב. ג. עוד ב-📈 שימוש');
    expect(digestBody([])).toBe('עוד ב-📈 שימוש');
  });
});

describe('weekTag', () => {
  it('is one stable tag per ISO week (the push_log idempotency key)', () => {
    expect(weekTag('2026-09-13T08:00:00+03:00')).toBe('usage-2026-w37');
    expect(weekTag('2026-09-14T08:00:00+03:00')).toBe('usage-2026-w38');
    expect(weekTag('2026-09-20T08:00:00+03:00')).toBe('usage-2026-w38');
    expect(weekTag('2026-01-01T08:00:00+02:00')).toBe('usage-2026-w01');
  });
});
