import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { currentTheme, toggleTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** 🌙/☀️ light-dark switch. The choice is persisted; the whole page follows (html[data-theme]). */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState(() => currentTheme());
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      aria-label={isDark ? 'מצב בהיר' : 'מצב כהה'}
      title={isDark ? 'מצב בהיר' : 'מצב כהה'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted',
        className,
      )}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      {withLabel && <span>{isDark ? 'מצב בהיר' : 'מצב כהה'}</span>}
    </button>
  );
}
