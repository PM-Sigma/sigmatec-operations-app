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
| `visit-saved` | `js/src/09-visits.js:413` | no island consumer yet — the cards' last-visit line is still a legacy decorator |
| `visit-form-open` | `js/src/02-init-attendance.js:13` (`switchTab('visit')`) | `components/home/CardActions.tsx` (🚚 waits for the form before asking for a cert) |
| `theme-changed` | `app/src/lib/theme.ts:applyTheme` | `components/ThemeToggle.tsx:12` · `components/ui/sonner.tsx:18` |
| **`notes-changed`** | `components/home/MeetingNotes.tsx:emitNotesChanged` — after import (`islands/ImportNotes.tsx:saveParsedMeeting`), ➕ link (`linkNoteToTask`), ✓ done (`setNoteDone`), pending→real id (`resolvePendingTasks`) | `MeetingNotes.tsx:listenForNotesChanges` → invalidates `['meetingNotes']`, which repaints **every card** (`components/home/KibbutzCard.tsx`) and the modal tab (`islands/ModalMeetings.tsx`). ONE listener per page, at module scope — a listener per component would mean one per card. |
| **`feedback-changed`** | `islands/Feedback.tsx:emitFeedbackChanged` — after a feedback is sent (and after a status flip / a bug→card in the inbox, both of which also invalidate the key directly) | `islands/FeedbackInbox.tsx` → invalidates `['feedback']`, so an admin with the inbox open sees the new row without reloading |
| **`session-expired`** | `js/src/00-bridge.js:sigmaSessionExpired` — the ONE funnel for every 401: `emsApi` (`js/src/12-reports.js`), the legacy REST reads (`js/src/01-data.js:sbGet`), the supabase-js interceptor (`app/src/lib/supabase.ts:sessionAwareFetch`) and the 12 h session cap. **Debounced (4 s)**, so five concurrent 401s are one event | `components/ReLoginSheet.tsx` (the one re-login sheet, mounted on every page) · `bridge.ts:useEmsConnected` (the connection flipped off) · `lib/session.ts:useEmsGate` → every island re-renders its gate |
| **`ems-queue-flushed`** | `js/src/13-ems.js:emsQueueFlush` — `detail.created = [{queueId, taskId}]`, one entry per `createTask` that went out | `components/home/MeetingNotes.tsx:resolvePendingTasks` — swaps every `ems_task_id = 'pending:<queueId>'` for the real task id. Without it a bullet linked while offline keeps a 🔗 that can never open anything. |

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
| `registerMoreItem({id:'feedback'})` — label `📣 רעיון / באג / תלונה`, **no `roles`** | island → nav | every role may submit, the viewer included (spec §7). The live `visible` predicate only hides it before anyone has picked who they are. |
| `registerMoreItem({id:'feedback-inbox'})` — `roles: ['idan','team']` + live `canSeeFeedbackInbox` | island → nav | the inbox is admins only (`canManageStaff` = עידן + עמיחי) and never a viewer, evaluated on every listing so `changeUser()` cannot leave it open. |
| `#feedback-inbox` hash | push → island | `push-send` mode `feedbackNew` opens the app at `?pushact=feedback#feedback-inbox`; `islands/FeedbackInbox.tsx` watches the hash AND `user-changed` (the island mounts before the user is known, so a single check at mount would swallow the deep link). |

## Edge functions this release touches

| Function | Mode added | Called by |
|---|---|---|
| `transcribe` (new) | `{token, path, audio_sec}` → `{text, engine, ms}` — **EMS-gated**, and `path` must match the whitelist `<name>.<audio ext>` (`chain.ts validAudioPath`): a blocklist could not keep a percent-encoded `%2e%2e/` inside the bucket, and an anon caller could spend Groq credit | `app/src/lib/speech.ts:uploadAndTranscribe` (the fallback voice path). Self-hosted Whisper first, Groq as insurance — `supabase/functions/transcribe/chain.ts`, runbook in `docs/whisper-server.md`. Writes `transcribe_log`. |
| `push-send` | `feedbackNew` `{token, kind, preview}` → עידן + עמיחי — **EMS-gated** (the public anon key alone must not be able to push to anyone's phone) | `islands/Feedback.tsx:sendFeedback` (fire-and-forget; the author is never sent, so an anonymous feedback stays anonymous) |
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
