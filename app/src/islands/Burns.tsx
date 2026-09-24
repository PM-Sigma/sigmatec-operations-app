// 🔥 צריבות — the temporary meter-burn project's one remaining root (round 5, K-U4):
//
//   #sigma-burns        the progress strip above the cards — one row, "בוצעו X מתוך Y",
//                       always opens the burns page (K1). Never on a kibbutz card, closed or
//                       open (K2) — the kibbutz-modal section (#sigma-burns-modal /
//                       BurnsModal / BurnsPanel) is retired with this task; the legacy DOM
//                       node itself goes with K-U5's modal deletion.
//
// The briefing's rows are built by lib/burns.ts and rendered by islands/Field.tsx. Both read
// the same ['meterBurns'] key.
//
// Nothing here is a permanent part of the app: `BURNS_PROJECT_ACTIVE = false`
// (js/src/24-meter-burns.js) makes it render null while the data stays.
import { BurnsStrip, openBurnsTable } from '@/components/home/Burns';
import { canSeeBurns } from '@/lib/burns';
import { registerMoreItem } from '@/lib/registry';
import { useEffect } from 'react';
import { sigma } from '@/bridge';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { isGateOpen, useEmsGate } from '@/lib/session';

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

/** Called from main.tsx's lazy import. */
export function mountBurns(): boolean {
  return mount('sigma-burns', BurnsLanding);
}
