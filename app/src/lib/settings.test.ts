// @vitest-environment jsdom
// ⚙️ הגדרות — the pure half (spec §7h, §7k #2). The store itself is covered through
// setSettingsLocal + useSettings in the island tests; what matters here is that a row from the
// database can never corrupt the person's session.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cardDescClamp, DEFAULT_SETTINGS, landingChoices, mergeSettings,
  setSettingsLocal, getSettings, _resetSettings, SETTINGS_KEY, pickNewer,
  type UserSettings,
} from '@/lib/settings';
import * as S from '@/lib/settings';

describe('mergeSettings', () => {
  it('an empty / missing row is the defaults', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the valid fields and falls back per field, never wholesale', () => {
    const m = mergeSettings({ landing: 'dev', card_desc: 'full', theme: 'zzz' });
    expect(m.landing).toBe('dev');
    expect(m.card_desc).toBe('full');
    expect(m.theme).toBe('system');         // unknown theme → system
  });

  it('rejects an unknown landing (an older build\'s value must not strand someone)', () => {
    expect(mergeSettings({ landing: 'today' }).landing).toBe('auto');
  });

  it('eod_hour accepts 0..23, an explicit null, and nothing else', () => {
    expect(mergeSettings({ eod_hour: 0 }).eod_hour).toBe(0);
    expect(mergeSettings({ eod_hour: 17 }).eod_hour).toBe(17);
    expect(mergeSettings({ eod_hour: null }).eod_hour).toBe(null);
    expect(mergeSettings({ eod_hour: 24 }, { ...DEFAULT_SETTINGS, eod_hour: 17 }).eod_hour).toBe(17);
    expect(mergeSettings({ eod_hour: 'x' }).eod_hour).toBe(null);
  });

  it('merges onto a base, not onto the defaults, when one is given', () => {
    const base = mergeSettings({ landing: 'dev', card_desc: 'full' });
    expect(mergeSettings({ eod_hour: 18 }, base)).toEqual({ ...base, eod_hour: 18 });
  });
});

describe('cardDescClamp (§7k #2)', () => {
  it('מקוצר clamps on the phone only', () => {
    expect(cardDescClamp({ card_desc: 'short' }, true)).toBe(true);
    expect(cardDescClamp({ card_desc: 'short' }, false)).toBe(false);
  });
  it('מלא never clamps', () => {
    expect(cardDescClamp({ card_desc: 'full' }, true)).toBe(false);
    expect(cardDescClamp({ card_desc: 'full' }, false)).toBe(false);
  });
});

// DS review §4 "Unnecessary" (round 5 G-L5): the font picker goes, Assistant is locked.
describe('font machinery is gone, Assistant is locked', () => {
  it('no font export survives', () => {
    expect((S as any).FONTS).toBeUndefined();
    expect((S as any).fontStack).toBeUndefined();
    expect((S as any).fontHref).toBeUndefined();
    expect((S as any).ensureFontLink).toBeUndefined();
  });
  it('a row carrying a font field does not resurrect one', () => {
    expect('font' in mergeSettings({ font: 'Rubik' } as any)).toBe(false);
    expect('font' in DEFAULT_SETTINGS).toBe(false);
  });
});

// round 5 grill round 2's אביאם/ניתאי peer-tasks setting is package C's `cal_peer_tasks` +
// `canTogglePeerTasks` (app/src/lib/calendar.ts) — G does not duplicate it.

describe('landingChoices — extracted from Settings.tsx (round 5 G-L5)', () => {
  const all = () => true;

  it('follows the page gates; reports is the viewer\'s alone', () => {
    expect(landingChoices(false, all).map(c => c.value))
      .toEqual(['auto', 'kibbutz', 'calendar', 'attendance', 'inventory', 'dev']);
    expect(landingChoices(true, all).map(c => c.value)).toContain('reports');
    expect(landingChoices(false, all).map(c => c.value)).not.toContain('reports');
  });

  it('a page the gate refuses is not offered', () => {
    expect(landingChoices(false, p => p !== 'inventory').map(c => c.value)).not.toContain('inventory');
  });

  it('auto is always first and always offered', () => {
    expect(landingChoices(false, () => false)[0].value).toBe('auto');
  });
});

describe('the live store', () => {
  beforeEach(() => { _resetSettings(); localStorage.clear(); });

  it('setSettingsLocal merges, mirrors and is readable back', () => {
    setSettingsLocal({ card_desc: 'full' });
    expect(getSettings().card_desc).toBe('full');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).card_desc).toBe('full');
    // a second patch must not reset the first
    setSettingsLocal({ eod_hour: 18 });
    expect(getSettings()).toMatchObject({ card_desc: 'full', eod_hour: 18 });
  });

  it('a corrupt mirror reads as the defaults instead of throwing', () => {
    localStorage.setItem(SETTINGS_KEY, '{not json');
    _resetSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('pickNewer — newest wins between this device and the row (review fix 6)', () => {
  const at = (iso: string, over: Partial<UserSettings> = {}): UserSettings =>
    ({ ...DEFAULT_SETTINGS, updated_at: iso, ...over });

  it('the ROW wins when it is newer', () => {
    const local = at('2026-09-18T10:00:00.000Z', { theme: 'light' });
    const r = pickNewer(local, { theme: 'dark', updated_at: '2026-09-18T11:00:00.000Z' });
    expect(r.settings.theme).toBe('dark');
    expect(r.push).toBe(false);
  });

  it('THIS DEVICE wins when its choice is newer — and the stale row is pushed back', () => {
    const local = at('2026-09-18T12:00:00.000Z', { theme: 'light' });
    const r = pickNewer(local, { theme: 'dark', updated_at: '2026-09-18T11:00:00.000Z' });
    expect(r.settings.theme).toBe('light');   // the explicit local choice is NOT clobbered
    expect(r.push).toBe(true);                // …and the other device will converge
  });

  it('a tie keeps what is already on screen and pushes nothing', () => {
    const local = at('2026-09-18T12:00:00.000Z', { theme: 'light' });
    const r = pickNewer(local, { theme: 'dark', updated_at: '2026-09-18T12:00:00.000Z' });
    expect(r.settings.theme).toBe('light');
    expect(r.push).toBe(false);
  });

  it('a device that never chose anything loses to any row', () => {
    const r = pickNewer(at(''), { card_desc: 'full', updated_at: '2026-01-01T00:00:00.000Z' });
    expect(r.settings.card_desc).toBe('full');
    expect(r.push).toBe(false);
  });

  it('no row at all changes nothing', () => {
    const local = at('2026-09-18T12:00:00.000Z', { card_desc: 'full' });
    expect(pickNewer(local, null)).toEqual({ settings: local, push: false });
  });

  it('the winning row still goes through the per-field validation', () => {
    const r = pickNewer(at('2026-01-01'), { landing: 'nope', updated_at: '2026-09-18' } as any);
    expect(r.settings.landing).toBe('auto');
  });
});

describe('round 5 \u00b7 C2 \u2014 cal_peer_tasks', () => {
  it('defaults to off and survives a merge', () => {
    expect(DEFAULT_SETTINGS.cal_peer_tasks).toBe(false);
    expect(mergeSettings({ cal_peer_tasks: true }).cal_peer_tasks).toBe(true);
    expect(mergeSettings({ cal_peer_tasks: 'yes' as unknown as boolean }).cal_peer_tasks).toBe(false);
    expect(mergeSettings({}, { ...DEFAULT_SETTINGS, cal_peer_tasks: true }).cal_peer_tasks).toBe(true);
  });
});

describe('setSettingsLocal stamps the person\u2019s own choices', () => {
  beforeEach(() => { _resetSettings(); localStorage.clear(); });

  it('a local choice gets a fresh updated_at (that is how it beats a stale row)', () => {
    const before = new Date().toISOString();
    const s = setSettingsLocal({ card_desc: 'full' });
    expect(s.updated_at >= before).toBe(true);
  });

  it('a patch that came FROM the row keeps the row’s timestamp', () => {
    const s = setSettingsLocal({ card_desc: 'full', updated_at: '2020-01-01T00:00:00.000Z' }, { stamp: false });
    expect(s.updated_at).toBe('2020-01-01T00:00:00.000Z');
  });
});
