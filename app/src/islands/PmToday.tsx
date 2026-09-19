// #sigma-pm-today — "היום שלי" (spec §7l). Task 26 fills the placeholder index.html left
// empty for Tasks 15/16: the person's own open 🔒 internal tasks, company-wide and at every
// kibbutz he owns work in. No EMS work here — that is Task 15/16's "היום שלי" card set; this
// island renders NOTHING (returns null) until it has rows, so it never shows an empty box on
// a role that has no internal tasks of his own.
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
  return mount('sigma-pm-today', PmToday);
}
