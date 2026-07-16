# Viewer role tightening — design

> **STATUS: 🟡 OPEN — spec approved-in-review, NOT built.** Resume point: implement the 2 edits in
> the Implementation section, `node build.mjs`, verify with PIN `0540`, then log to CHANGELOG/backlog/INDEX.
> Nothing shipped yet — no CHANGELOG entry exists on purpose.

**Date:** 2026-07-16 · **Branch:** `dev` · **Type:** small UI-gating change

## Goal

The view-only user (`role = viewer`, PIN `0540`, `isViewer()` in `js/src/11-search-login.js`)
currently lands on the full home page. עידן wants the viewer's home stripped down to the navy
header only, and one nav item removed. Everything the viewer keeps is already reachable.

## Scope

Reuse the existing `body.user-viewer` class (already toggled in `updateUserBadge()` →
`js/src/11-search-login.js:161`). No new role logic, no new state.

### Nav bar — viewer keeps 4 buttons
Keep: 🏠 דף הבית · 📦 מלאי · 📅 נוכחות · 🗓️ יומן.
Hide: ✅ משימות (`#navMyTasks`) — *"משימות לא נדרש"*.
(EMS / עובדים / פיתוח are already hidden for viewers.)

### Home page (`#kibbutz-view`) — viewer keeps only the navy header

| Block | Selector | Viewer |
|-------|----------|--------|
| Navy header + progress bar (**הבלון הראשי**) | `.header` | keep |
| Compact toggle 📱 (blue-balloon toggle) | `#compactToggle` | hide |
| Urgent alert 🚨 | `#urgentAlert` | hide |
| Search + filter chips | `.filter-bar` | hide |
| 📌 משימות חברה כלליות (**משימות**) | `.company-tasks` | hide |
| Kibbutz status cards (**כרטיסי קיבוצים**) | `#kibbutz-view .section` | hide |

**"בלון סיכום ביקור":** the only visit-summary UI is the visit FAB + its form, already hidden
for viewers. Nothing to do.

## 📊 Reports hub on the viewer's home (added 2026-07-16, עידן)

The freed home space gets a viewer-only **הפקת דוחות** card — every aggregate report producible
from one place, no module-hopping:

| Row | Actions | Reuses |
|-----|---------|--------|
| 📍 דוח ביקורי שטח | 📄 PDF · 📗 Excel | `openVisitsReportModal` / visits-report flow |
| 📅 דוח נוכחות חודשית (בחירת עובד+חודש) | 📄 · 📗 | attendance report + person toggle |
| 🚚 דוח תעודות משלוח (טווח) | 📄 · 📗 | `certRangeReport` |
| 🧾 סיכום חודשי תעודות | 📄 · 📗 | `certMonthlyFromTab` |
| 📦 מלאי לפי מיקום · 🏘 מלאי לפי קיבוץ | 📗 | inventory export paths |

- Hidden `<div id="viewerReportsHub">` in `index.html`, shown via `body.user-viewer` CSS.
- 📗 buttons come from the Excel-exports spec (2026-07-16-viewer-excel-exports-design.md) —
  the two features ship together, one test loop.

## Viewer modules = strictly read-only (added 2026-07-16, עידן)

Nav keeps 📦 מלאי · 📅 נוכחות · 🗓️ יומן as browsable pages, but **every action button is hidden**
for viewer — no update/edit of anything. Writes are already hard-blocked in the Supabase router;
this makes the UI match. At build time, sweep each view and hide under `body.user-viewer`:
inventory (new order/approve/status/adjust/accessory buttons; cert actions already `vw`-flagged),
attendance (save/edit day entries), calendar (any add/edit affordances), plus any FAB remnants.
Export/report buttons inside modules may stay (read-only actions).

## Implementation

1. **`css/app.css`** — viewer rule block:
   ```css
   body.user-viewer #compactToggle,
   body.user-viewer #urgentAlert,
   body.user-viewer .filter-bar,
   body.user-viewer .company-tasks,
   body.user-viewer #kibbutz-view .section { display: none !important; }
   body:not(.user-viewer) #viewerReportsHub { display: none; }
   /* + per-module action-button hiding selectors (enumerated at build time) */
   ```
2. **`index.html`** — `#viewerReportsHub` card markup after the header in `#kibbutz-view`.
3. **`js/src/11-search-login.js`** — hide `#navMyTasks` when `isViewer()`.
4. Hub buttons wired to the existing report entry points + the new 📗 export functions.
5. `node build.mjs` → test loop → commit on `dev`.

## Verification

Load with the viewer PIN (`0540`) and confirm: home shows only the navy header; nav shows
🏠/📦/📅/🗓️ only; מלאי, נוכחות, יומן all open read-only as before. Confirm a non-viewer role still
sees the full home (CSS is class-scoped, nav line is `isViewer()`-guarded).

## Out of scope (separate spec)

**PUSH notifications** — feasible via Web Push (SW `push` handler + `pushManager.subscribe` +
Supabase subscriptions table + VAPID Edge Function; iOS needs the installed PWA). Its own spec.
