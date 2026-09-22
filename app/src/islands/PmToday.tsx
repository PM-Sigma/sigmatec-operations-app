// #sigma-my-tasks — "היום שלי" (spec §7l; Task 26). The person's own open 🔒 internal tasks,
// company-wide and at every kibbutz he owns work in. No EMS work here — that is Task 15/16's
// "היום שלי" card set; this island renders NOTHING (returns null) until it has rows, so it
// never shows an empty box on a role that has no internal tasks of his own.
//
// Package O §4 (22.9 round 3): renamed from `#sigma-pm-today` — `MyInternalTasks` now renders
// itself as a fixed, collapsible strip above the bottom bar on every module (not only the
// kibbutz page), so the mount point moved next to `#sigma-nav` in index.html.
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { useCurrentUser } from '@/bridge';
import { MyInternalTasks } from '@/components/home/InternalTasks';

function PmTodayIsland() {
  const { name, role } = useCurrentUser();
  if (!name) return null;
  const isViewer = role === 'viewer';
  return <MyInternalTasks person={name} canAct={!isViewer} />;
}

export function PmToday() {
  return (
    <SigmaProviders>
      <PmTodayIsland />
    </SigmaProviders>
  );
}

export function mountPmToday(): boolean {
  return mount('sigma-my-tasks', PmToday);
}
