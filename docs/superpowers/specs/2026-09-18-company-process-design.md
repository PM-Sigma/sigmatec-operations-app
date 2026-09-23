# Company process in the app — meetings, internal tasks, PM workspace, hours, dev sprints — design spec

STATUS: 🟡 BRAINSTORM → DRAFT (עידן 18.9.26, chat). Not planned into tasks yet. `gmail-intake` below is PLANNED ONLY: no such Edge Function exists, and the 2.0 SRS
keeps it out of scope (not approved). Read with
`2026-09-17-kibbutz-cards-redesign-design.md` (the app redesign) and `2026-09-17-unified-inventory-design.md`.

## 0. עידן's answers that shape this (18.9)

| Question | Answer |
|----------|--------|
| Who sees internal tasks | **Everyone in the company** — all employees see everything on a kibbutz. Only the *kibbutz* must not see them (they are not EMS tasks). |
| Hours report money | **Hours only.** Billing is done by the bookkeeper through the reports viewer. Whether a session is billable is *sensitive* and decided per session (flag, default off). |
| Meeting recording | Local folder on עידן's PC, to be synced to **Google Drive** (preferred) — the app should be able to fetch it. |
| Summary pipeline | Today it runs in Claude (Sigmatec Management). It may move into the app or stay; what matters: **distributable, editable, same output format** (the existing styled DOCX). |
| Kibbutz health signals (עמיחי) | (1) **מאזן פיננסי** — profit that makes no sense or a loss; (2) **מאזן אנרגיה** at the level main supplier meter ↔ distribution centers; (3) **התראות** — non-transmitting meters, and **client requests without a response** (EMS tasks, emails); (4) **recurring problems** surfacing in emails / phone calls. Many parameters; start with what is measurable. |
| Meeting capture | "Too many decisions while the meeting is running" — **less typing and clicking during the meeting**. Kibbutz has both a *management* state and a *field/system* state; a kibbutz can be managerially problematic yet fully served in the field. |
| Auto-agenda | Also available **on demand as a button** for עידן, not only the Saturday push. |
| EMS tasks | Not always a due date — the field schedules by its own constraints. |
| Dev meetings | Review current development, refine specs, answer questions (עידן ↔ lead dev), **plan the next sprint** — עידן needs a PM tool for this; today he arrives unprepared and reactive. Consult the `Dev system GITHUB` session method (`C:\Users\idann\Projects\Git Ticket System For EMS\CLAUDE.md`: two-level board Main Fields → Backlog, every card has a parent, title `[מודול] | [תת-תחום] | [תיאור]`) and the **EMS knowledge graph** (`C:\Users\idann\Projects\EMS Graph\graph.json`, 10k nodes) for methodology and dependency analysis. |
| Hours tool | **Clockify** is in use — consult its API and the existing structure (`sigmatec-email-manager` integrates Clockify, WhatsApp, Gmail). Sessions describe: with whom (usually phone calls), on what, how long, billable or not. |
| Gmail | Partial fit: many emails are "read data → do an EMS action (update consumption, delete reading, update client assignment/tariff/details/meter) → issue bill → reply". A future smart agent may automate that; **not for the app now**. What IS for the app: emails that create tasks, and emails that advance a client's onboarding (e.g. חולדה: waiting for client list / meter-system credentials — the app should show that wait state and let עידן react). |

## 1. Meeting mode 2.0 — zero-decision capture

**Principle:** during the meeting עידן does one thing: **navigate**. The app records *where the meeting is* against the
recording clock; every classification happens afterwards, on the transcript, with the kibbutz already known.

### 1.1 Recording, synced by construction
- **Preferred: the app records.** "▶ התחל ישיבה" starts a `meeting_sessions` row (`id, date, kind 'company'|'dev',
  started_at, host, recording_path`) and starts recording **in the browser**: `getDisplayMedia({audio:true})` on the
  Meet tab (captures all participants) mixed with the mic (`AudioContext`), chunked `MediaRecorder` (webm/opus, 60 s
  chunks) uploaded to Supabase Storage `meetings/<id>/` as they are produced (so a crash loses ≤1 minute). At the end
  the chunks are concatenated server-side and a copy is pushed to the Google Drive folder (the Drive connector
  already exists in this environment) so the current pipeline finds it where it expects. Timeline sync is exact: every
  navigation event is stamped with `t = now − started_at`.
- **Fallback: external recorder.** עידן presses "▶ התחל ישיבה" in the app at the same moment he presses record.
  The app stores `started_at`; a later "🔁 כיול" lets him align by picking one sentence in the transcript and clicking
  the moment in the timeline (offset saved). Good enough to split by kibbutz.
- Recording file discovery: a Drive folder watch (`meetings/inbox`) — the summary job picks the newest file for the
  session date.

### 1.2 Presenter mode (מצב ישיבה) — what עידן sees
- Full-screen, big type, one kibbutz at a time in board order (new → active, region groups), `←/→` or `J/K` to move,
  `Space` = "📌 סמן רגע" (adds a timestamp marker with no text — "something important was just said"), `P` = parking
  lot (tangent), `Esc` back to the last kibbutz. Header: timer, kibbutz counter, "מהישיבה הקודמת: 3 פתוחים".
- Per kibbutz, **two state strips** side by side, no interaction needed: **ניהולי** (onboarding stage, billing status,
  unanswered requests, health score) and **שטח/מערכת** (visits this month, open EMS tasks, alerts, stock supplied).
  This is עידן's point: a kibbutz can be red on one strip and green on the other — the meeting should see both.
- Below: last meeting's bullets (state + age) and this week's changes. **Typing stays optional, never required
  (עידן 18.9: "לפעמים אני כן ארצה לרשום").** One always-visible quick-note line under the kibbutz: type anything, Enter
  saves it as a timestamped note on that kibbutz (`meeting_events.kind='note'`, no tag, no owner, no decision) and
  clears the field. A typed note is just a stronger marker: after the meeting it appears next to its transcript segment
  and gets the same one-tap classification as every other sentence. `N` focuses the field from the keyboard; `Esc`
  returns to navigation. Nothing else to click during the meeting.
- Navigation log: `meeting_events(session_id, t_sec, kind 'kibbutz'|'marker'|'parking'|'general', kibbutz, hint)`.

### 1.2b Live quick-note (עידן 18.9 21:50, ruling)
עידן shares his screen during the meeting, so the presenter view carries a **✏️ pencil on the current kibbutz**: tap →
one text field + the same classification chips as the review screen (📋 משימת EMS / 🔒 פנימי / 📝 הערה / …) + owner → **הזן**
creates it immediately (an EMS task is created on the spot, a note joins that kibbutz's bullets). Visible to everyone
in the room because the screen is shared; stored like any reviewed sentence (source `live`). Not held until "בצע".

### 1.3 After the meeting — classification with the transcript already split
- The transcript (Whisper on עידן's server, §7i of the redesign spec) is **segmented by the navigation log**: each
  segment carries its kibbutz. The summary job (Claude, as today, or the app's own `parse-daylog`-style function)
  produces per-kibbutz sentences exactly like today's `summary_D.M.YY.md`, plus a **proposal per sentence**:
  `📋 EMS` / `🔒 פנימי` / `🧭 הכרעה` / `💡 רעיון` / `⏭ נדחה` / `— רק דיבורים`, with owner guessed from "אחריות X" or from
  who is speaking about it. Markers (`Space`) raise the sentence's importance; "רק דיבורים" is the default for
  anything without an action verb.
- **Review screen (ישיבה → סיכום):** עידן walks the kibbutzim, accepts or changes the proposal per sentence with one
  tap, sets owner (due date optional — field decides), and presses **בצע**: EMS tasks are created (visible to the
  kibbutz), internal tasks stored, decisions logged, ideas sent to the dev board, deferrals dated. Bullets land in
  `kibbutz_meeting_notes` (redesign §3) linked to what they created. Nothing is written before **בצע**.
- **The review screen is עידן's editor, not just an approver (עידן 18.9):** per sentence — the classification chips
  (one tap), an **owner picker**, and **✏️ עריכה** to rewrite the sentence; tagging **📋 EMS** opens the task modal
  prefilled (site, title = first clause, description = sentence, owner) so the task is created on the spot, not
  later; per kibbutz — **➕ שורה משלי** to add a sentence that was never said aloud (it joins the bullets and gets
  the same chips); drag a sentence to another kibbutz when the transcript split got it wrong. Everything remains
  unsaved until **בצע**, and the DOCX renders from the edited result.
- **Output = the same styled DOCX** (`build_styled.py` format) generated from the accepted bullets, editable
  (re-generate after edits), distributable (Drive link + optional email). Whether Claude or an edge function renders
  it is an implementation choice; the format is the contract.

### 1.4 Auto-agenda (Saturday push + on-demand button)
`agendaFor(date)` → for each kibbutz in board order: changes since last session (visits, tasks opened/closed, gaps,
stock movements, alerts), previous bullets with age and state, health strips. Kibbutzim with nothing new collapse to
one line. Header: closure rate "X מתוך Y בוצעו", carried-over items, deferred items due this week. Pushed to עידן
Saturday 20:00 and available any time as **"📋 הכן אג'נדה"**. The same object drives presenter mode — no second
data path.

### 1.5 Follow-through
Every bullet has `state open|done|deferred|dropped`, `age_meetings`. Next agenda shows the open ones per kibbutz; two
meetings old → amber, three → red. Owners see their bullets in פערים. Monday one-pager to עמיחי: decisions, what
closed, what carried over.

## 2. Internal tasks (🔒)

Table `internal_tasks(id, kibbutz, title, description, owner, due date null, source 'meeting'|'email'|'idea'|'manual',
source_ref, state open|done|dropped, created_by, created_at, done_at)`. Visible to **all employees**, never to the
kibbutz. Shown in משימות, calendar, gaps and the card (🔒 badge) beside EMS tasks; **⬆ הפוך למשימת EMS** promotes it
(creates the EMS task, links it, closes the internal one). Meeting bullets, email drafts and the idea box create them.

## 3. PM workspace (עידן)

- **Inbox-lite (not full mail management):** Gmail label `EMS משימה` → draft internal/EMS task (kibbutz guessed from
  sender domain / `site_contacts`, subject → title, body → description) awaiting עידן's confirm. Gmail label
  `EMS הקמה` on a thread from a kibbutz in onboarding → advances/annotates that kibbutz's onboarding step (see §4)
  with "התקבל מייל: רשימת לקוחות" and offers a reply. The rest of the mailbox stays in Gmail. (The "smart agent that
  performs EMS actions from emails" is explicitly out of scope for the app.)
- **Ideas to dev:** 💡 from meetings and the idea box create GitHub cards through the existing `github` function,
  following the Git Ticket System rules: always a child under an existing Main Fields parent (title
  `[מודול] | [תת-תחום] | [תיאור]`, into Backlog, never a new parent without עידן). The parent picker is the list of
  parents (#55–#84, #87, #90, #95, #104…); the EMS knowledge graph can suggest the module from keywords (later).

### 3b. Gmail integration — full picture and data exposure (עידן 18.9: "מי חשוף למידע")

**Architecture (one intake, pluggable handlers — the hook for the future agent):** a single Edge Function
`gmail-intake` polls (or receives Pub/Sub pushes for) the `pm@sigmatec-energy.com` mailbox using a Google OAuth
refresh token stored **only as a Supabase secret** (`GMAIL_REFRESH_TOKEN`, scopes `gmail.readonly` +
`gmail.modify` for labels, later `gmail.send` only if a reply feature ships). It fetches only messages carrying app
labels (`EMS משימה`, `EMS הקמה`, future `EMS פעולה`), normalizes them to `{id, threadId, from, to, date, subject,
bodyText, attachments[meta only], kibbutzGuess}` and runs `handlers[]` in order: `taskDraft` (→ `internal_tasks`
draft), `onboardingProgress` (→ onboarding step wait-state), and a **stub `emsActionAgent`** (interface only,
returns "not implemented", logged) so עידן's future "smart agent that performs EMS actions from emails" plugs in
without redesign. Every handler writes an `email_intake_log(msg_id, handler, result, at)` row. Nothing is sent back
to Gmail in phase 1.

**Who sees the email data (exposure map):**

| Service | What it receives | Why | Can we avoid it |
|---------|------------------|-----|-----------------|
| Google (Gmail API) | already holds the mail | source | n/a |
| Supabase Edge Function (`gmail-intake`) | full labelled messages, in memory | normalize + route | keep; no persistence of bodies beyond what is stored below |
| Supabase Postgres (`internal_tasks`, `onboarding_steps`, `email_intake_log`) | subject, a **trimmed** body excerpt (≤ 2,000 chars), sender, thread id, kibbutz | the task/onboarding record | store excerpt not full body; attachments never stored |
| The app (all employees) | the task title/description created from the email | internal task is visible to all employees (עידן's rule) | עידן confirms every draft before it becomes visible |
| EMS (kibbutz can read) | only what עידן promotes to an **EMS task** | customer-facing | promotion is an explicit action |
| Gemini / Groq | **nothing in phase 1**. If AI classification of emails is turned on later, the body excerpt is sent to Google (Gemini) or Groq under their API terms | kibbutz guess, task extraction | keep rule-based (labels + `site_contacts` domain map) for as long as possible; if enabled, strip signatures/phones first |
| Whisper server (self-hosted) | nothing | — | — |
| GitHub | only 💡 ideas עידן explicitly sends | dev board | explicit |
| Clockify | session descriptions עידן types, never email content | hours | explicit |
| Claude (this tooling) | email content only when עידן uses the Gmail connector in a session | ad hoc | n/a |

Rules: least scopes; secrets only in Edge Functions; no raw bodies at rest; no attachments; a kill switch
(`GMAIL_INTAKE=off`); the exposure map is part of the SRS (Task 19) and must be updated when the agent handler ships.

## 4. New-client onboarding template

Creating a kibbutz as לקוח חדש spawns the checklist as internal tasks with owner + wait-state: `הקמת אתר ב-EMS` ·
`קבלת רשימת לקוחות מהקיבוץ (ממתין למייל)` · `קבלת פרטי כניסה למערכת המונים (ממתין למייל)` · `ייבוא מונים` · `תעריפים`
· `תקשורת` · `הדרכה` · `בדיקת חשבון ראשון` · `העברה לפעילים`. Steps marked "ממתין למייל" show the wait since
`sent_at` and are closed by the Gmail label flow (§3) or manually. Card shows progress (5/9) and days-in-onboarding;
עמיחי sees onboarding age per client. Template editable by עידן (`onboarding_templates`).

## 5. Kibbutz health v1 (עמיחי's four signals)

Score per kibbutz, recomputed nightly into `kibbutz_health(kibbutz, score, signals jsonb, computed_at)`; card shows a
small dot + tooltip, CEO page shows the table. v1 signals, each 0–3:
1. **מאזן פיננסי** — from EMS billing: last bill's profit/loss vs expected band per kibbutz (thresholds set by עידן);
   missing bill on time = red.
2. **מאזן אנרגיה** — supplier main meter vs sum of distribution centers over the last billing period (EMS energy
   balance report; the same data behind גבים's "אובדן 15–20%").
3. **התראות ובקשות ללא מענה** — count of non-transmitting-meter alerts (EMS alerts API) + EMS tasks opened by the
   client older than N days without an update + `EMS משימה`-labelled emails without a reply.
4. **בעיות חוזרות** — v1 proxy: internal/EMS tasks and emails with the same keyword cluster in the last 60 days
   (simple keyword bucket per kibbutz); later: phone-call log from Clockify sessions (§6).
Weights and thresholds are עידן's; start equal.

## 6. Work sessions (hours) + Clockify

- Table `work_sessions(id, person, kibbutz, task_ref (ems:id|internal:id|null), kind 'הדרכה'|'תמיכה'|'אפיון'|'הקמה'|
  'פגישה'|'שיחה', with_whom text, description, started_at, ended_at, billable bool default false, clockify_id, note)`.
- **Who logs sessions (עידן 18.9):** עידן (PM) and **מתניה (developer) — he sometimes has to schedule client work too**. Sessions carry `person` and a derived `role` (`pm`|`dev`|`field`), and every report separates them (PM hours / dev hours / technician visit hours), never summed into one number.
- **Timer** from a card / task / calendar: "▶ התחל עבודה על גבים" → stop → fill with-whom/description/kind, billable
  toggle (default off, sensitive). Calendar/Meet events tagged with a kibbutz suggest a session.
- **Clockify sync:** each session is mirrored to Clockify (project = kibbutz, tags = kind/billable) through its API so
  עידן's existing structure and reports keep working; existing Clockify entries import back. Task: consult the
  `sigmatec-email-manager` Clockify integration for the workspace/project ids and the existing conventions.
- **Reports viewer:** monthly hours per kibbutz (PDF/Excel), sessions listed with with-whom/description, billable
  column; technician visit hours in the same report → cost to serve. No money in the app.
- Scheduled hours = a fourth calendar layer.

## 7. Dev meeting mode (ישיבת פיתוח) + sprint planning

- Same presenter mode, driven by the **dev board** instead of kibbutzim: walk the columns בפיתוח עכשיו → שלבי בדיקות
  → ספרינט הקרוב, one card at a time with its description, comments, and open questions; markers stamp the transcript
  as with kibbutzim (`meeting_events.kind='issue'`, `issue_number`).
- **Prep card for עידן (auto, Saturday):** sprint burndown, cards without spec ("Scope Refinement" candidates), cards
  blocked > 7 days, questions from the lead dev (comments mentioning עידן), and a **proposed next sprint**: ranked
  Backlog candidates by parent module priority, age, and links to kibbutz health/alerts (a card that fixes a red
  signal ranks higher). עידן drags to accept → "העבר לספרינט הקרוב" (existing action).
- After the meeting: the same review screen classifies sentences into card comments (spec refinements), new child
  cards (following the ticket rules), decisions, and sprint moves. Output: the dev summary DOCX + the board updated.
- Methodology: use the EMS knowledge graph to show, per card, the modules/entities it touches (dependency awareness in
  sprint planning) — a later increment.

## 8. Daily loop (who sees what, when)
- Technicians: morning route + gaps; arrival briefing; 2 h nudge; evening day-log.
- עידן: morning card (email drafts to confirm, internal tasks due, onboarding waits, hours timer), Saturday agenda +
  dev prep, on-demand agenda button.
- עמיחי: 12:00/17:00 stock digest; Monday one-pager; health table; hours/equipment revenue mix monthly.

## 8b. Rulings 18.9 22:05 (עידן) — closes most of §9
- **Recording (closed):** עידן records locally on his PC today; recordings auto-upload to Drive folder
  `1C-fmIISkqqb7FcQxwxNG2Dvdn4_WjK5J` under `ישיבת חברה XX.26` / `ישיבת פיתוח XX.26` (client meetings also exist,
  `CLIENT MEETINGS`). Transcription + summary are done in Claude and written to a folder that syncs to Drive folder
  `17nvkpdn5crmlbZCc6SbwaNmNKY4Ml7YV` under `COMPANY MEETING` / `DEV MEETINGS`. A future bot will summarise as a
  participant. The app's meeting import reads from the second folder (or the synced local folder); no in-browser capture.
- **Health v1:** build a first draft, leave thresholds/data-source open; reminder set for Tue 22.9 09:00
  (scheduled task `sigma-health-v1-thresholds`).
- **Clockify (closed):** under every kibbutz card, עידן and מתניה get ▶ Clockify start/stop. On stop: pick who attended
  (contact from the kibbutz contact list, addable like in the visit summary) and choose topic **tags** = the tags that
  exist in the Clockify workspace (fetch via Clockify API, cache; Task must read the live tag list first). Entry is
  written to Clockify with description "<kibbutz> — <tags>" and stored locally in `work_sessions`.
- **Internal tasks:** NO due dates, no reminders. Just a list with owner + done.
- **"Hours for מתניה"** simply means מתניה also schedules work with kibbutzim and gets the same Clockify control.
- **Gmail intake-lite** (עידן: "לא מבין") — see §3b for the full description. In one line: the app reads only emails עידן
  labels `EMS משימה` in Gmail and turns each into a DRAFT internal task he confirms. Nothing is sent, nothing is read
  without a label. עידן has not yet approved it → stays OPTIONAL, not in the plan until he says so.

## 9. Open items to settle before planning tasks (remaining)
- Whether the app imports the summary from Drive automatically (Drive API, service account) or עידן pastes/uploads it
  (import screen already exists — Task 2). Default: upload/paste now, Drive auto-import later.
- Health thresholds and where EMS exposes billing profit/loss and energy balance (API vs read-only DB via the PG
  session memory).
- Clockify: API key location + workspace id (consult `sigmatec-email-manager`); tag list is read live.
