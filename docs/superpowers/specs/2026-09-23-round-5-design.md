# סבב 5: freeze, cleanup, one design system, and עידן's full phone QA list
nSTATUS: 🟡 OPEN — approved by עידן 23.9. Phase 0 (freeze) in progress. Resume: follow the phases in order; each package gate in "Grill round 3".

## Context
עידן tested the whole app on the phone after 2.27. His feedback: the app looks like a legacy system with a new layer on top, elements overlap, and he has had to repeat requirements. He is willing to accept a delay for a fully uniform app that is easy to fix and upgrade. He asked for: (1) freeze the app for everyone except him and עמיחי *now*, (2) cleanup of unused history and data, (3) this QA list fixed, (4) a grill before starting, (5) an independent design consultant, (6) a split into sub-tasks, all checked against the OPS GRAPH and QA tests.

Mobile is the delivery target for everyone. Desktop is only for עידן for now: desktop QA comes later, but the layout must hold on FHD, QHD and 4K.

## Decisions from the grill (latest wins)
| Topic | Ruling |
|---|---|
| Freeze | Only עידן (pm@) and עמיחי get in. Everyone else, including the viewer PIN, sees "המערכת בשדרוג". Customer certificate links keep working (my assumption, since they aren't app users). |
| Design scope | **Full rewrite of the legacy pages to React on one design system.** Delay accepted. |
| Header | One header on every page: Σ (goes home) · 🔔 · ✅ · ⚙️. The name chip becomes a gear bubble. The page action gets its own compact row, so nothing overlaps. |
| Visit summary | One editor: the new sheet. The legacy form is removed. The ביקורים tab shows history (✏️/🚚 on each row, both open the new sheet) plus "➕ סיכום ביקור". The contact picker moves into the new sheet. The attendance picker is removed. |
| Attendance from visits | Only for אביאם/ניתאי who appear in "מי ביקר" (the rules are below). עמיחי or anyone else saving a summary gets no attendance. |
| Burns | Not on kibbutz cards (closed or open). Visible in team-meeting mode, and as the home strip "פרויקט צריבות מונים · בוצעו X מתוך Y · לפירוט ›". |
| Onboarding | Only inside the open card, under מצב הקיבוץ. Its latest status also shows in meeting mode. |
| Inventory history | Keep everything in Supabase. Potential customers and regions stay. |
| SIM | Removed entirely: items archived (history kept), no auto-add to orders, no low-stock alert. |
| "סמן רגע" | A bookmark on the meeting timeline: time plus an optional one-line note. |
| Dev domains | The GitHub **parent issue** (every card sits under a parent). Grouping is parent → priority (קריטי/גבוה/נמוך). A card with no parent goes to "ללא אפיון". |
| Consultant | An independent design agent that didn't build the app. It audits screenshots of every page (phone + desktop) using impeccable and frontend-design, then returns what is unnecessary, what is missing, and a design-system proposal. עידן approves before the build. |

| Delete item | Real delete of the item **and its movements, orders and cert lines**. Text summaries stay. A confirmation screen lists what goes before deleting. |
| Calendar, future day | Picking a kibbutz block does both: the kibbutz becomes a planned stop that day, and the tasks you tick get that date. |
| Calendar, visit summary | Tapping it opens a compact read view with ✏️ edit and 🚚 cert. No small pins under it. |
| Team-meeting timeline | Covers everything since the previous meeting, with a toggle to 30 days. |
| Closed card | Full redesign, aligned edge to edge. It keeps 📍 סיכום ביקור, ▶ timer, ✍️ draft tag and 🤝 marketing tag. |
| Security | Included in this series: viewer read-only, plus a per-person name claim in `ems-auth` so messages and hours are limited to the person. It is applied before the unfreeze. |
| Push texts | Rewritten with no-ai-slop, keeping a warm tone. You approve the list. `field.ts` and its mirror in push-send are updated together. |
| Unfreeze | After your phone QA of the full series. |
| Removed | **Ctrl+K search**, plus its keyboard shortcut and header button. |
| Kept (you said they work) | Hours, Gaps, Usage. They get the new design only. |
| Not in this series | The Whisper meeting scribe. It comes after the unfreeze. |
| Viewer after the unfreeze | Same as today, in the new design. |

### Grill round 2 answers
| Topic | Ruling |
|---|---|
| Σ = home | Goes to each role's landing page. |
| Burns strip | "בוצעו X מתוך Y": X is meters burned, Y is total meters in the project. |
| Visit drafts | 1. Default-valued fields (date, visitor, duration chip…) don't count as input. <br>2. Tapping outside the sheet or the top of the screen asks "לבטל ולחזור אחר כך / להמשיך לסיים". <br>3. The **בטל** button deletes the draft. <br>4. Leaving any other way (back, app closed) keeps a draft **only** if something beyond the defaults was entered. |
| Week numbers | Shown in חודש מלא, hidden in חודש עבודה (the toggle's new name). |
| Team-meeting timeline | Everything goes on the timeline, per kibbutz. An EMS task sits at its **latest change**: creation, a comment without closing, or a due date set in the calendar. Internal tasks sit at their open date, notes at the meeting date, visits at the visit date. |
| Close EMS in the meeting | One click, בוצע or בוטל. עידן/עמיחי only. EMS gets the status plus the comment "נסגר בישיבת צוות d.m · <name>", and there is a 5 s undo. |
| Dev-meeting marks | Local to the meeting only, with a summary list at the end. GitHub isn't touched. |
| Google Calendar (INFORMATION) events | Every chip opens one generic detail sheet: title, time, description, location, who. |
| Planning another person's day | The blocks show the tasks of the person whose calendar is shown. **אביאם only** gets a setting in ⚙️, "לראות גם את המשימות של ניתאי". |
| Freeze text | "המערכת בשדרוג. נעדכן כשהיא חוזרת." No date. The unfreeze sends the team a push. |

### Grill round 3 answers
- **Inventory breakpoint (replaces the "same numbers" check).** At the start of Phase 1, freeze the current state:
  - Compute today's stock per product per location.
  - Write each one as an opening-balance movement dated T (`reason='opening_balance'`).
  - Move every movement before T to `archive.movements_pre_T`. It stays in Supabase, but the app no longer reads it.
  - The new inventory code starts from the opening balances. The golden test: stock at T after the breakpoint = stock at T before it, verified once by SQL.
  - After that, עידן corrects quantities through recounts (`stock_recounts`) as usual.
- **Local backup, done by me with no DB password.**
  - A new edge function `backup-export` serves the latest `backup.snapshots` rows. It's guarded by a generated `BACKUP_KEY` stored in the function secrets and in a local file only the user can read.
  - A Windows task at 01:00 saves `C:\Users\idann\Backups\Sigmatec Operations\YYYY-MM-DD.json` and deletes files older than 14 days. It replaces the pg_dump script, which needed the password.
- **Hourly progress report** while the series runs: an hourly cron wake-up posts this table with % done per phase, what finished in the last hour, what's running, and any blocker. The first report shows the weights.
- **Self-check after every chapter** (a hard gate; the next package does not start until it's green):
  1. `npm test`
  2. Playwright, 4 projects
  3. the no-overlap sweep at 390, 1440, 1920, 2560 and 3840
  4. `rebuild.py` plus a Sonnet re-extraction of the changed docs
  5. Opus audits the diff against the spec, the graph and the QA rows
  6. a short "checked / result" line in the progress report

### Grill round 4 answers
- **Visit-summary alerts:** עידן does not get visit-summary alerts or pushes (for example "no summary yet", draft reminders, visitCron) unless the visit is **in his name**.
  - Every visit-summary alert goes only to the people listed in "מי ביקר" on that visit.
  - This applies to both the bell (`app/src/lib/alerts.ts`) and push-send (`visitCron`, the draft and stale-timer modes). It sits in package X.
- **Drafts to delete:** only visit drafts **created since 19.9**, when development started. Visit summaries are never touched. A draft that is an update to an already sent summary loses only the draft.
- **End-of-series deliverable:** an alert matrix `docs/reports/2026-09-2x-alerts-matrix.md`, built from push-send's mode/recipient code and `alerts.ts`, not from memory. Its columns:
  - the alert/push name
  - the trigger (what happens)
  - the recipients by user (עידן, עמיחי, אביאם, ניתאי, מתניה, אבצן, אליה, viewer)
  - channel (bell / push)
  - timing / quiet hours
  - where a tap leads

  A golden test fails if the code and the matrix disagree.

### Weights (for the progress report)
| Phase / package | Weight |
|---|---|
| 0 · Freeze | 3% |
| 1 · Cleanup + graph cleanup + inventory breakpoint + local backup | 8% |
| 2 · Design system + consultant review | 10% |
| S · Shell | 6% |
| K · Kibbutz card + React KibbutzDetail | 9% |
| V · Visit summary + attendance rules | 14% |
| C · Calendar | 7% |
| I · Inventory rewrite | 12% |
| A · Attendance | 5% |
| G · Settings + burns + push log | 6% |
| M · Team meeting | 6% |
| D · Dev meeting | 4% |
| X · Security + push copy + Ctrl+K removal | 4% |
| R · Every other screen | 6% |
| **Total** | **100%** |

## Grill round 5 answers (עידן 23.9 evening), binding for I, V, K
- **Edit lock for past data.** Everything dated **August 2026 or earlier is read-only** everywhere (visits, attendance, inventory, certificates, orders). September onward stays editable.
  - **A visit summary locks on the 10th of the following month** (a September visit locks on 10.10).
  - Rule as one pure function: `editableUntil(date) = 10th of next month`, `locked = today > editableUntil || date < 2026-09-01`. The app enforces it; a DB trigger enforces it too.
- **Consequence for the inventory breakpoint:**
  - September visits dated before the breakpoint (1–23.9) stay editable, including equipment. Their original movements are in `archive.movements_pre_breakpoint`.
  - When one of them changes equipment, the stock difference is computed against the archived movement, so stock never double-deducts. This replaces the earlier "equipment locked before the breakpoint" rule.
- **Item delete:**
  - A removed item is deleted completely: the item, its movements, recounts, alerts, returns, and its lines in visits, requirements and AI examples. Orders left empty are deleted.
  - **Issued delivery certificates stay exactly as they are**, lines included.
- **Dead inventory paths are dropped:** the intake window, "import open requirements", reprint, cert from an order or EMS task, the duplicate ✉️ button, the stale flow diagram.
- **Hours are per person:** מתניה sees only his own; עידן and עמיחי see all.
- **GitHub dev board (X-L8, approved):** only עידן, עמיחי and מתניה can write (open an issue, update a card). Reading stays open to staff. The check lives in our `github` function only; nothing changes in GitHub.

## Standing authority while עידן is away (23.9 night)
- **Production changes:** Fable applies DB migrations and deploys functions **after** the change passes both the Opus audit and the tests. A backup comes first, each change has a rollback, and each is logged in the CHANGELOG. The freeze stays on throughout. The changes covered: viewer read-only, per-person policies (ems-auth first, then ≥180 min), attendance source and backfill, the past-data lock trigger, the delete function, `cal_peer_tasks`, and deploys of ems-auth, push-send, github and calendar.
- **Push texts:** the no-ai-slop rewrite (the X spec's table) is applied. עידן reviews it later, and nobody receives pushes while the app is frozen.
- **Inventory delete now:** only the empty item. The SIM items stay archived and are not deleted.
- **All planner defaults are accepted:**
  - The header does not hide on scroll.
  - The login screens stay light DOM, restyled.
  - The ➕ adders move into the open card's section titles.
  - "ייבוא סיכום ישיבה" goes into ⚙️ until meeting mode takes it.
  - Office and home days are filed only on the attendance page.
  - An EMS task's "latest change" is EMS's `updatedAt`.
  - The dev meeting keeps 4 priority levels.
  - "ללא אפיון" means only "no parent issue" (the sprint-prep list is renamed).
- **At the end of the round:** everything ships to the frozen app, and then work stops for עידן's phone QA before the unfreeze.

## Design ownership (עידן 23.9)
- **The external designer (the independent consultant agent) owns design and motion for the whole app.**
  - It picks one tool per purpose after running the real tools: impeccable CLI, humanizer, frontend-design, dataviz.
  - It writes the motion spec (exact tokens) and the prestige details, in `תוצרים/2026-09-23 — ייעוץ עיצוב/tools-and-motion.md`.
- **Extra gate for every package:**
  - The designer's PASS, given on screenshots at 390 light and dark plus the impeccable output. Without it the package doesn't merge.
  - `test-impeccable.mjs`: the count may never rise above `qa/impeccable-baseline.json`, and it ends the round at 0.

## How the work runs (עידן's rules)
- **Roles:**
  - Sonnet agents write the code.
  - Opus reviews every package against its spec, the graph and the tests, and it may reject a package.
  - Fable plans, and does only the final check.
- **Skills:**
  - ponytail on every package (shortest diff, no scaffolding).
  - superpowers: writing-plans, then subagent-driven-development, TDD and verification-before-completion.
  - no-ai-slop plus humanizer on every UI string.
- **Graph:**
  - Before Phase 1, Sonnet cleans the retired nodes out of the graph (Sheet, Apps Script, the legacy pages being rewritten), and Opus reviews that. The graph session is told.
  - After each package, `rebuild.py` runs and Sonnet re-extracts the changed docs, with a review.
- **One series:** nothing starts until this whole plan is closed. There is no QA ping-pong in the middle. Your single phone QA comes at the end.

### Attendance rules (exact)
1. **Save a visit** (new or edit). For each of אביאם/ניתאי listed in מי ביקר, write an attendance row: date = visit date, type = שטח, `source='visit_auto'`.
2. **The day already has a manual row:**
   - Same type: no prompt. The row stays manual.
   - Different type: ask "הוזן X, לשנות לשטח?"
3. **The visit's date moves:**
   - The person has another visit on the original date: that day stays שטח.
   - The original row is `visit_auto`: delete it. After saving, a popup says "נדרשת הזנת נוכחות ל-d.m".
   - The original row is manual: leave it.
4. **After saving**, a toast confirms: "הסיכום נשמר · הוזנה נוכחות שטח אוטומטית ל-d.m".
5. **Change from today:** attendance is derived from visits today (`withVisitDays`, `app/src/lib/attendance.ts:425`). It becomes real rows marked with `source`, so manual rows win.
   - The readers switch to the rows: `attRowsFor` in `04-attendance-daily.js`, `attMissingDays` in `22-push.js:200`, and `haveDates` in `push-send/index.ts:113`.
   - A one-time backfill covers the visits that already exist.
   - I still need to verify that "מי ביקר" is multi-select in the new sheet. If it isn't, it becomes multi-select.

## Your questions, answered
- **Rewrite, pros:**
  - One code base: React, the same primitives and the same tokens.
  - Fixes and upgrades happen in one place.
  - Tests are pure plus Playwright, instead of DOM strings.
  - The graph stays accurate.
  - Every page moves and looks the same.
- **Rewrite, cons:**
  - A delay of several days.
  - Regression risk in inventory, because stock is calculated from the movement ledger.
  - Mitigation: golden tests on the stock calculation before and after, so the same numbers must come out. Plus Playwright on every inventory flow, run on the old code first so the tests capture today's behaviour.
- **Does desktop affect the phone code?** It's the same code, with breakpoints. A responsive design system built once holds on phone and desktop. Desktop QA later won't change the phone code except in bugs specific to desktop breakpoints. The 1440, 1920, 2560 and 3840 widths are checked automatically by the overlap sweep, so nothing breaks unnoticed.

## Things you didn't mention, or where your notes contradicted each other (handled in the plan)
1. **Security fix still not applied.** The view-only user can still write (`db/rls_viewer_readonly.sql` has never been applied). The freeze doesn't replace it, because the freeze is client-side only. It waits for your "כן".
2. **Local backup not connected yet.** The backup on this computer still needs the connection line from you (Supabase → Connect → Session pooler).
3. **Team meeting and dev meeting can't be opened on desktop.** They are only in ⋯ עוד, which exists only on the phone. → Add them to the ⋯ עוד on desktop too, as you asked.
4. **Holiday eves are never displayed in the calendar.** `cell.eve` is computed but never rendered. → Mark them purple, with a note in the legend.
5. **The source of the "empty item" you saw.** It isn't a draft left from closing a form. It comes from the "➕ הוסף לקטלוג" button inside an order (`07-orders.js:1162`), which creates an item with no category. → Add delete, and remove the "add to catalog from an order" path.
6. **Draft left behind by "cancel".** The draft is created by autosave (800 ms), not on cancel. → Cancel on an empty sheet leaves nothing. A "🗑 מחק טיוטה" button is added. Existing drafts are deleted once; saved summaries are not touched.
7. **"שמור טיוטה" in the legacy form triggered the hidden `saveAttendance` button** (`00-guard.js:194`). This goes away together with the legacy form.
8. **Tone of the 14 motivational push messages.** Still waiting for your decision. It's not in this round.

## Phase 0: freeze, now (small, ships alone first)
- **Upgrade screen:** a full-screen `UpgradeGate` island ("המערכת בשדרוג · נחזור בקרוב"). It shows after identity is resolved in `15-login-gate.js` (`onAuthed` / `reconcileIdentity`) for anyone whose email isn't pm@ or עמיחי's, and for the viewer.
- **Exemptions:** certificate links (`?cert=`) and mock mode stay open.
- **One switch:** `UPGRADE_FREEZE` in `00-consts.js`, plus an allow-list. Lifting the freeze is one commit.
- **Tests:** a Playwright case for each role.
- **Ship:** 2.28.

## Phase 1: cleanup, with a fresh backup first (`backup.take_snapshot()`)
- **Remove the Google Sheet / Apps Script data path:**
  - `SHEET_API` in 10 modules.
  - `appsscript/*.gs`.
  - `db/import_from_appsscript.mjs`.
  - `maintenance.html`.
  - Before removing, check with the graph, `path SHEET_API <x>`, that nothing still depends on them.
  - `?sb=0` must keep working on local fixtures only.
- **Tables:** `tasks` (the old status line), `settings`, `ems_cache`, `ems_queue`. Delete each only after the graph and grep confirm there are no readers. Otherwise it's migrated first.
- **Kept:** potential customers, regions, all inventory history.
- **Old logs:** usage and pushes older than 30 days are deleted.
- **Drafts:** `visit_drafts` is emptied, and the localStorage map is cleared with a key bump.
- **SIM:** SIM items are archived.
- **Docs and memory:** INDEX, data-and-security.md and the ops-graph README lose the Sheet references. `rebuild.py` runs, and the graph session is told.

## Phase 2: design system + independent consultant
- **Screenshots:** capture every page and popup at 390, 1440 and 1920, in both light and dark.
- **Consultant:** an independent agent reviews them with the `impeccable` audit and `frontend-design`. Output:
  - the tokens: color roles (keeping the brand colors), type scale, spacing, radius, elevation, motion;
  - the building blocks: PageHeader, SectionBlock (a full-width block with a colored title), Bubble button, Chip, ListRow, Sheet, Tabs, Stat tile, DayCell;
  - what's unnecessary and what's missing in your list.
- **Spec:** `docs/superpowers/specs/2026-09-23-design-system-design.md` + components in `app/src/components/ui/` + tokens in `app/src/styles.css`, also exposed to legacy CSS for as long as it still exists.
- **Rule:** every button is a bubble. Nothing is absolutely positioned inside a header.
- **You approve** before Phase 3.

## Phase 3: packages (worktrees off origin/main, Opus/Sonnet in parallel after Phase 2)
| Package | Content (your item numbers) | Main files |
|---|---|---|
| **S · Shell** | General 1–2 (badge collision, Σ → home), gear header, page-action row, overlap-free at every width, ⋯ עוד on desktop too (meeting modes) | `index.html` header, `HeaderActions.tsx`, `Alerts.tsx`, `UserChip.tsx`, `primaryAdd.ts`, `MoreSheet.tsx`/`Nav.tsx` |
| **K · Kibbutz card** | Kibbutzim 1–6 | `KibbutzCard.tsx`, `MeetingNotes.tsx`, `ModalMeetings.tsx`, `InternalModal.tsx`, `components/home/Burns.tsx`, **the legacy modal (`index.html:613-852`, `10-activity.js openEditModal`) → a React KibbutzDetail island** |
| **V · Visit summary** | Kibbutzim 7–12 + the attendance rules | `Field.tsx` (becomes the only editor: new visit, editing an existing one, contacts, cert), `09-visits.js` (form removed; `saveVisitFromData` stays as the pipeline), `visitDraft.ts`, `attendance.ts`, `04-attendance-daily.js`, `22-push.js`, `push-send`, migration `attendance.source` + backfill |
| **C · Calendar** | Calendar 1–6 | `Calendar.tsx`, `calendar.ts`, `styles.css .ucal-*` |
| **I · Inventory** | Inventory 7 (tab order: הזמנות · מלאי חברה · תעודות משלוח · מלאי בקיבוצים · החזרות · פריטים; delete item; SIM out), **full React rewrite of `06/07/08/20` + inventory `index.html`** | new `app/src/islands/Inventory*.tsx`, `lib/inventory.ts` (exists; stock goldens) |
| **A · Attendance** | Attendance 8 (the "חסר לך" block redone, holidays purple + missing red in the mini calendar, clickable tiles that color the calendar) | `Attendance.tsx`, `attendance.ts`, `styles.css` |
| **G · Settings + burns + push log** | Settings 9, burns 10 (title "צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק", Excel/generators in one row), React rewrite of the burns page (`24-meter-burns.js`) and the push log (`23-push-log.js`) | `Settings.tsx`, `main.tsx:397` ("יומן היום · ניסיוני" tag), new Burns/PushLog pages |
| **M · Team meeting** | 11: small blocks; a timeline of EMS tasks by open date, internal tasks by open date, meeting notes by meeting date, visit reports; a compact timer; "סמן רגע"; the "since the previous meeting" line removed; burns + onboarding status shown | `Presenter.tsx`, `meetingRun.ts`, `meeting_events` |
| **X · Security + push copy + Ctrl+K removal** | Apply `db/rls_viewer_readonly.sql`, add a per-person claim in `ems-auth`, limit messages and work_sessions to the person, rewrite the 14 push texts (no-ai-slop), remove the CommandBar | `db/`, `supabase/functions/ems-auth`, `app/src/lib/field.ts` + push-send mirror, `CommandBar.tsx`, `main.tsx` |
| **R · Every other screen** | Everything not in another package gets the full design-system pass, laid out again on the building blocks, with animation to spec and the designer's PASS: ⏱ Hours, 📋 Gaps, 📊 Usage, המשימות שלי, 🔔 alerts, the idea/bug box and its inbox, holidays, יומן היום (tagged ניסיוני), the home inventory strip, stock report, onboarding, the home top section (drafts/timer), the timer sheets | `Hours.tsx`, `Gaps.tsx`, `Usage.tsx`, `MyTasks.tsx`, `Alerts.tsx`, `Feedback*.tsx`, `Holidays.tsx`, `DayLog.tsx`, `InventoryStrip.tsx`, `StockChange.tsx`, `OnboardingProgress.tsx`, `Home.tsx`, `WorkTimer*.tsx` |
| **D · Dev meeting** | 12: grouping by GitHub parent issue → priority, filters, "new this week" block; React rewrite of the dev board (`18-dev-tasks.js`) | `DevPresenter.tsx`, `devBoard.ts`, `sprintPrep.ts`, `supabase/functions/github` (sub-issues) |

Order: S → K and V (V depends on K's modal) → the rest in parallel. **Rule: by the end of the round, `no-overlap-allow.json` and `qa/impeccable-baseline.json` are empty/zero, so no screen can be left out.** Foldables (Galaxy Fold, Apple's foldable) come after this round as their own package.
Each package:
- runs `ops_graph.py file/table` before it touches anything;
- writes its own spec;
- ships with goldens, Playwright tests and humanizer-clean copy.

## Verification
- **Overlap sweep (new):** `qa/playwright/tests/no-overlap.spec.ts`. On every page and every open popup, at 390, 1440, 1920, 2560 and 3840, no two interactive or text elements may overlap (bounding-box intersection) and nothing may spill out of its bubble (`scrollWidth > clientWidth`). It runs on every build.
- **Stock goldens:** the same numbers before and after the inventory rewrite.
- **Test runs:** `npm test` + the full 4-project Playwright suite, looped until green.
- **QA re-check:** a `qa-coverage-audit` run over every note in this round, including the older rounds with the latest note winning.
- **Graph:** `python docs/ops-graph/rebuild.py`, then a message to the graph session.
- **Docs:** CHANGELOG, backlog, INDEX, and the test plan with a row per item.
- **Unfreeze:** only after you run your own phone QA on the frozen build.
