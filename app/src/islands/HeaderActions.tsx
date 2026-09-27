// The header's right-hand cluster (spec §6 header, §7k.2 the one page action; round 5 L1 moved
// `runAdd` out of the command bar and dropped the Ctrl+K button — S-11).
//   ✅ המשימות שלי · ⋯ עוד (desktop) · ⚙️ (opens GearSheet, U2)
//
// Round 5 U1 (designer review): Σ is NOT a chip here any more — the brand-mark in index.html
// IS the home button ("one Σ only"), wired via window.sigmaGoHome (main.tsx). The three chips
// left (🔔 lives in its own island, ✅, ⚙️) are all the SAME IconBubble — identical 48px
// circle, identical radius, 8px gap — instead of three different hand-rolled buttons.
//
// It replaces the legacy strip of six grey chips (👤 …, 🟢 EMS, 🔓 ישיבה, 🏘️ פוטנציאליים, …)
// as the place identity and settings live; the legacy chips that still have no React home
// (ישיבה, פוטנציאליים, סטטיסטיקה) stay where they are and are untouched.
import * as React from 'react';
import '@/shell/shell.css';
import { ListTodo, Settings } from 'lucide-react';
import { IconBubble } from '@/components/ui/icon-bubble';
import { MoreSheet } from '@/components/MoreSheet';
import { GearSheet, openGearSheet } from '@/shell/GearSheet';
import { AlertsBellSlot } from '@/islands/Alerts';
import { type SigmaRole as RegistryRole } from '@/lib/registry';
import { mount } from '@/islands';
import { useCurrentUser } from '@/bridge';
import { track } from '@/lib/track';
import { goHome } from '@/lib/navigate';
import { HEADER_LABELS } from '@/lib/shell';
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
    // IconBubble does not forward data-testid (DS-owned, not S's to edit) — wrapped in a span
    // instead, same fallback the U1 spec names.
    <span data-testid="header-my-tasks" title={MY_TASKS_TITLE}>
      <IconBubble
        size={48}
        icon={<ListTodo className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        badge={count || undefined}
        badgeTestId="header-my-tasks-badge"
        label={myTasksLabel(count)}
        className="text-muted-foreground"
        onClick={() => {
          track('my-tasks-open', 'header');
          try { window.dispatchEvent(new CustomEvent(MY_TASKS_OPEN_EVENT)); } catch { /* no DOM */ }
        }}
      />
    </span>
  );
}

export function HeaderActionsPanel() {
  const { name: user, role, isViewer } = useCurrentUser();
  const registryRole: RegistryRole = isViewer ? 'viewer' : role === 'idan' ? 'idan' : 'team';

  // Round 5 (S-5): the page action ("קיבוץ חדש", "דיווח מלאי", …) moved out of the header and
  // into its own compact row below it (PageBar, U3) — this cluster is 🔔 · ✅ · ⋯ · ⚙️ only
  // (Σ lives in the static brand-mark), so nothing here ever collides with a page title at
  // 360px (S-8).
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* 🔔 התראות — U4: on DS parts, in this cluster now (no separate #sigma-alerts mount). */}
      <AlertsBellSlot />

      {/* ✅ המשימות שלי — right next to the bell, on every screen size. */}
      <MyTasksButton me={user} />

      {/* S-9/S-10: ⋯ עוד on desktop too — the same sheet the phone's long press opens, so DEV
          and the meeting modes are reachable without a touch screen. */}
      <MoreSheet role={registryRole} user={user} variant="desktop" />

      {/* S-3/S-4: the name chip becomes a gear bubble opening a real Sheet (GearSheet, U2) —
          identity/role, settings, install, feedback, האזור האישי and the user switcher. No
          absolute status dot on the chip: the EMS connection state moved into the sheet's
          identity row as an ordinary Tag. */}
      <span data-testid="header-gear">
        <IconBubble
          size={48}
          icon={<Settings className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          label={HEADER_LABELS.settings}
          onClick={() => { track('gear-open', 'header'); openGearSheet(); }}
        />
      </span>
      <GearSheet />
    </div>
  );
}

export function mountHeaderActions(): boolean {
  // Σ (index.html's brand-mark) calls this — kept out of the BOOT-eager main.tsx so a home
  // button nobody has tapped yet costs nothing against the 304 kB ceiling; the static markup's
  // own fallback (`window.showPage('kibbutz')`) covers the gap before this chunk lands.
  (window as any).sigmaGoHome = goHome;
  return mount('sigma-header-actions', HeaderActionsPanel);
}
