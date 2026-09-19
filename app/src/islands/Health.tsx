// מצב הקיבוץ — the health strip's root (Task 28, company-process spec §5).
//
//   #sigma-health-modal   the strip inside the kibbutz modal. Same contract as the meetings
//                         and צריבות slots: js/src/10-activity.js stamps `data-kibbutz` on the
//                         slot and ONE root serves every card for the whole session.
//
// The mount also publishes `sigma.presenterStrip`, which ▶ מצב ישיבה (Task 24) reads through
// the bridge if it happens to be there. That direction is deliberate: the presenter has no
// import of this file and no dependency on this task.
import { HealthStrip, presenterStripFor } from '@/components/home/HealthStrip';
import { sigma } from '@/bridge';
import { useModalKibbutz } from '@/lib/modalSlot';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';

const SLOT_ID = 'sigma-health-modal';

function HealthModalPanel() {
  const kibbutz = useModalKibbutz(SLOT_ID);
  if (!kibbutz) return null;
  return <HealthStrip kibbutz={kibbutz} />;
}

export function HealthModal() {
  return (
    <SigmaProviders>
      <EmsGate>
        <HealthModalPanel />
      </EmsGate>
    </SigmaProviders>
  );
}

/** Called from main.tsx's lazy import. */
export function mountHealth(): boolean {
  try {
    (sigma as unknown as { presenterStrip?: (k: string) => unknown }).presenterStrip = presenterStripFor;
  } catch { /* no bridge on this page */ }
  return mount(SLOT_ID, HealthModal);
}
