// Status blocks for meeting mode (package M, M-R7): burns and onboarding used to live on the
// kibbutz card and were removed from it (K); in the meeting they get their own small blocks —
// burns as "נותרו X מתוך Y", onboarding as its latest status. Pure — built entirely on the
// existing burns.ts / onboarding.ts rules, never re-deriving them.
import { burnCounts, burnsForSite, burnsProjectActive, type BurnRow } from '@/lib/burns';
import { isComplete, nextStep, progressOf, waitAge, type OnboardingStepRow } from '@/lib/onboarding';

export interface StatusBlocks {
  burns: { remaining: number; total: number; text: string } | null;
  onboarding: { label: string; next: string | null; waitingDays: number | null; done: boolean } | null;
  emsOpen: number;
  internalOpen: number;
}

/**
 * Unlike the card's own `burnChip` (emoji "🔥 נותרו X/Y"), this never goes null just because
 * every meter is already burned — in a meeting that IS the news, so it reads "הכול נצרב"
 * instead of quietly disappearing. It still goes null with no rows for the kibbutz, with the
 * project off, or when the viewer isn't in the burns audience (`burnsVisible`).
 */
function burnsBlock(rows: BurnRow[], site: string, visible: boolean): StatusBlocks['burns'] {
  if (!visible || !burnsProjectActive()) return null;
  const mine = burnsForSite(rows, site);
  if (!mine.length) return null;
  const c = burnCounts(mine);
  const remaining = c.pending + c.issue;
  return { remaining, total: c.total, text: remaining > 0 ? `נותרו ${remaining} מתוך ${c.total}` : 'הכול נצרב' };
}

function onboardingBlock(steps: OnboardingStepRow[], now: Date): StatusBlocks['onboarding'] {
  if (!steps.length) return null;
  const next = nextStep(steps);
  return {
    label: progressOf(steps).label,
    next: next ? (next.label || next.step_key) : null,
    waitingDays: next ? waitAge(next, now) : null,
    done: isComplete(steps),
  };
}

export function statusBlocks(i: {
  kibbutz: string; burns: BurnRow[]; burnsVisible: boolean; steps: OnboardingStepRow[];
  emsOpen: number; internalOpen: number; now: Date;
}): StatusBlocks {
  return {
    burns: burnsBlock(i.burns, i.kibbutz, i.burnsVisible),
    onboarding: onboardingBlock(i.steps, i.now),
    emsOpen: i.emsOpen,
    internalOpen: i.internalOpen,
  };
}
