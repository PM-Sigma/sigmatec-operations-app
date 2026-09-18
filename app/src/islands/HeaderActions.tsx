// The header's right-hand cluster (spec §6 header, §7k #12 search, §7k.2 the one ➕):
//   🔍 חיפוש (desktop — opens Ctrl+K) · the context ➕ · 🌙/☀️ · ● user chip
//
// It replaces the legacy strip of six grey chips (👤 …, 🟢 EMS, 🔓 ישיבה, 🏘️ פוטנציאליים, …)
// as the place identity and settings live; the legacy chips that still have no React home
// (ישיבה, פוטנציאליים, סטטיסטיקה) stay where they are and are untouched.
import * as React from 'react';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserChip } from '@/components/UserChip';
import { mount } from '@/islands';
import { useCurrentUser } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';
import { roleOf } from '@/lib/landing';
import { canManageKibbutzim } from '@/lib/kibbutzim';
import { primaryAdd, primaryAddLabel, primaryAddOpensForm } from '@/lib/primaryAdd';
import { openCommandBar, runAdd } from '@/islands/CommandBar';
import { track } from '@/lib/track';

function HeaderActionsPanel() {
  const { name: user, role, isViewer } = useCurrentUser();
  const page = useCurrentPage();
  const personRole = roleOf(user, role);
  const add = primaryAdd(page, personRole, { canManageKibbutzim: canManageKibbutzim(user, isViewer) });
  const addLabel = primaryAddLabel(add);
  // A ➕ is a promise that something is created right here; a navigation action gets an arrow
  // and its own wording instead (review fix 5).
  const addCreates = primaryAddOpensForm(add);

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
          {addCreates
            ? <Plus className="h-4 w-4" />
            /* ArrowLeft points to the INLINE START inside this RTL container, i.e. forward */
            : <ArrowLeft className="h-4 w-4" />}
          {/* the label carries its own ➕ glyph for the command bar — strip it here */}
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
