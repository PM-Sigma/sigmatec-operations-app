// 👥 THE ROSTER — one list of people, one spelling per identity (audit A · A4/A5/A12).
//
// Before this file there were four person lists (the login roster in `index.html`, `EMS_USERS`
// in `js/src/11-search-login.js`, `MEETING_PEOPLE` in `meetingNotes.ts`, `STAFF_PEOPLE` in
// `js/src/00-bridge.js`) with four different memberships, and two Hebrew spellings for the
// view-only identity. Adding a person meant editing four places and nobody noticed when one
// was missed — אליה could not be sent a message at all.
//
// The legacy half mirrors this as `window.APP_PEOPLE` / `window.VIEWER_NAME`
// (`js/src/00-bridge.js`); `test-roster.mjs` asserts every copy agrees, so the mirror cannot
// drift silently.

/** Everyone who can sign in, in the order the login screen offers them. */
export const APP_PEOPLE = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה'] as const;

export type PersonName = (typeof APP_PEOPLE)[number];

/**
 * The view-only identity, as it is actually STORED (`dashboard_user_v1`, written by
 * `js/src/15-login-gate.js`). Every by-name viewer check compares against this constant —
 * the old second spelling `'צופה'` was never stored, so every check written against it was
 * dead code that looked alive.
 */
export const VIEWER_NAME = 'צפייה';

/** True for the PIN role token or for the stored viewer name. */
export function isViewerToken(role?: string | null): boolean {
  const r = String(role ?? '').trim();
  return r === 'viewer' || r === VIEWER_NAME;
}
