// The page action's dispatcher. Lived in islands/CommandBar.tsx until round 5: the command bar
// is being removed (package X), the page-action row is not.
import { sigma } from '@/bridge';
import type { AddAction } from '@/lib/primaryAdd';

/** The 📍 path: the field arrival sheet, then the manual chapters sheet, then the legacy form. */
export function openVisit(): void {
  try {
    const field = (window as any).sigmaField;
    if (field?.maybeOpen?.()) return;
    if (field?.openManual?.()) return;
  } catch { /* no field island */ }
  sigma.openVisitQuick();
}

export function runAdd(action: AddAction): void {
  switch (action) {
    case 'kibbutz': {
      const home = (window as any).sigmaHome;
      if (home?.openSheet) home.openSheet();
      else sigma.toast('הוספת קיבוץ זמינה בעמוד הקיבוצים');
      return;
    }
    case 'schedule': case 'event': sigma.showPage('calendar'); return;
    case 'stockChange':
      sigma.showPage('inventory');
      window.dispatchEvent(new CustomEvent('sigma-open-stock-change', { detail: { product: '' } }));
      return;
    case 'visit': openVisit(); return;
    case 'feedback': window.dispatchEvent(new CustomEvent('sigma-open-feedback')); return;
    default: return;
  }
}
