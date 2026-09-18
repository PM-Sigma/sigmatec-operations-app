// @vitest-environment jsdom
// ⚙️ הגדרות — the pure half (spec §7h, §7k #2). The store itself is covered through
// setSettingsLocal + useSettings in the island tests; what matters here is that a row from the
// database can never corrupt the person's session.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cardDescClamp, DEFAULT_SETTINGS, fontStack, mergeSettings, setSettingsLocal, getSettings,
  _resetSettings, SETTINGS_KEY,
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
