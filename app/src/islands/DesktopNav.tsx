// U6: the desktop top-tab row that replaces the legacy `.page-nav` (index.html, deleted).
// Same tabs the phone bar (Nav.tsx) shows, plus ביקור as a primary BubbleButton — no ⋯ עוד
// trigger here, that one already lives in the header cluster (HeaderActions.tsx, S-9/S-10),
// and a second "עוד" button on the same screen would break the single-match Playwright
// selectors that assume exactly one.
//
// Lazy chunk (island), NOT part of the boot bundle: main.tsx dynamic-imports it only when
// `#sigma-desktop-nav` exists, same pattern as Home/Field/MyTasks. Nav.tsx (the phone bar) IS
// boot, and stays untouched — its own byte budget has no room for a second nav's markup.
import * as React from 'react';
import { CalendarDays, Home, MapPin, Package, UserCheck, type LucideIcon } from 'lucide-react';
import { BubbleButton } from '@/components/ui/bubble-button';
import { sigma, useCurrentUser } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';
import { canShowPage } from '@/lib/canShowPage';
import { go } from '@/lib/navigate';
import { navTabsFor, roleOf, type NavTabId } from '@/lib/landing';
import { mount } from '@/islands';

function Tab({
  icon: Icon, label, active, onClick,
}: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        'relative flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors '
        + (active ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
      }
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
      {active && <span aria-hidden className="absolute inset-x-3 -bottom-[7px] h-[3px] rounded-[3px] bg-brand-grad" />}
    </button>
  );
}

function DesktopNavBar() {
  const { name: user, role, isViewer } = useCurrentUser();
  const page = useCurrentPage();
  const personRole = roleOf(user, role);
  const tabs = navTabsFor(personRole, user);

  const openVisit = () => { void import('@/lib/runAdd').then(m => m.openVisit()); };

  return (
    <div
      dir="rtl"
      className="sigma-root sticky z-[var(--z-sticky,10)] hidden items-center justify-between border-b border-border bg-card px-4 md:flex"
      style={{ insetBlockStart: 'var(--header-h)', minHeight: 52 }}
    >
      <nav aria-label="ניווט ראשי" className="flex items-center gap-1">
        {isViewer ? (
          <Tab icon={Home} label="קיבוצים" active={page === 'kibbutz'} onClick={() => go('kibbutz', 'peer')} />
        ) : (
          tabs.map((id: NavTabId) => {
            switch (id) {
              case 'kibbutz':
                return <Tab key={id} icon={Home} label="קיבוצים" active={page === 'kibbutz'} onClick={() => go('kibbutz', 'peer')} />;
              case 'attendance':
                return <Tab key={id} icon={UserCheck} label="נוכחות" active={page === 'attendance'} onClick={() => go('attendance', 'peer')} />;
              case 'calendar':
                return <Tab key={id} icon={CalendarDays} label="יומן" active={page === 'calendar'} onClick={() => go('calendar', 'peer')} />;
              case 'inventory':
                return canShowPage('inventory')
                  ? <Tab key={id} icon={Package} label="מלאי" active={page === 'inventory'} onClick={() => go('inventory', 'peer')} />
                  : null;
              default:
                return null;   // 'more' — the header's ⋯ עוד covers it; 'visit' — the BubbleButton below
            }
          })
        )}
      </nav>
      {!isViewer && (
        <BubbleButton
          variant="primary"
          size="sm"
          icon={<MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          aria-label="תיעוד ביקור"
          onClick={openVisit}
        >
          ביקור
        </BubbleButton>
      )}
    </div>
  );
}

export function mountDesktopNav(): boolean {
  return mount('sigma-desktop-nav', DesktopNavBar);
}
