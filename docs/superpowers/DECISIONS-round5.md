# Round 5 decisions (23.9 - 29.9)

One table of every decision that shaped round 5, for עידן's review. **Who decided** is either `עידן` (explicit ruling in chat)
or `Claude (pending עידן review)` (taken by the orchestrator/agents while עידן was away, or by his blanket "decide by your
defaults" of 24.9). Anything in the second group is open to change: the "Where in code" column says where.

Sources: `docs/superpowers/r5-MEMORY.md`, `docs/superpowers/r5-RESUME-27-9.md` (section "Decisions taken without עידן"),
`docs/reports/2026-09-23-r5-decisions-log.md` (Hebrew, 25 rows, kept as the detailed log), `docs/reports/2026-09-27-work-log-and-issues.md`,
`docs/CHANGELOG.md`. Repo is public: no secrets, IPs or row data here.

| Date | Decision | Who decided | Why | Where in code |
|---|---|---|---|---|
| 23.9 | Round 5 gets priority over everything until go-live; Modbus page, foldables, Whisper scribe and Apps Script proxy wait | עידן | One finished, secure app before new features | `docs/backlog.md` top block |
| 23.9 | Never modify another repo (ModbusClient, sigmatec-ems, ...); use only | עידן | Standing rule | `docs/superpowers/WORKING-METHOD.md` |
| 23.9 | Customer delivery-cert links (`?cert=`) and mock mode stay open during the freeze | Claude (pending עידן review) | The customer does not use the app; tests run in mock | `upgradeFreezeDecision` in `js/src/00-consts.js` |
| 23.9 | Freeze overlay sits above every other layer | Claude (pending עידן review) | No dialog may show over it | `js/src/00-consts.js`, `test-upgrade-freeze.mjs` |
| 23.9 | Apps Script stays as the EMS proxy (reports, order parsing, transcription); only the Sheet as data source is retired | Claude (pending עידן review) | Proxy is still used live | `js/src/01-data.js` (`WRITE_ROUTER_URL`) |
| 23.9 | Tables `tasks`, `settings`, `ems_cache`, `ems_queue` kept | Claude (pending עידן review) | All still in live use | `db/*.sql` |
| 23.9 | Inventory opening balance written as movements from '' to the location, dated at the breakpoint, in עידן's name; alert trigger disabled during the write | Claude (pending עידן review) | Stock maths ignores an empty source; avoids 81 alerts | `archive.movements_pre_breakpoint` (DB), CHANGELOG 2.29 |
| 23.9 | Local backup = key-guarded function producing a daily JSON export (not pg_dump) | Claude (pending עידן review) | No DB password on the machine | `supabase/functions/backup-export/`, `db/backup_export.sql` |
| 23.9 | Docs modelled on EMS (generated schema + knowledge layer + map); coverage checks are warnings until DOC-1 (`DOCS_STRICT=1`) | Claude (pending עידן review) | One source, no duplicates; do not break every merge | `scripts/docs/*`, `docs/system/` |
| 24.9 | Full inventory item delete is final and overrides the visit lock for equipment lines; visit text never changes | עידן | His ruling | `db/inventory_delete_product.sql`, `db/visit_edit_lock_trigger.sql` |
| 24.9 | Write access to the GitHub board (incl. opening issues) = עידן, עמיחי, מתניה | עידן | His GitHub-writers ruling (spec had proposed עידן/עמיחי) | `supabase/functions/github/gate.js`, `canWriteGithub` in `app/src/lib/devBoard.ts` |
| 24.9 | Dev board priority chips and "העברה לשלב" in the UI open to עידן/עמיחי/מתניה (was עידן-only) | Claude (pending עידן review) | Match the GitHub-writers ruling | `app/src/islands/dev/CardSheet.tsx` |
| 24.9 | Staff mapped to identities only for `@sigmatec-energy.com`; מתניה has two EMS accounts, both mapped | עידן (two accounts) / Claude (domain rule, security) | A customer named עידן would have got admin by first-name match | `supabase/functions/ems-auth/identity.js`, `staff_identities` |
| 24.9 | Stock digest to עמיחי keeps supply movements from visits even though the bell hides them | Claude (pending עידן review) | It is an inventory summary, not a visit alert | `supabase/functions/push-send/` (`inventoryDigest`) |
| 24.9 | "אביאם sees ניתאי's tasks" is C's `cal_peer_tasks`; G's duplicate removed | Claude (pending עידן review) | One field per ruling | `app/src/components/CalPeerRow.tsx`, `Settings.tsx` |
| 24.9 | `backup.snapshots` and `archive.movements_pre_breakpoint` left without RLS | Claude (pending עידן review) | anon has no privilege on the schema; not reachable through the API | DB only |
| 24.9 | Stock difference when editing a pre-breakpoint September visit is computed against the visit's own products, not the archive | Claude (pending עידן review) | Archive movements come from personal bags: would deduct twice | Package V edit path (`app/src/lib/visitEdit.ts`) |
| 24.9 | Prod order: backup, attendance source column, history backfill, lock trigger, client + push-send together, backfill re-run | Claude (pending עידן review) | Without backfill every past visit day looks missing and nudges | `db/attendance_source.sql`, `db/attendance_visit_backfill.sql` |
| 24.9 | Design system: took the designer's option B (one fix round, then gallery check) | Claude (pending עידן review) | Cheaper to close before 11 packages build on it | `app/src/components/ui/`, `app/src/tokens.css` |
| 24.9 | Y3, Z2, H3, H5, D6, personal area, designer leftovers: decide by Claude's defaults and include in the round | עידן (blanket delegation) | He left the office: "finish everything" | this table |
| 24.9 | CLAUDE.md "every feature updates its module doc" rule: left to the very end, not applied | עידן | It is his file | `CLAUDE.md` (not changed) |
| 24.9 | Push-text rewrite and planner defaults accepted | עידן | Standing acceptance | `supabase/functions/push-send/` |
| 24.9 | `inventory_delete_product` re-granted to signed-in users; server guard requires name claim = עידן, no name blocked | Claude (pending עידן review) | Safe once X is live; the guard enforces the owner | `db/inventory_delete_product.sql` (`inventory_delete_guard`) |
| 24.9 | Agents run 6 at a time instead of 12; later parallel mode with one small task per agent | עידן (parallel mode) / Claude (6 at a time) | Usage limit stopped everyone twice | process only |
| 26.9 | Voice: record then Whisper is the default wherever MediaRecorder exists; live Web Speech is only a fallback (with prefix-collapse) | Claude (pending עידן review) | Android joined cumulative finals (prefix pile) and the record path never ran | `app/src/lib/speech.ts`, `transcribeChain` |
| 26.9 | Presenter undo toast is its own element (not Sonner), flat dock on phones, no ✕ on toasts | Claude (pending עידן review) | Sonner toast could not be centred/clickable over an open sheet | `app/src/islands/Presenter.tsx` |
| 27.9 | Calendar: an in-route stop shows "במסלול" and no add button | Claude (pending עידן review) | Avoid double-adding a stop | `app/src/islands/Calendar.tsx` |
| 27.9 | Inventory "הוחלפה ב־1043" RTL rendering accepted as correct | Claude (pending עידן review) | Number at the left edge is correct in RTL; designer misread LTR | `app/src/islands/InventoryStock.tsx` |
| 27.9 | Gaps behaviour change reverted: design-only in round 5 | Claude (pending עידן review) | Round 5 rule: no behaviour changes in a restyle | `app/src/islands/Gaps.tsx` |
| 27.9 | Empty chips hidden (no "—") in kibbutz meeting rows | Claude (pending עידן review) | Less noise | `app/src/components/kibbutz/StatusTab.tsx` |
| 27.9 | Field-ops page: manual entry may read any IP through the EMS parameter override; access for all staff; one card per circuit | עידן | Knowing decision after the audit flagged it | `supabase/functions/field-ops/handler.ts`, `app/src/islands/FieldOps.tsx` |
| 27.9 | Field-ops server hardening: SSRF denylist, CORS pinned to the app origin, error mapping | Claude (pending עידן review) | Security audit FAIL items | `supabase/functions/field-ops/handler.ts` |
| 27.9 | Freeze lifted (`UPGRADE_FREEZE=false`), app open to all staff | עידן | His approval after QA6 | `js/src/00-consts.js` (`385a6d8b`) |
| 27.9 | Both home-card changes reverted rather than bisected (`36fac282` visit buttons, `2c09a0da` SectionBlock) | Claude (עידן confirmed the app works after) | Home broke on real data; fastest safe fix | reverts `2a9c7849`, `21fe1734` |
| 27.9 | Backlog rulings from QA6: delete test tasks, faster recording, absences for all staff, inventory LTR, meeting-note row actions | עידן | His QA6 list | `docs/reports/2026-09-27-idan-qa-round6.md` |
| 29.9 | Working method: MAIN session integrates, Opus plans/final-checks, Sonnet executes, Fable out, stop at 85% weekly and ask | עידן | Budget and quality | `docs/superpowers/WORKING-METHOD.md` |
| 29.9 | Home-card visit buttons rebuilt with ONE lookup built in Home (no per-card query) and a real-size fixture (60 kibbutzim / 480 visits) | Claude (pending עידן review) | Per-card queries broke real data; render time rose roughly 1.75s to 2.4s, to watch | `app/src/islands/Home.tsx`, `qa/playwright/tests/home-realsize.spec.ts` |
| 29.9 | Meeting-note row menu: delete (5s undo), move to another kibbutz (undo), open internal task, convert to EMS task | עידן (backlog 27.9) / Claude (design) | Fix wrong transcript placement | `app/src/lib/meetingNotesOps.ts`, `StatusTab.tsx` |
| 29.9 | Internal-task link from a note row is stored as `internal:<id>` in `ems_task_id` (no SQL) | Claude (pending עידן review) | No migration needed; the prefix tells it apart from a real EMS id | `app/src/lib/meetingNotesOps.ts`, `MyTasks.tsx` |
| 29.9 | Calendar absences: types חופשה / מחלה / אחר / מילואים / אירוע for all staff; sick and other feed attendance only for אביאם/ניתאי | עידן (all staff) / Claude (attendance scope) | Attendance is tracked for the field staff only | `db/calendar_absences_sick_other.sql`, `app/src/lib/calendar.ts`, `Calendar.tsx` |
| 29.9 | Prod: `calendar_absences_sick_other.sql` applied via `supabase db query --linked` (MCP down); backup `calendar_absences_bak_r9` (0 rows) | Claude (pending עידן review) | Migration needed for the new types; rollback is in the file | DB, `db/calendar_absences_sick_other.sql` |
| 29.9 | Voice recorder: mono, 24 kbps, echo/noise suppression (upload about 5.4x smaller; end-to-end speed not measured) | Claude (pending עידן review) | QA6 3.2 "recording is slow" | `app/src/lib/speech.ts` (`SPEECH_BITRATE`, `recorderOptions`) |
| 29.9 | Inventory cert values wrapped in `<bdi>`, quantity inputs `dir=ltr` (no visual check at 360) | Claude (pending עידן review) | QA6 5.1 LTR alignment | `app/src/islands/InventoryCert*.tsx`, `InventoryStock.tsx` |
| 29.9 | Test tasks for לביא and אפיק deleted; backup table `internal_tasks_bak_test_29_9` | עידן (asked 27.9) / Claude (backup) | QA6 1.3 | DB only (`internal_tasks`) |
| 29.9 | SectionBlock clip fix built on its own branch, NOT on main until עידן checks it on a phone | Claude (pending עידן review) | It may share the cause of the 27.9 home break | branch `r9/w2-sectionblock` (`733f15dd`) |
| 29.9 | H3 and H5 skipped, not built | Claude (pending עידן review) | Need עידן: new write path / cache change | see below |

## Open questions for עידן

1. **H3 - presenter edits.** May the meeting presenter edit a kibbutz's region/section? If yes, which roles? This is a new write
   path and needs an RLS decision. Not built.
2. **H5 - EMS task lifecycle.** ✅ עידן 29.9: yes — track opened / assigned (with due date) / updated / closed for stats (time-to-assign, on-time close %, opened per kibbutz). Also feeds the presenter's "since the last meeting" opened/closed split. Spec: `specs/2026-09-29-ems-task-lifecycle-design.md` — waiting on 4 answers (meaning of שובצה, closed statuses, who sees stats, who feeds tracking).
3. **SectionBlock fix.** Branch `r9/w2-sectionblock` (`733f15dd`, pushed as a branch, not on main) moves the `-mx-4` classes onto the
   overflow div so non-flush SectionBlocks stop clipping about 16px. It touches about 30 screens and the previous attempt broke home
   on real data. Waiting for a phone check (githack preview) before it can merge.
4. **Review of every "Claude (pending עידן review)" row above.** Say which to flip; the last column says where.
5. **Also open (work log):** an internal ModbusClient address remains in public git history (P2 - rewrite history or accept?); field-ops
   not yet tested on a real meter; the CLAUDE.md module-doc rule (his file, deferred).
