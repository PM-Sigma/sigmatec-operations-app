# סיכום ביקור: the full backend chain of one save

STATUS: ✅ DONE (r7/pkg-A, 23.9.2026). Not merged or pushed yet. Fable rebuilds the generated files after merging.

## Why
עידן, 23.9: "every action has its full backend chain. I don't know whether the automations on visit-summary
documentation happen as I demanded in QA." A visit is filed through one of two paths:

- **Legacy form**: `saveVisit()`, `js/src/09-visits.js`. This is the fallback (`?login=0`, viewer).
- **Chapters sheet**: `app/src/islands/Field.tsx` `send`, which calls `saveVisitFromData()` in `js/src/09-visits.js`
  (through the bridge). This is the path the team actually uses. The 📝 יומן היום day log shares the same function.

## What the QA rounds demanded (latest wins)
| # | Effect | Source |
|---|--------|--------|
| 1 | Attendance: the visitor's day at that kibbutz is an automatic יום שטח, and it moves when the date is edited | round 2 F2, attendance hub §2 |
| 2 | Stock: supplied equipment moves from the pool (חברה) to the kibbutz. An edit moves only the delta | inventory §1, round 2 C2 |
| 3 | EMS: the summary is a comment on EVERY selected EMS task. An edit of a linked visit gets a change note (comment only, never PATCH) | round 2 C6, attendance hub §3 |
| 4 | Internal tasks that were selected are marked done | round 2 C6 |
| 5 | סיבת הביקור is stored on the visit when nothing was linked (`visits.reason`) | round 2 C6 |
| 6 | Delivery certificate is linked to the visit (legacy: gate before save; chapters: cert screen after save) | round 2 C7 |
| 7 | A new איש קשר מלווה is saved to `site_contacts` | round 1 J5 |
| 8 | Open items (`visits.open_items`) show up at the next visit ("נשאר פתוח מהביקור הקודם" in the briefing) | §5.1b, field.ts `leaveChecklist` |
| 9 | The draft is thrown away once the visit is filed | §5.1c |
| 10 | Returned equipment: chapters files `returns` rows (status open) and the returns tab decides תקין/תקול. Legacy posts the movement straight away | round 2 C5 (chapters copy: "בניהול המלאי תחליט") |
| 11 | Check-in, calendar, visitCron: the push stops nagging once a visit exists for that person, kibbutz and day | §7l, push-send `visitCronSelect` |

## Matrix: before and after
Attendance, check-in and visitCron are **derived at read time**, and nothing is written for them. Field days come from
`SHEET_DATA.visits` (`app/src/lib/attendance.ts withVisitDays`, used by `Attendance.tsx:337`, and by the legacy
`mergeAttendanceByDate`). visitCron reads the `visits` table (`supabase/functions/push-send/index.ts:474`). So the graph's
"no path from save to `attendance`" is correct and expected. What each save path has to get right is the visit row plus the
immediate snapshot row, and that is what the matrix checks.

| # | Effect | Legacy `saveVisit` | Chapters, before | Chapters, after |
|---|--------|--------------------|------------------|-----------------|
| 1 | Attendance (snapshot row + `visit-saved`) | ✅ patch in place (09-visits.js ~1110) | ✅ new visit / ⚠️ a re-save pushed a **second** row | ✅ patched in place by id |
| 2 | Stock from the pool | ✅ delta on edit | ✅ new visit / ❌ a re-save deducted the **full** amount again | ✅ delta, `visit_supply_edit`, over-supply goes back to the pool |
| 3 | EMS comment | ✅ one task + status (`pushVisitToEms`) | ❌ **the first selected task got no comment.** Only `emsIds.slice(1)` were posted (Field.tsx ~1312), so the common single pick reached EMS as nothing. The body also skipped the shared `buildVisitSummaryText` format | ✅ every selected task goes through the same `pushVisitToEms`. An edit sends `pushVisitEditToEms` to the linked task instead of a second summary |
| 4 | Internal tasks done | n/a (the legacy form has no internal-task list) | ✅ Field.tsx | ✅ unchanged |
| 5 | Reason stored | n/a | ❌ sent, but `writeVisit` (01-data.js:608) dropped it. The "retry without the column" the migration comment promised did not exist | ✅ written, and retried without it on 42703/PGRST204 |
| 6 | Cert link | ✅ gate | ✅ cert screen after save (`certAfter`) | ✅ unchanged. A re-save of a filed visit is not re-gated |
| 7 | Contact to `site_contacts` | ✅ `visitContactPersist` | ❌ missing | ✅ `visitContactEnsure`: reads the kibbutz's list first, then adds only a new name |
| 8 | Open items at the next visit | ❌ the row is written, but the snapshot loader dropped `open_items` (01-data.js:584) and the briefing reads snake_case | ❌ same | ✅ loader keeps `openItems`, both saves patch it, and bridge `getLastVisit` hands the briefing `open_items` |
| 9 | Draft discarded | ✅ | ✅ `visitDraftDiscard` | ✅ |
| 10 | Returns | ✅ movements (new visit only) | ✅ rows / ⚠️ a re-save inserted them again | ✅ not re-sent on a re-save |
| 11 | Check-in / visitCron / calendar | ✅ derived | ✅ derived | ✅ |

The day log (`DayLog.tsx`) posts its own per-task sentence through `sigma.emsAddComment`. It passes no `emsComment`, so
`saveVisitFromData` adds nothing for it and the day log still sends one comment per task.

## Fixes
- `js/src/09-visits.js` `saveVisitFromData`: an id that is already a filed visit counts as an edit or a retry (`isNew:false`).
  It skips the cert gate, doesn't re-send returns, moves stock by the delta and patches the snapshot row in place. It posts
  EMS comments through `pushVisitToEms` for each id in `emsTaskIds` when `emsComment` is set, sends the change note on an
  edit, emits `stock-changed`, and persists the contact. Returns `{ ok, id, edited }`.
- `js/src/09-visits.js`: new `visitContactEnsure(kibbutz, name)`. The legacy `saveVisit` snapshot patch now carries `openItems`.
- `app/src/islands/Field.tsx`: `send` passes `emsTaskIds` + `emsComment: true` and no longer writes comments itself.
- `js/src/01-data.js`: the loader maps `open_items` → `openItems` and `reason`. `writeVisit` writes `reason` and retries without it on a missing column.
- `js/src/00-bridge.js` `getLastVisit`: adds `open_items` to the row it returns.

## Tests
- `test-visit-summary-chain.mjs` (new, 25 checks): evaluates `09-visits.js` for real and checks each effect for a new
  chapters save, an edit (date + quantity), an identical retry, a give-back edit, and the day log. 16 of the checks fail
  on the pre-fix source.
- `qa/playwright/tests/visit-chapters.spec.ts` "chain: a picked EMS task gets the summary as a comment, exactly once".
  It runs in mock mode, where the comment lands as a queued `emsQueueAdd`. It fails on the pre-fix source (no comment).
- `npm test` green (53 legacy runners + vitest). Playwright `--project=mobile-390-light visit-form visit-chapters field
  attendance inventory-pool ems-tasks`: 49 passed.

## Left open
- The chapters sheet has no way to open an already-filed visit (edits go through the legacy form). The edit path in
  `saveVisitFromData` exists so that a retry or a future edit stays idempotent.
- `db/visits_reason.sql` is still marked NOT APPLIED. Until it runs, the reason is dropped on the retry.
- The legacy form still has one EMS task with a mandatory status (round 1 design). The multi-select exists only in the chapters sheet.
