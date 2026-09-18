import * as React from 'react';
import { BarChart3, Home, MapPin, Package, Truck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { MoreSheet } from '@/components/MoreSheet';
import { todayISO } from '@/lib/visitDrafts';
import { type SigmaRole as RegistryRole } from '@/lib/registry';
import { sigma, useCurrentUser } from '@/bridge';

function TabButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors active:scale-[.97] active:bg-muted"
    >
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

  const scrollToReports = () => {
    sigma.showPage('kibbutz');
    document.getElementById('viewerReportsHub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      dir="rtl"
      aria-label="ניווט ראשי"
      className="sigma-root fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,.06)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1">
        <TabButton icon={Home} label="קיבוצים" onClick={() => sigma.showPage('kibbutz')} />

        {isViewer ? (
          <TabButton icon={BarChart3} label="דוחות" onClick={scrollToReports} />
        ) : (
          <>
            <TabButton icon={Truck} label="תעודה" onClick={certFromNav} />

            {/* center raised primary action — the brand gradient's one appearance in the nav */}
            <div className="relative flex w-[72px] shrink-0 justify-center">
              <button
                type="button"
                onClick={() => sigma.openVisitQuick()}
                aria-label="תיעוד ביקור"
                className="absolute -top-6 flex h-[56px] w-[56px] flex-col items-center justify-center rounded-full bg-brand-grad text-white shadow-lg transition-transform active:scale-95"
              >
                <MapPin className="h-6 w-6" />
              </button>
              <span className="mt-auto pb-1.5 text-[11px] font-medium text-muted-foreground">ביקור</span>
            </div>

            <TabButton icon={Package} label="מלאי" onClick={() => sigma.showPage('inventory')} />
          </>
        )}

        <MoreSheet role={registryRole} />
      </div>
    </nav>
  );
}

