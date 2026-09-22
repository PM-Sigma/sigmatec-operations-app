// First screen per role (spec §7l — APPROVED by עידן 18.9).
//
// "The first screen answers the one question that role asks every morning." The mapping is a
// PURE function of who is logged in and what he chose in ⚙️ הגדרות, so it is testable and so
// the same rule can feed Ctrl+K and the personal area later.
//
// What ships in Task 4 vs. what §7l promises: the PM's "היום שלי" card set (Tasks 15/16) and
// the CEO's "סקירה" table are not built yet, so pm and ceo land on קיבוצים — everything they
// need is there — and the two placeholders (#sigma-pm-today, #sigma-ceo) are mounted empty so
// those tasks have a home to render into without touching this file. The field role's arrival
// sheet is Task 5; `sigma.onLanding` is the hook it attaches to.
import { sigma, type SigmaPage, type SigmaRole } from '@/bridge';
import type { Landing, UserSettings } from '@/lib/settings';
import { VIEWER_NAME, isViewerToken } from '@/lib/people';
import { canShowPage } from '@/lib/canShowPage';

// The roster lives in one place; re-exported here because `roleOf` is what most callers
// already import when they need to reason about who someone is.
export { APP_PEOPLE, VIEWER_NAME, isViewerToken } from '@/lib/people';

/** The five people-shaped roles §7l reasons about (not the same axis as the PIN role). */
export type PersonRole = 'field' | 'pm' | 'dev' | 'ceo' | 'viewer';

/** The one landing that is not a page: the viewer's reports hub lives ON the kibbutz page. */
export type LandingTarget = { page: SigmaPage; scrollTo?: string };

const BY_NAME: Record<string, PersonRole> = {
  'עידן': 'pm',
  'עמיחי': 'ceo',
  'מתניה': 'dev',
  'אליה': 'dev',          // §7l explicitly: אליה = dev
  'אביאם': 'field',
  'ניתאי': 'field',
};

/**
 * Who is this, in §7l terms. The PIN role wins when it says `viewer` — that is a device-level
 * fact, not a guess from a name — and otherwise the name decides. An unknown name (a new hire
 * before he is added here) is treated as `field`: קיבוצים, which is where everyone starts and
 * the only landing that assumes nothing.
 */
export function roleOf(user: string, sigmaRole: SigmaRole | string | null | undefined): PersonRole {
  if (isViewerToken(sigmaRole)) return 'viewer';
  if (String(user ?? '').trim() === VIEWER_NAME) return 'viewer';
  return BY_NAME[String(user ?? '').trim()] || 'field';
}

/** The role default, before a personal override. */
export function defaultLanding(role: PersonRole): LandingTarget {
  switch (role) {
    case 'dev': return { page: 'dev' };
    case 'viewer': return { page: 'kibbutz', scrollTo: 'viewerReportsHub' };
    // field (arrival sheet — Task 5), pm (היום שלי — Task 15/16) and ceo (סקירה — later) all
    // start on the cards for now; §7l keeps 🏘 קיבוצים one tap away for every role anyway.
    case 'pm': case 'ceo': case 'field': default: return { page: 'kibbutz' };
  }
}

/** A stored `user_settings.landing` value mapped onto a target. `auto` = "ask the role". */
export function landingFromSetting(landing: Landing): LandingTarget | null {
  switch (landing) {
    case 'auto': return null;
    case 'reports': return { page: 'kibbutz', scrollTo: 'viewerReportsHub' };
    case 'kibbutz': case 'dev': case 'attendance': case 'calendar': case 'inventory':
      return { page: landing as SigmaPage };
    default: return null;
  }
}

/**
 * THE decision: where this person lands. A personal choice in ⚙️ הגדרות wins over the role
 * default; `canShow` (the legacy page gates) has the last word, because a landing the app
 * would refuse to open leaves the person looking at nothing.
 */
export function landingFor(
  role: PersonRole,
  user: string,
  settings?: Pick<UserSettings, 'landing'> | null,
  canShow: (page: SigmaPage) => boolean = () => true,
): LandingTarget {
  const chosen = settings ? landingFromSetting(settings.landing) : null;
  const target = chosen || defaultLanding(role);
  if (canShow(target.page)) return target;
  // The chosen page is gated for this person (e.g. dev landing after he lost the dev gate) —
  // fall back to the role default, and to the cards if that is gated too.
  const fallback = defaultLanding(role);
  return canShow(fallback.page) ? fallback : { page: 'kibbutz' };
}

/** Once per browser session — a person who navigated away must not be yanked back. */
const LANDED_KEY = 'sigma_landed_v1';

/**
 * Send the person to his first screen, once per session. Deliberately conservative:
 *  · a deep link in the URL (#usage, a push action) always wins — he asked for that screen;
 *  · a landing that resolves to the cards is a NO-OP, because the legacy boot already put him
 *    there, and calling showPage again would collapse anything he opened in the meantime;
 *  · `sigma.onLanding(target)` is the hook Task 5 attaches the arrival sheet to — it runs for
 *    every role, including the no-op case, so the field flow gets its call either way.
 */
export function applyLanding(settings?: Pick<UserSettings, 'landing'> | null): LandingTarget | null {
  let landed = false;
  try { landed = sessionStorage.getItem(LANDED_KEY) === '1'; } catch { /* private mode */ }
  if (landed) return null;
  try { sessionStorage.setItem(LANDED_KEY, '1'); } catch { /* private mode */ }

  if (typeof location !== 'undefined' && location.hash && location.hash.length > 1) return null;

  const user = (() => { try { return sigma?.getCurrentUser?.() || ''; } catch { return ''; } })();
  if (!user) return null;                       // nobody logged in yet — the gate lands him
  const role = roleOf(user, (() => { try { return sigma?.getRole?.() || ''; } catch { return ''; } })());
  const target = landingFor(role, user, settings, canShowPage);

  try {
    if (target.page !== 'kibbutz') sigma.showPage(target.page);
    if (target.scrollTo) {
      // After the page swap paints, not before.
      setTimeout(() => document.getElementById(target.scrollTo!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  } catch (e) { console.warn('[sigma] landing failed', e); }

  try { (sigma as any)?.onLanding?.(target, role); } catch { /* the hook is optional (Task 5) */ }
  return target;
}

// ───────────────────────────── bottom nav tab order (phone QA round 2, package A §3) ─────────────────────────────

/**
 * The bar's five slots for a non-viewer, phone only. Two people-shaped exceptions
 * (אביאם · ניתאי — the field leads who chase everyone else's נוכחות) get their own order;
 * everyone else gets the default. Pure function of (role, user) so it is one golden test —
 * Nav.tsx just renders whatever comes back, in order.
 */
export type NavTabId = 'attendance' | 'kibbutz' | 'calendar' | 'visit' | 'inventory' | 'more';

const FIELD_LEAD_NAMES = ['אביאם', 'ניתאי'];

/** True for the two people whose bar swaps מלאי for נוכחות (and drops קיבוצים to the end). */
export function isFieldLead(user: string): boolean {
  return FIELD_LEAD_NAMES.indexOf(String(user || '').trim()) !== -1;
}

/**
 * `role` is accepted (not just `user`) so the function reads the same way every other §7l
 * rule does — even though today only the name decides. The viewer bar (קיבוצים · דוחות · עוד)
 * is a different shape entirely and stays hardcoded in Nav.tsx.
 */
export function navTabsFor(role: PersonRole, user: string): NavTabId[] {
  void role;
  if (isFieldLead(user)) return ['attendance', 'calendar', 'visit', 'kibbutz', 'more'];
  return ['kibbutz', 'calendar', 'visit', 'inventory', 'more'];
}

/** Whether the ⋯ עוד sheet should put מלאי as the FIRST row (field leads only — F4/A3). */
export function moreLeadsWithInventory(user: string): boolean {
  return isFieldLead(user);
}
