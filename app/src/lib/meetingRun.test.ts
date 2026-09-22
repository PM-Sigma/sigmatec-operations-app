// Goldens for the pure "since the previous meeting" split (Package H item 5). The rest of
// useMeetingRun is a React hook wired to Supabase and is exercised by the Playwright specs;
// this file covers only the pure function so the rule is checked without a DOM or network.
import { describe, it, expect } from 'vitest';
import { sinceLastMeeting, type SinceLastTask } from './meetingRun';

const t = (id: string, openedAt: string, closedAt?: string | null): SinceLastTask => ({
  id, title: `task ${id}`, openedAt, closedAt: closedAt ?? null,
});

describe('sinceLastMeeting', () => {
  it('no previous meeting: nothing to report', () => {
    const tasks = [t('1', '2026-09-01T10:00:00Z')];
    expect(sinceLastMeeting(tasks, null)).toEqual({ openedSince: [], closedSince: [] });
    expect(sinceLastMeeting(tasks, undefined)).toEqual({ openedSince: [], closedSince: [] });
  });

  it('splits opened-and-still-open from opened-and-since-closed', () => {
    const tasks = [
      t('open-after', '2026-09-10T09:00:00Z'),
      t('closed-after', '2026-09-11T09:00:00Z', '2026-09-15T09:00:00Z'),
      t('opened-before', '2026-09-01T09:00:00Z'),
    ];
    const result = sinceLastMeeting(tasks, '2026-09-05T00:00:00Z');
    expect(result.openedSince.map(x => x.id)).toEqual(['open-after']);
    expect(result.closedSince.map(x => x.id)).toEqual(['closed-after']);
  });

  it('boundary date itself is excluded (strictly after)', () => {
    const tasks = [t('same-instant', '2026-09-05T00:00:00Z')];
    expect(sinceLastMeeting(tasks, '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
  });

  it('empty/missing task list is safe', () => {
    expect(sinceLastMeeting([], '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
    expect(sinceLastMeeting(null, '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
  });

  it('ignores a task with no openedAt and an unparsable previous date', () => {
    const tasks = [{ id: 'x', title: 'no date', openedAt: '' } as SinceLastTask];
    expect(sinceLastMeeting(tasks, '2026-09-05T00:00:00Z')).toEqual({ openedSince: [], closedSince: [] });
    expect(sinceLastMeeting([t('1', '2026-09-10T00:00:00Z')], 'not-a-date')).toEqual({ openedSince: [], closedSince: [] });
  });
});
