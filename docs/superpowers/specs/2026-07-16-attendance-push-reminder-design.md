# Attendance-reminder push (viewer-triggered) — design spec

STATUS: ✅ SHIPPED (1.50, 2026-07-16). Merged `feat/attendance-push`→dev→main; unified with the 1.48
order push into one dual-mode `push-send` + one client `22-push.js` + one VAPID keypair. Prod TODO
(עידן): redeploy `push-send` with the dual-mode code.
Date: 2026-07-16 · Decisions locked with עידן (all recommended options).

## Goal
The viewer user (הנהלת חשבונות) can send a **push notification** to a field worker whose
attendance is incomplete — a "live" reminder asking them to update.

## Locked decisions
1. **Trigger = manual button in the attendance report.** The report (viewer's view) marks
   missing days; the viewer clicks **🔔 בקש עדכון נוכחות** → push to that person. No cron.
2. **Missing day** = a weekday (Sun–Thu), from the 1st of the displayed month up to **yesterday**,
   with **no visit and no attendance entry** of any type (office/wfh/vacation/reserve/off/other).
3. **Live notification** = sticky (`requireInteraction: true`) + an **עדכן עכשיו** action;
   clicking opens the app on the attendance flow for the missing date(s). `tag` =
   `att-reminder-<person>-<month>` so a re-send replaces rather than stacks. No auto-repeat.

## UX
- In `renderAttendanceReport()` (js/src/04-attendance-daily.js): compute `missingDays(person,
  year, month)` — pure function; weekdays ≤ yesterday with no row. Show them as a red chip row
  ("⚠️ חסרים: 3.7, 8.7, 14.7").
- Viewer-only (isViewer(); optionally isIdan() too — decide at build): button
  **🔔 בקש עדכון נוכחות** appears when `missingDays.length > 0`. Click → confirm modal showing
  the dates → call `push-send` with `{mode:"attendanceReminder", person, dates:[...]}` → toast
  "🔔 נשלחה תזכורת ל<person>".
- Recipient's phone: "📅 חסרה נוכחות — <person>, נא לעדכן: 3.7, 8.7, 14.7" + עדכן עכשיו action →
  opens the app (attendance page / quick-visit FAB flow).

## Server (`push-send` Edge Function — additive mode)
- New `mode:"attendanceReminder"` alongside the webhook-driven order events: body carries person +
  dates; the fn composes the fixed text server-side (client can't send arbitrary content), loads
  the person's `push_subscriptions` rows, sends with `requireInteraction`, prunes 404/410.
- **Auth (open item, verify at build):** viewer sessions have no EMS account. Options:
  (a) accept the app's minted anon/auth pass + restrict the mode to fixed recipients (אביאם/ניתאי)
  and fixed text — worst case abuse = a nag, no data exposure; (b) require the viewer PIN in the
  request and check it server-side. Decide with עידן at build.
- Fallback when the recipient has no push subscription (or iPhone): the fn returns
  `{delivered:0}` → client shows the existing in-app-notification path instead (localStorage
  seen-set modal, like order notifications) so the reminder is never silently dropped.

## Testing (per docs/testing-methodology.md)
- Pure builders: `missingDays()` golden fixtures — full month, month with visits+attendance mix,
  weekend exclusion, future-days exclusion, boundary = yesterday, empty month; payload builder
  (person+dates → notification body, tag).
- Gating: button visible viewer(+idan if decided) only; team/field never.
- Round-trip: fn mode composes correct payload; no-subscription path returns delivered:0.
- Manual smoke: real push on Android, sticky + action opens attendance.

## Phases
1. `missingDays()` + red-chip UI + gated button (client, testable now — no infra needed).
2. `push-send` mode + auth decision (needs web-push phases 1–2).
3. Wire button → fn → toast + fallback; sw.js `notificationclick` route to attendance.
4. Suite green; manual smoke; CHANGELOG/backlog/INDEX; flip STATUS.
