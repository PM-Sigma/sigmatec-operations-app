import { describe, expect, it } from 'vitest';
import { PAGE_META, bellLabel, pageMeta } from '@/lib/shell';

describe('page meta', () => {
  it('covers every SigmaPage', () => {
    expect(Object.keys(PAGE_META).sort()).toEqual(
      ['attendance', 'burns', 'calendar', 'dev', 'hours', 'inventory', 'kibbutz', 'pushlog']);
  });
  it('nav peers are level 1, reached-from-a-menu pages are level 2', () => {
    for (const p of ['kibbutz', 'calendar', 'attendance', 'inventory'] as const) expect(pageMeta(p).level).toBe(1);
    for (const p of ['burns', 'pushlog', 'dev', 'hours'] as const) expect(pageMeta(p).level).toBe(2);
  });
  it('burns carries the full sentence on two lines (עידן, 23.9)', () => {
    expect(pageMeta('burns')).toEqual({
      title: 'צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק', level: 2, titleLines: 2,
    });
  });
  it('titles have no emoji', () => {
    for (const m of Object.values(PAGE_META)) expect(m.title).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('bell label', () => {
    expect(bellLabel(0)).toBe('התראות');
    expect(bellLabel(1)).toBe('התראות, 1 חדשה');
    expect(bellLabel(12)).toBe('התראות, 12 חדשות');
  });
});
