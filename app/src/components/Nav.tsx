import * as React from 'react';
import { BarChart3, Home, MapPin, Package, Truck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { MoreSheet } from '@/components/MoreSheet';
import { todayISO } from '@/lib/visitDrafts';
import { type SigmaRole as RegistryRole } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';

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

/**
 * Bottom tab bar — phones only (`md:hidden`; the legacy `.page-nav` keeps the desktop).
 * Field roles: קיבוצים · תעודה · [ביקור] · מלאי · עוד. Viewer: קיבוצים · דוחות · עוד.
 */
export function Nav() {
  const { role, isViewer } = useCurrentUser();
  const page = useCurrentPage();

  // css/app.css hides the legacy `.page-nav` and `#visitFab` on phones only while this class is
  // present. If ui/sigma.js never loads, the class never lands and the phone keeps the old nav.
  React.useEffect(() => {
    document.body.classList.add('sigma-nav-ready');
    return () => document.body.classList.remove('sigma-nav-ready');
  }, []);

  const registryRole: RegistryRole = isViewer ? 'viewer' : role === 'idan' ? 'idan' : 'team';

  /**
   * 🚚 from the nav has no kibbutz in hand. §5.1c: a certificate hangs off a visit summary,
   * so with nothing started this says so in one sentence and opens the form; with a draft
   * open it resumes that kibbutz and the certificate opens from inside the form, which is
   * what guarantees the cert ↔ visit link.
   */
  const certFromNav = () => {
    let draft = null as null | { kibbutz: string };
    try {
      const me = sigma?.getCurrentUser?.() || '';
      draft = (sigma?.visitDraftFor?.(null, me, todayISO()) as { kibbutz: string }) || null;
    } catch { draft = null; }
    if (draft?.kibbutz) { sigma.openVisitQuick(draft.kibbutz); return; }
    toast.info('נדרש קודם סיכום ביקור — פותח את הטופס');
    sigma.openVisitQuick();
  };

  /**
   * The raised 📍 (§5.1 fast path + §7k #1). For a field worker who has not checked in yet
   * today it opens the arrival sheet — that IS his fastest route, because the briefing's own
   * 📍 is the same form one tap later. For everyone else, and once he has checked in, it goes
   * straight to the visit form, exactly as before.
   */
  const openVisitOrArrival = () => {
    try { if ((window as any).sigmaField?.maybeOpen?.()) return; } catch { /* no field island */ }
    sigma.openVisitQuick();
  };

  const scrollToReports = () => {
    sigma.showPage('kibbutz');
    document.getElementById('viewerReportsHub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      dir="rtl"
      aria-label="ניווט ראשי"
      // `.nav` in the mockup: the CARD surface, a hairline on top, 8 px top / 18 px bottom.
      className="sigma-root fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 shadow-[0_-2px_12px_rgba(0,0,0,.06)] md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-1.5">
        <TabButton icon={Home} label="קיבוצים" active={page === 'kibbutz'} onClick={() => sigma.showPage('kibbutz')} />

        {isViewer ? (
          <TabButton icon={BarChart3} label="דוחות" onClick={scrollToReports} />
        ) : (
          <>
            <TabButton icon={Truck} label="תעודה" onClick={certFromNav} />

            {/* center raised primary action — the brand gradient's one appearance in the nav */}
            <div className="relative flex w-[72px] shrink-0 justify-center">
              <button
                type="button"
                onClick={openVisitOrArrival}
                aria-label="תיעוד ביקור"
                // 46 px, radius 14, pulled 16 px up — the mockup's `.nav a.big i`. A circle
                // read as a third-party FAB dropped onto the bar; this reads as part of it.
                className="absolute -top-4 flex h-[46px] w-[46px] flex-col items-center justify-center rounded-[14px] bg-brand-grad text-white shadow-[0_8px_18px_rgba(26,190,99,.35)] transition-transform active:scale-95"
              >
                <MapPin className="h-6 w-6" />
              </button>
              <span className="mt-auto pb-1.5 text-[11px] font-medium text-muted-foreground">ביקור</span>
            </div>

            <TabButton icon={Package} label="מלאי" active={page === 'inventory'} onClick={() => sigma.showPage('inventory')} />
          </>
        )}

        <MoreSheet role={registryRole} />
      </div>
    </nav>
  );
}

