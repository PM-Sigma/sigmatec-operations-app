// Page changes from the shell (Σ, the nav, ⋯ עוד, the back chevron). The motion lives in
// shell.css (tools-and-motion §2.2 #1–2); this only picks the kind and runs showPage ONCE.
import { sigma, type SigmaPage } from '@/bridge';
import { landingFor, roleOf, type LandingTarget } from '@/lib/landing';
import { getSettings } from '@/lib/settings';
import { canShowPage } from '@/lib/canShowPage';

export type NavKind = 'peer' | 'drill' | 'back';

const reduced = (): boolean => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
};

export function go(page: SigmaPage, kind: NavKind = 'peer'): void {
  let ran = false;
  const run = () => { if (!ran) { ran = true; sigma.showPage(page); } };
  const vt = (document as any).startViewTransition as undefined | ((cb: () => void) => unknown);
  if (!vt || reduced()) { run(); return; }
  document.documentElement.dataset.nav = kind;
  try { vt.call(document, run); } catch { run(); }
}

export function goHome(): LandingTarget {
  const user = sigma.getCurrentUser?.() || '';
  const target = landingFor(roleOf(user, sigma.getRole?.()), user, getSettings(), canShowPage);
  go(target.page, 'peer');
  if (target.scrollTo) {
    setTimeout(() => document.getElementById(target.scrollTo!)?.scrollIntoView({ block: 'start' }), 80);
  }
  return target;
}

// The same "חזרה" the legacy inner pages use (02-init-attendance.js:119 `pageBack`: the page
// before this one, else the cards), so the chevron and the phone's Back agree.
export function goBack(): void {
  const pb = (window as any).pageBack;
  if (typeof pb === 'function') { pb(); return; }
  goHome();
}
