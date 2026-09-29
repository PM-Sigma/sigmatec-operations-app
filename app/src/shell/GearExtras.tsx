// Lazy extras for the gear sheet (Q7-C). GearSheet lives in the boot chunk under a hard size
// ceiling, so everything that is not the menu rows themselves is here and loaded with
// React.lazy the first time the sheet opens: the identity block for the first screen
// (7.1/7.2: "מה נשאר לי לסגור", and עידן's "מצב הצוות") and the small install sheet (7.7).
import * as React from 'react';
import { Check, ClipboardList } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import { TeamStatus } from '@/components/TeamStatus';
import { sigma } from '@/bridge';
import { track } from '@/lib/track';

/** The first-screen identity area: what is still open on the person, and (עידן) the team. */
function GearIdentity({ user, onClose }: { user: string; onClose: () => void }) {
  return (
    <>
      <SectionBlock title="">
        <div data-testid="gear-open-gaps">
          <ListRow
            leading={<ClipboardList className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
            title="מה נשאר לי לסגור"
            onClick={() => {
              track('gear-sheet', 'gaps');
              onClose();
              try { window.dispatchEvent(new CustomEvent('sigma-open-gaps')); } catch { /* no DOM */ }
            }}
          />
        </div>
      </SectionBlock>
      <TeamStatus user={user} />
    </>
  );
}

const PUSH_TEXT: Record<string, string> = {
  granted: 'ההתראות פעילות במכשיר הזה',
  denied: 'חסום. יש לאשר התראות עבור האתר בהגדרות הדפדפן',
  default: 'לא פעיל',
  'ios-needs-install': 'צריך להוסיף את האפליקציה למסך הבית קודם',
  unsupported: 'לא נתמך במכשיר הזה',
  error: 'לא הצלחתי להפעיל. נסה שוב',
};

function Done() {
  return <Check aria-hidden className="h-5 w-5 text-[var(--ok-ink)]" strokeWidth={2.5} />;
}

/** 7.7: "התקנת אפליקציה" — install + allow notifications on THIS device, each with its state. */
function InstallSheet({ onClose }: { onClose: () => void }) {
  const readInstalled = () => { try { return !!sigma.isInstalled?.(); } catch { return false; } };
  const readPush = () => { try { return sigma.pushState?.() || 'unsupported'; } catch { return 'unsupported'; } };
  const [installed, setInstalled] = React.useState(readInstalled);
  const [push, setPush] = React.useState<string>(readPush);
  const canInstall = (() => { try { return !!sigma.canInstall?.(); } catch { return false; } })();

  const install = async () => {
    track('install-sheet', 'install');
    try { await sigma.appInstall?.(); } catch { /* the browser's own dialog decides */ }
    setInstalled(readInstalled());
  };
  const enable = async () => {
    track('install-sheet', 'push');
    const next = await sigma.pushEnable?.();
    setPush(next || readPush());
  };

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto border-border bg-card pb-8" data-testid="install-sheet">
        <SheetHeader className="mb-1 text-start">
          <SheetTitle className="text-base">התקנת אפליקציה</SheetTitle>
          <SheetDescription className="text-[13px]">על המכשיר הזה</SheetDescription>
        </SheetHeader>
        <SectionBlock title="">
          <ListRow
            title="התקנת האפליקציה"
            meta={installed ? 'מותקנת' : canInstall ? 'פתיחה מהמסך הראשי, בלי דפדפן' : 'איך מתקינים'}
            trailing={installed
              ? <Done />
              : <BubbleButton variant="tonal" size="sm" data-testid="install-sheet-install" onClick={() => void install()}>
                {canInstall ? 'התקנה' : 'איך מתקינים'}
              </BubbleButton>}
          />
          <ListRow
            title="אפשור התראות במכשיר"
            meta={PUSH_TEXT[push] || PUSH_TEXT.unsupported}
            trailing={push === 'granted'
              ? <Done />
              : <BubbleButton
                variant="tonal" size="sm" data-testid="install-sheet-push"
                disabled={push === 'unsupported' || push === 'ios-needs-install' || push === 'denied'}
                onClick={() => void enable()}
              >
                אפשור
              </BubbleButton>}
          />
        </SectionBlock>
      </SheetContent>
    </Sheet>
  );
}

/** The one entry GearSheet lazy-loads: the identity area, or (`install`) the install sheet. */
export default function GearExtras({ user = '', install = false, onClose }: { user?: string; install?: boolean; onClose: () => void }) {
  return install ? <InstallSheet onClose={onClose} /> : <GearIdentity user={user} onClose={onClose} />;
}
