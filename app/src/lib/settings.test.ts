// @vitest-environment jsdom
// ⚙️ הגדרות — the pure half (spec §7h, §7k #2). The store itself is covered through
// setSettingsLocal + useSettings in the island tests; what matters here is that a row from the
// database can never corrupt the person's session.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cardDescClamp, DEFAULT_SETTINGS, fontStack, mergeSettings, setSettingsLocal, getSettings,
  _resetSettings, SETTINGS_KEY, pickNewer, type UserSettings,
} from '@/lib/settings';

describe('mergeSettings', () => {
  it('an empty / missing row is the defaults', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the valid fields and falls back per field, never wholesale', () => {
    const m = mergeSettings({ landing: 'dev', font: 'nope', card_desc: 'full', theme: 'zzz' });
    expect(m.landing).toBe('dev');
    expect(m.card_desc).toBe('full');
    expect(m.font).toBe('Assistant');       // unknown face → the default, not a broken stack
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
    expect(mergeSettings({ font: 'Rubik' }, base)).toEqual({ ...base, font: 'Rubik' });
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

describe('fontStack', () => {
  it('always ends in a system fallback', () => {
    expect(fontStack('Rubik')).toBe("'Rubik', 'Segoe UI', system-ui, sans-serif");
  });
  it('an unknown face falls back to Assistant', () => {
    expect(fontStack('Comic Sans')).toContain("'Assistant'");
    expect(fontStack(null)).toContain("'Assistant'");
  });
});

describe('the live store', () => {
  beforeEach(() => { _resetSettings(); localStorage.clear(); });

  it('setSettingsLocal merges, mirrors and is readable back', () => {
    setSettingsLocal({ card_desc: 'full' });
    expect(getSettings().card_desc).toBe('full');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).card_desc).toBe('full');
    // a second patch must not reset the first
    setSettingsLocal({ font: 'Heebo' });
    expect(getSettings()).toMatchObject({ card_desc: 'full', font: 'Heebo' });
  });

  it('the font choice lands on the --font token (one declaration re-types the app)', () => {
    setSettingsLocal({ font: 'Rubik' });
    expect(document.documentElement.style.getPropertyValue('--font')).toContain('Rubik');
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
    const local = at('2026-09-18T12:00:00.000Z', { font: 'Rubik' });
    expect(pickNewer(local, null)).toEqual({ settings: local, push: false });
  });

  it('the winning row still goes through the per-field validation', () => {
    const r = pickNewer(at('2026-01-01'), { font: 'Wingdings', updated_at: '2026-09-18' } as any);
    expect(r.settings.font).toBe('Assistant');
  });
});

describe('setSettingsLocal stamps the person\u2019s own choices', () => {
  beforeEach(() => { _resetSettings(); localStorage.clear(); });

  it('a local choice gets a fresh updated_at (that is how it beats a stale row)', () => {
    const before = new Date().toISOString();
    const s = setSettingsLocal({ card_desc: 'full' });
    expect(s.updated_at >= before).toBe(true);
  });

  it('a patch that came FROM the row keeps the row\u2019s timestamp', () => {
    const s = setSettingsLocal({ card_desc: 'full', updated_at: '2020-01-01T00:00:00.000Z' }, { stamp: false });
    expect(s.updated_at).toBe('2020-01-01T00:00:00.000Z');
  });
});
