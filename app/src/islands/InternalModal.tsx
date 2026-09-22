// 🔒 משימות פנימיות inside the kibbutz modal (עידן 22.9, D3): the rows WITH their actions
// (done, owner, promote to EMS) and the ➕ that opens the form. The card at home shows the
// same rows read-only. Same one-root-per-session contract as the meetings and burns slots:
// js/src/10-activity.js stamps `data-kibbutz` on #sigma-internal-modal.
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { useModalKibbutz } from '@/lib/modalSlot';
import { InternalTasksPanel } from '@/components/home/InternalTasks';
import { useCurrentUser } from '@/bridge';

const SLOT_ID = 'sigma-internal-modal';

function Panel() {
  const kibbutz = useModalKibbutz(SLOT_ID);
  const { isViewer } = useCurrentUser();
  if (!kibbutz) return null;
  return <InternalTasksPanel kibbutz={kibbutz} canAct={!isViewer} />;
}

export function InternalModal() {
  return (
    <SigmaProviders>
      <Panel />
    </SigmaProviders>
  );
}

export function mountInternalModal(): boolean {
  return mount(SLOT_ID, InternalModal);
}
