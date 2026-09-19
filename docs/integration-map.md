# Integration map — who tells whom

The "סיגמה 2.00" redesign runs React islands beside 13k lines of legacy JS, so a feature is
never finished when its own screen works: **every surface that shows the same data has to hear
about a write.** This file is the register of those channels. The plan's Global Constraints
make it mandatory — a task that adds a write, an event or a `window.sigma*` surface adds its
row here in the same commit.

Channels, in the order of how loosely they couple:

1. **`sigmaBus` CustomEvent** — a legacy module or an island announces "something changed";
   anyone interested subscribes through `useSigmaEvent`. No imports either way.
2. **TanStack query key** — the shared cache. Invalidating a key refreshes every island reading it.
3. **`window.sigma.*` (bridge)** — React → legacy calls. Declared in `js/src/00-bridge.js`,
   typed in `app/src/bridge.ts`.
4. **`window.sigmaHome` / DOM attribute** — an island's own surface for legacy code and other
   islands, where a bus event would be too coarse (it needs a return value or a target).

## Events on `sigmaBus`

| Event | Emitted by | Consumers |
|---|---|---|
| `user-changed` | `js/src/11-search-login.js:227,248` · `js/src/15-login-gate.js:93,184,194` | `bridge.ts:useCurrentUser` (→ `components/Nav.tsx`, `islands/Home.tsx`, `islands/ModalMeetings.tsx`, `islands/ImportNotes.tsx`) · `bridge.ts:useEmsConnected` |
| `ems-cache-synced` | `js/src/13-ems.js:60` (`emsCacheSave`) | `bridge.ts:useEmsConnected` · `islands/Home.tsx:87` (re-runs `decorateCards`) · `components/home/EmsTasks.tsx:useCardEmsTasks` (re-reads `sigma.emsCacheTasksForKibbutz` so the card's open-task list stays live) |
| `kibbutzim-published` | `islands/Home.tsx:publishToLegacy` (Task 20) | `islands/CommandBar.tsx` — Ctrl+K snapshots `window.KIBBUTZIM` / `localStorage.kibbutzim_v1` once per open, and neither store notifies anyone. On a cold boot the publish can land a few ms AFTER the first card is in the DOM, and a Ctrl+K inside that window left the bar with no kibbutzim for as long as it stayed open. It now rebuilds on this event while open, keeping what the person typed. |
| `visit-saved` | `js/src/09-visits.js:413` | no island consumer yet — the cards' last-visit line is still a legacy decorator |
| `visit-form-open` | `js/src/02-init-attendance.js:13` (`switchTab('visit')`) | `components/home/CardActions.tsx` (🚚 waits for the form before asking for a cert) |
| `theme-changed` | `app/src/lib/theme.ts:applyTheme` | `components/ThemeToggle.tsx:12` · `components/ui/sonner.tsx:18` |
| **`notes-changed`** | `components/home/MeetingNotes.tsx:emitNotesChanged` — after import (`islands/ImportNotes.tsx:saveParsedMeeting`), ➕ link (`linkNoteToTask`), ✓ done (`setNoteDone`), pending→real id (`resolvePendingTasks`) | `MeetingNotes.tsx:listenForNotesChanges` → invalidates `['meetingNotes']`, which repaints **every card** (`components/home/KibbutzCard.tsx`) and the modal tab (`islands/ModalMeetings.tsx`). ONE listener per page, at module scope — a listener per component would mean one per card. |
| **`feedback-changed`** | `islands/Feedback.tsx:emitFeedbackChanged` — after a feedback is sent (and after a status flip / a bug→card in the inbox, both of which also invalidate the key directly) | `islands/FeedbackInbox.tsx` → invalidates `['feedback']`, so an admin with the inbox open sees the new row without reloading |
| **`session-expired`** | `js/src/00-bridge.js:sigmaSessionExpired` — the ONE funnel for every 401: `emsApi` (`js/src/12-reports.js`), the legacy REST reads (`js/src/01-data.js:sbGet`), the supabase-js interceptor (`app/src/lib/supabase.ts:sessionAwareFetch`) and the 12 h session cap. **Debounced (4 s)**, so five concurrent 401s are one event | `components/ReLoginSheet.tsx` (the one re-login sheet, mounted on every page) · `bridge.ts:useEmsConnected` (the connection flipped off) · `lib/session.ts:useEmsGate` → every island re-renders its gate |
| **`checkin-created`** | `islands/Field.tsx` — after a field worker picks a kibbutz in the arrival sheet and the `field_checkins` row is written (spec §5.1). `detail = {id, kibbutz, person}` | the `היום` strip (`islands/Field.tsx` `Today`, via `['checkins', person, day]`); anything that wants to know he is on site. The row is ALSO the only thing that starts the 2 h `visitCron` clock. |
| **`attendance-saved`** | `js/src/04-attendance-daily.js:attSaveRow` — every day filed, from the legacy form OR from the island through `sigma.attSave`. `detail = {id, person, dayType, note, date}` | `islands/Attendance.tsx` → invalidates `['attRows']`, so the grid, the three KPIs and the missing chips all move together |
| **`holidays-loaded`** | `js/src/04-attendance-daily.js:attLoadHolidays` — the session's `company_holidays` list landed in `SHEET_DATA.holidays` (once per session) | the legacy report redraws (a חג stops being a red row); `islands/Attendance.tsx` reads the same list through `sigma.attHolidays()` |
| **`burns-changed`** | `components/home/Burns.tsx:emitBurnsChanged` — after every 🔥 צריבות write (✅ נצרב from the card modal, the briefing checklist or a bulk mark; ⚠ בעיה; ⚡ גנרטור; a new `generators` row) | `Burns.tsx:listenForBurnChanges` → invalidates `['meterBurns']` + `['burnGenerators']`, which repaints the card chip, the card-modal section and the landing strip at once · `js/src/24-meter-burns.js` reloads the full table if it is open. ONE listener per page, at module scope — a listener per component would mean one per card. |
| **`ems-queue-flushed`** | `js/src/13-ems.js:emsQueueFlush` — `detail.created = [{queueId, taskId}]`, one entry per `createTask` that went out | `components/home/MeetingNotes.tsx:resolvePendingTasks` — swaps every `ems_task_id = 'pending:<queueId>'` for the real task id. Without it a bullet linked while offline keeps a 🔗 that can never open anything. |
| **`onboarding-changed`** | `components/home/OnboardingProgress.tsx:emitOnboardingChanged` — after a step tap (`tapStep`) and after a fresh 🆕 kibbutz spawns its checklist (`spawnOnboardingForNewKibbutz`, called from `KibbutzSheet.tsx` on create) | `OnboardingProgress.tsx:listenForOnboardingChanges` → invalidates `['onboardingSteps']`, repainting every 🆕 card's strip at once. ONE listener per page, at module scope — same pattern as `internal-tasks-changed`. |

## Session & access (spec §7n, Task 21)

| Surface | Direction | Why |
|---|---|---|
| `sigma.sessionExpired(reason)` → bool | React → legacy (`window.sigmaSessionExpired`) | the debouncer has to be SHARED by both halves — a legacy 401 and an island 401 arriving together must raise one sheet, so the canonical one lives in the legacy bundle and `app/src/lib/session.ts:notifySessionExpired` routes into it (its own local debounce is only the no-bridge fallback). Returns true when this call is the one that announced the expiry, which is what the tests assert. |
| `sigma.beginReLogin()` | React → legacy (`window.sigmaBeginReLogin`) | hands over to the sign-in while keeping the place: `ems_return_page_v1` + `ems_return_scroll_v1` in `sessionStorage`, then the gate (`js/src/15-login-gate.js` restores both). The visit draft needs nothing — `js/src/09-visits.js` already mirrored it to `visitDrafts_v2`. |
| `window.sigmaOpenReLogin()` | island → legacy | assigned by `ReLoginSheet.tsx` while it is mounted. `emsRequireLogin` (`js/src/12-reports.js`) calls it, so a legacy page raises the SAME sheet; the old modal is only what a page without the React bundle gets, and neither path jumps to the retired EMS page any more (§7m G3). |
| `app/src/lib/session.ts:useEmsGate()` + `components/EmsGate.tsx` | island-side | "nothing without a sign-in" as a property of the shell: every island wraps its content, and renders `<LoginRequired/>` instead when the gate is closed. `?login=0` opens it ONLY on localhost / `*.githack.com` (mirrored in `js/src/11-search-login.js`, where `LOGIN_FLAG` lives). |
| `app/src/lib/supabase.ts:sessionAwareFetch` | island-side | the one supabase-js interceptor — read, write and RPC alike — so a `401`/`PGRST301` anywhere reaches the funnel. Its sibling `bearerForRequest()` now MINTS a pass for reads too, because the business tables are authenticated-only (`db/rls_authenticated_only.sql`). |

## Postgres functions (RPC)

| Function | Called by | Why a function |
|---|---|---|
| `feedback_admin_update(p_id, p_actor, p_status, p_github_issue)` (`db/feedback.sql`) | `islands/FeedbackInbox.tsx` (status buttons, the `github_issue` stamp) | `feedback` has **no UPDATE/DELETE policy and the privilege is revoked**, so a row cannot be changed directly at all. **The app has ONE shared `authenticated` JWT** minted from the EMS gate (`js/src/01-data.js`), so Postgres cannot tell עידן from ניתאי and RLS cannot be the identity check. The function is `SECURITY DEFINER` and validates the `actor` the client passes against the `app_admins` table (עידן, עמיחי) — defence in depth, not authentication: it stops every ordinary path and any accidental write, and tampering would mean deliberately forging an actor name. Real per-user identity needs per-user Supabase auth (own piece of work). Verified with `set local role authenticated`: direct UPDATE/DELETE → `42501`, a non-admin actor → `42501`, a bad status → `22023`, anon SELECT → 0 rows. |
| `import_meeting_notes(jsonb)` (`db/kibbutz_meeting_notes_import.sql`) | `islands/ImportNotes.tsx:saveParsedMeeting` | the import must be ONE transaction and must not destroy human work. A client-side DELETE+INSERT wiped `ems_task_id`/`done_at` on every re-import and left a hole if it failed in between. The function upserts on the unique key, keeps the link and the ✓, stamps `text_changed_at` when a linked bullet's wording changed, and deletes only the rows the new parse dropped. `SECURITY INVOKER`, so RLS still refuses an anon caller. |

## Query keys

| Key | Written by | Read by |
|---|---|---|
| `['kibbutzim']` | `islands/Home.tsx` (create/edit/archive) | `islands/Home.tsx` · `islands/ImportNotes.tsx` (the parser's name catalog — the import must never resolve against a staler list than the cards do) |
| `['meetingNotes']` | `islands/ImportNotes.tsx` · `components/home/MeetingNotes.tsx` | `components/home/MeetingNotes.tsx` (cards + modal tab) |
| `['feedback']` | `islands/Feedback.tsx:sendFeedback` (via `feedback-changed`) · `islands/FeedbackInbox.tsx` (status flip, `github_issue`) | `islands/FeedbackInbox.tsx` (the admin inbox) |
| `['gh-parents']` | — (read-only, `staleTime` 10 min) | `islands/FeedbackInbox.tsx` — the Main Fields parent picker, from the `github` function's `listParents` mode |
| `['checkins', person, day]` | `islands/Field.tsx` (a check-in, a `visitDismiss` deep link) | `islands/Field.tsx` — the arrival sheet's "already here today" and the היום strip |
| `['dayPlan', person, day]` | — (read-only; `day_plans` is the calendar task's table and is **feature-detected** — a missing table answers `[]`, never an error) | `islands/Field.tsx` — the arrival order and the strip's route |
| `['openOrders']` | — (read-only) | `islands/Field.tsx` — "לפני שיוצאים" stock rows, and whether 🚚 has anything to hand over |
| `['meterBurns']` | `components/home/Burns.tsx` (`markBurned` / `markUnburned` / `markIssue` / `assignGenerator`, all via `burns-changed`) | `components/home/Burns.tsx` — the card chip (`BurnChip`), the card-modal section (`BurnsPanel`) and the landing strip (`BurnsStrip`) · `islands/Field.tsx` — the briefing's `burn` checklist rows. **`enabled` is the role gate**: someone outside the project's audience never issues the query at all. |
| `['burnGenerators']` | `components/home/Burns.tsx:ensureGenerator` | `components/home/Burns.tsx:BurnsPanel` — the ⚡ name on a meter row and the ⚡ שבץ לגנרטור picker |

## Bridge surfaces added / changed by the meeting-notes task

| Surface | Direction | Why |
|---|---|---|
| `sigma.createTask(item)` → `{sent, id?}` / `{queued, queueId}` | React → legacy (`js/src/13-ems.js:emsWriteOrQueue`) | a bullet has to remember **which** EMS task it became (`ems_task_id`). The legacy function used to return a bare `{sent:true}`; it now returns the created task's id via `emsCreatedId`, which unwraps BOTH shapes EMS answers with (`{id}` and `{data:{id}}` — reading `res.id` alone silently produced no id). Queued ⇒ the note is stamped `pending:<queueId>`, shows ⏳, and `ems-queue-flushed` resolves it later. Pinned by `test-ems-createtask.mjs`. |
| `emsSendItem` `createTask` honours `item.priority` / `item.siteId` | React → legacy | the note prefill sets priority `medium`; site is still resolved from `item.kibbutz` at send time so a queued task resolves it on flush. |
| `window.sigmaHome.openSheet(name)` | island → island / legacy → island | `islands/Home.tsx` exposes its ➕/✏️ sheet. The import preview's **צור קיבוץ** and the modal tab's **✏️ פרטי קיבוץ** both need to open it for a *specific* name — a bus event cannot target one card. Deleted on unmount. |
| `#sigma-modal-meetings[data-kibbutz]` | legacy → island | `js/src/10-activity.js:openEditModal` stamps the kibbutz it is showing; `islands/ModalMeetings.tsx` observes the attribute. One React root for the whole session instead of a mount per modal open. |
| `sigma.decorateCards()` | React → legacy | already existed; the cards' notes block is React, so the legacy passes still attach after `.kibbutz-name-row` — the notes sit between the two (order: name → notes → EMS tasks). |
| `sigma.emsCacheTasksForKibbutz(name)` → `EmsTask[]` | React → legacy (`js/src/13-ems.js:emsCacheTasksForKibbutz`) | task-3-brief: the on-card EMS-tasks widget moved to React (`components/home/EmsTasks.tsx`), reusing the legacy site-id filter (merged sites, e.g. שדה אליהו + חקלאות) instead of re-deriving `KIBBUTZ_SITE_MAP` in TS. `applyCardEmsWidgets`/`renderCardEmsTasks` are removed from `js/src/13-ems.js` and from `sigma.decorateCards()`; the legacy kibbutz-modal task list (`prepModalEmsSection`) is untouched. Pinned by `test-ems-card.mjs` (slim-mapper `description` field) and `app/src/components/home/EmsTasks.test.tsx`. |

## Bridge surfaces / channels added by the feedback task (Task 6)

| Surface | Direction | Why |
|---|---|---|
| `sigma.emsToken()` → `string` | React → legacy (`getEmsToken`, `js/src/12-reports.js`) | the `github` Edge Function gates EVERY mode on a valid EMS login (the legacy dev board passes the same token). The inbox's 🐙 button needs it to create a ticket; no other island may use it. |
| `registerMoreItem({id:'feedback'})` — label `📣 רעיון / באג`, **no `roles`** | island → nav | every role may submit, the viewer included (spec §7). The live `visible` predicate only hides it before anyone has picked who they are. |
| `registerMoreItem({id:'feedback-inbox'})` — `roles: ['idan','team']` + live `canSeeFeedbackInbox` | island → nav | the inbox is admins only (`canManageStaff` = עידן + עמיחי) and never a viewer, evaluated on every listing so `changeUser()` cannot leave it open. |
| `#feedback-inbox` hash | push → island | `push-send` mode `feedbackNew` opens the app at `?pushact=feedback#feedback-inbox`; `islands/FeedbackInbox.tsx` watches the hash AND `user-changed` (the island mounts before the user is known, so a single check at mount would swallow the deep link). |

## Edge functions this release touches

| Function | Mode added | Called by |
|---|---|---|
| `transcribe` (new) | Three modes on the one endpoint (task 6b, spec §7i). **Transcribe** `{token, path, audio_sec}` → `{text, engine, ms, refined, job_id?, refine_eta_seconds?}` — **EMS-gated**, `path` must match the whitelist `<name>.<audio ext>` (`chain.ts validAudioPath`). **Poll** `{token, job_id}` → proxies the self server's GET with the bearer → `{text, status, refined, seconds_remaining}`, no `transcribe_log` row (a status check, not a new attempt). **Health** `{health:true}` → `{ok, engine}`, no EMS gate. | `app/src/lib/speech.ts:uploadAndTranscribe` + `pollRefineStatus` (the fallback voice path). Self-hosted Whisper first (`https://idanhomepc.tail9e880d.ts.net`, `DEFAULT_SELF_WHISPER_URL`), Groq as insurance, one retry (2 s) on network/5xx never on 4xx — `supabase/functions/transcribe/chain.ts`. Refine merge rule (untouched→replace, edited/sent→discard) is `app/src/lib/feedback.ts:refineMerge`. Pointer runbook: `docs/whisper-server.md`. Writes `transcribe_log`. |
| `push-send` | `feedbackNew` `{token, kind, preview}` → עידן + עמיחי — **EMS-gated** (the public anon key alone must not be able to push to anyone's phone) | `islands/Feedback.tsx:sendFeedback` (fire-and-forget; the author is never sent, so an anonymous feedback stays anonymous) |
| `push-send` | **`visitCron`** `{}` — the 2 h visit-summary reminder (spec §5.2). **Authenticated**: the `X-Cron-Key` header (`db/cron_visit_15min.sql`, every 15 min) or a live EMS login. Every decision is the pure `visitCronSelect` in `supabase/functions/push-send/field.ts`, a **byte-identical copy** of `app/src/lib/field.ts` (`test-field.mjs` fails on drift): 2 h after the check-in but never past 20:00 Israel, quiet hours 21:00–06:30, **≤ 3 non-digest pushes per person per day** counted from `push_log` (`attendanceCron` obeys the same cap), one nudge per arrival (`reminded_at`), never when the visit is filed. Words from the 19-variant pool, `hashIdx(checkin id)`; a draft swaps in its own line (§5.1c) | `pg_cron` → `field_checkins` → the two field phones |
| `github` | `listParents` · `createIssue` `{title, body, labels, parent}` — `parent` is **required server-side** (the board is two-level by rule) and `body` is capped at 20k | `islands/FeedbackInbox.tsx` — a bug becomes a CHILD of a Main Fields parent, titled `[מודול] | [תת-תחום] | [תיאור]`, into Backlog (the Git Ticket System rules) |

## Surfaces / channels added by the usage-analytics task (Task 17, spec §7j)

| Surface | Direction | Why |
|---|---|---|
| `window.sigmaTrack(action, target?, page?)` + `sigma.track(...)` | legacy → shared queue → React | ONE stamping point for who/where/when. Legacy modules call it guarded by `typeof` and never touch Supabase; `app/src/lib/track.ts` drains `window.__sigmaTrack` and owns the only insert. If `ui/sigma.js` never loads, the array caps at 200 and the events are lost — the intended failure mode. |
| `window.showPage` **wrapped** by `sigma.sigmaWrapShowPage()` | legacy → analytics | page views are tracked in the wrapper, NOT in `sigma.showPage`. showPage is the single door every page change goes through (legacy nav buttons, deep links, the React nav), so the wrapper counts each change exactly once; tracking inside the bridge call would have missed the legacy buttons and double-counted React clicks. It logs `window._currentPage` (the page actually landed on), because showPage rewrites `page` when a gate denies it. Pinned behaviourally by `test-usage-track.mjs [1]`. |
| `track()` / `trackMount()` from `app/src/lib/track.ts` | island → analytics | the React-side twin of `sigmaTrack`; routes through the bridge when legacy is loaded. `islands.tsx mount()` calls `trackMount(id)`, so **every island mount is an event** with no per-island wiring. `track.ts` is in the BOOT chunk and therefore imports supabase-js lazily (`await import('./supabase')`) — `test-sigma-shell.mjs [3]` enforces that the library itself never lands there. |
| `registerMoreItem({id:'usage'})` — label `📈 שימוש`, `roles:['idan']` + live `canSeeUsage` | island → nav | §7j makes this screen עידן's alone. The predicate is evaluated on every listing, so `changeUser()` cannot leave it listed, and the dialog closes itself if the current user stops being עידן. |
| `#usage` hash | push → island | `push-send` mode `usageDigest` opens the app at `#usage`; `islands/Usage.tsx` watches the hash AND `user-changed` (the island mounts before the user is known, so a single check at mount would swallow the deep link — same lesson as `#feedback-inbox`). |
| `usage_report(p_days, p_actor)` RPC | island → DB | `usage_events` has **no client SELECT policy and the privilege is revoked**, so the page cannot read the table at all. The RPC is SECURITY DEFINER and refuses any actor but עידן. The client gate is the first door, this is the second; identity is still the app's one shared `authenticated` pass (same honest limitation as `feedback_admin_update`). |
| `app/src/lib/usageNarrative.ts` ↔ `supabase/functions/push-send/usageNarrative.ts` | shared logic | a **byte-identical copy**: Deno cannot import from `app/src`, and the Sunday push must say exactly what the page says and what the vitest goldens pin. Edit `app/src/lib` and copy it over — `test-usage-track.mjs [3]` fails the build on any drift. Keep the module import-free so the copy stays possible. |

### Query keys (Task 17)

| Key | Invalidated by | Read by |
|---|---|---|
| `['usage', 30]` | nothing — `staleTime` 60 s, and the island flushes the tracker before each fetch so the current session's own events are in the report | `islands/Usage.tsx` (📈 שימוש) |

### Standing rulings on `usage_events` (fix round 1 — do not re-litigate per task)

| Ruling | What it means in code |
|---|---|
| **Analytics never stores text a user typed. No exceptions.** §7j's example narrative quoted the failed search terms ("לא נמצאו: 'גשר'"); the review overruled it — a typed query is typed text whatever it happens to contain. | A search miss is `track('search-no-results', searchMissTarget(q))` → `target = "results:0,len:<n>"` (`app/src/lib/track.ts`). `usageNarrative` COUNTS misses and quotes nothing, even if a row somehow carries text. Pinned by `test-usage-track.mjs [5b]` + goldens in `track.test.ts` / `usageNarrative.test.ts`. A new `target` must be an id or a name the APP chose. |
| **A `target` is capped at 40 chars** — a backstop, not a licence. | `MAX_TARGET` in `track.ts` and `TRACK_TARGET` in `js/src/00-bridge.js`. |
| **The unload flush uses `fetch(..., {keepalive:true})`, NOT `navigator.sendBeacon`.** | sendBeacon cannot set headers, and PostgREST needs `apikey` + `Authorization: Bearer <EMS-minted pass>`; without the pass the insert arrives as `anon` and RLS rejects it, and a JWT in a query string is not something we do. Accepted loss, documented in `track.ts`: browsers without `keepalive` lose the last page's tail (≤ 10 s of events). |
| **`p_actor` on `usage_report()` is a client-supplied string** (one shared `authenticated` pass ⇒ Postgres cannot tell עידן from ניתאי). Defence in depth, not authentication. | Deferred to **Task 18** (per-user Supabase auth). Same limitation as `feedback_admin_update`. |

### Edge function / cron (Task 17)

| Function | Mode added | Called by |
|---|---|---|
| `push-send` | `usageDigest` `{force?, token?, actor?}` → the weekly narrative to עידן. **AUTH (fix round 1): the public anon key is NOT enough.** Either the `X-Cron-Key` header matches the `CRON_SECRET` secret (pg_cron — scheduled runs only, never a forced one, because the key sits in a readable SQL job body) or `emsValid(token)` passes AND `actor === 'עידן'` (the only caller allowed to `force` past the Sunday gate, and with `force:'resend'` past the week tag). The decision is the pure `usageDigestAuth()` — `app/src/lib/usageDigest.ts`, byte-identical copy in the function dir, four cases tested. Gated on **Sunday 08:00 Israel** (`israelNow()`: DST server-side, a missed hour re-fires safely), idempotent on the `usage-<yyyy>-w<ww>` tag in `push_log`, recipient fixed server-side. **The response never contains the sentences** — `{ok, tag, sent, lines}` only; the narrative names people and reaches עידן's devices and `push_log`, never a caller. Reads `usage_events` with the service role (no RPC — that is the client's door). | pg_cron `push-usage-hourly` (`db/cron_usage_weekly.sql`, `5 * * * *` so it never races `push-attendance-hourly` at `0 * * * *`; the same file re-schedules the attendance job with the header). **Not scheduled yet** — prod steps after the merge: set `CRON_SECRET`, then run the file. |

---

## Task 4 — brand polish, landing per role, settings, Ctrl+K, visit drafts (סיגמה 2.00)

### Tables added

| Table / column | Written by | Read by | Notes |
|---|---|---|---|
| `user_settings(person pk, landing, card_desc, font, theme, eod_hour, updated_at)` (`db/user_settings.sql`) | `app/src/lib/settings.ts saveSettings()` (⚙️ הגדרות) | `loadSettings()` at boot and on `user-changed` | Identity is the person's NAME (`dashboard_user_v1`), the app's only identity. A **localStorage mirror** (`sigma_settings_v1`) is authoritative for the first paint and offline; the row is merged over it field-by-field (`mergeSettings`), so an unknown value from another build cannot strand someone on the defaults. `card_desc` drives the phone clamp (§7k #2), `font` writes the `--font` token, `landing` overrides the §7l role default. Task 15 extends both. |
| `visits.open_items text` (`db/visits_open_items.sql`) | `saveVisit()` in `js/src/09-visits.js` (the "מה נשאר לי פתוח" field) | the visit form's edit path, the last-visit block, the visits PDF/Excel (`js/src/12-reports.js`, `js/src/21-excel-export.js`), and the briefing's previous-visit block (Task 5) | The summary is now TWO fields: `summary` = "מה עשיתי בביקור", `open_items` = what he left open (§5.1b). Old visits have `null` — every reader treats that as "nothing left open", never as an error. |
| `visit_drafts(id pk, person, kibbutz, date, payload jsonb, updated_at)` (`db/visit_drafts.sql`) | `visitDraftSave()` in `js/src/09-visits.js` — debounced 800 ms, plus `switchTab` / `pagehide` / `visibilitychange` | `visitDraftFor()` via the bridge (the card chip, the "המשך טיוטה" prompt, the 🚚 gate) | **`id` is the PRE-MINTED visit id** (`visitDraftId()`), so a draft, the delivery certificate issued from it and the saved visit share one identity — the cert's `refId` keeps pointing at the right visit before the visit row exists. Deleted on a successful save. A localStorage mirror (`visitDraft_v1`) carries the offline case. 14-day sweep statement is in the .sql. |

### Bridge surface added (`js/src/00-bridge.js`)

| Surface | Direction | Why |
|---|---|---|
| `sigma.visitDraftFor(kibbutz, person, date)` → `{id, updated_at, payload} \| null` | React → legacy | The card chip "סיכום ביקור בהתהוות" and the "המשך טיוטה מ-HH:MM" prompt need to know a draft exists WITHOUT owning the draft format. The legacy module is the only writer, so it is the only reader too. |
| `sigma.visitDraftDiscard(id?)` | React → legacy | "התחל מחדש" in the resume prompt. |
| `sigma.onLanding(target, role)` — **optional hook, assigned by a later task** | landing → legacy | §7l's landing calls it after the first screen is chosen, for every role. Task 5 attaches the field arrival sheet here instead of editing `app/src/lib/landing.ts`. |
| `sigma.openCommandBar()` | legacy → React | The desktop header search and the phone search field open the Ctrl+K list (§7k.1) instead of carrying their own result UI. |

### Query keys / events added

| Key or event | Fired / invalidated by | Read by |
|---|---|---|
| `visit-draft-changed` (sigmaBus) | every `visitDraftSave()` / discard / delete-on-save | the card's draft chip, the briefing (Task 5) |
| `sigma-open-settings` (window event, `SETTINGS_OPEN_EVENT`) | the ⋯ sheet row, the user-chip menu, Ctrl+K | `islands/Settings.tsx` | The event lives in `lib/settings.ts`, NOT in the island, so the boot chunk can ask for the panel without importing it. |

### Standing rulings from Task 4

| Ruling | What it means in code |
|---|---|
| **The ⋯ sheet badges are ATTENTION ONLY** (§7k #3). | `registry.itemBadge()` — a positive integer means "this needs you". Totals and "new since" counts get no badge. The gaps badge is 0 until Task 15 computes it. |
| **No page is retired here** (§7m guard rail). | `MoreSheet`'s `MORE_PAGES` still lists משימות / EMS / עובדים; Task 14 removes them after a coverage audit. |
| **The tokens-only region of `css/app.css` may not contain a hex literal.** | The marked `/* @tokens-only */ … /* @end */` block; `test-theme.mjs` fails the build otherwise. New legacy CSS goes inside it. |
| **RTL is a release gate.** | `test-rtl.mjs` — logical properties only in the new CSS and in `app/src/**`; a physical property needs a `/* rtl-ok */` on the line, with the reason. |
| **The UI never explains its own mechanics, and never says who else sees the data.** | `test-copy-rules.mjs` greps `app/src/**` and `index.html` for the banned words. |

### Task 4 — review fix round 1

| Change | Why it matters downstream |
|---|---|
| The visit-draft mirror is a **MAP** keyed `person|kibbutz|date` in `localStorage['visitDrafts_v2']` (was one slot in `visitDraft_v1`, which a second kibbutz overwrote). `visitDraftFor(kibbutz?, person?, date?)` still answers one row — the NEWEST when the query is widened — and `visitDraftsForPerson(person)` lists them all, newest first. A v1 row is migrated on the first read. | Anything asking "is there a draft?" keeps the same call. Anything LISTING drafts (Task 5's briefing, Task 15's gaps line) should use `visitDraftsForPerson` rather than assuming one. |
| `visitDraftsSync()` READS `visit_drafts` for the logged-in person and merges newest-`updated_at`-wins into the mirror (pure `draftMergeRows`, tested). Called on `switchTab('visit')` and on `user-changed`. | The table is no longer write-only, so "the draft follows you to another device" is now true. A new draft writer must keep `updated_at` honest — it is the only tie-breaker. |
| `user_settings` now carries **`updated_at` as the person's own choice stamp**, and `pickNewer(local, remote)` decides boot conflicts newest-wins; a device that is ahead PUSHES its row back. | Task 15 must stamp every settings write (`setSettingsLocal` does it by default) and must pass `{ stamp: false }` when the patch came FROM the row, or the row's timestamp is lost and the two devices ping-pong. |
| `primaryAdd`'s labels: only `kibbutz` / `visit` / `feedback` carry ➕. `stockChange` / `schedule` / `event` read "עבור למלאי" / "עבור ליומן" until Tasks 8/13 ship their forms — `ADD_OPENS_FORM` is the flag to flip. | §7k.2's matrix is unchanged; only the wording is. When those forms land, flip the flag and the label in ONE place and the header icon follows. |
| Ctrl+K renders ONE flat ranked list with the kind labels as dividers (`flatWithHeadings`), because cmdk selects by DOM order and real groups made Enter run the first ACTION instead of the top hit. | Any new command source just needs a `kind`; do not reintroduce `CommandGroup` per kind. |

## QA gates (Task 22 — P0) — the commands every later task is measured by

`npm run qa` (= `scripts/qa.mjs`) runs six gates on the current tree, writes
`qa/reports/<yyyy-mm-dd>-<label>.md`, and exits non-zero if any of them failed.
**Definition of Done for every task from P0 on: `npm run qa` green + the reviewer can read
`qa/reports/<date>-task-N.md`.** Install steps, per-gate detail and every fallback:
[`qa/README.md`](../qa/README.md).

| # | Gate | Command | Threshold |
|---|------|---------|-----------|
| 1 | gitleaks | `qa/bin/gitleaks.exe detect --source . --config qa/gitleaks/.gitleaks.toml --no-git` | 0 findings |
| 2 | semgrep | `npm run qa -- --only semgrep` (manifest: `qa/semgrep/config.yml`) | 0 ERROR / 0 WARNING |
| 3 | existing suites | `npm test` | green |
| 4 | Playwright | `npx playwright test --config qa/playwright/playwright.config.ts` | 4 projects green, no console errors |
| 5 | Lighthouse | `node qa/lighthouse/run.mjs` | perf ≥ 85 · a11y ≥ 95 · bp ≥ 95 |
| 6 | ZAP baseline | `pwsh -File qa/zap/baseline.ps1` · `bash qa/zap/baseline.sh` | 0 High / 0 Medium (passive) |

```bash
npm run qa                        # all six
npm run qa -- --label task-23     # → qa/reports/<date>-task-23.md
npm run qa -- --only playwright   # one gate (repeatable)
git config core.hooksPath .githooks   # ONCE per clone / worktree: pre-commit = gitleaks --staged
```

### Standing rulings from Task 22 (do not re-litigate per task)

| Ruling | What it means in code |
|---|---|
| **A gate is never silently skipped.** | Only the ZAP baseline may report `SKIPPED`, and only when Docker is absent (its script exits 2). Every other gate is PASS or FAIL. |
| **Thresholds are not lowered to make a run pass.** | A page that cannot reach a Lighthouse threshold gets its numbers and its top causes written into the report instead. |
| **An accepted finding is recorded, not hidden.** | `qa/semgrep/config.yml` `exclude_rules` / the allowlist in `qa/gitleaks/.gitleaks.toml`, each with the sites reviewed and the reason. A NEW site under an already-excluded rule is not automatically safe. |
| **The Playwright suite owns port 8124.** | Not 8123: `cards-wt` serves this worktree there with a single-threaded python server, which drops island-chunk requests under four workers. The suite starts `qa/playwright/server.mjs` itself (`reuseExistingServer: false`). |
| **Specs are hermetic and can never write to production.** | `qa/playwright/tests/_helpers.ts` `boot()` serves Supabase reads from `_fixtures.ts` and answers every write 401 — which is a real mock-mode session, and the reason a spec can assert the "יש להתחבר ל-EMS כדי לשמור" hint. A new island's tables go in `_fixtures.ts`, not in a live call. |
| **One spec per screen, four projects, RTL asserted in every one.** | `desktop-1440-{light,dark}` + `mobile-390-{light,dark}`; `expectRtl()` + `expectNoConsoleErrors()` end every test. A new feature adds its spec to `qa/playwright/tests/`. |
| **The fixture rows are UI fixtures, not a copy of production.** | Two sections · three regions · one sub-site · one 🤝 marketing row · one gas site — so section headers, region sub-labels, both chips and a non-⚡ energy badge all have something to render. |

### Bugs the backfill found and fixed (Task 22)

| Fix | Downstream note |
|---|---|
| `app/src/islands/Feedback.tsx` now listens for **`sigma-open-feedback`** (exported as `FEEDBACK_OPEN_EVENT`). The command bar's 📣 action and `runAdd('feedback')` dispatch that event and nothing was listening, so both did nothing at all. | Any surface may open the sheet with `window.dispatchEvent(new CustomEvent('sigma-open-feedback'))`; importing `openFeedback()` still works. |
| `app/src/lib/feedback.ts` gained the **`record-denied`** voice event. A microphone refused during the RECORD leg was reported as `live-denied`, which only the `listening` phase handles — so the sheet sat on "מקליט…" for 10 s and then blamed the wrong thing ("המיקרופון לא נפתח"). It now fails immediately with "אין הרשאה למיקרופון — אפשר להקליד". | Task 6b (Whisper live) must keep the two legs' error events distinct: `live-denied` for the listening leg, `record-denied` for the recorder. |
| `stats.html` — the jsdelivr `chart.js` tag gained `integrity` + `crossorigin` (semgrep `missing-integrity`). | Any new CDN tag needs an SRI hash or gate 2 fails. |
| `scripts/test-all.mjs` — dropped `shell: true` in favour of `npm.cmd` on Windows (semgrep `spawn-shell-true`). | Spawn native commands by name, never through a shell. |

## Surfaces / channels added by the field-day task (Task 5, spec §5)

| Surface | Direction | Why |
|---|---|---|
| `sigma.prefillOpenItems(kibbutz, text)` | React → legacy (`js/src/00-bridge.js`) | the briefing's "לפני שיוצאים" leftovers have to land in the visit form's `#visitOpenItems` (§5.1b). React must not touch legacy form DOM, so it hands the text over and the bridge writes it on the next `visit-form-open` — **once**, and only while the field is still empty, so a restored draft's own words always win. The `input` event it fires is what makes the draft autosave pick the text up. |
| `window.sigmaField` = `{ maybeOpen, openArrival, openBriefing(name), dismiss(cid) }` | island → legacy / island → island | `components/Nav.tsx`'s raised 📍 calls `maybeOpen()`: a field worker with no check-in today gets the arrival sheet, everyone else goes straight to the visit form (§5.1 fast path + §7k #1). `js/src/22-push.js` calls `dismiss(cid)` for the `?pushact=visitDismiss` deep link — the island owns the write, because it owns the supabase-js client and the query cache. Deleted on unmount. |
| `sigma.onLanding(target, role)` | legacy/React landing (§7l) → island | the one hook `app/src/lib/landing.ts` already called for every role. The field island wraps it (keeping any previous hook) and opens the arrival sheet when a `field` role lands on קיבוצים with no check-in. Latched by `window._fieldPromptShown` — **once per browser session**, like the push and attendance prompts, which is also how the Playwright harness keeps it off unrelated specs. |
| `?pushact=visit&kibbutz=<name>` · `?pushact=visitDismiss&cid=<id>` | push → `js/src/22-push.js` → island / bridge | the notification's two buttons. `visit` → `sigma.openVisitQuick(kibbutz)` (the form, kibbutz prefilled, one tap); `visitDismiss` → `sigmaField.dismiss(cid)`, which retries for ~5 s because the field island is a lazy chunk. `sw.js` needs no change — `actUrls` in the payload's `data` already routes both. |
| `#sigma-today` (new placeholder, ABOVE `#sigma-home`) | index.html → island | the "היום" strip (§7k #11): today's stops from `day_plans` + check-ins, and the in-app mirror of the 2 h nudge (§7k #4), rendered from the clock and **independent of push delivery**. Same lazy chunk as `#sigma-field`, two roots. Renders nothing for a non-field role or a closed session gate. |

## Surfaces / channels added by the 🔥 צריבות task (Task 23 — a TEMPORARY project)

צריבות is a few months of field work, not a part of the app. It therefore has **no nav tab**: it
lives on the surfaces where the work happens, and **one flag removes all of them**.

| Surface | Direction | Why |
|---|---|---|
| `window.BURNS_PROJECT_ACTIVE` (set in `js/src/24-meter-burns.js`) | legacy → everything | **the removal path.** `false` hides the card chip, the card-modal section, the briefing rows, the landing strip, the ⋯ עוד row and the full-table page; the `meter_burns` rows stay for the report. The React half reads the same global through `app/src/lib/burns.ts:burnsProjectActive()`, which treats *absent* as active so an island loaded without the legacy bundle (vitest) still renders. |
| `app/src/lib/burns.ts` — `canSeeBurns` / `canWriteBurns` | pure | THE audience gate, mirrored in `js/src/24-meter-burns.js` between `BURN-AUDIENCE-START/END` (`test-meter-burns.mjs` asserts the two lists match). Write: אביאם/ניתאי/עידן/עמיחי · read: + the viewer · hidden: מתניה/אליה and any unknown name. |
| `#sigma-burns` (new placeholder, between `#sigma-today` and the cards) | index.html → island | the progress strip. Work for the field team (`🔥 צריבות — נותרו N ב-M קיבוצים`), **progress** for everyone else (`בוצעו X מתוך Y · NN%` — עידן 18.9 21:50, so it is not only a field surface). Hidden at zero. |
| `#sigma-burns-modal` (new placeholder, in `#tab-meetings`) | legacy → island | the card modal's 🔥 צריבות section. `js/src/10-activity.js:openEditModal` stamps `data-kibbutz` on it, exactly like `#sigma-modal-meetings`; the shared `app/src/lib/modalSlot.ts:useModalKibbutz(slotId)` observes it, so ONE root serves every card. |
| `body.burn-filter-on` + `.kibbutz.burn-filtered-out` | island → the card DOM | tapping the strip filters the cards to the kibbutzim that still have pending burns. A class, not a React filter, because the strip is its own root and must not own the home island's state; released on a second tap and on unmount. |
| `sigma.showPage('burns')` + `canShowPage('burns')` | React → legacy | the full table / Excel / generators helper is one legacy screen (`js/src/24-meter-burns.js`), reached from the strip's "הכול ›", from the section's link and from ⋯ עוד → צריבות מונים (פרויקט זמני). `canShowPage` asks the legacy `burnCanSee()`, so a stale deep link lands on 🏘 קיבוצים instead of on a page the person may not see. |
| ⋯ עוד row `burns-table` | island → registry | registered by `islands/Burns.tsx` with a LIVE `visible` predicate, so a `changeUser()` (or the flag going false) takes the row away without a reload. |
| `LeaveItem.kind = 'burn'` + `LeaveItem.meterId` (`app/src/lib/field.ts`) | pure → the briefing | the pending meters of the kibbutz become "לפני שיוצאים" rows, LAST in the list. Ticking one is not a checkbox — `islands/Field.tsx:toggleLeaveItem` calls `markBurned`, optimistically, rolling back on a refusal. `burn` rows are deliberately **excluded from `openItemsPrefill`**: an unburned meter is a `meter_burns` row, not a line of free text in a visit summary. |

## Surfaces / channels added by the stale-while-revalidate task (Task 20, spec §7k #10)

עידן's ruling: every screen paints the **last known state instantly** and refreshes silently
behind it; skeletons only when there is no cache at all; pull-to-refresh on the phone; and the
shared EMS snapshot keeps refreshing even when nobody has the app open.

| Surface | Direction | Why |
|---|---|---|
| `app/src/lib/query.ts` — `QUERY_DEFAULTS` (`refetchOnMount:'always'` · `refetchOnWindowFocus` · `networkMode:'offlineFirst'` · `staleTime` 60 s · `gcTime` 24 h) | the policy every island inherits | the four settings ARE decision #10. `'always'` is what makes painting a stale cache safe; `offlineFirst` is because `navigator.onLine` is wrong often enough on cellular in a קיבוץ that the default `'online'` mode would leave screens `fetchStatus:'paused'` with no refresh at all. Pinned by name in `app/src/lib/query.test.ts` — a diff that "tidies" one of them fails the suite. |
| `app/src/lib/query.ts` — `persistedHas` / `hasPersistedData(key)` | pure + localStorage | the persister restores one microtask AFTER the first render, so `useQuery` honestly reports `isLoading` while a full answer sits in `sigma-query-cache-v1`. Asking the blob directly is how a screen distinguishes "nothing to show" from "a paint is one tick away". |
| `app/src/lib/query.ts` — `showSkeleton(hasData, cached)` | pure | the one sentence of #10, as a function. Used by `islands/Home.tsx`, whose `cached` is the legacy `kibbutzim_v1` mirror **or** the persisted blob. The other islands already gated on TanStack `isLoading`, which is false once data exists. |
| `app/src/lib/query.ts` — `refreshAll()` | island → both caches | invalidate every query **and** force `sigma.emsSync(true)`. Two different caches: TanStack's, and the shared EMS snapshot in `ems_cache` that the on-card task widget reads. Never rejects — a gesture must not raise an unhandled rejection. |
| `#sigma-refresh` (new placeholder, next to `#sigma-toaster`) → `components/PullToRefresh.tsx` | index.html → island | ONE pull-to-refresh for the whole app. The touch listeners are on `document`, so a single mount serves every page; a `window.__sigmaPullToRefresh` claim makes a second instance inert (one pull must never refresh twice). Phone only, via `matchMedia('(max-width: 767px)')` re-evaluated on change. Lazy + `whenIdle` so TanStack stays out of the boot chunk. |
| `sigma.emsSync(force?)` → `Promise<boolean>` | React → legacy (`js/src/13-ems.js:emsBackgroundSync`) | refresh the SHARED snapshot now. `force` skips the 5-minute throttle (that is the pull-to-refresh path); a bare call is a nudge the throttle may decline. Resolves `false` when nothing happened and never rejects. |
| `js/src/13-ems.js` — `emsBackgroundSync` / `emsBgSyncInstall` / `emsBgDue` | legacy, installed from `js/src/01-data.js` | the snapshot used to refresh only on CONNECT (`emsOnConnected`, once per session). Now: any page, on `visibilitychange`, on `focus` and on a 5-minute tick, while connected. The throttle stamp (`localStorage['ems_bg_sync_at_v1']`) is shared across tabs, so three tabs cost one crawl; `emsSyncCache` stamps it too, so a sync from any path resets it. Emits the existing `ems-cache-synced`. `emsBgDue` is pure and pinned by `test-ems-refresh.mjs`, including the clock-went-backwards case. |
| `scripts/ems-cache-refresh.mjs` (+ `docs/ems-cache-refresh.md`) | office PC → `ems_cache` | the half-hourly job for the hours when nobody is in the app. It reproduces the browser's three steps: EMS sign-in → `functions/v1/ems-auth` → `POST /rest/v1/ems_cache?on_conflict=id`. **`emsCacheWrite` is not an Apps Script call** — `js/src/01-data.js` intercepts it and upserts Supabase with the authenticated bridge pass, and the anon key is read-only, which is why the job needs the mint. Credentials come from a git-ignored `.env`; nothing is hardcoded and nothing is logged. |
| `kibbutzim-published` → `islands/CommandBar.tsx` | island → island | the regression this task's own QA run caught, and the fix. Ctrl+K builds its source list once per open from two stores that notify nobody; the boot-time work this task added was enough to get a Ctrl+K in before the card home published them, and the bar then answered "לא נמצא כלום" for a kibbutz on the screen behind it (2 of 3 full Playwright runs, against 0 of 3 on the same tree without Task 20). Two changes: the bar rebuilds on the event while open, and the pull-to-refresh chunk moved off `whenIdle` to the first `touchstart`, so it no longer competes with the card home's effect flush. |
| `scripts/ems-cache-refresh.mjs:slimTask` ↔ `js/src/13-ems.js:emsSlimTask` | the one contract that can hurt | both write the same `ems_cache.tasks` column and the card renders whichever landed last, so a drifted mapper would blank task text for everyone with no obvious cause. `test-ems-refresh.mjs` runs the REAL `emsSlimTask` out of the legacy source over `qa/fixtures/ems-tasks.json` and diffs values AND key order; it also pins `EMS_CACHE_VER` and `OPEN_STATUSES = EMS_STATUS − EMS_CLOSED`. |

## Surfaces / channels added by ▶ מצב ישיבה (Task 24, company-process spec §1.2 + §1.2b)

The in-meeting screen. It writes to three places and reads from four, and the one thing that
must stay true is that it never becomes the place a decision LIVES: the navigation log is a
timeline for splitting the recording (§1.3), and anything that has to survive the meeting is
written through the paths that already own it.

| Surface | Direction | Why |
|---|---|---|
| `meeting_sessions` (`db/meeting_sessions.sql`) | island → Postgres | one row per run of the screen. `started_at` is the zero of every event's `t_sec`, and `ended_at` is stamped on the way out. A failed insert is **not** fatal — the overlay runs with `session === null` and simply logs nothing, because a meeting must not be blocked by its own bookkeeping. |
| `meeting_events` (`db/meeting_events.sql`) | island → Postgres | the navigation log: `kibbutz` (the segment boundary) · `marker` (Space) · `parking` (P) · `note` (the typed line) · `general` · `issue`. Offsets, never wall clocks: §1.3 lines the log up against a recording that started when עידן pressed record. |
| `kibbutz_meeting_notes.source` (`db/kibbutz_meeting_notes_source.sql`) | migration | `'live'` = typed during the meeting, `'review'` = Task 25, `null`/`'import'` = the pasted summary. The import is idempotent by `(kibbutz, meeting_date, meeting_kind, seq)`, so a line that was never in the summary has to be distinguishable or a re-import would fight it. |
| `app/src/lib/meetingSession.ts` — `presenterOrder` | pure | imports `groupBySection` from `lib/kibbutzim.ts` and flattens it. It does **not** re-implement the comparator: the meeting walks the board, and a second sort is how the two would drift. |
| `app/src/lib/meetingSession.ts` — `tSec` / `nextIndex` / `carryOverLine` / `eventRow` / `canPresent` | pure | the whole decision surface of the screen, golden-tested without a DOM (`meetingSession.test.ts`). `tSec` clamps clock skew to 0 (a negative offset would place an event before the recording starts); `nextIndex` never wraps (wrapping looks like the meeting restarted). |
| `sigma.createTask(taskFromBullet(...))` | island → legacy → EMS | the ✏️ 📋 chip reuses the EXISTING chain (`components/home/MeetingNotes.tsx:linkNoteToTask` uses the same one), so the offline queue and the `ems-queue-flushed` id resolution keep working from here for free. |
| `notes-changed` (existing event) | island → every card | emitted after the ✏️ sheet creates anything, so the cards behind the overlay are already right when he exits. |
| Query key `['cal', 'events', today, today]` | shared with `islands/Calendar.tsx` | the 🎥 Meet link of today's company/dev meeting is **display only** and comes from the calendar's own query, reused by key so the two share one fetch. No second data path. |
| `sigma.presenterStrip?(kibbutz)` | optional, Task 28 → island | the third state strip, read through the bridge rather than imported. Absent → nothing renders and nothing errors; Task 24 has **no** dependency on Task 28. |
| `#sigma-presenter` (new placeholder, after `#sigma-daylog`) → `islands/Presenter.tsx` | index.html → island | deferred behind `whenIdle` like the gaps and day-log panels, with the ⋯ row and the opener registered eagerly (the task-15 cold-tap lesson) and the cold-open flag consumed inside the island's first render. |
| ⋯ עוד row `presenter` (group `admin`) | island + `main.tsx` → registry | `canPresent(isAdmin, isViewer)` — עידן and עמיחי, never a viewer, asked LIVE so a `changeUser()` takes the row away without a reload. |
| 🔒 פנימי chip — **offered** (Task 26) | — | `INTERNAL_TASKS_WRITABLE` in **`app/src/lib/caps.ts`** flipped to `true`: `internal_tasks` now has a client write path (`components/home/InternalTasks.tsx`), so the chip that was hidden here and in `islands/MeetingReview.tsx` is offered in both — one flag, both screens agree. |

## 📝 ישיבה → סיכום (Task 25, company-process spec §1.3)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/meetingReview.ts` — `proposeChip` · `draftFromParsed` · `setChip`/`setOwner`/`editLine`/`addLine`/`moveLine`/`removeLine`/`setTask` · `reviewSummary` · `applyReview` | pure | the whole review, golden-tested without a DOM (`meetingReview.test.ts` + `__fixtures__/review_17.9.26.json`). A **contract test asserts the module imports nothing but `./meetingNotes`** — "nothing is written before בצע" is then a property of the code, not a promise in a comment. Every mutator is immutable, which is what makes ביטול real. |
| `import_meeting_notes(jsonb)` (`db/kibbutz_meeting_notes_import.sql`) | `islands/MeetingReview.tsx:saveReview` → Postgres | the review commits through the SAME transactional merge the import uses, on the same `(kibbutz, meeting_date, meeting_kind, seq)` key. Reviewing a meeting that was already imported therefore REPLACES its bullets instead of doubling them, and keeps every `ems_task_id` / `done_at` set in between. No second write path, and no new migration. |
| `sigma.createTask(taskFromBullet(...))` + `kibbutz_meeting_notes.ems_task_id` PATCH | island → legacy → EMS, then → Postgres | one task per 📋 line at בצע, then the note it came from is linked — the same two steps `components/home/MeetingNotes.tsx:linkNoteToTask` does for a single bullet. Not reused as a call: the review carries the 📋 modal's per-line overrides, which that helper cannot see. A queued task still links, as `pending:…`, so `resolvePendingTasks` picks it up. |
| `sigma.emsSiteIdForKibbutz(kibbutz)` | island → legacy | display only, inside the 📋 modal: it says whether the kibbutz resolves to an EMS site BEFORE בצע, so a card with no site is seen here instead of after the task went out under none. `createTask` resolves the site itself (`js/src/13-ems.js`). |
| `notes-changed` (existing event) | island → every card | emitted once after בצע, so the cards are right the moment the sheet closes. |
| `📝 עבור על הסיכום` (`islands/ImportNotes.tsx:review`) | island → island | the hand-off. `import('@/islands/MeetingReview')` is dynamic, so an ordinary import never pays for the review chunk; the straight `שמור N בולטים` path is untouched. The parse is handed over as an object — nothing round-trips through the database in between. |
| `sigma-open-import` window event (`islands/ImportNotes.tsx:IMPORT_OPEN_EVENT`) | page → island | the import sheet joins the other sheets (feedback, day log, מצב ישיבה) in being openable by event. The module opener stays for in-bundle callers; the event is what the legacy page and the QA harness can reach. |
| `#sigma-meeting-review` (new placeholder, after `#sigma-presenter`) → `islands/MeetingReview.tsx` | index.html → island | mounted ON DEMAND by the hand-off (`mount()` is idempotent), so it costs nothing anywhere else. The draft handed over before the first render waits in the module's `pending` slot and is consumed inside that render — the presenter's cold-open lesson. |
| Role gate `canReview(isAdmin, isViewer)` | island | עידן + עמיחי, never a viewer, asked LIVE at open AND re-checked while open, so a `changeUser()` closes the sheet instead of leaving a write surface up. |

## 🔒 internal tasks (Task 26, company-process spec §2 + §8b: no due dates, no reminders)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/internalTasks.ts` — `openFor` · `myOpen` · `countBadge` · `toggleDone` · `promoteToEms` · `canWriteInternal` | pure | every decision golden-tested (`internalTasks.test.ts`), including a **contract sweep asserting the module has no field named `due` or `remind`** — the §8b ruling enforced on the source, not trusted. `promoteToEms` reuses `meetingNotes.ts:taskFromBullet` rather than a second payload shape. |
| `internal_tasks` table (`db/internal_tasks.sql`, created by Task 14, unchanged by Task 26 — `if not exists` made the schema a no-op to re-declare) | Postgres | RLS: read-all, write-authenticated. `kibbutz = null` = company-wide, read by `islands/Calendar.tsx`'s list-view "חברה" group (`companyItems`, Task 14); `kibbutz = '<name>'` is this task's per-kibbutz card section. |
| `INTERNAL_TASKS_WRITABLE` (`app/src/lib/caps.ts`) flipped `false` → `true` | one flag, four readers | `components/home/InternalTasks.tsx` (new UI), `islands/Presenter.tsx` (live ✏️ 🔒 chip), `islands/MeetingReview.tsx` (review 🔒 chip + `saveReview`'s `internal_tasks` insert) all read the same const — none holds its own copy, so they cannot drift out of sync. |
| `internal-tasks-changed` (new `sigmaBus` event, `components/home/InternalTasks.tsx:emitInternalTasksChanged`) | island → every card + "היום שלי" | ONE listener at module scope (same pattern as `notes-changed`) invalidates `['internalTasks']` — a listener per card would mean one per card. Emitted by every write: add, ✓ toggle, ⬆ promote. |
| Query key `['internalTasks']` | shared | one fetch (`select * from internal_tasks`) feeds every card's 🔒 section, "היום שלי" (`islands/PmToday.tsx`), and (read-only, via `sigma.companyTasks?.()` fallback) the calendar list's "חברה" group. |
| `<InternalTasksSection kibbutz canAct>` in `components/home/KibbutzCard.tsx` | React tree | card order stays EMS tasks → notes → 🔒 (§7k #7); renders nothing when there is nothing open and the viewer cannot write, so a quiet kibbutz never grows a box. |
| `#sigma-pm-today` (existing placeholder, §7l — left empty for Tasks 15/16) → `islands/PmToday.tsx` | index.html → island, new lazy chunk | Task 26 fills it with `MyInternalTasks` (the person's own open 🔒 rows, company-wide + every kibbutz); Task 15/16's EMS "היום שלי" card set, if it ships later, adds to the same root rather than replacing it. |
| ⬆ הפוך למשימת EMS (`promoteInternalTask`) | island → legacy → EMS, then → Postgres | creates the EMS task first, THEN sets the internal row `done = true` — never the reverse, so a failed EMS create leaves the row open for retry. |
| Legacy company-task retirement (redundancy-audit R-rulings) | — | already done by Task 14: the home "משימות חברה כלליות" block is removed, `settings.companyTasks` migrated one-shot into `internal_tasks` (`kibbutz = null`), and the calendar list's "חברה" group reads the real rows with the legacy settings row as a fallback only until the migration lands (`db/internal_tasks.sql`'s trailing `insert`). Task 26 adds nothing here — the per-kibbutz 🔒 section is new surface, not a retirement. |

## 🆕 new-client onboarding (Task 27, company-process spec §4)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/onboarding.ts` — `stepsFromTemplate` · `progressOf` · `daysInOnboarding` · `waitAge` · `nextStep` · `isComplete` · `nextState` · `canEditTemplate` | pure | golden-tested (`onboarding.test.ts`), including a DST-boundary date built from Y/M/D parts (methodology) and the role matrix (`canEditTemplate` — עידן only). |
| `onboarding_templates` (`db/onboarding_templates.sql`) — one seeded `'ברירת מחדל'` row, `steps: jsonb[{key,label,waits}]` | Postgres | RLS: read-all, write-authenticated (UI, not RLS, gates the write to עידן — same pattern as every other single-person gate in this app). |
| `onboarding_steps` (`db/onboarding_steps.sql`) — frozen per-kibbutz copy, unique `(kibbutz, step_key)`, `state` open\|waiting\|done | Postgres | spawned once at create time (`spawnOnboardingForNewKibbutz`, upsert with `ignoreDuplicates` so a retried create is a no-op); editing the template afterwards never touches an already-spawned row. |
| `onboarding-changed` (new `sigmaBus` event, `components/home/OnboardingProgress.tsx:emitOnboardingChanged`) | island → every 🆕 card | ONE listener at module scope (same pattern as `internal-tasks-changed`) invalidates `['onboardingSteps']`. Emitted by a step tap and by a fresh spawn. |
| Query key `['onboardingSteps']` | shared | one fetch feeds every 🆕 card's strip; `stepsForKibbutz` filters client-side, same shape as `internalTasks.ts:openFor`. |
| `<OnboardingProgress kibbutz canAct>` in `components/home/KibbutzCard.tsx`, gated `section === 'new'` | React tree | a ✅ active card never renders the strip — it has no spawned rows once it graduates, and the gate is belt-and-suspenders even if rows lingered. |
| `spawnOnboardingForNewKibbutz` wired into `components/home/KibbutzSheet.tsx`'s `save()` | island → Postgres | fires only on a genuine INSERT (`!row?.id`) with `section === 'new'`; best-effort (`.catch`) so a template hiccup never blocks the kibbutz itself from saving. |
| `OnboardingTemplateRow` in `islands/Settings.tsx`, gated `canEditTemplate(user)` | React tree | an ordered-list editor (reorder / relabel / toggle ממתין למייל) for עידן only; `saveOnboardingTemplate` writes only `steps` + `updated_by/at` — never touches `onboarding_steps`. |
| עמיחי's onboarding-age overview column | deferred | `lib/landing.ts` notes the CEO/עמיחי "סקירה" table isn't built yet (later task). `daysInOnboarding` is the pure function that table will call per client — nothing to wire until the table itself exists. |

## 🩺 מצב הקיבוץ — health v1 DRAFT (Task 28, company-process spec §5 + ruling §8b)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/health.ts` — `HEALTH_CONFIG_DRAFT` · `scoreFinance` · `scoreEnergy` · `scoreAlerts` · `scoreRecurring` · `healthOf` · `bandOf` · `canSeeHealth` | pure | the whole tuning surface is ONE exported const, so 22.9's answer (`sigma-health-v1-thresholds`) is a one-line diff. A contract sweep in `health.test.ts` reads the source and fails if any scorer body carries a digit — every threshold therefore comes from the config by construction. `null` in → `{score: null, why: 'אין נתונים'}`, and a null signal is **excluded from the average**, never counted as 0: a source nobody wired up must not fake a red. |
| `canSeeHealth(user, role)` → `audienceFor(role).health` (`app/src/lib/field.ts`) | pure → pure | who may look at a management signal is decided once, in §5.1b's `audienceFor`, and re-used here rather than re-derived. On top of it: עמיחי, עידן, and a read-only viewer. |
| `app/src/lib/healthSources.ts` — `HealthSource` · `emsApiSource` · `nullSource` · `sourceFor(cfg, deps)` · `loadHealth` | island → legacy → EMS | the §9 "EMS API vs read-only Postgres" question never reaches the UI: the strip asks a `HealthSource` and gets inputs or `null`. EMS exposes `/sites`, `/meters`, `/employee-tasks`, `/users` and nothing else, so **מאזן כספי, מאזן אנרגיה and בעיות חוזרות are `null` today** and only the age of the oldest open `/employee-tasks` row is real. `pgReadOnlySource` is deliberately NOT written — the interface is the deliverable. |
| `kibbutz_health` (`db/kibbutz_health.sql`) | Postgres | the on-demand cache: `kibbutz` pk · `score numeric` · `signals jsonb` · `computed_at`. RLS read-all / write-authenticated, like `onboarding_steps`. **No pg_cron job** until the thresholds are real — nothing nightly publishes unapproved numbers. |
| `#sigma-health-modal` (new slot in `index.html`, stamped by `js/src/10-activity.js:openEditModal`) → `islands/Health.tsx` | legacy → island, new lazy chunk | the third slot on the meetings/צריבות contract: ONE root for the session reads `data-kibbutz` off its own slot (`lib/modalSlot.ts`). Renders nothing outside the overview's audience. |
| `sigma.presenterStrip` ← `components/home/HealthStrip.tsx:presenterStripFor` | island → bridge → `islands/Presenter.tsx` | Task 24 reads this optional hook off the bridge, so the dependency runs one way only: the presenter never imports this file, and a page without the health chunk simply shows two strips. Served from the last answer the strip already has — the presenter triggers no second fetch. |
| Query key `['kibbutzHealth', kibbutz]` | island | one query per kibbutz, `staleTime` 5 min, `retry: false` — an EMS that is not signed in answers `null` rather than retrying behind a modal. |
| טיוטה marker | UI | permanent for v1: the strip says the numbers are a draft and that nobody should act on them yet. Removing it is part of the 22.9 follow-up, not of this task. |

## ⏱️ Clockify — ▶/■ שעות per kibbutz (Task 29, company-process spec §6 + ruling §8b)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/clockify.ts` — `canTrackTime` · `elapsed` · `formatElapsed` · `entryPayload` · `projectIdFor` · `tagIdsFor` · `tagsCached` · `loadRunning`/`saveRunning`/`clearRunning` · `startBlockedBy` | pure | every rule is a golden (`clockify.test.ts`, fake clock): the description format (`'<kibbutz> — <tags>'`, and **no dangling `— `** with no tags), the elapsed time across a reload and across midnight, the TTL cache that serves the STALE list when the API blinks, the duplicate-start guard and the role matrix (עידן ✓ מתניה ✓ אביאם ✗ עמיחי ✗ viewer ✗). |
| `supabase/functions/clockify/index.ts` — actions `tags` (rate-limited + 10-min instance cache) · `projects` · `entry` | island → edge function → Clockify | the ONLY holder of `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID` / `CLOCKIFY_USER_ID`. Same EMS gate, `{error}` shape, origin allowlist and hard fetch timeout as `supabase/functions/github/index.ts`. Creating a project is out of scope: an unmatched kibbutz gets `projectId: null` and keeps its name in the description. A sweep in `WorkTimer.test.tsx` asserts no `CLOCKIFY_*` read exists under `app/` or `js/`. |
| `work_sessions` (`db/work_sessions.sql`) — `clockify_id` **nullable** | Postgres | the row is the source of truth and Clockify is the mirror. RLS: read for authenticated, insert/update own rows only (`person = auth.jwt() ->> 'name'`). A partial index on `ended_at where clockify_id is null` is what a later quiet retry scans. |
| `components/home/WorkTimer.tsx` (button) + `WorkTimerStopSheet.tsx` (**lazy** chunk) + `workTimerApi.ts` / `workTimerEvents.ts` | React tree | the sheet, the Sheet primitives and the form are only loaded when someone actually stops a timer — the card itself pays for a button. The running session lives in `localStorage` (`sigma_clockify_running_v1`, keyed by person), so a reload keeps the clock and one person can only run one timer. |
| Attendee picker = `site_contacts` by `kibbutz`, addable inline | island → Postgres | the same rule as the visit summary: a name typed inline is usable immediately and is best-effort inserted into `site_contacts`; a refused insert never costs the session its attendee. |
| `work-session-saved` (new `sigmaBus` event, `workTimerEvents.ts`) | island → anyone | emitted once per saved session with `{kibbutz, clockify_id}`. `clockify_id = null` means "saved locally, not yet in Clockify" — the hook a later hours/retry surface listens on. |
| `sigma_clockify_tags_v1` (localStorage, 1 h) | client cache | the tag vocabulary is **theirs** (87 live tags) and is never hard-coded. A failed refresh keeps the stale list rather than emptying the picker. |

## ▶ ישיבת פיתוח — dev meeting mode + sprint prep (Task 30, company-process spec §7)

| Contract | Direction | Why it is here |
| --- | --- | --- |
| `app/src/lib/sprintPrep.ts` — `stageOf` · `walkOrder` · `cardsWithoutSpec` · `blockedOver` · `questionsForIdan` · `burndown` · `rankCard` · `proposeSprint` · `sprintList` · `devPrep` · `canRunDevMeeting` | pure | every judgement the meeting makes is a golden over one board fixture (`sprintPrep.test.ts`, 34 cases): the three-column walk order, the "no `## ` section = no spec" rule, the >7-day stall, עידן's open questions, a burndown that is 0/0 rather than NaN on an empty board, and a ranking that is **total and stable** (ties → issue number ascending, so a re-run never reshuffles the list under him). `rankCard` is the WHOLE ranking in one exported function, so re-tuning it is a change to four numbers and to nothing else. |
| `devPrep(cards, opts)` → the one object | pure | the presenter walks `walk`; the 📋 prep card prints `burndown` / `cardsWithoutSpec` / `blocked` / `questions` / `sprint`. **One derivation, two surfaces** — there is no second data path and therefore no way for the screen and the prep sheet to disagree in front of the room. |
| `proposeSprint` never proposes a parent | pure | the Git Ticket System's rule (every card is a CHILD under a Main Fields parent, title `[מודול] \| [תת-תחום] \| [תיאור]`) is **enforced** here, not trusted: `stageOf(card) === 'fields'` is filtered out before ranking, and a board of nothing but parents proposes nothing. |
| `rankCard({ redKibbutzim })` ← `sigma.healthBands` ← `components/home/HealthStrip.tsx:healthBandsKnown` | island → bridge → island | Task 28's red signal, read the same one-way, null-safe way `sigma.presenterStrip` already is: no health chunk on the page → no map → **no bonus and no crash**. This screen has no import of that task. Pinned by a golden that `redKibbutzim: null` and `[]` both leave the score untouched. |
| `app/src/lib/devBoard.ts` — `DEV_BOARD_QUERY_KEY('open')` · `fetchDevBoard` · `moveToSprint` | island → `github` Edge Function | the React side's ONE path to the dev board. The read is the function's **default mode** — the same call `js/src/18-dev-tasks.js` makes for 💻 לוח פיתוח — under one shared query key, so the walk and the prep card are one fetch. **No new Edge-Function action was added for this task.** |
| `moveToSprint(numbers)` → `mode:'setStatus'`, `status:'Ready'` | island → edge function → GitHub Projects v2 | accepting a proposal uses the **EXISTING** "העבר לספרינט הקרוב" write and nothing else. The dev meeting **never creates a ticket**: the QA harness refuses every github mode but `setStatus`, so a create would fail loudly rather than quietly inventing a card. |
| `islands/DevPresenter.tsx` — a SEPARATE island, not a `mode` prop on `Presenter.tsx` | decision | the two screens share their frame (timer, counter, key map, session row, event log) and that frame is already `lib/meetingSession.ts`, which this island imports. Below the header they share nothing: one walks kibbutz ROWS with two state strips, a bullet history and a ✏️ sheet writing to `kibbutz_meeting_notes`; the other walks GitHub CARDS across three board columns and writes to the board. A `mode` prop would have forked the data source, the strips, the body, the sheet and the footer — five branches in one 721-line file. |
| `meeting_events` rows of kind `issue`, carrying `issue_number` | island → Postgres | the dev meeting's navigation log, on the SAME table and the same offsets §1.3 lines up against the recording. Arriving at a card logs it once (keyed against StrictMode); 📌 adds one more row for the card on screen and the screen does not move. |
| `#sigma-dev-presenter` (new placeholder, after `#sigma-presenter`) → `islands/DevPresenter.tsx` | index.html → island | deferred behind `whenIdle` exactly like ▶ מצב ישיבה, with the ⋯ row and the opener registered eagerly (the task-15 cold-tap lesson) and the cold-open flag consumed inside the island's first render. |
| ⋯ עוד → **▶ ישיבת פיתוח** (`registry.ts`, group `admin`) | registry | gated live by the **dev page's own audience**: עידן + מתניה + אליה, or anyone the app already calls an admin, and **never a viewer** — the screen writes to the meeting log and moves cards on the board. Asked on every listing, so `changeUser()` cannot leave a stale row behind. |
