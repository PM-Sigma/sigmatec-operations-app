// PageBar — the page action's own compact row (round 5, S-5/S-6). It sits BELOW the header
// (`#sigma-page-bar`), scrolls with the page, and is the one place a page title and its
// primary action live — nothing here ever shares a line with Σ · 🔔 · ✅ · ⚙️, which is how the
// header/page-action overlap (round-5 grill round 1 "Header") happened in the first place.
import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { PageActionRow } from '@/components/ui/page-action-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { mount } from '@/islands';
import { useCurrentUser } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';
import { roleOf } from '@/lib/landing';
import { canManageKibbutzim } from '@/lib/kibbutzim';
import { pageMeta } from '@/lib/shell';
import { pageActionsFor, onPageActionsChanged, type PageAction } from '@/lib/pageActions';
import { goBack } from '@/lib/navigate';
import { track } from '@/lib/track';

function OverflowSheet({ actions }: { actions: PageAction[] }) {
  const [open, setOpen] = React.useState(false);
  if (!actions.length) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <BubbleButton variant="icon" size="sm" aria-label="עוד פעולות">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </BubbleButton>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto border-border bg-card pb-8">
        <SheetHeader className="mb-2 text-start">
          <SheetTitle className="text-base">עוד פעולות</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col gap-0.5">
          {actions.map(a => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full min-h-[48px] items-center gap-3 px-3 text-start text-[14px] text-foreground transition-colors hover:bg-muted"
                onClick={() => { setOpen(false); track('page-action', a.id); a.onSelect(); }}
              >
                <span className="flex-1">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export function PageBar() {
  const { name: user, role, isViewer } = useCurrentUser();
  const page = useCurrentPage();
  const personRole = roleOf(user, role);
  const meta = pageMeta(page);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onPageActionsChanged(bump), []);

  const { shown, overflow } = pageActionsFor(page, personRole, {
    canManageKibbutzim: canManageKibbutzim(user, isViewer),
  });

  // Attendance / BurnsPage / PushLog / DevBoard draw their own PageActionRow (richer title or
  // actions this shared row has no slot for) — a second title here would be a duplicate <h1>
  // (see the `ownHeader` doc in lib/shell.ts).
  if (meta.ownHeader) return null;

  return (
    <div className="sigma-page-bar" dir="rtl">
      <PageActionRow
        title={meta.title}
        onBack={meta.level === 2 ? () => { track('back', page); goBack(); } : undefined}
        actions={
          (shown.length || overflow.length) ? (
            <>
              {shown.map(a => (
                <BubbleButton
                  key={a.id}
                  variant={a.primary ? 'primary' : 'tonal'}
                  size="sm"
                  onClick={() => { track('page-action', a.id); a.onSelect(); }}
                >
                  {a.label}
                </BubbleButton>
              ))}
              <OverflowSheet actions={overflow} />
            </>
          ) : undefined
        }
      />
    </div>
  );
}

export function mountPageBar(): boolean {
  return mount('sigma-page-bar', PageBar);
}
