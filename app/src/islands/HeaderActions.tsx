// The header's right-hand cluster (spec §6 header, §7k.2 the one page action; round 5 L1 moved
// `runAdd` out of the command bar and dropped the Ctrl+K button — S-11).
//   the context page action · ● user chip (🌙 moved into ⚙️ הגדרות, 22.9)
//
// It replaces the legacy strip of six grey chips (👤 …, 🟢 EMS, 🔓 ישיבה, 🏘️ פוטנציאליים, …)
// as the place identity and settings live; the legacy chips that still have no React home
// (ישיבה, פוטנציאליים, סטטיסטיקה) stay where they are and are untouched.
import * as React from 'react';
import { ArrowLeft, ListTodo, Plus } from 'lucide-react';
import { UserChip } from '@/components/UserChip';
import { mount } from '@/islands';
import { useCurrentUser } from '@/bridge';
import { useCurrentPage } from '@/lib/currentPage';
import { roleOf } from '@/lib/landing';
import { canManageKibbutzim } from '@/lib/kibbutzim';
import { primaryAdd, primaryAddLabel, primaryAddOpensForm } from '@/lib/primaryAdd';
import { runAdd } from '@/lib/runAdd';
import { track } from '@/lib/track';
import { MY_TASKS_TITLE, myTasksLabel } from '@/lib/myTasks';
import { useMyTasksCount } from '@/lib/myTasksBadge';

// ✅ המשימות שלי (round 4, Package X) — the button that replaced the floating strip. It sits
// next to the bell because both answer the same question ("what needs me?"), and it carries
// the open count. The RAW event, not an import of the island: the sheet is a lazy chunk and
// main.tsx loads it on the first tap, exactly as ⋯ עוד's rows are loaded.
const MY_TASKS_OPEN_EVENT = 'sigma-open-my-tasks';

function MyTasksButton({ me }: { me: string }) {
  const count = useMyTasksCount(me);
  if (!me) return null;
  return (
    <button
      type="button"
      data-testid="header-my-tasks"
      aria-label={myTasksLabel(count)}
      title={MY_TASKS_TITLE}
      onClick={() => {
        track('my-tasks-open', 'header');
        try { window.dispatchEvent(new CustomEvent(MY_TASKS_OPEN_EVENT)); } catch { /* no DOM */ }
      }}
      className="relative inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
    >
      <ListTodo className="h-[18px] w-[18px]" aria-hidden />
      {count > 0 ? (
        <span
          data-testid="header-my-tasks-badge"
          // text-[var(--s-on-brand)], not text-white (designer confirm round, item 1): white on
          // --brand-2 measured 2.4:1. --s-on-brand is verified (test-design-tokens.mjs) to clear
          // 4.5:1 on both brand-1 and brand-2.
          className="absolute -top-1 min-w-[18px] rounded-full bg-[color:var(--brand-2)] px-1 text-center text-[10px] font-bold leading-[18px] text-[var(--s-on-brand)]"
          style={{ insetInlineStart: '-4px' }}
        >
          <bdi>{count}</bdi>
        </span>
      ) : null}
    </button>
  );
}

export function HeaderActionsPanel() {
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
      {/* ✅ המשימות שלי — right next to the bell, on every screen size. */}
      <MyTasksButton me={user} />

      {/* §7k.2 / S-11: the 🔍 חיפוש · Ctrl+K button is gone (round 5, package X removes the
          command bar itself). rendered ONLY when the page has something to add, and the label
          always says what it does — never a bare plus. "קיבוץ חדש" (add === 'kibbutz') is
          desktop-only: the phone header has no room for it and the row is already in ⋯ עוד
          (Home.tsx registers it there for canManage) — Package A §2. Every other add action
          keeps showing on the phone too. */}
      {addLabel && (
        <button
          type="button"
          onClick={() => { track('primary-add', add); runAdd(add); }}
          className={
            'items-center gap-1.5 rounded-xl s-brand px-3 text-[13px] font-bold transition-transform active:scale-[.97] min-h-[40px] '
            + (add === 'kibbutz' ? 'hidden md:inline-flex' : 'inline-flex')
          }
        >
          {addCreates
            ? <Plus className="h-4 w-4" />
            /* ArrowLeft points to the INLINE START inside this RTL container, i.e. forward */
            : <ArrowLeft className="h-4 w-4" />}
          <span>{addLabel}</span>
        </button>
      )}

      <UserChip />
    </div>
  );
}

export function mountHeaderActions(): boolean {
  return mount('sigma-header-actions', HeaderActionsPanel);
}
