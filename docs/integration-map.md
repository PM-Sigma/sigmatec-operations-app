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
| **`ems-queue-flushed`** | `js/src/13-ems.js:emsQueueFlush` — `detail.created = [{queueId, taskId}]`, one entry per `createTask` that went out | `components/home/MeetingNotes.tsx:resolvePendingTasks` — swaps every `ems_task_id = 'pending:<queueId>'` for the real task id. Without it a bullet linked while offline keeps a 🔗 that can never open anything. |

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
