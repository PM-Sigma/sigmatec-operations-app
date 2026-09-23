// ⚙️ הגדרות — the per-person settings the UI reads at runtime (spec §7h, §7k #2, §7l).
//
// The row lives in `user_settings` (db/user_settings.sql), keyed by the person's name — the
// app's only identity — with a localStorage MIRROR so the first paint never waits for the
// network and a field phone with no signal still honours the person's choices.
//
// Reads are merged onto the defaults, never trusted whole: a row written by an older (or
// newer) build can be missing keys or carry values this build does not know.
//
// round 5 G-L5: the font picker is GONE (DS review §4 "Unnecessary") — Assistant is locked,
// every FONT_* export is deleted rather than deprecated, so nothing can quietly resurrect it.
import { useSyncExternalStore } from 'react';
import { applyTheme, storedTheme, type ThemeChoice } from '@/lib/theme';

/** Landing views a person can be sent to. `auto` = whatever the role default says (§7l). */
export type Landing = 'auto' | 'kibbutz' | 'dev' | 'reports' | 'attendance' | 'calendar' | 'inventory';
export type CardDesc = 'short' | 'full';

export interface UserSettings {
  landing: Landing;
  /** 'short' clamps a task description to 2 lines on the phone; 'full' never clamps (§7k #2). */
  card_desc: CardDesc;
  theme: ThemeChoice;
  /** Task 15 (end-of-day nudge hour). Carried through so a write never drops it. */
  eod_hour: number | null;
  /** Round 5 · C2 — אביאם only: also show ניתאי's tasks in the calendar blocks. */
  cal_peer_tasks: boolean;
  /**
   * אביאם's ⚙️ toggle — "לראות גם את המשימות של ניתאי" (round 5 grill round 2). Honoured for
   * אביאם only (`partnerTasksOwner`); anyone else's row carrying `true` (edited by hand, or a
   * shared device) is simply ignored. Package C reads `partnerTasksOwner` for the calendar
   * blocks.
   */
  show_partner_tasks: boolean;
  /**
   * When these settings were last CHANGED BY THIS PERSON. It is the tie-breaker between a
   * device and the row: newest wins (review fix 6). An ISO string, or '' for "never touched",
   * which always loses to a real timestamp.
   */
  updated_at: string;
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
  theme: 'system',
  eod_hour: null,
  cal_peer_tasks: false,
  show_partner_tasks: false,
  updated_at: '',
};

const LANDINGS: Landing[] = ['auto', 'kibbutz', 'dev', 'reports', 'attendance', 'calendar', 'inventory'];

/**
 * Pure: an unknown / partial / hostile row merged onto the defaults. Every field is validated
 * on its own so ONE bad value (an old landing name, a stray type) cannot throw the person back
 * to every default.
 */
export function mergeSettings(patch: Partial<UserSettings> | Record<string, unknown> | null | undefined,
                              base: UserSettings = DEFAULT_SETTINGS): UserSettings {
  const p = (patch || {}) as Record<string, unknown>;
  const eod = Number(p.eod_hour);
  return {
    landing: LANDINGS.includes(p.landing as Landing) ? (p.landing as Landing) : base.landing,
    card_desc: p.card_desc === 'full' || p.card_desc === 'short' ? p.card_desc : base.card_desc,
    theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : base.theme,
    eod_hour: p.eod_hour === null ? null : Number.isInteger(eod) && eod >= 0 && eod <= 23 ? eod : base.eod_hour,
    cal_peer_tasks: typeof p.cal_peer_tasks === 'boolean' ? p.cal_peer_tasks : base.cal_peer_tasks,
    show_partner_tasks: p.show_partner_tasks !== undefined ? !!p.show_partner_tasks : base.show_partner_tasks,
    updated_at: typeof p.updated_at === 'string' ? p.updated_at : base.updated_at,
  };
}

/** אביאם only — the round 5 grill round 2 ruling. */
export function canSetPartnerTasks(user: string): boolean {
  return String(user ?? '').trim() === 'אביאם';
}

/**
 * ניתאי when אביאם switched the setting on, null otherwise — including for anyone who is not
 * אביאם, even if their own row somehow carries `show_partner_tasks: true` (a shared device, a
 * hand-edited row). Package C reads this to decide whose tasks the calendar blocks also show.
 */
export function partnerTasksOwner(user: string, s: Pick<UserSettings, 'show_partner_tasks'>): string | null {
  return canSetPartnerTasks(user) && s.show_partner_tasks ? 'ניתאי' : null;
}

/** The landing options a person may pick, in the order they read (moved out of Settings.tsx
 *  round 5 G-L5; G-U1 wires it into the sub-sheet). */
const LANDING_OPTIONS: Array<{ value: Landing; label: string }> = [
  { value: 'auto', label: 'לפי התפקיד שלי' },
  { value: 'kibbutz', label: '🏘 קיבוצים' },
  { value: 'calendar', label: '🗓 יומן' },
  { value: 'attendance', label: '📅 נוכחות' },
  { value: 'inventory', label: '📦 מלאי' },
  { value: 'dev', label: '💻 פיתוח' },
  { value: 'reports', label: '📊 דוחות' },
];

/**
 * The landing choices THIS person may actually pick: `auto` always, `reports` for the viewer
 * alone (#viewerReportsHub is display:none for everyone else), every other page gated by
 * `canShow` (`sigma.canShowPage`). `user` is carried for a future per-person exception; today
 * the rule does not need it.
 */
export function landingChoices(user: string, isViewer: boolean, canShow: (page: string) => boolean):
  Array<{ value: Landing; label: string }> {
  void user;
  return LANDING_OPTIONS.filter(o => o.value === 'auto' || (o.value === 'reports' ? isViewer : canShow(o.value)));
}

/**
 * NEWEST WINS (review fix 6). The row used to be merged over the mirror wholesale, so a theme
 * chosen on the phone came back and overwrote the one just chosen on the desktop.
 *
 * `push` says the LOCAL side is newer and the row is stale — the caller writes it back, which
 * is what makes two devices converge instead of fighting on every boot. Pure, so the rule is
 * pinned by tests rather than by watching two browsers.
 */
export function pickNewer(local: UserSettings, remote: Partial<UserSettings> | null | undefined):
  { settings: UserSettings; push: boolean } {
  if (!remote) return { settings: local, push: false };
  const r = mergeSettings(remote as Record<string, unknown>, local);
  const localAt = String(local.updated_at || '');
  const remoteAt = String(r.updated_at || '');
  // A tie keeps the local copy: it is what is already on screen, and re-applying an identical
  // value would still flash the theme.
  if (localAt && localAt >= remoteAt) return { settings: local, push: localAt > remoteAt };
  return { settings: r, push: false };
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
  // THE THEME HAS ONE SOURCE OF TRUTH: localStorage('theme'), which the <head> boot snippet
  // and the 🌙 toggle both use. This store only MIRRORS it — otherwise the settings default
  // ('system') silently overwrites an explicit light/dark choice on the next boot, which is
  // exactly what the browser smoke caught.
  const stored = storedTheme();
  const theme: ThemeChoice = stored || 'system';
  if (current.theme !== theme) current = { ...current, theme };
  return current;
}

/**
 * Apply the parts of the settings that are pure presentation. Nothing today: the theme is
 * already on the document by the time this runs (the <head> snippet set it before the first
 * paint, re-applying it here is what used to clobber an explicit choice), and the font picker
 * is gone (round 5 G-L5 — Assistant is locked, set once in index.html's <head>). Kept as a
 * named hook so a future presentation-only setting has one call site to land in.
 */
export function applySettings(_s: UserSettings): void { /* no-op today; see comment above */ }

function notify(): void { listeners.forEach(fn => { try { fn(); } catch { /* a bad listener never blocks the rest */ } }); }

/**
 * Merge a patch into the live settings: mirror, apply, notify. Persistence is the caller's.
 * A patch that came from THIS PERSON (the default) is stamped `updated_at`, which is what
 * lets it win over a stale row on another device; `{ stamp: false }` is for a patch that came
 * FROM the row, where the row's own timestamp must survive.
 */
export function setSettingsLocal(patch: Partial<UserSettings>, opts: { stamp?: boolean } = {}): UserSettings {
  const stamped = opts.stamp === false
    ? patch
    : { ...patch, updated_at: new Date().toISOString() };
  current = mergeSettings(stamped as Record<string, unknown>, getSettings());
  writeMirror(current);
  applySettings(current);
  // A theme is applied only when the person actually CHOSE one in this call — 'system' is
  // still the absence of a choice, and applyTheme() removes the stored key for it.
  if (patch.theme !== undefined) applyTheme(current.theme);
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
    // ONE snapshot: getSettings() re-derives `theme` from localStorage and can hand back a
    // fresh object, so comparing against a second call would be comparing two strangers.
    const before = getSettings();
    const { settings, push } = pickNewer(before, data as Partial<UserSettings>);
    if (settings !== before) {
      // the row is newer → adopt it, keeping ITS timestamp (not now)
      setSettingsLocal(settings, { stamp: false });
      applyTheme(settings.theme);
    } else if (push) {
      // this device is newer → the row is stale, so write ours back and let the other device
      // pick it up on its next boot instead of losing to it forever.
      void saveSettings(person, {}).catch(() => { /* offline — the mirror is still right */ });
    }
    return getSettings();
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
    theme: next.theme,
    eod_hour: next.eod_hour,
    cal_peer_tasks: next.cal_peer_tasks,
    show_partner_tasks: next.show_partner_tasks,
    // The person's OWN stamp, not "now": `pickNewer` compares this against the other device's,
    // and a fresh "now" on every push would make the last device to boot always win.
    updated_at: next.updated_at || new Date().toISOString(),
  }, { onConflict: 'person' }));
}
