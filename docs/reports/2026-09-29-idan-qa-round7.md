# QA round 7 — עידן, 29.9 (phone)

| # | Item | Package |
|---|---|---|
| 1 | Home: remove the per-card "סיכום ביקור חדש" / edit-summary buttons (a new summary lives inside the card → ביקורים) | Q7-A |
| 2 | Meeting-notes rows block: the LAST row's ⋯ menu does not open | Q7-A |
| 3 | The ➕ fails with VALIDATION ERROR 422. Errors must be clear: what happened, understandable by any user, say whether to retry or report | Q7-A (+ app-wide error mapping) |
| 4 | Meeting-notes rows: remove the per-row ➕; all actions live in the ⋯ menu | Q7-A |
| 5 | Bell: the "3 kibbutzim not linked to EMS" alert can't be marked read; the "1" badge stays | Q7-B |
| 6 | My tasks (header icon): the count after the title touches the close handle; the subtitle almost touches the blocks | Q7-B |
| 7.1 | Settings → זהות shows on the FIRST settings screen. For עידן: which staff member/device has not installed the app or not allowed notifications | Q7-C |
| 7.2 | "מה נשאר לי לסגור" inside זהות on the first settings screen | Q7-C |
| 7.3 | Title "הגדרות" → "העדפות משתמש" | Q7-C |
| 7.4 | Remove "התקנת אפליקציה" and "רעיון או באג" from user preferences (already in the main menu) | Q7-C |
| 7.5 | "תיאור מלא/קצר של המשימות" seems to do nothing: verify; remove if so | Q7-C |
| 7.6 | "ניהול" only for עידן. Buttons app-wide: more solid, elliptical (pill), slimmer height, less space | Q7-C |
| 7.7 | "התקנת אפליקציה" opens a menu: install + allow notifications on this device | Q7-C |
| 8.1 | Dark mode: moderately more colourful; grey border on sheets/popovers (repeats in many places) | Q7-D |
| 8.2 | Dark mode: full contrast audit (menus, taps, buttons, error alerts, loaders, everywhere), verified by Claude | Q7-D |
| 9 | Σ didn't work on githack: the preview branch predates the Σ fix (a84b6e1b); check on live | answered |
| 10 | "Gallery" = the internal design-system screen: hide it for everyone but עידן | Q7-C |
| 11.1 | Calendar: future days show nothing unless something is scheduled (no suggested tasks) | Q7-E |
| 11.2 | Calendar: thin borders per day; weekday headers (א ב ג…) right-aligned, each over its column | Q7-E |
| 11.3 | Calendar: can't add vacations in future scheduling. עידן/עמיחי add for anyone; others only for themselves | Q7-E |
| 11.4 | Vacation shown as a thin day-wide strip: "עידן - חופש"; several: "עידן, עמיחי, מתניה, אביאם - חופש" | Q7-E |
| 12 | Inventory: everything still left-aligned; fix | Q7-E |
| 13 | Hulda readings feature not visible: in progress in its own session, not merged | answered |
