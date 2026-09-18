// Goldens for the 📈 שימוש aggregation (spec §7j): heat table, top actions, zero-use pages,
// last seen, the time-to-first-action median, and the 30-day bar-chart series.
import { describe, expect, it } from 'vitest';
import {
  aggregate, heatBucket, lastSeenLabel, median, mmss, timeToFirstAction, type UsageEvent,
} from './usage';

const NOW = '2026-09-18T12:00:00+03:00';
const at = (d: number, h = 9, mi = 0) =>
  `2026-09-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00+03:00`;

const ev = (
  person: string, action: string, when: string,
  page?: string | null, target?: string | null, session_id?: string,
): UsageEvent => ({ person, action, at: when, page: page ?? null, target: target ?? null, session_id: session_id ?? null });

const PAGES = ['kibbutz', 'inventory', 'mytasks'];
const PEOPLE = ['אביאם', 'ניתאי', 'עמיחי'];

const WEEK: UsageEvent[] = [
  ev('אביאם', 'view', at(18, 8), 'kibbutz', null, 's1'),
  ev('אביאם', 'view', at(18, 8, 30), 'kibbutz', null, 's1'),
  ev('אביאם', 'visit-saved', at(18, 8, 32), 'kibbutz', 'גבת', 's1'),
  ev('אביאם', 'view', at(17, 9), 'inventory', null, 's0'),
  ev('ניתאי', 'view', at(16, 9), 'kibbutz', null, 's2'),
  ev('ניתאי', 'visit-saved', at(16, 9, 4), 'kibbutz', 'דפנה', 's2'),
  ev('ניתאי', 'cert-issued', at(16, 9, 6), 'kibbutz', '1041', 's2'),
  // outside the 30-day window — must be ignored everywhere
  ev('עמיחי', 'view', '2026-07-01T09:00:00+03:00', 'mytasks', null, 'sOld'),
];

describe('aggregate', () => {
  const r = aggregate(WEEK, { now: NOW, people: PEOPLE, pages: PAGES });

  it('counts page views per person × page and keeps a silent person on the table', () => {
    expect(r.heat.map(h => [h.person, h.cells.kibbutz, h.cells.inventory, h.cells.mytasks, h.total])).toEqual([
      ['אביאם', 2, 1, 0, 3],
      ['ניתאי', 1, 0, 0, 1],
      ['עמיחי', 0, 0, 0, 0],
    ]);
    expect(r.maxCell).toBe(2);
  });

  it('ranks primary actions over the 7-day window, count desc', () => {
    expect(r.topActions).toEqual([
      { action: 'visit-saved', label: 'סיכום ביקור נשמר', count: 2 },
      { action: 'cert-issued', label: 'תעודת משלוח הופקה', count: 1 },
    ]);
  });

  it('lists the pages nobody opened', () => {
    expect(r.zeroPages).toEqual(['mytasks']);
  });

  it('reports last seen per person, and null for a person with nothing in the window', () => {
    expect(r.lastSeen['אביאם']).toBe(at(18, 8, 32));
    expect(r.lastSeen['ניתאי']).toBe(at(16, 9, 6));
    expect(r.lastSeen['עמיחי']).toBeNull();
  });

  it('zero-fills the 30-day series, ascending, ending today', () => {
    expect(r.perDay).toHaveLength(30);
    expect(r.perDay[29]).toEqual({ date: '2026-09-18', count: 3 });
    expect(r.perDay[28]).toEqual({ date: '2026-09-17', count: 1 });
    expect(r.perDay[0].date).toBe('2026-08-20');
    expect(r.perDay[0].count).toBe(0);
  });

  it('summarises the KPI strip', () => {
    expect(r.kpi).toEqual({
      actionsWeek: 3, activePeople: 2, people: 3, zeroPages: 1, medianSeconds: 1080,
    });
  });

  it('appends a person who only exists in the data', () => {
    const r2 = aggregate([...WEEK, ev('אליה', 'view', at(18), 'kibbutz')], { now: NOW, people: PEOPLE, pages: PAGES });
    expect(r2.people).toEqual([...PEOPLE, 'אליה']);
  });
});

describe('timeToFirstAction', () => {
  it('falls back to opening קיבוצים when no check-ins exist, per session', () => {
    // s1: 08:00 → 08:32 = 1920 s · s2: 09:00 → 09:04 = 240 s → median of two = 1080
    expect(timeToFirstAction(WEEK)).toBe(1080);
  });

  it('prefers check-ins the moment the app has them', () => {
    const rows = [
      ev('אביאם', 'view', at(18, 8), 'kibbutz', null, 's1'),
      ev('אביאם', 'checkin', at(18, 8, 30), 'kibbutz', 'גבת', 's1'),
      ev('אביאם', 'visit-saved', at(18, 8, 32), 'kibbutz', 'גבת', 's1'),
    ];
    expect(timeToFirstAction(rows)).toBe(120);
  });

  it('ignores a session with no primary action at all', () => {
    const rows = [ev('אביאם', 'view', at(18, 8), 'kibbutz', null, 's9')];
    expect(timeToFirstAction(rows)).toBeNull();
  });

  it('groups by person+day when the session id is missing', () => {
    const rows = [
      ev('אביאם', 'view', at(18, 8), 'kibbutz'),
      ev('אביאם', 'visit-saved', at(18, 8, 1), 'kibbutz'),
      ev('ניתאי', 'view', at(18, 8), 'kibbutz'),
      ev('ניתאי', 'visit-saved', at(18, 8, 5), 'kibbutz'),
    ];
    expect(timeToFirstAction(rows)).toBe(180);   // median of 60 and 300
  });
});

describe('formatting helpers', () => {
  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(3);   // rounded mean of the middle pair
  });

  it('mmss', () => {
    expect(mmss(null)).toBe('—');
    expect(mmss(100)).toBe('1:40');
    expect(mmss(1920)).toBe('32:00');
  });

  it('heatBucket scales against the busiest cell, tokens decided by the caller', () => {
    expect(heatBucket(0, 30)).toBe(0);
    expect(heatBucket(5, 0)).toBe(0);
    expect(heatBucket(4, 30)).toBe(1);
    expect(heatBucket(12, 30)).toBe(2);
    expect(heatBucket(30, 30)).toBe(3);
  });

  it('lastSeenLabel', () => {
    expect(lastSeenLabel(null, NOW)).toBe('לא נראה');
    expect(lastSeenLabel(at(18, 14, 2), NOW)).toBe('היום 14:02');
    expect(lastSeenLabel(at(17, 13, 40), NOW)).toBe('אתמול 13:40');
    expect(lastSeenLabel(at(15, 9), NOW)).toBe('15.9');
  });
});
