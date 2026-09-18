// ⚙️ הגדרות — the per-person settings the UI reads at runtime (spec §7h, §7k #2, §7l).
//
// Task 4 ships only the four settings the redesign itself needs (מסך פתיחה · תיאור משימות
// בכרטיס · פונט · מצב תצוגה); Task 15 extends both the table and the island. The row lives in
// `user_settings` (db/user_settings.sql), keyed by the person's name — the app's only identity
// — with a localStorage MIRROR so the first paint never waits for the network and a field
// phone with no signal still honours the person's choices.
//
// Reads are merged onto the defaults, never trusted whole: a row written by an older (or
// newer) build can be missing keys or carry values this build does not know.
import { useSyncExternalStore } from 'react';
import { applyTheme, type ThemeChoice } from '@/lib/theme';

/** Landing views a person can be sent to. `auto` = whatever the role default says (§7l). */
export type Landing = 'auto' | 'kibbutz' | 'dev' | 'reports' | 'attendance' | 'calendar' | 'inventory';
export type CardDesc = 'short' | 'full';
export type FontChoice = 'Assistant' | 'Rubik' | 'Noto Sans Hebrew' | 'Heebo';

export interface UserSettings {
  landing: Landing;
  /** 'short' clamps a task description to 2 lines on the phone; 'full' never clamps (§7k #2). */
  card_desc: CardDesc;
  font: FontChoice;
  theme: ThemeChoice;
  /** Task 15 (end-of-day nudge hour). Carried through so a Task-4 write never drops it. */
  eod_hour: number | null;
}

export const SETTINGS_KEY = 'sigma_settings_v1';

/**
 * The window event that opens ⚙️ הגדרות. It lives HERE, not in the island, so the boot chunk
 * (nav, user chip) can ask for the panel without importing the panel — the island stays a lazy
 * chunk and a missing island simply means nothing opens.
 */
export const SETTINGS_OPEN_EVENT = 'sigma-open-settings';

/** Open ⚙️ הגדרות from anywhere (the ⋯ sheet, the user chip, Ctrl+K). */
export function openSettings(): void {
  try { window.dispatchEvent(new CustomEvent(SETTINGS_OPEN_EVENT)); } catch { /* no DOM */ }
}

export const DEFAULT_SETTINGS: UserSettings = {
  landing: 'auto',
  card_desc: 'short',
  font: 'Assistant',
  theme: 'system',
  eod_hour: null,
};

const LANDINGS: Landing[] = ['auto', 'kibbutz', 'dev', 'reports', 'attendance', 'calendar', 'inventory'];
export const FONTS: FontChoice[] = ['Assistant', 'Rubik', 'Noto Sans Hebrew', 'Heebo'];

/** The CSS stack for a face — always with the system fallback, so a blocked webfont still reads. */
export function fontStack(font: FontChoice | string | null | undefined): string {
  const name = FONTS.includes(font as FontChoice) ? (font as FontChoice) : DEFAULT_SETTINGS.font;
  return `'${name}', 'Segoe UI', system-ui, sans-serif`;
}

/**
 * Pure: an unknown / partial / hostile row merged onto the defaults. Every field is validated
 * on its own so ONE bad value (an old landing name, a font that was renamed) cannot throw the
 * person back to every default.
 */
export function mergeSettings(patch: Partial<UserSettings> | Record<string, unknown> | null | undefined,
                              base: UserSettings = DEFAULT_SETTINGS): UserSettings {
  const p = (patch || {}) as Record<string, unknown>;
  const eod = Number(p.eod_hour);
  return {
    landing: LANDINGS.includes(p.landing as Landing) ? (p.landing as Landing) : base.landing,
    card_desc: p.card_desc === 'full' || p.card_desc === 'short' ? p.card_desc : base.card_desc,
    font: FONTS.includes(p.font as FontChoice) ? (p.font as FontChoice) : base.font,
    theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : base.theme,
    eod_hour: p.eod_hour === null ? null : Number.isInteger(eod) && eod >= 0 && eod <= 23 ? eod : base.eod_hour,
  };
}

/**
 * Pure: should a task description be clamped right now? 'short' clamps on the phone only —
 * the desktop card, the briefing and the modal always show the description in full (§7k #2).
 */
export function cardDescClamp(settings: Pick<UserSettings, 'card_desc'>, isPhone: boolean): boolean {
  return settings.card_desc === 'short' && isPhone;
}

// ───────────────────────────── the live store ─────────────────────────────
let current: UserSettings | null = null;
const listeners = new Set<() => void>();

function readMirror(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return mergeSettings(raw ? JSON.parse(raw) : null);
  } catch { return DEFAULT_SETTINGS; }
}

function writeMirror(s: UserSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function getSettings(): UserSettings {
  if (!current) current = readMirror();
  return current;
}

/** Apply the parts of the settings that are pure presentation (font + theme). */
export function applySettings(s: UserSettings): void {
  try { document.documentElement.style.setProperty('--font', fontStack(s.font)); } catch { /* no DOM */ }
  // The theme has its OWN source of truth (localStorage('theme'), read by the <head> boot
  // snippet). applyTheme keeps the two in step; 'system' is still the absence of a choice.
  applyTheme(s.theme);
}

function notify(): void { listeners.forEach(fn => { try { fn(); } catch { /* a bad listener never blocks the rest */ } }); }

/** Merge a patch into the live settings: mirror, apply, notify. Persistence is the caller's. */
export function setSettingsLocal(patch: Partial<UserSettings>): UserSettings {
  current = mergeSettings(patch as Record<string, unknown>, getSettings());
  writeMirror(current);
  applySettings(current);
  notify();
  return current;
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** React binding. Every surface that reads a setting re-renders the moment it changes. */
export function useSettings(): UserSettings {
  return useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_SETTINGS);
}

/** Test-only: forget the live value so the next read comes from the mirror again. */
export function _resetSettings(): void { current = null; listeners.clear(); }

// ───────────────────────── persistence (user_settings) ─────────────────────────
/**
 * Load the person's row and merge it over the mirror. Never throws: no row, no network and no
 * write pass all mean "keep what the mirror says", which is the whole point of the mirror.
 */
export async function loadSettings(person: string): Promise<UserSettings> {
  if (!person) return getSettings();
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = await getSupabase();
    const { data, error } = await sb.from('user_settings').select('*').eq('person', person).maybeSingle();
    if (error || !data) return getSettings();
    return setSettingsLocal(data as Partial<UserSettings>);
  } catch { return getSettings(); }
}

/** Save a patch: the mirror + the row. The mirror lands first, so the UI never waits. */
export async function saveSettings(person: string, patch: Partial<UserSettings>): Promise<void> {
  const next = setSettingsLocal(patch);
  if (!person) return;
  const { sbWrite } = await import('@/lib/supabase');
  await sbWrite(sb => sb.from('user_settings').upsert({
    person,
    landing: next.landing,
    card_desc: next.card_desc,
    font: next.font,
    theme: next.theme,
    eod_hour: next.eod_hour,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'person' }));
}
