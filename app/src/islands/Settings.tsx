// ⚙️ הגדרות — #sigma-settings (spec §7h; Task 4 ships the four settings the redesign needs,
// Task 15 extends both this island and the table).
//
// Copy rule (§ before 7i): nothing here explains the app's own mechanics. Each row says what
// the person gets, not where it is stored or how it is applied.
import * as React from 'react';
import { Bell, ClipboardList, Monitor, Moon, Settings as Cog, Smartphone, Sun } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mount } from '@/islands';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { toast } from 'sonner';
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

/**
 * 📋 Open the gaps panel without importing it: the panel is its own lazy chunk (TanStack,
 * supabase-js), and a static import here would drag all of it into the settings chunk for a
 * button most people never press. The island listens for this event.
 */
function openGaps(): void {
  try { window.dispatchEvent(new CustomEvent('sigma-open-gaps')); } catch { /* no DOM */ }
}

/** ⏰ שעת תזכורת סוף יום — a short list beats a time picker for four realistic answers. */
const EOD_HOURS = [17, 18, 19, 20];

/**
 * 📲 התקן כאפליקציה. Three states and three different sentences: an install the browser can
 * actually perform, the iOS steps, and "it is already installed" — which is a fact, not a
 * button.
 */
function InstallRow() {
  const installed = (() => { try { return !!sigma.isInstalled?.(); } catch { return false; } })();
  const can = (() => { try { return !!sigma.canInstall?.(); } catch { return false; } })();
  return (
    <Row label="התקנה על המכשיר" hint={installed ? 'האפליקציה מותקנת' : 'פתיחה מהמסך הראשי, בלי דפדפן'}>
      <button
        type="button"
        data-testid="settings-install"
        disabled={installed}
        onClick={() => { track('settings-install'); void sigma.appInstall?.(); }}
        className="inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-xl bg-brand-grad px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
      >
        <Smartphone className="h-4 w-4" />
        {installed ? 'מותקנת' : can ? 'התקן כאפליקציה' : 'איך מתקינים'}
      </button>
    </Row>
  );
}

/** 🔔 התראות — one button, and a state line that says what to do next, never why. */
function NotificationsRow() {
  const read = React.useCallback(() => {
    try { return sigma.pushState?.() || 'unsupported'; } catch { return 'unsupported'; }
  }, []);
  const [state, setState] = React.useState<string>(read);

  const TEXT: Record<string, string> = {
    granted: 'פעיל',
    denied: 'חסום — יש לאשר התראות עבור האתר בהגדרות הדפדפן',
    default: 'לא פעיל',
    'ios-needs-install': 'צריך להוסיף את האפליקציה למסך הבית קודם',
    unsupported: 'לא נתמך במכשיר הזה',
    error: 'לא הצלחתי להפעיל — נסה שוב',
  };

  const enable = async () => {
    track('settings-push-enable');
    const next = await sigma.pushEnable?.();
    setState(next || read());
    if (next === 'granted') toast.success('התראות פעילות');
  };

  return (
    <Row label="התראות" hint={TEXT[state] || TEXT.unsupported}>
      <div className="flex flex-wrap gap-1.5">
        {state !== 'granted' && (
          <button
            type="button"
            data-testid="settings-push-enable"
            disabled={state === 'unsupported' || state === 'ios-needs-install'}
            onClick={() => void enable()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-grad px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
          >
            <Bell className="h-4 w-4" /> הפעל התראות
          </button>
        )}
        {state === 'granted' && (
          <button
            type="button"
            data-testid="settings-push-test"
            onClick={() => { track('settings-push-test'); void sigma.pushTest?.().then(ok => { if (!ok) toast.error('לא הצלחתי לשלוח'); }); }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-[13px] font-semibold text-foreground"
          >
            <Bell className="h-4 w-4" /> שלח התראת בדיקה
          </button>
        )}
      </div>
    </Row>
  );
}

/** 👤 האזור האישי — who he is, what is still open on him, and how to get to it. */
function PersonalArea({ user, role, onClose }: { user: string; role: string; onClose: () => void }) {
  const [devices, setDevices] = React.useState<number | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.resolve(sigma.pushDeviceCount?.() ?? 0).then(n => { if (live) setDevices(Number(n) || 0); });
    return () => { live = false; };
  }, [user]);

  const ROLE_HE: Record<string, string> = {
    field: 'שטח', pm: 'ניהול מוצר', dev: 'פיתוח', ceo: 'הנהלה', viewer: 'צפייה',
  };
  const connected = (() => { try { return !!sigma.isEmsConnected?.(); } catch { return false; } })();

  return (
    <div className="mt-2 rounded-xl border border-border bg-muted/40 p-3" data-testid="settings-personal">
      <div className="text-[14px] font-extrabold text-foreground">{user || 'לא מחובר'}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">
        {ROLE_HE[role] || role}
        {' · '}{connected ? 'מחובר ל-EMS' : 'לא מחובר ל-EMS'}
        {devices !== null && ' · ' + (devices ? devices + ' מכשירים מקבלים התראות' : 'אין מכשיר שמקבל התראות')}
      </div>
      <button
        type="button"
        data-testid="settings-open-gaps"
        onClick={() => { track('settings-gaps'); onClose(); openGaps(); }}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-[13px] font-extrabold text-foreground"
      >
        <ClipboardList className="h-4 w-4" /> מה נשאר לי לסגור
      </button>
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
  // The end-of-day reminder exists for the field team only (§7h).
  const isField = (() => { try { return (sigma.ATT_PEOPLE || []).includes(user); } catch { return personRole === 'field'; } })();
  const landingHint = settings.landing === 'auto'
    ? 'המסך שנפתח כשאתה נכנס'
    : 'המסך שבחרת נפתח תמיד';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The panel grew past a phone screen once the install / notifications / personal rows
          joined it (Task 15) — on a 390×844 device the last button sat outside the dialog and
          could not be tapped at all. It scrolls now, and stops short of the screen edge. */}
      <DialogContent className="max-h-[88svh] max-w-[460px] overflow-y-auto" dir="rtl">
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

          {/* ⏰ Only the two people the evening nudge is for. Nobody else has one to move. */}
          {isField && (
            <Row label="תזכורת סוף יום" hint="השעה שבה מגיעה התזכורת לעדכן את היום">
              <Choice<string>
                ariaLabel="תזכורת סוף יום"
                value={String(settings.eod_hour ?? 19)}
                onChange={v => set({ eod_hour: Number(v) }, v)}
                options={EOD_HOURS.map(h => ({ value: String(h), label: String(h).padStart(2, '0') + ':00' }))}
              />
            </Row>
          )}

          <InstallRow />
          <NotificationsRow />
        </div>

        <PersonalArea user={user} role={personRole} onClose={() => setOpen(false)} />

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
