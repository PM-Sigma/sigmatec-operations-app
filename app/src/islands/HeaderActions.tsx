// The header's right-hand cluster (spec §6 header, §7k #12 search, §7k.2 the one ➕):
//   🔍 חיפוש (desktop — opens Ctrl+K) · the context ➕ · 🌙/☀️ · ● user chip
//
// It replaces the legacy strip of six grey chips (👤 …, 🟢 EMS, 🔓 ישיבה, 🏘️ פוטנציאליים, …)
// as the place identity and settings live; the legacy chips that still have no React home
// (ישיבה, פוטנציאליים, סטטיסטיקה) stay where they are and are untouched.
import * as React from 'react';
import { Plus, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserChip } from '@/components/UserChip';
import { mount } from '@/islands';
import { sigma, useCurrentUser, useSigmaEvent, type SigmaPage } from '@/bridge';
import { roleOf } from '@/lib/landing';
import { canManageKibbutzim } from '@/lib/kibbutzim';
import { primaryAdd, primaryAddLabel } from '@/lib/primaryAdd';
import { openCommandBar, runAdd } from '@/islands/CommandBar';
import { track } from '@/lib/track';

/** The page the legacy shell is showing. It changes without any React event, so we poll the
 *  one global that always holds it — on the events that can change it, not on a timer. */
function useCurrentPage(): SigmaPage {
  const read = () => (((window as any)._currentPage as SigmaPage) || 'kibbutz');
  const [page, setPage] = React.useState<SigmaPage>(read);
  React.useEffect(() => {
    // showPage() is wrapped by the bridge for analytics; a click anywhere is the cheapest
    // reliable "the page may have changed" signal, and re-reading a global is free.
    const on = () => setPage(read());
    document.addEventListener('click', on, true);
    window.addEventListener('hashchange', on);
    return () => { document.removeEventListener('click', on, true); window.removeEventListener('hashchange', on); };
  }, []);
  useSigmaEvent('user-changed', on => { void on; setPage(read()); });
  return page;
}

function HeaderActionsPanel() {
  const { name: user, role, isViewer } = useCurrentUser();
  const page = useCurrentPage();
  const personRole = roleOf(user, role);
  const add = primaryAdd(page, personRole, { canManageKibbutzim: canManageKibbutzim(user, isViewer) });
  const addLabel = primaryAddLabel(add);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Desktop only: the phone has the sticky search pill + the bottom nav. */}
      <button
        type="button"
        onClick={() => { track('search-open', 'header'); openCommandBar(); }}
        className="hidden min-h-[40px] items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
        title="חיפוש ופעולות · Ctrl+K"
      >
        <Search className="h-4 w-4" />
        <span>חיפוש</span>
        <kbd className="rounded border border-border px-1 text-[10px] font-semibold"><bdi>Ctrl K</bdi></kbd>
      </button>

      {/* §7k.2: rendered ONLY when the page has something to add, and the label always says
          what it does — never a bare plus. */}
      {addLabel && (
        <button
          type="button"
          onClick={() => { track('primary-add', add); runAdd(add); }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand-grad px-3 text-[13px] font-bold text-white transition-transform active:scale-[.97]"
        >
          <Plus className="h-4 w-4" />
          {/* the label already carries its own ➕ glyph for the command bar — strip it here */}
          <span>{addLabel.replace(/^➕\s*/, '')}</span>
        </button>
      )}

      <ThemeToggle className="min-h-[40px] rounded-xl border border-border bg-card" />
      <UserChip />
    </div>
  );
}

export function mountHeaderActions(): boolean {
  return mount('sigma-header-actions', HeaderActionsPanel);
}
