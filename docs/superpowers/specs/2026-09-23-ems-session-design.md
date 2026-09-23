# EMS session: signed in = connected, lapse = freeze (23.9.2026)

STATUS: 🟡 BUILT on `r8/pkg-D` (not pushed). Base `origin/main` 19fcb84 (2.25).

## The ruling (עידן, 23.9)
No place in the app offers "link / connect to EMS" as a step. Every user except the viewer signs in with
their EMS user, and from then on everything is connected. When the connection expires the app FREEZES and
forces a fresh sign-in. The viewer (PIN entry, no EMS account) is unchanged.

## 1. Inventory: surfaces that treated EMS as an optional connection (before this change)
| Surface | What it offered / said | Now |
|---|---|---|
| `app/src/components/EmsGate.tsx` (wraps every island: Home, Burns, Usage, FeedbackInbox, Calendar, DevPresenter, …) | an expired staff session rendered `LoginRequired` per island ("כדי לראות את זה צריך להתחבר ל-EMS") | staff: empty frozen frame + the one blocking re-login; viewer keeps the card |
| `app/src/components/LoginRequired.tsx` | title "…להתחבר ל-EMS" | "כדי לראות את זה צריך להתחבר" (viewer only) |
| `app/src/components/UserChip.tsx` | menu row "התחבר ל-EMS" / "מחובר ל-EMS · ניתוק" | row removed |
| `app/src/islands/Settings.tsx` (⚙️ הגדרות, personal area) | "מחובר ל-EMS / לא מחובר ל-EMS" | removed |
| `index.html` `#emsBubble` + `js/src/11-search-login.js` `updateEmsBubble` | 🟢/🔴 "מחובר / אין חיבור ל-EMS", tap to connect | plain "↗ EMS" link to the EMS system; a dead session goes to the freeze |
| `js/src/13-ems.js` | cached task detail "התחבר ל-EMS (טאב 📋 EMS משימות)…", alert "התחבר ל-EMS לצפייה מלאה", queue modal "ממתינות לחיבור" | neutral copy ("ייטענו כשהחיבור יחזור", "ממתינות לשליחה") |
| `js/src/12-reports.js` `emsRequireLogin` | modal "החיבור ל-EMS נותק" (🔌) | "נדרשת התחברות מחדש", above every overlay; normally routed to ReLoginSheet |
| `js/src/14-calendar.js`, `18-dev-tasks.js`, `24-meter-burns.js` | "יש להתחבר ל-EMS כדי…", "אין חיבור ל-EMS. התחבר…" | `sigmaSessionLost()` → freeze |
| `app/src/lib/devBoard.ts`, `islands/FeedbackInbox.tsx`, `islands/Usage.tsx`, `lib/speech.ts`, `lib/supabase.ts`, `components/home/Burns.tsx`, `home/MeetingNotes.tsx` | "יש להתחבר ל-EMS כדי…", "דורש חיבור ל-EMS", "אין חיבור ל-EMS, המשימה בתור" | `sessionLost()` / `SESSION_LOST_MSG` ("ההתחברות פגה. צריך להתחבר מחדש") or neutral copy |
| `js/src/15-login-gate.js` | the sign-in itself (EMS credentials) and the returning-session re-login on open | unchanged: this IS the one sign-in |
| `js/src/01-data.js` write retry | "יש להתחבר מחדש ל-EMS כדי לשמור" | "השמירה לא עברה. ההתחברות פגה, צריך להתחבר מחדש" |

## 2. Expiry behaviour
- Pure rule `expiryDecision()` in `app/src/lib/session.ts` → `ok | remint | freeze`:
  mock / cert link / viewer / mint in flight / never signed in → `ok`; EMS token gone → `freeze`;
  EMS live but pass lapsed → `remint` (silent, `sigma.remintOnce`); a 401 (not 42501) or 403 PGRST301 →
  `remint` if EMS is live, else `freeze`. `shouldFreeze(gateState, role)` for the island gate.
- Detection: `sessionAwareFetch` 401s (existing), `EmsGate` seeing `expired`, surfaces with no token
  (`sessionLost()` / `window.sigmaSessionLost()`), and a watcher (`checkSession` in ReLoginSheet.tsx) on
  focus, on return to the tab and once a minute.
- One funnel: `notifySessionExpired` → `ReLoginSheet` (single instance). Full screen (`100dvh`),
  `z-index: 2147483000` above every legacy modal and sheet, no close button, Esc / outside tap ignored.
  What is underneath stays mounted, so drafts and half-typed fields survive; the CTA hands over to the sign-in
  gate, which restores page + scroll + draft (existing F13 path).

## 3. Site-unlinked warning (data, not connection)
Stays. One rule on both sides: linked iff the `kibbutzim` row's `ems_site_ids` is non-empty (blanks ignored,
JSON string tolerated). Card chip `applyCardSiteWarnings` (13-ems.js) uses `emsIdsUnlinked` (01-data.js);
bell `emsUnlinkedGroup` uses `isUnlinked` / `siteIdsOf` (lib/kibbutzim.ts).

## 4. Tests
- vitest goldens: `session.test.ts` (`expiryDecision`, `shouldFreeze`), `kibbutzim.test.ts` (rule parity),
  `Usage.test.tsx` (new copy); legacy `test-site-indicator.mjs`, `test-calendar-legacy.mjs`.
- Playwright `ems-session.spec.ts`: pass + EMS token expire mid-session → one blocking full-screen re-login,
  not dismissable, typed text + saved draft survive; sweep: no connect-to-EMS copy for staff.
  `session-gate.spec.ts` and `nav-shell.spec.ts` updated for the removed card / menu row.
