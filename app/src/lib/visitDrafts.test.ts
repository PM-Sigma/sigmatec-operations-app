// Visit drafts, the pure half (spec §5.1c). `draftState` is what decides whether a card shows
// "סיכום ביקור בהתהוות", whether the gaps list calls a kibbutz missed or merely started, and
// which words the 2 h nudge uses — so every branch is pinned.
import { describe, expect, it } from 'vitest';
import { draftState, draftTimeLabel, todayISO, type VisitDraft } from '@/lib/visitDrafts';

const draft = (over: Partial<VisitDraft> = {}): VisitDraft => ({
  id: 'v_1', person: 'אביאם', kibbutz: 'גבים', date: '2026-09-18',
  updated_at: '2026-09-18T14:02:00', ...over,
});

const TODAY = '2026-09-18';

describe('draftState', () => {
  it('nothing typed and nothing filed → none', () => {
    expect(draftState('גבים', 'אביאם', TODAY, [], [])).toBe('none');
    expect(draftState('גבים', 'אביאם', TODAY, null, null)).toBe('none');
  });

  it('a draft for this person, this kibbutz, today → draft', () => {
    expect(draftState('גבים', 'אביאם', TODAY, [draft()])).toBe('draft');
  });

  it('a filed visit wins over a leftover draft — nothing left to chase', () => {
    const filed = [{ kibbutz: 'גבים', visitor: 'אביאם', date: '2026-09-18T12:00:00Z' }];
    expect(draftState('גבים', 'אביאם', TODAY, [draft()], filed)).toBe('filed');
  });

  it('someone else\'s draft is not mine', () => {
    expect(draftState('גבים', 'אביאם', TODAY, [draft({ person: 'ניתאי' })])).toBe('none');
  });

  it('another kibbutz\'s draft does not mark this card', () => {
    expect(draftState('גבים', 'אביאם', TODAY, [draft({ kibbutz: 'גבת' })])).toBe('none');
  });

  it('yesterday\'s draft is not today\'s work', () => {
    expect(draftState('גבים', 'אביאם', TODAY, [draft({ date: '2026-09-17' })])).toBe('none');
  });

  it('a filed visit for someone else does not clear MY draft', () => {
    const filed = [{ kibbutz: 'גבים', visitor: 'ניתאי', date: TODAY }];
    expect(draftState('גבים', 'אביאם', TODAY, [draft()], filed)).toBe('draft');
  });

  it('a filed visit carrying a full timestamp still matches the day', () => {
    const filed = [{ kibbutz: 'גבים', visitor: 'אביאם', date: '2026-09-18T23:59:59.999Z' }];
    expect(draftState('גבים', 'אביאם', TODAY, [], filed)).toBe('filed');
  });

  it('malformed rows are ignored, not thrown on', () => {
    expect(draftState('גבים', 'אביאם', TODAY, [null as any, draft({ date: undefined as any })])).toBe('none');
  });
});

describe('draftTimeLabel', () => {
  it('is the HH:MM the prompt shows', () => {
    expect(draftTimeLabel('2026-09-18T14:02:00')).toBe('14:02');
    expect(draftTimeLabel('2026-09-18T09:07:00')).toBe('09:07');
  });
  it('an absent or unparsable stamp shows no time rather than "Invalid Date"', () => {
    expect(draftTimeLabel(null)).toBe('');
    expect(draftTimeLabel('nope')).toBe('');
  });
});

describe('todayISO', () => {
  it('is the LOCAL calendar day (a draft belongs to the day the person worked)', () => {
    expect(todayISO(new Date(2026, 8, 18, 23, 30))).toBe('2026-09-18');
    expect(todayISO(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05');
  });
});
