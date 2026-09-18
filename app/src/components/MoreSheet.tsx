// "⋯ עוד" — a LABELED bottom sheet with large rows (§7k #3, עידן 18.9: "נוכחות never hidden
// without a label"). Two blocks: the everyday rows, then the management block behind a rule.
//
// Badges are ATTENTION ONLY: a number here means "this needs you". Totals and "new since last
// time" counts are not action, so they get no badge — a nav that cries wolf stops being read.
// The gaps count is 0 until Task 15 computes it; the feedback replies badge comes from the
// inbox island's own registration.
import * as React from 'react';
import {
  CalendarDays, CheckSquare, ClipboardList, Code2, Download, FileDown, FileText, Home, Inbox,
  MapPin, MessageSquarePlus, MoreHorizontal, Notebook, Package, Settings, TrendingUp, Truck,
  Users, Bell, type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserChip } from '@/components/UserChip';
import {
  itemBadge, listMoreItems, onMoreItemsChanged, type MoreItem, type SigmaRole as RegistryRole,
} from '@/lib/registry';
import { sigma, type SigmaPage } from '@/bridge';
import { track } from '@/lib/track';

export const MORE_ICONS: Record<string, LucideIcon> = {
  Home, MapPin, Truck, Package, CalendarDays, CheckSquare, ClipboardList, Code2, Users, Bell,
  Settings, MessageSquarePlus, Download, FileDown, Inbox, TrendingUp, Notebook, FileText,
  MoreHorizontal,
};

/**
 * §7k #3 fixes the ORDER of the everyday rows, and the registry's order is the order islands
 * happened to mount in — which changes with lazy chunks. Registered rows are sorted by this
 * list (anything unlisted keeps its registration order, after the listed ones).
 */
const APP_ORDER = ['settings', 'field-journal', 'feedback'];

/**
 * Legacy pages reachable from the sheet, in the order §7k #3 lists them. `משימות` stays until
 * Task 14 retires it (gated by a coverage audit — nothing is removed here).
 */
const MORE_PAGES: Array<{ page: SigmaPage; label: string; icon: LucideIcon; group?: 'admin' }> = [
  { page: 'calendar', label: 'יומן', icon: CalendarDays },
  { page: 'attendance', label: 'נוכחות', icon: CalendarDays },
  { page: 'mytasks', label: 'משימות', icon: CheckSquare },
  { page: 'ems', label: 'משימות EMS', icon: ClipboardList },
  { page: 'inventory', label: 'מלאי', icon: Package },
  { page: 'pushlog', label: 'התראות', icon: Bell, group: 'admin' },
  { page: 'staff', label: 'עובדים', icon: Users, group: 'admin' },
  { page: 'dev', label: 'פיתוח', icon: Code2, group: 'admin' },
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ms-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-bold text-destructive-foreground">
      <bdi>{n}</bdi>
    </span>
  );
}

function SheetRow({
  icon: Icon, label, badge = 0, muted = false, onClick,
}: {
  icon: LucideIcon; label: string; badge?: number; muted?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={muted}
      className={
        'flex w-full min-h-[52px] items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ' +
        (muted ? 'text-muted-foreground' : 'text-foreground active:bg-muted')
      }
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span>{label}</span>
      <Badge n={badge} />
    </button>
  );
}

export function MoreSheet({ role }: { role: RegistryRole }) {
  const [open, setOpen] = React.useState(false);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onMoreItemsChanged(bump), []);

  const pages = MORE_PAGES.filter(p => { try { return sigma.canShowPage(p.page); } catch { return false; } });
  const extras = listMoreItems(role);
  const go = (fn: () => void) => { setOpen(false); fn(); };

  const rank = (id: string) => {
    const i = APP_ORDER.indexOf(id);
    return i === -1 ? APP_ORDER.length : i;
  };
  const block = (g: 'app' | 'admin') => ({
    pages: role === 'viewer' ? [] : pages.filter(p => (p.group || 'app') === g),
    items: extras
      .filter((i: MoreItem) => (i.group || 'app') === g)
      .slice()
      .sort((a, b) => (g === 'app' ? rank(a.id) - rank(b.id) : 0)),
  });
  const app = block('app');
  const admin = block('admin');

  // The sheet's own attention total — shown on the ⋯ tab so the person knows to open it.
  const attention = extras.reduce((n, i) => n + itemBadge(i), 0);

  return (
    <Sheet
      open={open}
      onOpenChange={o => { setOpen(o); if (o) track('more-sheet-open'); }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="עוד"
          className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors active:scale-[.97] active:bg-muted"
        >
          <MoreHorizontal className="h-[22px] w-[22px]" />
          <span>עוד</span>
          {attention > 0 && (
            <span aria-hidden className="absolute end-3 top-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-border bg-background pb-8">
        <SheetHeader className="mb-2 text-start">
          <SheetTitle className="text-base">עוד</SheetTitle>
        </SheetHeader>

        <div className="mb-3"><UserChip /></div>

        <ul className="flex flex-col gap-0.5">
          {app.pages.map(({ page, label, icon }) => (
            <li key={page}>
              <SheetRow icon={icon} label={label} onClick={() => go(() => sigma.showPage(page))} />
            </li>
          ))}
          {app.items.map(item => (
            <li key={item.id}>
              <SheetRow
                icon={MORE_ICONS[item.icon] ?? MoreHorizontal}
                label={item.label}
                badge={itemBadge(item)}
                onClick={() => go(item.onSelect)}
              />
            </li>
          ))}
          <li>
            <ThemeToggle withLabel className="w-full min-h-[52px] justify-start gap-3 rounded-xl px-3 text-[15px]" />
          </li>
        </ul>

        {(admin.pages.length > 0 || admin.items.length > 0) && (
          <>
            <div className="mt-3 border-t border-border pt-3 text-[12px] font-bold text-muted-foreground">ניהול</div>
            <ul className="flex flex-col gap-0.5">
              {admin.pages.map(({ page, label, icon }) => (
                <li key={page}>
                  <SheetRow icon={icon} label={label} onClick={() => go(() => sigma.showPage(page))} />
                </li>
              ))}
              {admin.items.map(item => (
                <li key={item.id}>
                  <SheetRow
                    icon={MORE_ICONS[item.icon] ?? MoreHorizontal}
                    label={item.label}
                    badge={itemBadge(item)}
                    onClick={() => go(item.onSelect)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
