import * as React from 'react';
import {
  BarChart3, CalendarDays, CheckSquare, ClipboardList, Code2, Home, MapPin, MoreHorizontal,
  Package, Truck, Users, Bell, type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserChip } from '@/components/UserChip';
import { listMoreItems, onMoreItemsChanged, type SigmaRole as RegistryRole } from '@/lib/registry';
import { sigma, useCurrentUser, type SigmaPage } from '@/bridge';

// Legacy pages reachable from the "⋯ עוד" sheet. Each is shown only when the legacy gate
// (sigma.canShowPage → the exact conditions showPage applies) allows it.
const MORE_PAGES: Array<{ page: SigmaPage; label: string; icon: LucideIcon }> = [
  { page: 'attendance', label: 'נוכחות', icon: CalendarDays },
  { page: 'ems', label: 'משימות EMS', icon: ClipboardList },
  { page: 'mytasks', label: 'המשימות שלי', icon: CheckSquare },
  { page: 'calendar', label: 'יומן', icon: CalendarDays },
  { page: 'staff', label: 'עובדים', icon: Users },
  { page: 'dev', label: 'פיתוח', icon: Code2 },
  { page: 'pushlog', label: 'התראות', icon: Bell },
];

const ICONS: Record<string, LucideIcon> = {
  Home, MapPin, Truck, Package, BarChart3, CalendarDays, CheckSquare, ClipboardList, Code2, Users, Bell,
};

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

function MoreSheet({ role }: { role: RegistryRole }) {
  const [open, setOpen] = React.useState(false);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onMoreItemsChanged(bump), []);

  const pages = MORE_PAGES.filter(p => sigma.canShowPage(p.page));
  const extras = listMoreItems(role);
  const go = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="עוד"
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors active:scale-[.97] active:bg-muted"
        >
          <MoreHorizontal className="h-[22px] w-[22px]" />
          <span>עוד</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background pb-8">
        <SheetHeader className="mb-3 text-start">
          <SheetTitle className="text-base">עוד</SheetTitle>
        </SheetHeader>

        <div className="mb-4"><UserChip /></div>

        {role !== 'viewer' && pages.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2">
            {pages.map(({ page, label, icon: Icon }) => (
              <li key={page}>
                <button
                  type="button"
                  onClick={() => go(() => sigma.showPage(page))}
                  className="flex w-full min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-xs font-medium text-foreground transition-colors active:bg-muted"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {extras.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {extras.map(item => {
              const Icon = ICONS[item.icon] ?? MoreHorizontal;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => go(item.onSelect)}
                    className="flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm text-foreground transition-colors active:bg-muted"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <ThemeToggle withLabel className="w-full justify-start min-h-[48px]" />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Bottom tab bar — phones only (`md:hidden`; the legacy `.page-nav` keeps the desktop).
 * Field roles: קיבוצים · תעודה · [ביקור] · מלאי · עוד. Viewer: קיבוצים · דוחות · עוד.
 */
export function Nav() {
  const { role, isViewer } = useCurrentUser();
  const registryRole: RegistryRole = isViewer ? 'viewer' : role === 'idan' ? 'idan' : 'team';

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
            <TabButton icon={Truck} label="תעודה" onClick={() => sigma.openDeliveryCert({})} />

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

