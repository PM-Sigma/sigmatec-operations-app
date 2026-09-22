// 🔥 צריבות — the two roots of the temporary meter-burn project (Task 23):
//
//   #sigma-burns-modal  the "🔥 צריבות" section inside the kibbutz modal. Like the meetings
//                       tab, ONE root serves every card: js/src/10-activity.js stamps
//                       `data-kibbutz` on the slot and the island observes that attribute.
//   #sigma-burns        the progress strip above the cards — work for the field team,
//                       progress for everyone else (עידן 18.9 21:50).
//
// The card chip is rendered by KibbutzCard (components/home/Burns.tsx), and the briefing
// rows by islands/Field.tsx. All four read the same ['meterBurns'] key.
//
// Nothing here is a permanent part of the app: `BURNS_PROJECT_ACTIVE = false`
// (js/src/24-meter-burns.js) makes every one of these render null while the data stays.
import { BurnsPanel, BurnsStrip, openBurnsTable, useBurnAccess } from '@/components/home/Burns';
import { canSeeBurns } from '@/lib/burns';
import { registerMoreItem } from '@/lib/registry';
import { useEffect } from 'react';
import { sigma } from '@/bridge';
import { useModalKibbutz } from '@/lib/modalSlot';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { isGateOpen, useEmsGate } from '@/lib/session';

const SLOT_ID = 'sigma-burns-modal';

function BurnsModalPanel() {
  const kibbutz = useModalKibbutz(SLOT_ID);
  const { canSee } = useBurnAccess();
  if (!kibbutz || !canSee) return null;
  return <BurnsPanel kibbutz={kibbutz} />;
}

export function BurnsModal() {
  return (
    <SigmaProviders>
      <EmsGate>
        <BurnsModalPanel />
      </EmsGate>
    </SigmaProviders>
  );
}

function BurnsStripGated() {
  const gate = useEmsGate();
  // §7n: no sign-in, no content — and this strip sits ABOVE the cards, which already show
  // the sign-in card, so a closed gate means "render nothing", not a second login box.
  if (!isGateOpen(gate)) return null;
  return <BurnsStrip />;
}

export function BurnsLanding() {
  return <SigmaProviders><BurnsLandingWithRow /></SigmaProviders>;
}

/**
 * ⋯ עוד → 🔥 צריבות. The full table, the Excel report and the generators helper are one
 * screen, and this row plus the strip's "הכול ›" are the only two ways to it — the project
 * never earns a nav tab. `visible` is asked LIVE, so a changeUser() (or the flag going
 * false) takes the row away without a reload.
 */
function useBurnsMoreRow(): void {
  useEffect(() => {
    registerMoreItem({
      id: 'burns-table',
      label: 'צריבות מונים',
      icon: 'Flame',
      group: 'app',
      visible: () => {
        try { return canSeeBurns(sigma?.getCurrentUser?.() || '', !!sigma?.isViewer?.()); }
        catch { return false; }
      },
      onSelect: openBurnsTable,
    });
  }, []);
}

/** The strip's root also owns the ⋯ row — one mount, one registration. */
function BurnsLandingWithRow() {
  useBurnsMoreRow();
  return <BurnsStripGated />;
}

/** Called from main.tsx's lazy import. Two roots, one chunk: they share the query cache. */
export function mountBurns(): boolean {
  const a = mount(SLOT_ID, BurnsModal);
  const b = mount('sigma-burns', BurnsLanding);
  return a || b;
}
