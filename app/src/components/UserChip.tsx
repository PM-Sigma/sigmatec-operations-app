// "● עידן" — the header/sheet identity chip (spec §6: no bare 👤 icon), and the small menu
// behind it (עידן, mockup comment 18.9: "app settings live here too, not only under ⋯").
//
// Rows: ⚙️ הגדרות · 👤 האזור האישי (Task 15) · the EMS connection · החלפת משתמש. Copy rule:
// the menu never says who else sees anything, and never explains the app's own machinery —
// the EMS row states a state and offers the one action that changes it.
import * as React from 'react';
import { useClickAway } from '@/lib/useClickAway';
import { LogIn, Plug, Settings, User, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sigma, useCurrentUser, useEmsConnected } from '@/bridge';
import { openSettings } from '@/lib/settings';
import { track } from '@/lib/track';

function MenuRow({
  icon: Icon, label, hint, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full min-h-[48px] items-center gap-3 px-3 text-start text-[14px] text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/** Green dot = connected to EMS. Tap → the menu (the user switcher is one of its rows). */
export function UserChip({ className }: { className?: string }) {
  const { name } = useCurrentUser();
  const connected = useEmsConnected();
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLSpanElement>(null);

  // A tap anywhere else, or Escape, closes it — and the listeners only exist while it is
  // open. The behaviour lives in @/lib/useClickAway (F14 ⑩); it used to be written out here
  // and again, identically, in MeetingNotes.
  useClickAway(open, wrap, () => setOpen(false));

  const pick = (fn: () => void, what: string) => { setOpen(false); track('user-menu', what); fn(); };

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted',
          className,
        )}
      >
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', connected ? 'bg-brand-2' : 'bg-muted-foreground')}
        />
        <span className="hidden sm:inline">{name || 'לא מחובר'}</span>
        <span className="sm:hidden font-bold" aria-label={name || 'לא מחובר'}>{(name || '?').slice(0, 1)}</span>
      </button>

      {open && (
        <span
          role="menu"
          className="absolute top-full z-50 mt-1.5 flex w-[220px] flex-col overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg [inset-inline-end:0]"
        >
          <MenuRow icon={Settings} label="הגדרות" onClick={() => pick(openSettings, 'settings')} />
          <MenuRow
            icon={User}
            label="האזור האישי"
            hint="בקרוב"
            onClick={() => pick(() => sigma.toast('האזור האישי, בקרוב'), 'personal')}
          />
          <span className="my-1 border-t border-border" />
          {/* There is no EMS PAGE any more (§7m R2). Connected → the one way out is ניתוק;
              disconnected → the one way in is the sign-in gate (§7n), never a second panel. */}
          {connected ? (
            <MenuRow icon={Plug} label="מחובר ל-EMS · ניתוק" onClick={() => pick(() => sigma.emsDisconnect?.(), 'ems-disconnect')} />
          ) : (
            <MenuRow icon={LogIn} label="התחבר ל-EMS" onClick={() => pick(() => sigma.beginReLogin?.(), 'ems-connect')} />
          )}
          <MenuRow icon={UserCog} label="החלפת משתמש" onClick={() => pick(() => sigma.changeUser(), 'change-user')} />
        </span>
      )}
    </span>
  );
}
