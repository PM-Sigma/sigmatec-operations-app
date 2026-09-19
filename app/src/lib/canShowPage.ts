// ONE page gate for the React shell (audit A · A3).
//
// `js/src/00-bridge.js`'s `canShowPage()` is the single answer to "may this person open this
// page" — it is what `showPage()` itself enforces and what the legacy desktop nav obeys. Every
// React surface that offers a page (the bottom tab bar, the ⋯ sheet, Ctrl+K, the landing
// resolver, the ⚙️ landing picker) must ask THAT function and nothing else: the מלאי tab used
// to be rendered unconditionally, so מתניה — who `canShowPage('inventory')` says no to — had a
// tab that bounced her straight back to 🏘 קיבוצים.
//
// A throwing/absent bridge means "no", never a silently-open page.
import { sigma, type SigmaPage } from '@/bridge';

export function canShowPage(page: SigmaPage): boolean {
  try { return !!sigma.canShowPage(page); } catch { return false; }
}
