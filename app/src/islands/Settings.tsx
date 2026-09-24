// ⚙️ הגדרות — #sigma-settings (spec §7h; round 5 G-U1 moves every row onto the design system:
// no native `<select>`, no steppers, every control a SegmentedControl / Switch / ListRow →
// sub-sheet). The gear SHEET entry point itself (the header bubble, the open event's origin)
// belongs to package S (`r9/S-U`, not merged yet) — this file owns the sheet BODY only.
//
// Copy rule: nothing here explains the app's own mechanics. Each row says what the person
// gets, not where it is stored or how it is applied.
import * as React from 'react';
import { Bell, ChevronDown, ChevronLeft, ChevronUp, ClipboardList, Lightbulb, Settings as Cog, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { BubbleButton } from '@/components/ui/bubble-button';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { mount } from '@/islands';
import { registerMoreItem } from '@/lib/registry';
import { track } from '@/lib/track';
import { toast } from 'sonner';
import { sigma, useCurrentUser } from '@/bridge';
import { roleOf } from '@/lib/landing';
import { canShowPage } from '@/lib/canShowPage';
import {
  landingChoices, loadSettings, openSettings, saveSettings, SETTINGS_OPEN_EVENT, useSettings,
  type CardDesc, type Landing, type UserSettings,
} from '@/lib/settings';
import type { ThemeChoice } from '@/lib/theme';
import { EmsGate } from '@/components/EmsGate';
import { canEditTemplate, type OnboardingTemplate, type TemplateStep } from '@/lib/onboarding';
import { fetchOnboardingTemplate, saveOnboardingTemplate } from '@/components/home/OnboardingProgress';

/** A label + a control that is not a chevron row (a SegmentedControl or a Switch body) —
 *  matches ListRow's own horizontal padding so both kinds sit flush inside the same
 *  SectionBlock divide-y list (SectionBlock cancels its own px-4 and expects every child to
 *  supply its own). */
function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-[length:var(--fs-body)] font-semibold leading-[var(--lh-body)]">{label}</span>
      {children}
    </div>
  );
}

/** G-R10: the calendar peer-tasks setting is אביאם's alone — the one person round 5's grill
 *  round 2 named. An unknown name never sees it, the same closed-set rule `burns.ts` uses for
 *  BURN_WRITERS. */
export function canSetPartnerTasks(user: string): boolean {
  return String(user ?? '').trim() === 'אביאם';
}

/**
 * 📋 Open the gaps panel without importing it: the panel is its own lazy chunk (TanStack,
 * supabase-js), and a static import here would drag all of it into the settings chunk for a
 * button most people never press. The island listens for this event.
 */
function openGaps(): void {
  try { window.dispatchEvent(new CustomEvent('sigma-open-gaps')); } catch { /* no DOM */ }
}

/** R own Feedback.tsx listens for this (`Feedback.tsx:205`) — G only dispatches it. */
function openFeedback(): void {
  try { window.dispatchEvent(new CustomEvent('sigma-open-feedback')); } catch { /* no DOM */ }
}

/** ⏰ שעת תזכורת סוף יום — a short list beats a time picker for four realistic answers. */
const EOD_HOURS = [17, 18, 19, 20];
const EOD_OPTIONS = EOD_HOURS.map(h => ({ value: String(h), label: String(h).padStart(2, '0') + ':00' }));

/**
 * 🖥 מסך פתיחה — a pushed sub-PANE with a radio ListRow per choice, replacing the native
 * `<select>` (G-R7). Persists the moment a row is tapped, same as every other control here.
 *
 * An inline pane swap inside the SAME dialog, not a nested `Sheet`: the settings panel is
 * still a radix `Dialog` (the GearSheet rewrite is package S, not merged) and radix marks
 * every OTHER open portal `inert` while one is open — nesting a second radix `Dialog` (which
 * `Sheet` is built on) inside the first made its own content un-clickable. A back row plus a
 * conditional render avoids stacking two dialogs at all.
 */
function LandingPane({
  value, options, onPick, onBack,
}: {
  value: Landing;
  options: Array<{ value: Landing; label: string }>;
  onPick: (v: Landing) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <ListRow
        onClick={onBack}
        title="חזרה להגדרות"
        leading={<span aria-hidden className="text-[15px]">→</span>}
        trailing={null}
      />
      <div className="-mx-4 mt-1 divide-y divide-border" data-testid="landing-options">
        {options.map(o => (
          <ListRow
            key={o.value}
            onClick={() => onPick(o.value)}
            title={o.label}
            trailing={o.value === value ? <span aria-hidden className="h-2.5 w-2.5 rounded-full s-brand" /> : null}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 📲 התקן כאפליקציה. Three states and three different sentences: an install the browser can
 * actually perform, the iOS steps, and "it is already installed" — which is a fact, not a
 * button.
 */
function InstallRow() {
  const installed = (() => { try { return !!sigma.isInstalled?.(); } catch { return false; } })();
  const can = (() => { try { return !!sigma.canInstall?.(); } catch { return false; } })();
  return (
    <ListRow
      leading={<Smartphone className="h-5 w-5 text-muted-foreground" aria-hidden />}
      title="התקנה על המכשיר"
      meta={installed ? 'האפליקציה מותקנת' : 'פתיחה מהמסך הראשי, בלי דפדפן'}
      trailing={
        <BubbleButton
          variant="tonal"
          size="sm"
          data-testid="settings-install"
          disabled={installed}
          onClick={() => { track('settings-install'); void sigma.appInstall?.(); }}
        >
          {installed ? 'מותקנת' : can ? 'התקן' : 'איך מתקינים'}
        </BubbleButton>
      }
    />
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
    denied: 'חסום. יש לאשר התראות עבור האתר בהגדרות הדפדפן',
    default: 'לא פעיל',
    'ios-needs-install': 'צריך להוסיף את האפליקציה למסך הבית קודם',
    unsupported: 'לא נתמך במכשיר הזה',
    error: 'לא הצלחתי להפעיל. נסה שוב',
  };

  const enable = async () => {
    track('settings-push-enable');
    const next = await sigma.pushEnable?.();
    setState(next || read());
    if (next === 'granted') toast.success('התראות פעילות');
  };

  return (
    <ListRow
      leading={<Bell className="h-5 w-5 text-muted-foreground" aria-hidden />}
      title="התראות"
      meta={TEXT[state] || TEXT.unsupported}
      trailing={
        state === 'granted' ? (
          <BubbleButton
            variant="neutral"
            size="sm"
            data-testid="settings-push-test"
            onClick={() => { track('settings-push-test'); void sigma.pushTest?.().then(ok => { if (!ok) toast.error('לא הצלחתי לשלוח'); }); }}
          >
            שלח בדיקה
          </BubbleButton>
        ) : (
          <BubbleButton
            variant="tonal"
            size="sm"
            data-testid="settings-push-enable"
            disabled={state === 'unsupported' || state === 'ios-needs-install'}
            onClick={() => void enable()}
          >
            הפעלה
          </BubbleButton>
        )
      }
    />
  );
}

/** 👤 זהות — who he is, his role, his device count, and what is still open on him. */
function IdentityBlock({ user, role, onClose }: { user: string; role: string; onClose: () => void }) {
  const [devices, setDevices] = React.useState<number | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.resolve(sigma.pushDeviceCount?.() ?? 0).then(n => { if (live) setDevices(Number(n) || 0); });
    return () => { live = false; };
  }, [user]);

  const ROLE_HE: Record<string, string> = {
    field: 'שטח', pm: 'ניהול מוצר', dev: 'פיתוח', ceo: 'הנהלה', viewer: 'צפייה',
  };
  const deviceLine = devices === null ? undefined
    : devices ? devices + ' מכשירים מקבלים התראות' : 'אין מכשיר שמקבל התראות';

  return (
    <SectionBlock title="זהות">
      <div data-testid="settings-personal">
        <ListRow title={user || 'לא מחובר'} meta={[ROLE_HE[role] || role, deviceLine].filter(Boolean).join(' · ')} trailing={null} />
      </div>
      <div data-testid="settings-open-gaps">
        <ListRow
          leading={<ClipboardList className="h-5 w-5 text-muted-foreground" aria-hidden />}
          title="מה נשאר לי לסגור"
          onClick={() => { track('settings-gaps'); onClose(); openGaps(); }}
        />
      </div>
    </SectionBlock>
  );
}

/**
 * 🆕 תבנית קליטת לקוח חדש — עידן only (spec §4: "template editable by עידן"). An ordered-list
 * editor: reorder, edit a step's label, toggle "ממתין למייל". Saving changes the ORDER a
 * FUTURE 🆕 client gets — it never rewrites steps already spawned on an existing card.
 */
function OnboardingTemplateRow({ user }: { user: string }) {
  const [tpl, setTpl] = React.useState<OnboardingTemplate | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void fetchOnboardingTemplate().then(t => { if (live) { setTpl(t); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  if (!canEditTemplate(user)) return null;
  if (loading) return null;

  const move = (i: number, dir: -1 | 1) => {
    if (!tpl) return;
    const steps = tpl.steps.slice();
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setTpl({ ...tpl, steps });
  };
  const setLabel = (i: number, label: string) => {
    if (!tpl) return;
    const steps = tpl.steps.slice();
    steps[i] = { ...steps[i], label };
    setTpl({ ...tpl, steps });
  };
  const setWaits = (i: number, waits: boolean) => {
    if (!tpl) return;
    const steps = tpl.steps.slice();
    steps[i] = { ...steps[i], waits };
    setTpl({ ...tpl, steps });
  };
  const save = async () => {
    if (!tpl) return;
    setSaving(true);
    try { await saveOnboardingTemplate(tpl, user); toast.success('התבנית נשמרה'); }
    catch (e: any) { toast.error(e?.message || 'השמירה נכשלה'); }
    finally { setSaving(false); }
  };

  return (
    <SectionBlock title="ניהול" flush>
      <div className="px-4">
        <div className="mb-2 text-[13px] font-semibold text-foreground">תבנית קליטת לקוח חדש</div>
        {!tpl ? (
          <div className="text-[12px] text-muted-foreground">לא נמצאה תבנית</div>
        ) : (
          <>
            <div className="mb-2 text-[12px] text-muted-foreground">
              הסדר והתוויות שכל 🆕 לקוח חדש מקבל, לא משפיע על קיבוצים שכבר בקליטה
            </div>
            <ol className="flex w-full flex-col gap-1.5" data-testid="onboarding-template-editor">
              {tpl.steps.map((s: TemplateStep, i: number) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-[12px] text-muted-foreground">{i + 1}</span>
                  <input
                    value={s.label}
                    onChange={e => setLabel(i, e.target.value)}
                    aria-label={'תווית שלב ' + (i + 1)}
                    className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-2 text-[13px]"
                    style={{ minHeight: 48 }}
                  />
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    ממתין למייל
                    {/* The DS Switch is a fixed 24×44 visual — under the 48×48 tap-target floor
                        wherever it renders alone rather than inside a full-height ListRow.
                        data-hit-slop is the documented escape hatch (_overlap.ts) for exactly
                        this: a visual under the floor, with slop making up the difference. */}
                    <Switch checked={!!s.waits} onCheckedChange={v => setWaits(i, v)} aria-label={'ממתין למייל: ' + s.label} data-hit-slop="true" />
                  </span>
                  {/* Reorder — a BubbleButton pair, not the legacy ▲▼ text steppers the DS
                      review flagged (G-R7): same up/down move, a real icon button each. */}
                  <BubbleButton variant="icon" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={'הזז למעלה: ' + s.label} className="shrink-0">
                    <ChevronUp className="h-4 w-4" />
                  </BubbleButton>
                  <BubbleButton variant="icon" size="sm" disabled={i === tpl.steps.length - 1} onClick={() => move(i, 1)} aria-label={'הזז למטה: ' + s.label} className="shrink-0">
                    <ChevronDown className="h-4 w-4" />
                  </BubbleButton>
                </li>
              ))}
            </ol>
            <BubbleButton variant="primary" size="sm" className="mt-2" disabled={saving} onClick={() => void save()}>
              שמור תבנית
            </BubbleButton>
          </>
        )}
      </div>
    </SectionBlock>
  );
}

function SettingsPanel() {
  const [open, setOpen] = React.useState(false);
  const [landingOpen, setLandingOpen] = React.useState(false);
  const { name: user, role, isViewer } = useCurrentUser();
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
  const isIdan = String(user ?? '').trim() === 'עידן';

  const options = landingChoices(isViewer, o => canShowPage(o as any));
  const landingLabel = options.find(o => o.value === settings.landing)?.label
    || (settings.landing === 'auto' ? 'לפי התפקיד שלי' : settings.landing);

  // §7p, wired for completeness: every control writes the moment it is touched (`set()`
  // above), so there is never a draft to lose and the predicate is honestly false.
  const guard = useUnsavedGuard({ dirty: () => false, onClose: () => setOpen(false) });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) setLandingOpen(false); guard.onOpenChange(setOpen)(v); }}>
      <DialogContent className="max-h-[88svh] max-w-[460px] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Cog className="h-5 w-5" /> {landingOpen ? 'מסך פתיחה' : 'הגדרות'}
          </DialogTitle>
          <DialogDescription>{user || 'לא מחובר'}</DialogDescription>
        </DialogHeader>
        <EmsGate>
          {landingOpen ? (
            <LandingPane
              value={settings.landing}
              options={options}
              onPick={v => { set({ landing: v }, v); setLandingOpen(false); }}
              onBack={() => setLandingOpen(false)}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <IdentityBlock user={user} role={personRole} onClose={() => setOpen(false)} />

              <SectionBlock title="תצוגה">
                <ControlRow label="מצב תצוגה">
                  <SegmentedControl<ThemeChoice>
                    ariaLabel="מצב תצוגה"
                    value={settings.theme}
                    onChange={v => set({ theme: v }, v)}
                    options={[
                      { value: 'light', label: 'בהיר' },
                      { value: 'dark', label: 'כהה' },
                      { value: 'system', label: 'מכשיר' },
                    ]}
                  />
                </ControlRow>
                <ControlRow label="תיאור משימות בכרטיס">
                  <SegmentedControl<CardDesc>
                    ariaLabel="תיאור משימות בכרטיס"
                    value={settings.card_desc}
                    onChange={v => set({ card_desc: v }, v)}
                    options={[{ value: 'short', label: 'מקוצר' }, { value: 'full', label: 'מלא' }]}
                  />
                </ControlRow>
              </SectionBlock>

              <SectionBlock title="מסך פתיחה">
                <ListRow
                  title="מסך פתיחה"
                  meta={settings.landing === 'auto' ? 'המסך שנפתח כשאתה נכנס' : 'המסך שבחרת נפתח תמיד'}
                  onClick={() => setLandingOpen(true)}
                  // Designer round 5 review #6: value + chevron, like every other row that opens
                  // a sub-sheet — an explicit `trailing` replaces ListRow's own default chevron
                  // entirely, so a value-only span (the earlier version) silently dropped it.
                  trailing={
                    <span className="flex items-center gap-1">
                      <span className="text-[13px] font-semibold text-foreground">{landingLabel}</span>
                      <ChevronLeft aria-hidden className="h-5 w-5" />
                    </span>
                  }
                />
              </SectionBlock>

              {/* ⏰ Only the two people the evening nudge is for. Nobody else has one to move. */}
              {isField && (
                <SectionBlock title="תזכורת סוף יום">
                  <ControlRow label="השעה שבה מגיעה התזכורת לעדכן את היום">
                    <SegmentedControl<string>
                      ariaLabel="תזכורת סוף יום"
                      value={String(settings.eod_hour ?? 19)}
                      onChange={v => set({ eod_hour: Number(v) }, v)}
                      options={EOD_OPTIONS}
                    />
                  </ControlRow>
                </SectionBlock>
              )}

              {/* G-R10: אביאם only — round 5 grill round 2. */}
              {canSetPartnerTasks(user) && (
                <SectionBlock title="המשימות שלי">
                  <ListRow
                    title="לראות גם את המשימות של ניתאי"
                    trailing={
                      <Switch
                        checked={!!settings.cal_peer_tasks}
                        onCheckedChange={v => set({ cal_peer_tasks: v }, 'cal_peer_tasks')}
                        aria-label="לראות גם את המשימות של ניתאי"
                      />
                    }
                  />
                </SectionBlock>
              )}

              <SectionBlock title="התראות">
                <NotificationsRow />
              </SectionBlock>

              <SectionBlock title="אפליקציה">
                <InstallRow />
                <ListRow
                  leading={<Lightbulb className="h-5 w-5 text-muted-foreground" aria-hidden />}
                  title="רעיון או באג"
                  onClick={() => {
                    track('settings-feedback');
                    // Open the feedback sheet FIRST, close this dialog after: radix's own
                    // "mark every other open portal inert" pass runs off the dialog that is
                    // MOST RECENTLY opened, so opening feedback while this one is still open
                    // (and closing it right after) keeps feedback the live, clickable one —
                    // the reverse order raced the close animation and left feedback inert.
                    openFeedback();
                    setOpen(false);
                  }}
                />
              </SectionBlock>

              {/* עידן only. */}
              {isIdan && <OnboardingTemplateRow user={user} />}
            </div>
          )}

          {/* read so the panel re-renders after changeUser() — the landing options are gated per person */}
          <span hidden data-role={personRole} />
        </EmsGate>
        {guard.prompt}
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
