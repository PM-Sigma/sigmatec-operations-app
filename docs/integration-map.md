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
| `ems-cache-synced` | `js/src/13-ems.js:60` (`emsCacheSave`) | `bridge.ts:useEmsConnected` · `islands/Home.tsx:87` (re-runs `decorateCards`) |
| `visit-saved` | `js/src/09-visits.js:413` | no island consumer yet — the cards' last-visit line is still a legacy decorator |
| `visit-form-open` | `js/src/02-init-attendance.js:13` (`switchTab('visit')`) | `components/home/CardActions.tsx` (🚚 waits for the form before asking for a cert) |
| `theme-changed` | `app/src/lib/theme.ts:applyTheme` | `components/ThemeToggle.tsx:12` · `components/ui/sonner.tsx:18` |
| **`notes-changed`** | `components/home/MeetingNotes.tsx:emitNotesChanged` — after import (`islands/ImportNotes.tsx:saveParsedMeeting`), ➕ link (`linkNoteToTask`), ✓ done (`setNoteDone`) | `MeetingNotes.tsx:useMeetingNotes` → invalidates `['meetingNotes']`, which repaints **every card** (`components/home/KibbutzCard.tsx`) and the modal tab (`islands/ModalMeetings.tsx`) |

## Query keys

| Key | Written by | Read by |
|---|---|---|
| `['kibbutzim']` | `islands/Home.tsx` (create/edit/archive) | `islands/Home.tsx` · `islands/ImportNotes.tsx` (the parser's name catalog — the import must never resolve against a staler list than the cards do) |
| `['meetingNotes']` | `islands/ImportNotes.tsx` · `components/home/MeetingNotes.tsx` | `components/home/MeetingNotes.tsx` (cards + modal tab) |

## Bridge surfaces added / changed by the meeting-notes task

| Surface | Direction | Why |
|---|---|---|
| `sigma.createTask(item)` → `{sent, id?}` / `{queued, queueId}` | React → legacy (`js/src/13-ems.js:emsWriteOrQueue`) | a bullet has to remember **which** EMS task it became (`ems_task_id`). The legacy function used to return a bare `{sent:true}`; it now passes the created task's id back, and the queue id when it could not send. Queued ⇒ the note is stamped `pending:<queueId>` and 🔗 renders muted. |
| `emsSendItem` `createTask` honours `item.priority` / `item.siteId` | React → legacy | the note prefill sets priority `medium`; site is still resolved from `item.kibbutz` at send time so a queued task resolves it on flush. |
| `window.sigmaHome.openSheet(name)` | island → island / legacy → island | `islands/Home.tsx` exposes its ➕/✏️ sheet. The import preview's **צור קיבוץ** and the modal tab's **✏️ פרטי קיבוץ** both need to open it for a *specific* name — a bus event cannot target one card. Deleted on unmount. |
| `#sigma-modal-meetings[data-kibbutz]` | legacy → island | `js/src/10-activity.js:openEditModal` stamps the kibbutz it is showing; `islands/ModalMeetings.tsx` observes the attribute. One React root for the whole session instead of a mount per modal open. |
| `sigma.decorateCards()` | React → legacy | already existed; the cards' notes block is React, so the legacy passes still attach after `.kibbutz-name-row` — the notes sit between the two (order: name → notes → EMS tasks). |
