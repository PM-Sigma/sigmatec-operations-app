import { describe, expect, it } from 'vitest';
import {
  backlogAge, buildLifecycleStats, canSeeEmsStats, closedPerMonth, formatDuration, jerusalemDay, median,
  onTimeClose, openedPerKibbutzMonth, timeToAssign, type StateRow,
} from './emsLifecycle';

const row = (o: Partial<StateRow> & { task_id: string }): StateRow => ({
  site_name: 'דפנה', status: 'new', due_date: null, opened_at: null, closed_at: null, closed_src: null,
  assigned_at: null, assigned_src: 'pending', gone_at: null, ...o,
});
const NOW = Date.parse('2026-09-29T12:00:00Z');

describe('median', () => {
  it('odd, even, empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('time to assign', () => {
  it('uses only observed (derived) assignments with both stamps; clamps skew at 0', () => {
    const rows = [
      row({ task_id: 'a', opened_at: '2026-09-01T08:00:00Z', assigned_at: '2026-09-01T10:00:00Z', assigned_src: 'derived' }),   // 2h
      row({ task_id: 'b', opened_at: '2026-09-01T08:00:00Z', assigned_at: '2026-09-01T14:00:00Z', assigned_src: 'derived' }),   // 6h
      row({ task_id: 'c', opened_at: '2026-09-01T08:00:00Z', assigned_at: '2026-09-01T07:59:00Z', assigned_src: 'derived' }),   // -1m -> 0
      row({ task_id: 'd', opened_at: '2026-08-01T08:00:00Z', assigned_at: null, assigned_src: 'unknown' }),                     // excluded
      row({ task_id: 'e', opened_at: '2026-08-01T08:00:00Z', assigned_at: null, assigned_src: 'pending' }),                     // excluded
      row({ task_id: 'f', opened_at: null, assigned_at: '2026-09-01T07:59:00Z', assigned_src: 'derived' }),                     // excluded
    ];
    const t = timeToAssign(rows);
    expect(t.n).toBe(3);
    expect(t.medianHours).toBe(2);
    expect(t.avgHours).toBeCloseTo(8 / 3, 5);
  });
  it('empty -> nulls', () => {
    expect(timeToAssign([])).toEqual({ n: 0, medianHours: null, avgHours: null });
  });
});

describe('on-time close', () => {
  it('counts done + cancelled with a due date; compares Israel calendar days', () => {
    const rows = [
      row({ task_id: 'a', status: 'done', due_date: '2026-09-10', closed_at: '2026-09-10T20:30:00Z' }),  // 23:30 IL on the 10th: on time
      row({ task_id: 'b', status: 'done', due_date: '2026-09-10', closed_at: '2026-09-10T21:30:00Z' }),  // 00:30 IL on the 11th: late
      row({ task_id: 'c', status: 'cancelled', due_date: '2026-09-10', closed_at: '2026-09-01T00:00:00Z' }), // on time
      row({ task_id: 'd', status: 'rejected', due_date: '2026-09-10', closed_at: '2026-09-01T00:00:00Z' }), // not counted
      row({ task_id: 'e', status: 'done', due_date: null, closed_at: '2026-09-01T00:00:00Z' }),          // no due: not counted
      row({ task_id: 'f', status: 'new', due_date: '2026-09-10' }),                                       // open: not counted
    ];
    expect(onTimeClose(rows)).toEqual({ n: 3, onTime: 2, pct: 66.7 });
  });
  it('no data -> null pct', () => { expect(onTimeClose([]).pct).toBeNull(); });
  it('jerusalemDay crosses midnight correctly', () => {
    expect(jerusalemDay('2026-01-10T22:30:00Z')).toBe('2026-01-11');   // winter +2
    expect(jerusalemDay('2026-07-10T20:30:00Z')).toBe('2026-07-10');   // summer +3
    expect(jerusalemDay('2026-07-10T21:30:00Z')).toBe('2026-07-11');
  });
});

describe('opened / closed per month', () => {
  const rows = [
    row({ task_id: 'a', site_name: 'דפנה', opened_at: '2026-09-02T08:00:00Z' }),
    row({ task_id: 'b', site_name: 'דפנה', opened_at: '2026-09-20T08:00:00Z' }),
    row({ task_id: 'c', site_name: 'חוקוק', opened_at: '2026-09-21T08:00:00Z' }),
    row({ task_id: 'd', site_name: 'דפנה', opened_at: '2026-08-31T21:30:00Z' }),   // 1 Sept 00:30 Israel time
    row({ task_id: 'e', site_name: null, opened_at: '2026-08-05T08:00:00Z' }),
    row({ task_id: 'f', site_name: 'דפנה', opened_at: null }),                     // not counted: never use first_seen
  ];
  it('groups by site and Israel month, newest first', () => {
    expect(openedPerKibbutzMonth(rows)).toEqual([
      { site: 'דפנה', month: '2026-09', count: 3 },
      { site: 'חוקוק', month: '2026-09', count: 1 },
      { site: 'ללא אתר', month: '2026-08', count: 1 },
    ]);
  });
  it('closed per month by closed_at', () => {
    const c = closedPerMonth([
      row({ task_id: 'a', closed_at: '2026-09-02T08:00:00Z' }), row({ task_id: 'b', closed_at: '2026-09-03T08:00:00Z', closed_src: 'disappeared' }),
      row({ task_id: 'c', closed_at: '2026-08-03T08:00:00Z' }), row({ task_id: 'd' }),
    ]);
    expect(c).toEqual([{ month: '2026-09', count: 2 }, { month: '2026-08', count: 1 }]);
  });
});

describe('backlog age', () => {
  it('buckets open tasks, skips closed/gone, counts unknown age separately', () => {
    const d = (days: number) => new Date(NOW - days * 86400_000).toISOString();
    const rows = [
      row({ task_id: 'a', opened_at: d(0) }), row({ task_id: 'b', opened_at: d(7) }), row({ task_id: 'c', opened_at: d(8) }),
      row({ task_id: 'd', opened_at: d(30) }), row({ task_id: 'e', opened_at: d(31) }), row({ task_id: 'f', opened_at: d(90) }),
      row({ task_id: 'g', opened_at: d(91) }), row({ task_id: 'h', opened_at: null }),
      row({ task_id: 'i', status: 'done', opened_at: d(400), closed_at: d(1) }),
      row({ task_id: 'j', opened_at: d(400), gone_at: d(1), closed_at: d(1), closed_src: 'disappeared' }),
    ];
    const b = backlogAge(rows, NOW);
    expect(b.open).toBe(8);
    expect(b.unknownAge).toBe(1);
    expect(b.buckets.map(x => x.count)).toEqual([2, 2, 2, 1]);
    expect(b.medianDays).toBe(30);
  });
});

describe('helpers', () => {
  it('formatDuration follows size', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0.5)).toBe('30 דק׳');
    expect(formatDuration(3.46)).toBe('3.5 שע׳');
    expect(formatDuration(72)).toBe('3 ימים');
  });
  it('audience: עידן and עמיחי only, never the viewer', () => {
    expect(canSeeEmsStats('עידן', false)).toBe(true);
    expect(canSeeEmsStats('עמיחי', false)).toBe(true);
    expect(canSeeEmsStats('עידן', true)).toBe(false);
    for (const n of ['אביאם', 'ניתאי', 'מתניה', 'אליה', 'אבצן', '']) expect(canSeeEmsStats(n, false)).toBe(false);
  });
});

describe('real-size fixture', () => {
  it('handles 5000 rows quickly with consistent totals', () => {
    const sites = ['דפנה', 'חוקוק', 'כפר עזה', 'אור הנר', null];
    const rows: StateRow[] = [];
    for (let i = 0; i < 5000; i++) {
      const opened = new Date(NOW - (i % 400) * 86400_000).toISOString();
      const closed = i % 3 === 0;
      rows.push(row({
        task_id: 't' + i, site_name: sites[i % 5], status: closed ? (i % 2 ? 'done' : 'cancelled') : 'new',
        due_date: i % 4 === 0 ? '2026-09-15' : null, opened_at: opened,
        closed_at: closed ? new Date(NOW - (i % 30) * 86400_000).toISOString() : null,
        assigned_src: i % 5 === 0 ? 'derived' : 'unknown',
        assigned_at: i % 5 === 0 ? new Date(Date.parse(opened) + 3600_000).toISOString() : null,
      }));
    }
    const t0 = Date.now();
    const s = buildLifecycleStats(rows, NOW);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(s.total).toBe(5000);
    expect(s.backlog.open + s.closed.reduce((a, c) => a + c.count, 0)).toBe(5000);
    expect(s.opened.reduce((a, c) => a + c.count, 0)).toBe(5000);
    expect(s.timeToAssign.n).toBe(1000);
    expect(s.timeToAssign.medianHours).toBe(1);
  });
});
