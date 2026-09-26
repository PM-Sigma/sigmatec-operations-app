// GearSheet (U2, S-3/S-4) — the ⚙️ bubble opens a real Sheet (design-system pattern, not a
// position:absolute dropdown menu — Opus must-fix "no absolute positioning in the header").
// Identity + role at the top (with an inline EMS-connection Tag instead of the old floating
// status dot on the chip), then settings / install / feedback / האזור האישי / user-switch.
import * as React from 'react';
import {
  Download, Lightbulb, Settings, User, UserCog,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { ListRow } from '@/components/ui/list-row';
import { SectionBlock } from '@/components/ui/section-block';
import { Tag } from '@/components/ui/chip';
import { sigma, useCurrentUser, useEmsConnected } from '@/bridge';
import { roleOf } from '@/lib/landing';
import { openSettings } from '@/lib/settings';
import { track } from '@/lib/track';
import { ROLE_LABEL } from '@/shell/IdentityRow';

export const GEAR_OPEN_EVENT = 'sigma-open-gear';

let pendingOpen = false;
try { window.addEventListener(GEAR_OPEN_EVENT, () => { pendingOpen = true; }); } catch { /* no DOM */ }

/** Opens the gear sheet from anywhere — the header bubble, or a skeleton fallback link. */
export function openGearSheet(): void {
  pendingOpen = true;
  try { window.dispatchEvent(new CustomEvent(GEAR_OPEN_EVENT)); } catch { /* no DOM */ }
}

export function GearSheet() {
  const { name: user, role, isViewer } = useCurrentUser();
  const connected = useEmsConnected();
  const [open, setOpen] = React.useState(() => { const o = pendingOpen; pendingOpen = false; return o; });
  const personRole = roleOf(user, role);

  const installed = (() => { try { return !!sigma.isInstalled?.(); } catch { return false; } })();
  const canInstall = (() => { try { return !!sigma.canInstall?.(); } catch { return false; } })();
  const mock = (() => { try { return !!(window as any).__SIGMA_MOCK; } catch { return false; } })();

  React.useEffect(() => {
    const on = () => { pendingOpen = false; setOpen(true); };
    window.addEventListener(GEAR_OPEN_EVENT, on);
    return () => window.removeEventListener(GEAR_OPEN_EVENT, on);
  }, []);

  const pick = (fn: () => void, what: string) => { setOpen(false); track('gear-sheet', what); fn(); };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="s-gear-desktop max-h-[85vh] overflow-y-auto border-border bg-card pb-8">
        {/* Designer round 3: SheetHeader wraps its children in its OWN hard-coded flex-col div
            (sheet.tsx) — passing Tags straight in as siblings of the title stretched them to
            that column's full width (`align-items:stretch`), so "לא מחובר"/"סביבת בדיקה" read
            as full-width buttons instead of small inline chips. One row, everything as ITS own
            flex children, as the ONLY child of that column — the column still stretches, but
            nothing inside a `flex items-center` row does. `items-center` on SheetHeader itself
            (already here) also centres the ✕ against this whole row instead of top-aligning it
            against just the first text line. */}
        <SheetHeader className="mb-1 items-center gap-3 text-start">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <SheetTitle className="text-base">{user || 'לא מחובר'}</SheetTitle>
              <SheetDescription className="!mt-0 text-[13px]">{isViewer ? ROLE_LABEL.viewer : ROLE_LABEL[personRole]}</SheetDescription>
            </div>
            <Tag role={connected ? 'ok' : 'neutral'} dot className="shrink-0">{connected ? 'מחובר ל-EMS' : 'לא מחובר'}</Tag>
            {mock && <Tag role="info" className="shrink-0">סביבת בדיקה</Tag>}
          </div>
        </SheetHeader>

        <SectionBlock title="">
          <ListRow leading={<Settings className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />} title="הגדרות" onClick={() => pick(openSettings, 'settings')} />
          {!installed && (
            <ListRow
              leading={<Download className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
              title="התקנת האפליקציה"
              meta={canInstall ? undefined : 'איך מתקינים'}
              onClick={() => pick(() => { void sigma.appInstall?.(); }, 'install')}
            />
          )}
          <ListRow
            leading={<Lightbulb className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
            title="רעיון או באג"
            onClick={() => pick(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')), 'feedback')}
          />
          <ListRow
            leading={<User className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
            title="האזור האישי"
            meta="בקרוב"
            onClick={() => pick(() => sigma.toast('האזור האישי, בקרוב'), 'personal')}
          />
          <ListRow
            leading={<UserCog className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
            title="החלפת משתמש"
            onClick={() => pick(() => sigma.changeUser(), 'change-user')}
          />
        </SectionBlock>
      </SheetContent>
    </Sheet>
  );
}
