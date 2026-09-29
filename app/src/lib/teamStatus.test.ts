import { describe, expect, it } from 'vitest';
import { STAFF, buildTeamStatus, canSeeTeamStatus } from './teamStatus';
import { canOpenGallery } from './galleryGate';
import { deviceLabel, shouldReport } from './devicePresence';

describe('canSeeTeamStatus (Q7-C 7.1 role matrix)', () => {
  it('עידן only', () => {
    expect(canSeeTeamStatus('עידן')).toBe(true);
    expect(canSeeTeamStatus(' עידן ')).toBe(true);
    for (const n of ['עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה', 'צפייה', '', 'PM']) {
      expect(canSeeTeamStatus(n)).toBe(false);
    }
  });
});

describe('buildTeamStatus', () => {
  it('reads notifications from push subscriptions, installed from devices', () => {
    const rows = buildTeamStatus(STAFF, [{ owner: 'עידן' }, { owner: 'עידן' }, { owner: 'ניתאי' }], [
      { person: 'עידן', is_standalone: true },
      { person: 'ניתאי', is_standalone: false },
    ]);
    const by = Object.fromEntries(rows.map(r => [r.person, r]));
    expect(rows).toHaveLength(STAFF.length);
    expect(by['עידן']).toMatchObject({ notif: true, installed: true, devices: 1 });
    expect(by['ניתאי']).toMatchObject({ notif: true, installed: false, devices: 1 });
    expect(by['אליה']).toMatchObject({ notif: false, installed: false, devices: 0 });
  });
  it('a missing device table means installed is UNKNOWN (null), notifications still work', () => {
    const rows = buildTeamStatus(STAFF, [{ owner: 'אבצן' }], null);
    expect(rows.every(r => r.installed === null)).toBe(true);
    expect(rows.find(r => r.person === 'אבצן')!.notif).toBe(true);
  });
});

describe('canOpenGallery (Q7-C item 10)', () => {
  it('עידן and mock mode only', () => {
    expect(canOpenGallery('עידן', false)).toBe(true);
    expect(canOpenGallery('', true)).toBe(true);
    for (const n of ['עמיחי', 'אביאם', 'ניתאי', 'צפייה', '']) expect(canOpenGallery(n, false)).toBe(false);
  });
});

describe('devicePresence pure helpers', () => {
  it('labels a device coarsely', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S911B) Chrome/120 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Safari/604')).toBe('iPhone · Safari');
    expect(deviceLabel('')).toBe('מכשיר');
  });
  it('reports when the state changed or a day passed, not otherwise', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(shouldReport('a', null, 1)).toBe(true);
    expect(shouldReport('a', { sig: 'a', at: 1000 }, 1000 + 60_000)).toBe(false);
    expect(shouldReport('b', { sig: 'a', at: 1000 }, 1000 + 60_000)).toBe(true);
    expect(shouldReport('a', { sig: 'a', at: 1000 }, 1000 + day)).toBe(true);
  });
});
