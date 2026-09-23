// The kibbutz modal's 🗓 ישיבות tab (spec §3.3, "Modal"): the SAME timeline as the card but
// with the whole history expanded, plus the two admin buttons.
//
// Task 1 left `#tab-meetings` as a legacy tab with an empty `#sigma-modal-meetings` slot in
// it. The legacy modal is opened and closed by js/src/10-activity.js, which only ever sets
// `data-kibbutz` on that slot — this island reads that attribute through a MutationObserver,
// so ONE React root serves every card instead of mounting and unmounting per open.
import { Skeleton } from '@/components/ui/skeleton';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { sigma, useCurrentUser } from '@/bridge';
import { MeetingTimeline, useMeetingNotes } from '@/components/home/MeetingNotes';
import { openImportSheet } from '@/islands/ImportNotes';
import { canImportNotes } from '@/lib/meetingNotes';
import { EmsGate } from '@/components/EmsGate';
import { useModalKibbutz } from '@/lib/modalSlot';

const SLOT_ID = 'sigma-modal-meetings';

function ModalMeetingsPanel() {
  const kibbutz = useModalKibbutz(SLOT_ID);
  const { name: user, role, isViewer } = useCurrentUser();
  const { data, isLoading } = useMeetingNotes();
  const admin = canImportNotes(!!sigma?.isAdmin?.(), isViewer);

  if (!kibbutz) return null;

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <h4 className="flex-1 text-[14px] font-bold">🗓 ישיבות · {kibbutz}</h4>
        {admin && (
          <button
            type="button"
            onClick={() => openImportSheet()}
            className="min-h-[36px] rounded-xl s-brand px-3 text-[12px] font-bold"
          >
            📥 ייבוא סיכום ישיבה
          </button>
        )}
        {!isViewer && (
          <button
            type="button"
            onClick={() => (window as any).sigmaHome?.openSheet?.(kibbutz)}
            className="min-h-[36px] rounded-xl border border-border px-3 text-[12px] font-bold"
          >
            ✏️ פרטי קיבוץ
          </button>
        )}
      </div>
      {isLoading && !data
        ? (
          <div className="flex flex-col gap-1.5" aria-busy="true">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-[34px] rounded-lg" />)}
          </div>
        )
        : <MeetingTimeline rows={data} kibbutz={kibbutz} canAct={!isViewer} expandAll />}
      {/* `user`/`role` are read so the panel re-renders on user-changed — the buttons above
          are role-gated and a changeUser() must take effect without reopening the modal. */}
      <span hidden data-user={user} data-role={role} />
    </div>
  );
}

export function ModalMeetings() {
  return (
    <SigmaProviders>
      <EmsGate>
        <ModalMeetingsPanel />
      </EmsGate>
    </SigmaProviders>
  );
}

export function mountModalMeetings(): boolean {
  return mount(SLOT_ID, ModalMeetings);
}
