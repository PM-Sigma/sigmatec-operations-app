// First screen per role (spec §7l, APPROVED). The full person × setting × gate matrix — this
// is the function that decides what someone sees the second he opens the app, so every row of
// §7l's table is asserted literally.
import { describe, expect, it } from 'vitest';
import {
  defaultLanding, landingFor, landingFromSetting, moreLeadsWithInventory, navTabsFor, roleOf,
} from '@/lib/landing';
import { DEFAULT_SETTINGS } from '@/lib/settings';

describe('roleOf', () => {
  it('maps the people §7l names', () => {
    expect(roleOf('אביאם', 'team')).toBe('field');
    expect(roleOf('ניתאי', 'team')).toBe('field');
    expect(roleOf('עידן', 'idan')).toBe('pm');
    expect(roleOf('מתניה', 'team')).toBe('dev');
    expect(roleOf('אליה', 'team')).toBe('dev');      // §7l explicitly adds אליה as a dev
    expect(roleOf('עמיחי', 'team')).toBe('ceo');
  });

  it('the PIN viewer role wins over any name — it is a device-level fact', () => {
    expect(roleOf('עידן', 'viewer')).toBe('viewer');
    expect(roleOf('', 'viewer')).toBe('viewer');
  });

  it('an unknown name is field — קיבוצים assumes nothing', () => {
    expect(roleOf('אבצן', 'team')).toBe('field');
    expect(roleOf('מישהו חדש', '')).toBe('field');
    expect(roleOf('', '')).toBe('field');
  });

  it('is not confused by stray whitespace in the stored name', () => {
    expect(roleOf(' עידן ', 'idan')).toBe('pm');
  });
});

describe('defaultLanding — §7l role defaults as Task 4 ships them', () => {
  it('devs land on the board', () => {
    expect(defaultLanding('dev')).toEqual({ page: 'dev' });
  });
  it('the viewer lands on the reports hub, which lives on the kibbutz page', () => {
    expect(defaultLanding('viewer')).toEqual({ page: 'kibbutz', scrollTo: 'viewerReportsHub' });
  });
  it('field, pm and ceo land on the cards for now (היום שלי / סקירה are later tasks)', () => {
    for (const r of ['field', 'pm', 'ceo'] as const) {
      expect(defaultLanding(r)).toEqual({ page: 'kibbutz' });
    }
  });
});

describe('landingFromSetting', () => {
  it('auto defers to the role', () => {
    expect(landingFromSetting('auto')).toBe(null);
  });
  it('reports is the hub on the kibbutz page, not a page of its own', () => {
    expect(landingFromSetting('reports')).toEqual({ page: 'kibbutz', scrollTo: 'viewerReportsHub' });
  });
  it('every other value is the page itself', () => {
    expect(landingFromSetting('dev')).toEqual({ page: 'dev' });
    expect(landingFromSetting('attendance')).toEqual({ page: 'attendance' });
    expect(landingFromSetting('inventory')).toEqual({ page: 'inventory' });
    expect(landingFromSetting('calendar')).toEqual({ page: 'calendar' });
  });
});

describe('landingFor', () => {
  const all = () => true;

  it('with no setting it is the role default', () => {
    expect(landingFor('dev', 'מתניה', null, all)).toEqual({ page: 'dev' });
    expect(landingFor('field', 'אביאם', DEFAULT_SETTINGS, all)).toEqual({ page: 'kibbutz' });
  });

  it('a personal choice overrides the role default', () => {
    expect(landingFor('field', 'אביאם', { landing: 'attendance' }, all)).toEqual({ page: 'attendance' });
    expect(landingFor('pm', 'עידן', { landing: 'dev' }, all)).toEqual({ page: 'dev' });
  });

  it('a landing this person cannot open falls back to the role default', () => {
    const noDev = (p: string) => p !== 'dev';
    expect(landingFor('field', 'אביאם', { landing: 'dev' }, noDev as any)).toEqual({ page: 'kibbutz' });
  });

  it('when even the role default is gated, the cards are the floor', () => {
    const onlyCards = (p: string) => p === 'kibbutz';
    expect(landingFor('dev', 'מתניה', { landing: 'dev' }, onlyCards as any)).toEqual({ page: 'kibbutz' });
  });

  it('every role reaches a page the gates allow — nobody lands on nothing', () => {
    for (const r of ['field', 'pm', 'dev', 'ceo', 'viewer'] as const) {
      const t = landingFor(r, 'x', DEFAULT_SETTINGS, all);
      expect(typeof t.page).toBe('string');
      expect(t.page.length).toBeGreaterThan(0);
    }
  });
});

describe('navTabsFor — bottom bar order (phone QA round 2, package A §3)', () => {
  it('אביאם and ניתאי get נוכחות · יומן · ביקור · קיבוצים · עוד', () => {
    expect(navTabsFor('field', 'אביאם')).toEqual(['attendance', 'calendar', 'visit', 'kibbutz', 'more']);
    expect(navTabsFor('field', 'ניתאי')).toEqual(['attendance', 'calendar', 'visit', 'kibbutz', 'more']);
  });

  it('every other role gets קיבוצים · יומן · ביקור · מלאי · עוד', () => {
    expect(navTabsFor('pm', 'עידן')).toEqual(['kibbutz', 'calendar', 'visit', 'inventory', 'more']);
    expect(navTabsFor('ceo', 'עמיחי')).toEqual(['kibbutz', 'calendar', 'visit', 'inventory', 'more']);
    expect(navTabsFor('dev', 'מתניה')).toEqual(['kibbutz', 'calendar', 'visit', 'inventory', 'more']);
    expect(navTabsFor('field', 'מישהו חדש')).toEqual(['kibbutz', 'calendar', 'visit', 'inventory', 'more']);
  });

  it('moreLeadsWithInventory matches the same two names', () => {
    expect(moreLeadsWithInventory('אביאם')).toBe(true);
    expect(moreLeadsWithInventory('ניתאי')).toBe(true);
    expect(moreLeadsWithInventory('עידן')).toBe(false);
  });
});
