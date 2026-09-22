# סבב תיקונים 3 — QA מהטלפון (22.9.2026, ערב)

STATUS: 🟡 OPEN — planned by Fable, executed by Opus/Sonnet agents in parallel worktrees off `origin/main` (2.14, a9edc5f).
Ground rules: identical to `2026-09-22-phone-qa-round-2-design.md` (source-only commits, own files, tests green, humanizer copy).

Data already fixed (22.9 19:xx): גבת was archived at 16:06 by the same ✏️→🗄 path that archived דפנה in the morning;
unarchived. **The archive path must become impossible to hit by accident (Package N item 1).**

## Package N — kibbutz modal, ✏️, quick visit list, EMS link + login  (Opus) — URGENT
Files: `js/src/10-activity.js` (openEditModal, the ✏️), `app/src/components/home/KibbutzSheet.tsx`, `app/src/islands/Home.tsx`
(`sigmaHome.openSheet`), `js/src/02-init-attendance.js` (openVisitQuick list), `js/src/01-data.js`/`13-ems.js`/`12-reports.js`
(`kibbutzSiteIds`, `emsSiteIdForKibbutz`, EMS session), `js/src/15-login-gate.js`, `sw.js` ONLY if the cache is the cause,
`qa/playwright/tests/kibbutz-sheet.spec.ts`, `home-cards.spec.ts`, `session-gate.spec.ts`.
1. ✏️ inside the kibbutz card (עידן only): today it "does nothing" for עידן and TWICE a kibbutz ended up ARCHIVED
   (דפנה 08:46, גבת 16:06). Reproduce with Playwright as עידן on the phone project: open card → ✏️ → what happens.
   Suspects: `window.sigmaHome` undefined when the Home island is not mounted/canManage false → button no-op; the
   §7p unsaved-guard / Back handler (popstate re-push) firing `onArchived` or the confirm step; the archive button
   being the first focusable element under a fast double tap. Fix the root cause AND make archive require typing the
   kibbutz name (or a 2-step with a 1.5 s delay before the confirm is enabled). Make ✏️ always work for עידן.
2. The kibbutz NAME is the big title of the card modal (`#modalTitle`), not a small "קיבוץ: X" line; ✏️ sits beside it.
3. "תיעוד ביקור מהיר" kibbutz list must be the same list as the home page (the `kibbutzim` table via `kibbutzOptions()`
   → check it reads `window.KIBBUTZIM` after the island published it; if the legacy cache is stale, read the table).
   Also offer the EMS sites that have no card as "(אתר EMS ללא כרטיס)" so nothing is unreachable.
4. EMS site link "does not work" + login "gets stuck": test on production (https://pm-sigma.github.io/sigmatec-operations-app/)
   with Playwright/browser: sign in (ask Fable if credentials are needed — do NOT invent), watch `ems-auth`, `/sites`,
   `kibbutzHasSite`. Check whether round-1's `sw.js` cache-first for `?v=` files or the version watcher change broke the
   post-login reload path, and whether `emsSiteIdForKibbutz` still resolves after the `kibbutzim` section changes.
   Fix what you find; write the finding in the report even if it is environmental.

## Package O — shell copy + clutter  (Sonnet)
Files: `app/src/components/UserChip.tsx`, `index.html` (legend block), `app/src/islands/CommandBar.tsx`, `app/src/lib/commands.ts`,
`app/src/islands/PmToday.tsx`, `app/src/components/home/InternalTasks.tsx` (`MyInternalTasks`), `index.html` (a `#sigma-my-tasks`
slot above the bottom bar), `css/app.css`, specs: `nav-shell`, `command-bar`, `home-cards`.
1. Header chip shows only "ע": show the FIRST NAME ("עידן") on the phone, not the initial.
2. Remove "מקרא צבעים והסבר הלחצנים" from the kibbutz page entirely.
3. Ctrl+K / search: remove the "פעולות" group entirely (kibbutzim · משימות · מסכים stay).
4. "המשימות הפנימיות שלי" strip sits ABOVE the bottom bar on EVERY module (a fixed, collapsible strip; collapsed =
   one line "🔒 N משימות פנימיות שלי"), not only on the kibbutz page. Remember collapsed state per device.

## Package P — inventory: certificates tab + orders edit  (Sonnet)
Files: `js/src/20-delivery-cert.js`, `js/src/07-orders.js`, `index.html` (inventory view), `css/app.css`, `test-delivery-cert.mjs`,
`test-order-patch.mjs`, `qa/playwright/tests/inventory-pool.spec.ts`.
1. Certificates tab re-renders constantly ("רענונים כל הזמן"): find the loop (`invRenderCerts` on every `renderInventory`,
   a polling interval, or the `stock-changed`/realtime invalidation) and render once per data change.
2. "מתאריך / עד תאריך" on ONE line; the search box styled like the rest of the app (the `.sig-fi` input look).
3. Orders → edit: the status select is stuck (cannot change). Fix; add `test-order-patch` case.
4. "אחראי על ההספקה" — what does it mean? Rename to what it is (the person who supplies/approves), and allow approving
   the order from the edit form for אביאם/ניתאי (and עידן/עמיחי) — the same rule as the row's quick action.

## Package Q — alerts that never go away  (Opus)
Files: `app/src/islands/Alerts.tsx`, `app/src/lib/alerts.ts` (+test), `db/*alert*.sql`, `qa/playwright/tests/alerts.spec.ts`.
1. עידן marked alerts read five times and they still show. Debug on production data: does `alert_mark_seen` RPC exist
   and succeed for his pass (check `supabase/functions`/`db/inventory_pool*.sql` for the RPC and its RLS), does
   `seen_by` get his exact stored name (`getCurrentUser()` vs the JWT `name` claim vs "pm@sigmatec-energy.com"), does
   the grouped list re-derive `seen` after the optimistic update, does the query refetch overwrite it. Fix root cause;
   if the RPC compares a different identity, make the client send the same one. Add a Playwright case: mark read →
   reload → still hidden.
2. Also: the crossed "read" state should hide the group by default (round 2) — verify it survives a refetch.

## Package R — calendar ↔ Google Calendar (INFORMATION) guide  (Sonnet, docs + gap list)
Files: `docs/usage/יומן-גוגל.md` (new), read `docs/calendar-setup.md`, `supabase/functions/calendar/index.ts`,
`app/src/islands/Calendar.tsx`, `app/src/lib/calendar.ts`, `db/calendar_absences.sql`.
Write the guide עידן asked for: how to reach a state where a vacation added in the app appears in the INFORMATION Google
Calendar and vice versa. Document what works TODAY (read of Google events into the app? writes?), the exact steps
(service account, calendar sharing, secrets), and a precise list of what is missing to make it two-way (e.g. the
`calendar` function has no write mode; absences are app-only). Do not build; the gap list is the deliverable.

## Package S — recording panel placement  (Sonnet)
Files: `app/src/islands/Field.tsx` (visit chapters part), `qa/playwright/tests/visit-chapters.spec.ts`.
עידן does not see the 🎙 "סיכום ביקור מהקלטה" panel. It must sit UNDER "📍 ביקור אחרון" and BEFORE "מי ביקר" (chapter 1),
visible on the phone without scrolling tricks, for every writer role. Check why it is not visible in production for עידן
(role gate? `canSubmit`? the collapsed default?) and fix; update the C8 spec accordingly.

## Not changed by ruling
- Red missing-report days: shown in the calendar for the signed-in person only (already so). Kept.
