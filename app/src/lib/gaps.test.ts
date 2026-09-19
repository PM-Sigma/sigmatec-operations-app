// 📋 הפערים שלי — the goldens (spec §7h: "fixture week with two check-ins, one with a visit
// and one without, one overdue task, one holiday → exactly two gaps, in date order").
import { describe, expect, it } from 'vitest';
import {
  defaultRange, gapCounts, gapsFor, gapsSummary, isAssignedTo, NUDGE_MIN_AGE_DAYS,
  nudgeable, shiftDays, type GapSources,
} from '@/lib/gaps';
import { GAP_NUDGES, gapNudgeFor } from '@/lib/field';
import type { AttRow, Holiday } from '@/lib/attendance';

// ── the §7h fixture week ────────────────────────────────────────────────────────────────
// Sunday 2026-09-06 … Thursday 2026-09-10, "today" = Friday 2026-09-11.
// Two check-ins (Sun גבים with a visit, Mon יטבתה without), one overdue EMS task (due Tue),
// one holiday (Wed, required=false). Attendance is complete EXCEPT the holiday — which must
// not produce a gap, which is what the holiday is in the fixture for.
const TODAY = '2026-09-11';

const holidays: Holiday[] = [
  { date: '2026-09-09', name: 'חג הבדיקה', kind: 'holiday', required: false },
];

const attendance: AttRow[] = [
  { date: '2026-09-06', type: 'field' },
  { date: '2026-09-07', type: 'field' },
  { date: '2026-09-08', type: 'office' },
  // 09-09 is the holiday — deliberately absent
  { date: '2026-09-10', type: 'office' },
  // the first of the month, up to the window's start, filled so the fixture isolates the week
  { date: '2026-09-01', type: 'office' }, { date: '2026-09-02', type: 'office' },
  { date: '2026-09-03', type: 'office' },
];

const fixture: GapSources = {
  checkins: [
    { person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-09-06T08:10:00Z' },
    { person: 'אביאם', kibbutz: 'יטבתה', checked_in_at: '2026-09-07T09:00:00Z' },
  ],
  visits: [
    { visitor: 'אביאם', kibbutz: 'גבים', date: '2026-09-06' },
  ],
  tasks: [
    {
      id: 'T1', title: 'החלפת מונה', status: 'open', expectedCompletionDate: '2026-09-08',
      site: { name: 'גבים' }, assignee: { firstName: 'אביאם', lastName: 'כהן' },
    },
  ],
  attendance,
  holidays,
};

const range = { from: '2026-09-04', today: TODAY };

describe('gapsFor — the §7h fixture week', () => {
  const gaps = gapsFor('אביאם', fixture, range);

  it('produces exactly two gaps', () => {
    expect(gaps).toHaveLength(2);
  });

  it('is in date order, oldest first', () => {
    expect(gaps.map(g => g.date)).toEqual(['2026-09-07', '2026-09-08']);
  });

  it('names the check-in without a summary, and not the one with', () => {
    expect(gaps[0].kind).toBe('visit');
    expect(gaps[0].kibbutz).toBe('יטבתה');
    expect(gaps[0].text).toBe('היית ביטבתה ב-7.9 ואין סיכום ביקור');
    expect(gaps.some(g => g.kibbutz === 'גבים' && g.kind === 'visit')).toBe(false);
  });

  it('names the overdue task', () => {
    expect(gaps[1].kind).toBe('task');
    expect(gaps[1].taskId).toBe('T1');
    expect(gaps[1].text).toContain('תאריך היעד עבר');
  });

  it('never counts the holiday as a missing day', () => {
    expect(gaps.some(g => g.kind === 'attendance')).toBe(false);
  });

  it('gives every gap a stable id and exactly one action', () => {
    expect(new Set(gaps.map(g => g.id)).size).toBe(gaps.length);
    expect(gapsFor('אביאם', fixture, range).map(g => g.id)).toEqual(gaps.map(g => g.id));
    for (const g of gaps) expect(g.actionLabel).toBeTruthy();
  });

  it('counts by kind', () => {
    expect(gapCounts(gaps)).toEqual({ total: 2, visit: 1, attendance: 0, task: 1 });
  });
});

// Every small fixture below carries a FULL attendance month: the attendance rule is already
// pinned by its own case, and without rows every past weekday is missing, which would drown
// the one rule each of these is about.
const FULL: AttRow[] = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`, type: 'office' as const,
}));

describe('gapsFor — the rules one at a time', () => {
  it('a missing work day IS a gap when it is not a holiday', () => {
    const src: GapSources = { ...fixture, holidays: [] };
    const gaps = gapsFor('אביאם', src, range);
    const att = gaps.filter(g => g.kind === 'attendance');
    expect(att.map(g => g.date)).toEqual(['2026-09-09']);
    expect(att[0].text).toBe('אין נוכחות ל-9.9');
  });

  it('today is never a gap — the day is not over', () => {
    const src: GapSources = { attendance: FULL,
      checkins: [{ person: 'אביאם', kibbutz: 'גבים', checked_in_at: TODAY + 'T08:00:00Z' }],
    };
    expect(gapsFor('אביאם', src, range)).toHaveLength(0);
  });

  it('a dismissed check-in is taken at its word', () => {
    const src: GapSources = { attendance: FULL,
      checkins: [{ person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-09-07T08:00:00Z', dismissed: true }],
    };
    expect(gapsFor('אביאם', src, range)).toHaveLength(0);
  });

  it('a planned stop with no summary is a gap too', () => {
    const src: GapSources = { attendance: FULL, dayPlans: [{ person: 'אביאם', date: '2026-09-07', kibbutz: 'רביבים' }] };
    expect(gapsFor('אביאם', src, range).map(g => g.kibbutz)).toEqual(['רביבים']);
  });

  it('a check-in, a stop and a due task at the same place and day are ONE gap', () => {
    const src: GapSources = { attendance: FULL,
      checkins: [{ person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-09-07T08:00:00Z' }],
      dayPlans: [{ person: 'אביאם', date: '2026-09-07', kibbutz: 'גבים' }],
      tasks: [{
        id: 'T9', title: 'x', status: 'done', expectedCompletionDate: '2026-09-07',
        site: { name: 'גבים' }, assignee: { firstName: 'אביאם' },
      }],
    };
    expect(gapsFor('אביאם', src, range).filter(g => g.kind === 'visit')).toHaveLength(1);
  });

  it('a closed task is never overdue', () => {
    const src: GapSources = { attendance: FULL,
      visits: [{ visitor: 'אביאם', kibbutz: 'גבים', date: '2026-09-08' }],
      tasks: [{
        id: 'T2', title: 'x', status: 'done', expectedCompletionDate: '2026-09-08',
        site: { name: 'גבים' }, assignee: { firstName: 'אביאם' },
      }],
    };
    expect(gapsFor('אביאם', src, range).filter(g => g.kind === 'task')).toHaveLength(0);
  });

  it('another person’s data is never his gap', () => {
    expect(gapsFor('ניתאי', fixture, range)).toHaveLength(0);
  });

  it('nothing older than the window', () => {
    const src: GapSources = { attendance: FULL,
      checkins: [{ person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-06-01T08:00:00Z' }],
    };
    expect(gapsFor('אביאם', src, range)).toHaveLength(0);
  });

  it('no person, no gaps', () => {
    expect(gapsFor('', fixture, range)).toEqual([]);
  });

  it('survives empty / missing sources — no throw, and nothing invented', () => {
    // With no attendance rows at all every past work day IS missing, which is the honest
    // answer; what must not happen is a visit or task gap out of thin air.
    for (const src of [{}, { checkins: null, visits: null, tasks: null } as GapSources]) {
      expect(gapsFor('אביאם', src, range).every(g => g.kind === 'attendance')).toBe(true);
    }
    expect(gapsFor('אביאם', { attendance: FULL }, range)).toEqual([]);
  });
});

describe('isAssignedTo', () => {
  const t = (first?: string, last?: string) => ({ id: 'x', assignee: first ? { firstName: first, lastName: last } : null });
  it('matches the EMS full name against the app first name', () => {
    expect(isAssignedTo(t('אביאם', 'כהן'), 'אביאם')).toBe(true);
    expect(isAssignedTo(t('אביאם'), 'אביאם')).toBe(true);
    expect(isAssignedTo(t('ניתאי', 'לוי'), 'אביאם')).toBe(false);
  });
  it('an unassigned task belongs to nobody', () => {
    expect(isAssignedTo(t(), 'אביאם')).toBe(false);
    expect(isAssignedTo(t('אביאם'), '')).toBe(false);
  });
});

describe('the window and the nudge guard', () => {
  it('shiftDays crosses months and years in UTC', () => {
    expect(shiftDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDays('2026-09-11', -21)).toBe('2026-08-21');
  });

  it('defaultRange is the last three weeks', () => {
    expect(defaultRange(TODAY)).toEqual({ from: '2026-08-21', today: TODAY });
  });

  it('a gap is only nudgeable once it has sat for two days', () => {
    const gaps = gapsFor('אביאם', fixture, range);
    expect(NUDGE_MIN_AGE_DAYS).toBe(2);
    expect(nudgeable(gaps, '2026-09-09').map(g => g.date)).toEqual(['2026-09-07']);
    expect(nudgeable(gaps, '2026-09-08')).toEqual([]);
  });
});

describe('the copy (§7h rules)', () => {
  const gaps = gapsFor('אביאם', { ...fixture, holidays: [] }, range);
  const lines = [...gaps.map(g => g.text), gapsSummary(gaps), gapsSummary([]), gapsSummary(gaps.slice(0, 1))];

  it('never explains the app’s own mechanics', () => {
    for (const s of lines) {
      expect(s).not.toMatch(/Supabase|RLS|API|פונקציה|בדיקה אוטומטית|מחושב|מקושר ל-/);
    }
  });

  it('never tells the person who else sees his data', () => {
    for (const s of lines) expect(s).not.toMatch(/(עמיחי|עידן)[^.]{0,12}(ראה|רואה|יראה)/);
  });

  it('speaks to him about his own next step', () => {
    expect(gapsSummary([])).toContain('הכל סגור');
    expect(gapsSummary(gaps.slice(0, 1))).toBe('נשאר פריט אחד לסגור');
  });
});

describe('gapNudgeFor — the push words (adoption §3.5 rows 4–6)', () => {
  it('is the report’s three sentences, unchanged', () => {
    expect(GAP_NUDGES.map(n => n.t)).toEqual([
      'כמה דברים קטנים מחכים לך', 'הרשימה שלך כמעט נקייה', 'סדר עושה שקט',
    ]);
  });

  it('is deterministic — a retry is not a new message', () => {
    expect(gapNudgeFor('אביאם|2026-09-11', 3)).toEqual(gapNudgeFor('אביאם|2026-09-11', 3));
  });

  it('substitutes the count and never writes "1 פריטים"', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(gapNudgeFor(key, 1).body).not.toMatch(/\bנשארו 1\b/);
      expect(gapNudgeFor(key, 4).body).not.toContain('{n}');
    }
    // the plural line, when it is the one picked, carries the real number
    const plural = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(k => gapNudgeFor(k, 4).body)
      .find(b => b.includes('נשארו'));
    expect(plural).toContain('נשארו 4 פריטים');
  });

  it('is titled as the gaps list, never as a kibbutz', () => {
    const n = gapNudgeFor('x', 2);
    expect(n.title.startsWith('📋 ')).toBe(true);
    expect(n.body).not.toContain('{kibbutz}');
  });
});
