// Dark mode (spec §6): a real toggle, not only the OS preference. The choice lives in
// localStorage('theme'); 'system' (or nothing stored) falls back to prefers-color-scheme.
// The same three-way resolve runs in the inline boot snippet in index.html <head>, so the
// first paint is already in the right theme.
export type ThemeChoice = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'theme';
export const THEME_COLOR: Record<Theme, string> = { light: '#EEF3F5', dark: '#0F1417' };

/** Pure: stored choice + OS preference → the theme actually shown. */
export function themeResolve(stored: ThemeChoice | string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function storedTheme(): ThemeChoice | null {
  try { return (localStorage.getItem(THEME_KEY) as ThemeChoice | null) || null; } catch { return null; }
}

/** Current theme = stored choice resolved against the OS preference. */
export function currentTheme(): Theme {
  return themeResolve(storedTheme(), prefersDark());
}

/**
 * Apply a theme choice to the document: `html[data-theme]` drives the legacy CSS tokens,
 * `html.dark` drives Tailwind's `darkMode:['class']`, theme-color keeps the PWA chrome in sync.
 * Persists the choice and announces it on sigmaBus so legacy code can react.
 */
export function applyTheme(choice: ThemeChoice): Theme {
  const theme = themeResolve(choice, prefersDark());
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.classList.toggle('dark', theme === 'dark');
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = THEME_COLOR[theme];
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* private mode */ }
  try {
    (window as any).sigmaBus?.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
  } catch { /* no bus yet */ }
  return theme;
}

/** Toggle between the two concrete themes (an explicit choice — never back to 'system'). */
export function toggleTheme(): Theme {
  return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
