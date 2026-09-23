import * as React from 'react';
import {
  BarChart3, CalendarDays, Home, MapPin, Package, UserCheck, type LucideIcon,
} from 'lucide-react';
import { MoreSheet } from '@/components/MoreSheet';
import { type SigmaRole as RegistryRole } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';
import { canShowPage } from '@/lib/canShowPage';
import { track } from '@/lib/track';
import { navTabsFor, roleOf, type NavTabId } from '@/lib/landing';

function TabButton({
  icon: Icon, label, onClick, active = false,
}: {
  icon: LucideIcon; label: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        'relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-[3px] rounded-xl px-2 pt-1.5 text-[11px] font-semibold transition-colors active:scale-[.97] active:bg-muted '
        + (active ? 'text-foreground' : 'text-muted-foreground')
      }
    >
      {/* the mockup's `.nav a.on::before` — a 26×3 gradient bar above the icon */}
      {active && <span aria-hidden className="absolute top-0 h-[3px] w-[26px] rounded-[3px] bg-brand-grad" />}
      <Icon className="h-[22px] w-[22px]" />
      <span>{label}</span>
    </button>
  );
}

/** How long a finger rests on the bar before it counts as "show me everything" (A6). */
export const LONG_PRESS_MS = 450;

/**
 * Bottom tab bar — phones only (`md:hidden`; the legacy `.page-nav` keeps the desktop).
 * Field roles: קיבוצים · רעיון/באג · [ביקור] · מלאי · עוד. Viewer: קיבוצים · דוחות · עוד.
 * 22.9 (עידן): 🚚 תעודה left the bar — a certificate is made from inside a visit summary;
 * its slot went to 📣 רעיון / באג. A long press anywhere on the bar opens the ⋯ sheet.
 */
export function Nav() {
  const { name: user, role, isViewer } = useCurrentUser();
  const page = useCurrentPage();
  const [moreSignal, setMoreSignal] = React.useState(0);
  const personRole = roleOf(user, role);
  const tabs = navTabsFor(personRole, user);

  // css/app.css hides the legacy `.page-nav` and `#visitFab` on phones only while this class is
  // present. If ui/sigma.js never loads, the class never lands and the phone keeps the old nav.
  React.useEffect(() => {
    document.body.classList.add('sigma-nav-ready');
    return () => document.body.classList.remove('sigma-nav-ready');
  }, []);

  const registryRole: RegistryRole = isViewer ? 'viewer' : role === 'idan' ? 'idan' : 'team';

  /**
   * The raised 📍 (§5.1 fast path + §7k #1). Round 3 · Package S: this must reach the React
   * chapters sheet (and its 🎙 panel) for EVERY writer role, not only `FIELD_PEOPLE`
   * (אביאם/ניתאי) — `maybeOpen` is an auto-invite ELIGIBILITY check and used to be the only
   * thing this button called, so עידן (and every other non-field writer) fell straight to
   * `sigma.openVisitQuick()`, the legacy form, which has no voice panel. `openManual` opens
   * the same arrival → briefing → chapters route unconditionally; the legacy form stays the
   * true fallback for a browser with no React island mounted.
   *
   * Round 5, L1: the same logic now also lives in lib/runAdd's `openVisit` (the page-action
   * row's `visit` add). Kept duplicated here rather than imported — `runAdd.ts` shares a
   * module with the `runAdd()` switch that HeaderActions' lazy chunk needs, and Nav.tsx is a
   * BOOT file: importing `openVisit` from it pulled that whole switch into the eager bundle
   * and broke the 303 KB boot ceiling (test-sigma-shell.mjs). Revisit once `openVisit` has
   * its own tree-shakeable module, or once U1 rewrites this button.
   */
  const openVisitOrArrival = () => {
    try {
      const field = (window as any).sigmaField;
      if (field?.maybeOpen?.()) return;
      if (field?.openManual?.()) return;
    } catch { /* no field island */ }
    sigma.openVisitQuick();
  };

  const scrollToReports = () => {
    sigma.showPage('kibbutz');
    document.getElementById('viewerReportsHub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Long press → the ⋯ sheet, the way a phone's quick-settings drawer opens on a pull (A6).
  const pressTimer = React.useRef<number | null>(null);
  const clearPress = () => { if (pressTimer.current != null) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const onPointerDown = () => {
    clearPress();
    pressTimer.current = window.setTimeout(() => { pressTimer.current = null; track('more-sheet-open', 'long-press'); setMoreSignal(n => n + 1); }, LONG_PRESS_MS);
  };

  return (
    <nav
      dir="rtl"
      aria-label="ניווט ראשי"
      onPointerDown={onPointerDown}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onContextMenu={e => e.preventDefault()}
      // `.nav` in the mockup: the CARD surface, a hairline on top, 8 px top / 18 px bottom.
      className="sigma-root fixed inset-x-0 bottom-0 z-40 select-none border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 shadow-[0_-2px_12px_rgba(0,0,0,.06)] md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-1.5">
        {isViewer ? (
          <>
            <TabButton icon={Home} label="קיבוצים" active={page === 'kibbutz'} onClick={() => sigma.showPage('kibbutz')} />
            <TabButton icon={BarChart3} label="דוחות" onClick={scrollToReports} />
          </>
        ) : (
          tabs.map((id: NavTabId) => {
            switch (id) {
              case 'kibbutz':
                return <TabButton key={id} icon={Home} label="קיבוצים" active={page === 'kibbutz'} onClick={() => sigma.showPage('kibbutz')} />;
              case 'attendance':
                // §3, A5: נוכחות must not read as יומן — a distinct icon, not CalendarDays twice.
                return <TabButton key={id} icon={UserCheck} label="נוכחות" active={page === 'attendance'} onClick={() => sigma.showPage('attendance')} />;
              case 'calendar':
                // 22.9: 🗓 יומן took the "רעיון / באג" slot — feedback now lives in ⋯ עוד only.
                return <TabButton key={id} icon={CalendarDays} label="יומן" active={page === 'calendar'} onClick={() => sigma.showPage('calendar')} />;
              case 'inventory':
                // The same gate showPage() enforces and the legacy desktop nav obeys — an
                // unpermitted page is not offered at all (audit A · A3: מתניה's מלאי tab
                // bounced her back to קיבוצים).
                return canShowPage('inventory')
                  ? <TabButton key={id} icon={Package} label="מלאי" active={page === 'inventory'} onClick={() => sigma.showPage('inventory')} />
                  : null;
              case 'visit':
                return (
                  // center raised primary action — the brand gradient's one appearance in the nav
                  <div key={id} className="relative flex w-[72px] shrink-0 justify-center">
                    <button
                      type="button"
                      onClick={openVisitOrArrival}
                      aria-label="תיעוד ביקור"
                      // 46 px, radius 14, pulled 16 px up — the mockup's `.nav a.big i`. A circle
                      // read as a third-party FAB dropped onto the bar; this reads as part of it.
                      className="absolute -top-4 flex h-[46px] w-[46px] flex-col items-center justify-center rounded-[14px] s-brand shadow-[0_8px_18px_rgba(26,190,99,.35)] transition-transform active:scale-95"
                    >
                      <MapPin className="h-6 w-6" />
                    </button>
                    <span className="mt-auto pb-1.5 text-[11px] font-medium text-muted-foreground">ביקור</span>
                  </div>
                );
              case 'more':
                return null;   // MoreSheet renders once, below
              default:
                return null;
            }
          })
        )}

        <MoreSheet role={registryRole} openSignal={moreSignal} user={user} />
      </div>
    </nav>
  );
}
