// The header's right-hand cluster (spec §6 header, §7k.2 the one page action; round 5 L1 moved
// `runAdd` out of the command bar and dropped the Ctrl+K button — S-11).
//   the context page action · ● user chip (🌙 moved into ⚙️ הגדרות, 22.9)
//
// It replaces the legacy strip of six grey chips (👤 …, 🟢 EMS, 🔓 ישיבה, 🏘️ פוטנציאליים, …)
// as the place identity and settings live; the legacy chips that still have no React home
// (ישיבה, פוטנציאליים, סטטיסטיקה) stay where they are and are untouched.
import * as React from 'react';
import { Lightbulb, ListTodo, Settings, UserCog } from 'lucide-react';
import { MoreSheet } from '@/components/MoreSheet';
import { type SigmaRole as RegistryRole } from '@/lib/registry';
import { mount } from '@/islands';
import { sigma, useCurrentUser, useEmsConnected } from '@/bridge';
import { useClickAway } from '@/lib/useClickAway';
import { openSettings } from '@/lib/settings';
import { track } from '@/lib/track';
import { goHome } from '@/lib/navigate';
import { HEADER_LABELS } from '@/lib/shell';
import { MY_TASKS_TITLE, myTasksLabel } from '@/lib/myTasks';
import { useMyTasksCount } from '@/lib/myTasksBadge';

// ⚙️ gear bubble (round 5, S-3/S-4): the name chip's menu, moved off the boot-eager UserChip
// (which stays boot-eager via Nav → MoreSheet) and built here instead — this whole panel is
// already a lazy chunk, so growing it costs nothing against the 304 kB boot ceiling.
function GearMenuRow({
  icon: Icon, label, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full min-h-[48px] items-center gap-3 px-3 text-start text-[14px] text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
    </button>
  );
}

function GearBubble() {
  const connected = useEmsConnected();
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLSpanElement>(null);
  useClickAway(open, wrap, () => setOpen(false));
  const pick = (fn: () => void, what: string) => { setOpen(false); track('user-menu', what); fn(); };

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={HEADER_LABELS.settings}
        data-testid="header-gear"
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-secondary active:scale-[.97]"
      >
        <Settings className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <span aria-hidden className={'absolute h-2 w-2 rounded-full ' + (connected ? 'bg-brand-2' : 'bg-muted-foreground')} style={{ insetBlockStart: 6, insetInlineEnd: 6 }} />
      </button>
      {open && (
        <span role="menu" className="absolute top-full z-50 mt-1.5 flex w-[220px] flex-col overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg [inset-inline-end:0]">
          <GearMenuRow icon={Settings} label="הגדרות" onClick={() => pick(openSettings, 'settings')} />
          <GearMenuRow icon={Lightbulb} label="רעיון או באג" onClick={() => pick(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')), 'feedback')} />
          <span className="my-1 border-t border-border" />
          <GearMenuRow icon={UserCog} label="החלפת משתמש" onClick={() => pick(() => sigma.changeUser(), 'change-user')} />
        </span>
      )}
    </span>
  );
}

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
  const registryRole: RegistryRole = isViewer ? 'viewer' : role === 'idan' ? 'idan' : 'team';

  // Round 5 (S-5): the page action ("קיבוץ חדש", "דיווח מלאי", …) moved out of the header and
  // into its own compact row below it (PageBar, U3) — this cluster is Σ · 🔔 · ✅ · ⋯ · ⚙️ only,
  // so nothing here ever collides with a page title at 360px (S-8).
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Σ — goes to the role's landing page (S-2), same as tapping the wordmark used to feel
          like it should do but never did. */}
      <button
        type="button"
        aria-label={HEADER_LABELS.home}
        onClick={() => { track('home', 'header'); goHome(); }}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[17px] font-extrabold text-foreground/80 transition-colors hover:bg-secondary active:scale-[.97]"
      >
        <span aria-hidden>Σ</span>
      </button>

      {/* ✅ המשימות שלי — right next to the bell, on every screen size. */}
      <MyTasksButton me={user} />

      {/* S-9/S-10: ⋯ עוד on desktop too — the same sheet the phone's long press opens, so DEV
          and the meeting modes are reachable without a touch screen. */}
      <MoreSheet role={registryRole} user={user} variant="desktop" />

      {/* S-3/S-4: the name chip becomes a gear bubble; the menu behind it holds settings,
          feedback and the user switcher. */}
      <GearBubble />
    </div>
  );
}

export function mountHeaderActions(): boolean {
  return mount('sigma-header-actions', HeaderActionsPanel);
}
