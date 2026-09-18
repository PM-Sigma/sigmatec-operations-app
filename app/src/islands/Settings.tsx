// ⚙️ הגדרות — #sigma-settings (spec §7h; Task 4 ships the four settings the redesign needs,
// Task 15 extends both this island and the table).
//
// Copy rule (§ before 7i): nothing here explains the app's own mechanics. Each row says what
// the person gets, not where it is stored or how it is applied.
import * as React from 'react';
import { Monitor, Moon, Settings as Cog, Sun } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mount } from '@/islands';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { sigma, useCurrentUser } from '@/bridge';
import { roleOf } from '@/lib/landing';
import {
  FONTS, loadSettings, openSettings, saveSettings, SETTINGS_OPEN_EVENT, useSettings,
  type CardDesc, type FontChoice, type Landing, type UserSettings,
} from '@/lib/settings';
import type { ThemeChoice } from '@/lib/theme';
import { EmsGate } from '@/components/EmsGate';

/** The landing options a person may pick, in the order they read. */
const LANDING_OPTIONS: Array<{ value: Landing; label: string }> = [
  { value: 'auto', label: 'לפי התפקיד שלי' },
  { value: 'kibbutz', label: '🏘 קיבוצים' },
  { value: 'calendar', label: '🗓 יומן' },
  { value: 'attendance', label: '📅 נוכחות' },
  { value: 'inventory', label: '📦 מלאי' },
  { value: 'dev', label: '💻 פיתוח' },
  { value: 'reports', label: '📊 דוחות' },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0">
      <div>
        <div className="text-[14px] font-semibold text-foreground">{label}</div>
        {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** A segmented row of choices — 44 px targets, the active one on the brand gradient. */
function Choice<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors ' +
              (on ? 'bg-brand-grad text-white' : 'border border-border bg-card text-foreground hover:bg-muted')
            }
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsPanel() {
  const [open, setOpen] = React.useState(false);
  const { name: user, role } = useCurrentUser();
  const settings = useSettings();

  // The person's row, read once per session (and again after a user switch) and merged over
  // the mirror. A failure is silent by design: the mirror is already on screen.
  React.useEffect(() => { if (user) void loadSettings(user); }, [user]);

  React.useEffect(() => {
    const on = () => { setOpen(true); track('settings-open'); };
    window.addEventListener(SETTINGS_OPEN_EVENT, on as EventListener);
    return () => window.removeEventListener(SETTINGS_OPEN_EVENT, on as EventListener);
  }, []);

  const set = React.useCallback((patch: Partial<UserSettings>, what: string) => {
    void saveSettings(user, patch).catch(() => { /* the mirror already holds the choice */ });
    track('settings-change', what);
  }, [user]);

  const personRole = roleOf(user, role);
  const landingHint = settings.landing === 'auto'
    ? 'המסך שנפתח כשאתה נכנס'
    : 'המסך שבחרת נפתח תמיד';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[460px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Cog className="h-5 w-5" /> הגדרות
          </DialogTitle>
          <DialogDescription>{user || 'לא מחובר'}</DialogDescription>
        </DialogHeader>
        <EmsGate>

        <div className="flex flex-col">
          <Row label="מסך פתיחה" hint={landingHint}>
            {/* A native select: seven options do not fit as chips on a 390 px phone. */}
            <select
              value={settings.landing}
              onChange={e => set({ landing: e.target.value as Landing }, e.target.value)}
              aria-label="מסך פתיחה"
              className="min-h-[44px] rounded-xl border border-border bg-card px-3 text-[14px] text-foreground"
            >
              {LANDING_OPTIONS
                // Offer only what this person can actually open.
                .filter(o => o.value === 'auto' || o.value === 'reports'
                  || (() => { try { return sigma.canShowPage(o.value as any); } catch { return true; } })())
                .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>

          <Row label="תיאור משימות בכרטיס" hint="בטלפון — שורתיים או הטקסט המלא">
            <Choice<CardDesc>
              ariaLabel="תיאור משימות בכרטיס"
              value={settings.card_desc}
              onChange={v => set({ card_desc: v }, v)}
              options={[{ value: 'short', label: 'מקוצר' }, { value: 'full', label: 'מלא' }]}
            />
          </Row>

          <Row label="פונט">
            <Choice<FontChoice>
              ariaLabel="פונט"
              value={settings.font}
              onChange={v => set({ font: v }, v)}
              options={FONTS.map(f => ({ value: f, label: f }))}
            />
          </Row>

          <Row label="מצב תצוגה">
            <Choice<ThemeChoice>
              ariaLabel="מצב תצוגה"
              value={settings.theme}
              onChange={v => set({ theme: v }, v)}
              options={[
                { value: 'light', label: 'בהיר', icon: <Sun className="h-4 w-4" /> },
                { value: 'dark', label: 'כהה', icon: <Moon className="h-4 w-4" /> },
                { value: 'system', label: 'לפי המכשיר', icon: <Monitor className="h-4 w-4" /> },
              ]}
            />
          </Row>
        </div>

        {/* read so the panel re-renders after changeUser() — the landing options are gated per person */}
        <span hidden data-role={personRole} />
        </EmsGate>
      </DialogContent>
    </Dialog>
  );
}

export function mountSettings(): boolean {
  const ok = mount('sigma-settings', SettingsPanel);
  if (ok) {
    registerMoreItem({
      id: 'settings', label: 'הגדרות', icon: 'Settings', group: 'app', onSelect: openSettings,
    });
  }
  return ok;
}
