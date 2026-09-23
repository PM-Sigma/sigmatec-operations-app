🔴 OPENED BY THE OPS GRAPH (2026-09-23) — verified against the repo + live DB, needs עידן's decision.
Detail + evidence: `<project>/תוצרים/2026-09-23 — ממצאי OPS GRAPH/BROKEN.md` (local only — kept out of this public repo).
1. **🔴 RLS / access control** — three live-DB findings on write policies and roles (P1). Details in the
   local file only; do not paste them into this public repo.
4. **Schema drift** — `messages`, `auth_attempts` exist live with no `create table` in `db/`.
5. **24 modules with no test** — incl. permission logic `canShowPage.ts`, `caps.ts`, and `KibbutzCard.tsx`.
6. **Stale docs** — "legacy lockdown not applied" (live: anon already blocked), `17-staff.js` (retired),
   `test-mytasks-filter.mjs` (missing), `stats.html` (deleted).

✅ DONE (2026-09-20, Task 34) — **סיגמה 2.02**, the post-go-live fix round. The boot TDZ that was
silently serving a three-month-old snapshot on the live site (task-33 FAIL-2) + the two gates that
catch its whole class (`test-concat-order.mjs`, `qa/playwright/tests/boot-console.spec.ts`); the
duplicate `digestBody` import that stopped `push-send` booting (FAIL-1) + its two gates
(`deno-check` in `npm run qa`, `test-edge-imports.mjs` in `npm test`); and עידן's three rulings of
20.9 — the region inside the card, attendance leading with `חסר לך` plus a `חסר לצוות` strip for
עידן/עמיחי/viewer, and a held recording with ↻ when transcription is unavailable. Full detail:
`docs/CHANGELOG.md` [2.02]. Built on `feat/kibbutz-cards-redesign`, **not pushed**.

🟡 PENDING — **`db/rls_legacy_lockdown.sql` is written but NOT APPLIED.** The twelve
Apps-Script-era tables (`attendance, ems_cache, ems_queue, movements, orders, potentials,
products, regions, requirements, returns, settings, tasks`) still answer the public anon key.
עידן ruled 20.9: close them. A human applies this one in the SQL editor, after
`db/rls_2_00_lockdown.sql`. Reversible, and it needs no client change — every read already goes
out with the bridge pass. `test-rls-policies.mjs` fails if the file stops governing any of them.

✅ DONE (2026-09-19, release-prep) — **סיגמה 2.01**: unified inventory (P6, Tasks 8–10) + whole-app
QA audit (Task 31, 9 Critical/22 Important/22 Minor found, all Critical + most Important fixed)
+ visit summary in chapters (Task 32) + this release-prep pass (card 📍 → chapters, pending-states
extended, `VERSION` → 2.01, docs checkpointed). Full detail: `docs/CHANGELOG.md` [2.01]. Pushed to
`dev`. **`main` NOT updated** — 27 parked production steps now (was 20 at 2.00), see
`docs/HANDOFF-עידן.md`. **Deferred from the Task 31 audit** (reasons in `task-31-fix2-report.md` /
`task-31-fix3-report.md`; pick these up in a follow-up, not blockers for go-live):
- **A7** — a bus-contract cleanup (needs a wider pass across every `sigmaEmit` caller, not a
  one-file fix).
- **A10/A11** — need a product decision before touching them (see the audit report for the two
  options each).
- **F-17/F-18** — their own dedicated sweep (broader than the fix rounds' scope).
- **F-19/F-20** — decisions pending, same shape as A10/A11.
- **F-22 — עידן's decision to make** (flagged explicitly by the auditor; not the controller's call).
- **4 jscpd duplication leftovers** — cosmetic, non-blocking, listed by file in
  `task-31-fix3-report.md`.
- **Health v1 thresholds** — only "פניות ללא מענה" has real EMS data behind it; the rest wait on
  עידן's numbers (originally slated for Tue 22.9, still open).
- **Day-log per-task status ownership** — who resolves a day-log line item, still undecided.
- **Attendees-as-tags (Clockify)** — ~40 of the 87 live Clockify tags are people, not
  projects/kibbutzim; decide whether attendees should also apply as tags.
- **Dev-board inference** — the 🚀 "source column" question from 2.00 is still open.
- **Gmail intake** — still optional/unapproved, not part of any shipped task.
- **pending-states.spec.ts full sweep** — this release only added 4 of ~30 remaining
  click-map §1 clickables (see [2.01] CHANGELOG entry); the rest need the same delay/abort
  treatment in a follow-up task.

✅ DONE (2026-09-19, Task 7) — **סיגמה 2.00 redesign** built through Task 30 + 18a/18b/19, version bumped (`node build.mjs major` → **2.00**), full suite green, pushed to `dev`. Spec `docs/superpowers/specs/2026-09-17-kibbutz-cards-redesign-design.md`, plan `docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md`, branch `feat/kibbutz-cards-redesign` (worktree `SigmatecOps-wt-cards`). **`main` NOT updated** — stays on maintenance mode (`e398947`) until עידן completes the 20 parked production steps (10 migrations, 6 edge-fn deploys, 3 cron jobs, 1 re-run) and secrets in `docs/HANDOFF-עידן.md`, after which the controller fast-forwards `dev`→`main` and removes maintenance mode. Open decisions waiting on עידן: health v1 thresholds (Tue 22.9), day-log per-task status ownership, Clockify attendees-as-tags, dev-board 🚀 source column, Gmail intake (still optional/unapproved). Companion specs: unified inventory (Tasks 8–10, ships 2.01, depends on this release), company process (P4, planned).

# Backlog & status

✅ DONE (22.9 evening) — **phone QA round 2** (2.12): nine packages built by Opus/Sonnet agents, merged, all five
migrations applied. Test plan per item: `docs/reports/2026-09-22-round-2-test-plan.md`. Follow-ups shipped the same night (2.17): red missing days on the calendar, 2 h timer server push (cron +
push-send v22), home top section = drafts + active timer, humanizer sweep complete, meeting-review site gate.
Open: tone decision on the 14 motivational push texts in `field.ts`; Whisper meeting scribe plan (23.9 10:00).
Round 3 (2.18, same night): packages N–S + audit gaps T/U shipped — root causes of the accidental archives, the
unclearable alerts, the stuck order status and the invisible 🎙 panel are all fixed at the source; SQL applied
(`alert_mark_seen_fix`, `kibbutzim_code`). Open: עידן re-tests on the phone; QA session reads `docs/HANDOFF-QA-phone-round.md`.
2.21 (same evening): icon reverted to the Σ gear image, my-tasks strip collapsed, kibbutzim ↔ EMS sites linked,
visit form in one scroll (ruling), Android speech duplication + Whisper vocabulary prompt. Open: Whisper accuracy
check by עידן after the prompt; פזגז (3 gas meters) has no card on purpose — decide if it needs one.
2.22 (round 4): המשימות שלי sheet, no EMS chain in kibbutz edit + unlinked error, last-visit ✏️/🚚 regression fixed,
arrival date. Open: graphify run; personal area spec; certificate list in the card (עידן to decide).

🟡 IN PROGRESS — **phone QA round (22.9)**: rounds 1–2 built on `feat/phone-qa-round` (2.08), see
[spec](superpowers/specs/2026-09-22-phone-qa-round-design.md). Round 3 built E1 (timer sheet: pause/resume, retime, people/tags while running, 2 h auto-stop + local notification)
and E2 (⏱ שעות מול לקוחות page: filters, edit/add/delete for עידן+עמיחי, PDF/Excel, DB change log). Left open:
**E1-push** (a server push for a phone closed the whole 2 h), **D12 — FOUND + FIXED (data):** דפנה's row had `archived_at = 2026-09-22 08:46` — the ✏️ on the home card led to 🗄 ארכב, which is why the card vanished; unarchived and set `section='active'` (עידן: "not in לקוחות חדשים"). **D13 — finding:** every `tasks.status` is empty since 17.9 14:xx (the 2.00 migration); the 18.9 18:00 state already had them empty, so a rollback to 18.9 restores nothing — only a Supabase backup from before 17.9 14:00 would, and that is עידן's call in the Supabase dashboard. The 8 `section='new'` rows are the 2.00 seed (אלומות, גבת, דגניה, דגניה ב, חוקוק, יגור, עין דור + דפנה now active); which 3 should stay "new" needs עידן's list. **D13** data restore (a data decision — needs עידן), **D6** card-crash hunt (QA session),
**K2** the remaining ~180 dashed strings (report). Three migrations to apply by a human: `db/internal_tasks_fields.sql`,
`db/meter_burns_ems_task.sql`, `db/work_sessions_log.sql` (the last one is REQUIRED for edits on the hours page) (the client tolerates their absence). QA session (סשן B) runs the full gate set next.


_Update this file as things move. Session-by-session history lives in claude-mem._
_Full current snapshot: [INDEX.md](INDEX.md) → 🚦 Current state. Build: **1.67 on main** (2026-08-24, live)._

## ✅ DONE — site consolidation & EMS-link integrity (RELEASED 1.67 to main, 2026-08-24)
Spec: [docs/superpowers/specs/2026-08-24-site-consolidation-design.md](superpowers/specs/2026-08-24-site-consolidation-design.md).
אור הנר unified from two energy-split cards into one · 5 sub-site cards added (גשר השלום, שדה אליהו
חקלאות, מכללת ספיר, שלוחות ספק חיצוני, שער הגולן מחוץ למחלק), each on its own EMS UUID with the UUID
removed from the parent so no task double-renders · כפר עזה + דביר mapped (their EMS sites existed but
were missing from the map — that was the "no EMS tasks" bug) · every card now gets a region (the
three-duplicate-row שדה אליהו shadowing bug fixed + REGION_FALLBACK) · the data-entry procedure deleted
everywhere including the stats.html KPI · live cards lost the construction-process fields.
72 checks + 24 suites green, verified in-browser against the live Sheet.
**⛔ Blocked on עידן (EMS writes, cannot be done from the app):** create EMS sites for **ניר עציון,
עין דור, דגניה ב** — until then those three keep the ⚠️ "לא מקושר ל-EMS" indicator and the hard block
on task creation. Also worth cleaning in the Sheet: orphan row 13 (אור הנר גז) + duplicate שדה אליהו rows.
**Note:** this branch also carries the never-merged 1.59 kibbutz↔EMS site-integrity work (18 commits).

## ✅ DONE — נוכחות is the operations hub (shipped 1.60)
Spec: [docs/superpowers/specs/2026-08-02-attendance-hub-design.md](superpowers/specs/2026-08-02-attendance-hub-design.md) (SHIPPED).
Field days editable from נוכחות via the visit editor (one visit opens directly, a 2-kibbutz day expands
to pick) · `visits.ems_task_id` added (**migration applied to prod**) so a visit remembers its EMS task ·
editing a linked visit posts an EMS **comment** naming the change (never a status/due-date PATCH) ·
דוח ביקורי שטח deleted, its content folded into the monthly נוכחות PDF (contact/products/visit totals),
while the cert picker + certs report + visits Excel moved to a button on the נוכחות header · the visit
form no longer defaults to today and refuses an empty date. 33 checks + full suite 18/18, verified live.
**Open:** no month-lock (a month already sent to accounting is still editable); no attendance↔field
conversion; the quick-FAB still defaults its wizard date to today (deliberate — it's an explicit step).

## ✅ DONE — editable attendance reports (shipped 1.59)
Spec: [docs/superpowers/specs/2026-08-02-attendance-edit-design.md](superpowers/specs/2026-08-02-attendance-edit-design.md) (SHIPPED).
Workers could not fix a submitted attendance report at all (no edit path; re-entering left the mis-dated
row alongside the new one). ✏️ per non-field row → edit date / day type / "אחר" note; saves with the row
`id` so the router UPDATEs instead of inserting. Own entries only; עידן+עמיחי may fix anyone's; viewer none.
**Edit-only, no delete** (a wrong date is fixed by editing the date). 28 checks + full suite 17/17, verified live.
**Open follow-ups:** no month-lock, so a month already reported to accounting can still be edited — worth
a lock or an edit log once a month-close concept exists. No attendance↔field conversion (mis-logging a
field day as משרד still needs a visit created).

## ✅ DONE — "המשימות שלי" per-אחראי view filter (shipped 1.58)
The top-row אחראי picker now filters the displayed task list too (was report-buttons-only), and
**defaults to the logged-in user** so everyone opens on their own tasks. Heading switches to
"המשימות של &lt;name&gt;" for others. `test-mytasks-filter.mjs` → 14 green; full suite 16/16; verified live.

## ✅ DONE — עידן can open others' נוכחות (shipped 1.57)
`canSeeAttendance()` had עידן explicitly excluded; re-added via `isIdan()` so the pre-existing
person-toggle works for him. One-line fix.

## ⚠️ NEEDS RECONCILING — `feat/kibbutz-site-integrity`
18 commits diverged from `main`, **conflicts on rebase** (index.html + sw.js generated files). 1.57 and
1.58 both shipped by cherry-picking source-only edits into a clean worktree off `origin/main` instead.
Decide: rebase-and-resolve, or re-apply its source edits onto main the same way. Its 7 site-* test
suites live only on that branch (hence 16 suites on main vs 23 there).

## 🟡 IN PROGRESS — EMS-linking batch (4 features, A built 2026-07-19)
Sequence A→D→B→C, one spec+branch each.
- **A = ✅ BUILT on `feat/kibbutz-site-integrity` (1.59), pending dev→main.** Exact-match resolver (killed
  the fuzzy `indexOf` bug), corrected data (שלוחות UUID/entity, added דפנה + קיבוץ ניצנים), ⚠️ indicator +
  hard block on all task-creation paths + עידן-only linkage audit. 23 checks green. Spec + plan:
  [spec](superpowers/specs/2026-07-19-kibbutz-site-integrity-design.md) ·
  [plan](superpowers/plans/2026-07-19-kibbutz-site-integrity.md). **Action (עידן):** in EMS, create/verify
  sites for the still-unlinked cards — כפר עזה, ניר עציון, עין דור, דגניה ב, דביר — then ship dev→main.
- **D = delivery-note overhaul** (save-without-PDF → produce-PDF → email; visit-summary-central auto-open
  pulling EMS site details), **B = quick-order-from "אספקת מונים" task (AI)**, **C = remove מלאי בקיבוצים
  window** — not yet spec'd. Next up: D.

## ✅ DONE — 🔥 צריבות merged into 2.00 as a temporary project (Task 23, on `feat/kibbutz-cards-redesign`)
Spec: [docs/superpowers/specs/2026-09-06-meter-burn-tracker-design.md](superpowers/specs/2026-09-06-meter-burn-tracker-design.md) (§7 = EMS refresh)
(worktree `C:/Users/idann/Projects/SigmatecOps-wt-burns`, preview config `burns-wt` in `.claude/launch.json`).
Done 7.9.26: tables + seed applied by עידן (268 / 261 / 85 verified), insert policy migration, tab renders real data (28 kibbutz groups),
⟳ EMS button + auto-sync on open built (1.69), writes mint the pass on demand + generator meter-number/EMS lookup (1.70), 27 suites green, gate verified (עידן only).
**19.9.26 — Task 23 (plan §"Task 23"):** `feat/meter-burns-rel` (1.71) merged into `feat/kibbutz-cards-redesign`
and the feature re-placed where the work happens: card chip `🔥 נותרו X/Y` (hidden at 0) · a 🔥 צריבות section in the
card modal · `burn` rows in the briefing's לפני שיוצאים (ticking = ✅ נצרב) · a progress strip above the cards
(work for the field team, **progress** for everyone else — עידן 21:50). **No nav tab**; the full table stays one legacy
screen reached from the strip / ⋯ עוד, tagged פרויקט זמני. Audience back to the spec's: write אביאם/ניתאי/עידן/עמיחי,
viewer reads, hidden from מתניה/אליה. **Removal path:** `window.BURNS_PROJECT_ACTIVE = false` hides every surface, data stays.
**Still open (עידן):** the live smoke with a real EMS login (⟳ EMS once, verify the toast/footer + the row count) — it ships
with 2.00 now, not on its own branch; then `git worktree remove SigmatecOps-wt-burns` and delete the superseded
`feat/meter-burns` / `feat/meter-burns-rel`. Deferred: EMS write-back of role, JSON export for the disconnect software,
`seen_at` for meters that vanish from the EMS, `burnAttr` backslash escape.
## ✅ DONE — attendance-reminder push, viewer-triggered (shipped 1.50)
Spec: [docs/superpowers/specs/2026-07-16-attendance-push-reminder-design.md](superpowers/specs/2026-07-16-attendance-push-reminder-design.md) (SHIPPED).
Viewer sees missing weekdays (red chips) + 🔔 בקש עדכון נוכחות button → sticky push to the worker.
Merged `feat/attendance-push`→dev→main; unified with the 1.48 order push into one `push-send`
(dual-mode) + one client file + one VAPID keypair. **Prod TODO (עידן):** redeploy `push-send` with the
dual-mode code (table + secrets already live from 1.48).

## ✅ DONE — Web Push notifications for order approvals (shipped 1.48)
Spec: [docs/superpowers/specs/2026-07-16-web-push-notifications-design.md](superpowers/specs/2026-07-16-web-push-notifications-design.md).
Native Web Push: `push_subscriptions` + Edge Function `push-send`, client-triggered after create/approve.
Routing mirrors approval rules (customer→אביאם/ניתאי, supplier≤10→אביאם, >10→עמיחי; approved→group minus
approver/creator). Android OS push; iPhone/unsupported keep the in-app modal. Live on main.

## ✅ SHIPPED 2026-07-16 — 1.47 drop-ship orders (ספק ישיר) + supplier datalist (main)
Customer order can be supplied directly by the supplier: אחראי picker option "🏭 ספק ישיר" →
approval touches no stock, opens no EMS task. ספק field backed by a datalist of past supplier
names. Spec: [2026-07-16-dropship-orders-design.md](superpowers/specs/2026-07-16-dropship-orders-design.md).

## ✅ SHIPPED 2026-07-16 — 1.45 viewer rework + Excel exports (dev, b34ceb4)
Both viewer specs delivered together on `feat/viewer-reports-excel` → `dev`. Viewer home = navy
header + **📊 reports hub** (visits/attendance/certs/cert-summary/stock — PDF+📗Excel from one card);
kibbutz cards/company-tasks/urgent/filter/compact hidden; משימות nav hidden; מלאי/נוכחות/יומן stay
browsable but read-only (all action buttons hidden). 📗 Excel = real .xlsx (vendored SheetJS 0.20.3,
lazy-loaded), typed cells, row-per-item, gated to עידן+viewer. `test-exports.mjs` 21 green + all
regression suites. **Pending: manual Excel smoke by עידן on dev preview, then dev→main.**

## 🔴 Run SQL — seed kibbutz_details (delivery-cert customer block, ready)
✅ `db/delivery_certs.sql` RAN (2026-07-14, verified). ✅ EMS `sites` data pulled (2026-07-15 — the
table DOES have company_name/company_id + accountant contact; no address column) and the seed is
generated at **`C:\Users\idann\Documents\seed_kibbutz_details.sql`** (kept OUT of the public repo —
it contains real customer ח.פ./contact data): 47 cards, swapped-column rows fixed, placeholders
blanked. **Action (עידן): run it in the Supabase SQL editor** (writes are authenticated-only, so
Claude can't apply it via anon REST). 6 kibbutzim have genuinely blank details
in EMS (אגודת המים עמק הירדן, אפיק, חולדה, כפר דניאל, מגידו, מעלה גלבוע) — fill in EMS or leave as
editable blanks on the cert. Cert test automation: `test-delivery-cert.mjs` (26 ✓) +
`test-cert-pdf.mjs` (33 ✓, markitdown) — both green 2026-07-15.

## ✅ RELEASED 2026-07-06 — 1.20+1.21 live on `main` (E360 default rule + order assignee)
`db/orders_schedule_fields.sql` ran (`orders.assignee` live), `parse-order` redeployed, ff
`c584261`→`3056380`. Brand-less meters now default to מונה Landis+Gyr E360PP (Satec only on explicit
סאטק/133); "מונה תלת-פאזי משנה זרם" → E360CT; one email may carry PP+CT. עידן+עמיחי can assign supply
responsibility on customer orders (stock from the assignee's bag, EMS task assigned to them). Learning
loop verified. No open items from this batch.

## ✅ RELEASED 2026-07-02 — 1.07–1.15 live on `main` (audit fix sweep)
Migration `db/orders_type_kibbutz.sql` ran clean, `parse-order` + `ems-auth` redeployed, then
`dev`→`main` ff (`83d4924`→`87cc656`). Bundle: P0 critical bugs (sbDelete `H`→`baseH`, customer-order
orderType/kibbutz persistence, blank requirements tab, ems_cache-401 root fix) · dev-page kanban grid ·
connection hardening · design polish. Details: CHANGELOG 1.12–1.15. This also closed the long-pending
"re-deploy parse-order (·56 changes)" item below.

## ⏳ Re-deploy `parse-order` — pick up ·56 changes
**Action:** Supabase → Edge Functions → `parse-order` → paste updated `supabase/functions/parse-order/index.ts` → Deploy.
Changes in this version: Carlo/PM135/PURS/ROBUSTEL/SIM aliases + auto-add rules + `orderType` param + Groq default
model `llama-3.1-8b-instant`. **Optional:** add `GROQ_API_KEY` secret (console.groq.com) for the Groq fallback path.
The app (·56) already has the matching offline matcher — parsing works in degraded mode until redeploy.

## ✅ RESOLVED — live dev-tasks priorities/status (2026-06-23)

- **The `GH_TOKEN` blocker is fixed.** עידן updated the token with **`repo` + `read:org` + `project`** scopes
  and **redeployed** the `github` function. *(Sigmatec-Energy doesn't enforce SAML SSO, so no SSO authorization
  step was needed.)* **Verified live in עידן's session:** the פיתוח page renders **127 status badges + priority
  chips** (קריטי/גבוהה, In Progress/Backlog) across 130 tickets, and **"בפיתוח עכשיו"** is driven by real
  Status=In-Progress (5 items). No code change — token scope only.

## ✅ DONE — עידן's independent add/remove stock tool (1.11, on dev)
Shipped + verified in-browser. Only affects `dev` — deploy dev→main to make it live. No further action
needed unless עידן wants it opened to other roles too (currently עידן-only per the ask).

## 🟡 Pending — pick a new name for "מלאי לפי מיקום" (naming options given, not yet applied)
Category separators shipped (1.10). The tab/header rename is waiting on עידן's pick from the options
Claude proposed in-session — one-line text change once decided (`index.html` tab button + card `<h3>`).

## 🔴 Run SQL — add EM133 משנ"ז fix + בקר 485 + PUSR top-up for ניתאי (1.09, on dev)
**Action:** run `db/add-em133-mashneze-and-485.sql` in the Supabase SQL editor (transactional, has a
verify SELECT). Fixes the name of the EM133 משנ"ז product you already added (missing the מונה prefix —
that's also why it wasn't showing in by-location/kibbutz stock: zero movements yet), adds "בקר 485" to
the catalog, and enters ניתאי's stock (2× EM133 משנ"ז, 3× בקר 485, +1× בקר PUSR). **Also deploy `parse-order`**
(code updated: new AI glossary entries for both items + an offline-matcher disambiguation rule so "EM133"
mentions don't double-match the new EM133-משנ"ז variant).

## ✅ DONE — unify E360PP/SP meter names (1.08, still needs dev→main)
SQL ran clean (`db/unify_e360_meter_names.sql`): 11 rows/732 qty `מונה Landis+Gyr E360PP`, 4 rows/337 qty
`מונה Landis+Gyr E360SP`, zero leftover variants, corrupted duplicates deleted. `parse-order` redeployed
with the new aliases. **Remaining:** deploy the 1.08 bundle dev→main (code was already aligned pre-SQL,
so `main` still has the old short-form fallback strings until this ships). Broader meter/accessory drift
(CT/E570/EM133/PM135/controllers/SIMs + a corrupted CT row + empty-name catalog row) is left untouched
until asked.

## 🟡 Pending (user / admin)

1. **Supabase MCP** — added to `~/.claude.json` (`mcp.mcpServers.supabase`). This machine runs Claude in the
   **desktop app** (no `claude` CLI). Activate: **fully quit + reopen the desktop app → `/mcp` → authenticate**
   (Supabase OAuth). Then a session can deploy functions / read logs / run SQL directly (closes the redeploy loop).
2. **Calendar** — Workspace **Domain-Wide Delegation**: admin authorizes the SA `client_id` for the `calendar`
   scope → then add a `sub` impersonation claim + wire the יומן UI. (`calendar` fn already in repo.)
3. **Rotate `service_role`** (exposed in chat) — coordinated: roll the JWT secret → update `ems-auth`'s
   `JWT_SECRET` env + redeploy → swap the new `anon` key into the bundle + rebuild.
4. **EMS changelog → calendar** — show EMS version-release days in the יומן (needs the calendar unblocked + the
   changelog source מתניה maintains).
_(No open blockers. Dev sprint board incl. writes is LIVE & verified (·94). Standing admin items: Supabase MCP,
calendar DWD, `service_role` rotation.)_

## 🔜 Open feature work (next sessions)

- 🧩 **Spec A — kibbutz order → EMS task scheduling flow** — DESIGNED + approved, **not built**. Spec:
  `docs/superpowers/specs/2026-06-29-kibbutz-order-ems-task-flow-design.md`. Needs `db/orders_schedule_fields.sql`
  run first (עידן). Next step: writing-plans → build. Then **Spec B — דף היום inside משימות** (once-daily 00:01
  notification + click-to-set-target). Note the flow **requires a live EMS connection** (no offline EMS actions;
  the offline queue is bypassed, kept for now).

- 🔗 **`ems_task_id` link (order/visit ↔ EMS task)** — store the EMS task id on the order (and visit) so closing
  the task reconciles the order/visit, and a visit's summary attaches to a known task instead of just a comment.
  Needs a DB column + SQL (`db/orders_ems_task_id.sql` already drafted) + wiring in approveCustomerOrder /
  pushVisitToEms. Surfaced in the ·99 EMS-flow audit (deferred — schema change).
- 🧑‍💻 **Dev-page: statistics page** — עידן's next ask. The new `dev_status_log` table (first-day-per-stage per ticket)
  is the data source: time-in-stage, cycle time, throughput per sprint, aging in Backlog/Review. Build on the Stats page.
- 🧑‍💻 **Dev-page board grouping (optional revisit)** — the status board groups each whole tree by its **root's** stage,
  so a sub-task's own status doesn't place it in its own column (it nests under its parent's column with a status badge).
  Per "keep the hierarchy" this is intended; revisit only if עידן wants sub-tasks to also surface by their own status.
- 📦 **EMS/inventory: `ems_cache` RLS 401 on login** — `emsOnConnected → emsSyncCache` upserts `ems_cache` as anon →
  RLS reject (seen repeatedly in console). Likely needs the authenticated Supabase pass before the write (cf. the
  ·36 saves fix in `01-data.js`). **Inventory/EMS lane** — not the dev-page lane.

## 🟢 Done (recent — see CHANGELOG for detail)

- **Draggable quick-visit FAB (1.04→1.06, LIVE):** free-drag + persisted per device + tap-vs-drag; glowing
  drag-hint arrows that fade after first drag; gated to **עמיחי/אביאם/ניתאי only** (hidden from עידן).
  Merged `feat/draggable-visit-fab` → dev → main.
- **Released ·95→1.03 to `main` (2026-06-29):** the whole session batch (notifications, data-loss fix, per-ticket
  board, EMS-flow audit fixes + calendar tasks, visit→status, mobile, 401 fix) — reviewed pre-merge with
  superpowers + ponytail (green). **1.03** = review nit (no optimistic offline EMS status). Added
  `db/orders_schedule_fields.sql` (assignee+due_date) for the upcoming Spec A flow.
- **401/RLS save fix (1.02):** re-mint + retry, then prompt EMS re-login instead of a raw Postgres 401.

- **Visit→status + mobile QA + calendar guide (1.01):** visit report no longer appended to the kibbutz status;
  card "ביקור אחרון" shows date + who only. Mobile QA of notifications/tasks/reports at 375px (no overflow);
  fixed report range buttons to ≥40px tap targets. Calendar setup guide added (`docs/calendar-setup.md` —
  service-account *calendar-sharing*, no DWD). Version rolled ·100 → **1.01**. On `dev`.

- **EMS-task flow audit + fixes (·99):** parallel read-only audit (open/close triggers, visits, calendar,
  orders↔stock). No second order-class data-loss bug. Shipped: **EMS tasks on the calendar** (grid+day panel by
  due date); **createTask** no longer dead-letters a site-less task on a transient lookup error (#1); **task-detail
  status is queue-aware offline** (#2); **writeVisit** preserves `created_at` on edit (#4); **delivered-without-
  distribution** now confirms instead of silently downgrading (#5); requirement re-fulfill + blank-product movement
  guards. On `dev` (·99).

- **Dev sprint board: per-ticket placement (·97):** the board bucketed whole trees by the **root's** stage, so
  pushing a **child** to a sprint changed its GitHub status but the card didn't visibly move, and column counts
  (=roots) didn't match the cards shown (=subtrees). Now every ticket sits in **its own** status column (flat
  cards, accurate counts); the full tree stays in "לפי נושא". Parent-cascade removed (each card selectable
  directly) — also kills the epic-demotion bug. **LIVE on `main` (·97).** `test-devboard.mjs`.

- **DATA-LOSS fix — order/requirement details wiped on status change (·96):** status-only writes (`{id,status}`
  from approve / quick-status) rebuilt the whole row from empty defaults → wiped `items`/`supplier`/`notes`/
  `distribution`. Now order+requirement updates are **partial-safe** (PATCH only the sent fields, via
  `writeOrder`/`writeRequirement` + `sbPatch`; `test-order-patch.mjs`). **LIVE on `main` (·96).**
  ⚠️ orders wiped before this build aren't auto-recovered (e.g. עמיחי's לנדיס order — re-enter via create→edit→בדרך).

- **Approved-order notifications (·95):** אביאם/ניתאי/עמיחי — when one approves, the others see a modal on next
  open ("🔔 N הזמנות חדשות אושרו") listing each order with a "📦 הצג הזמנות" button. Zero schema changes —
  `localStorage` seen-set per user. Creator excluded, no repeat-notify. Fires from `maybeShowOrderNotifications`
  post-data hook. **On dev; not yet released to main.**

- **Dev sprint board — phase 2 LIVE (·86)**: status board (6 named columns + view toggle + day-stamps via Supabase
  `dev_status_log`), **multi-select → דחוף ל-Ready** + **🚀 עלתה גרסה** (Done→Committed) via the `github` fn
  `mode:"setStatus"` (EMS-gated; `GH_TOKEN` Projects-v2 write + a "Committed" status option — both done). Offline
  ticket cache (fetch once/connection). Page now visible to **מתניה + אליה** too. Closes the phase-2 write token item.

- **Inventory two-type order flow (·49)** — BUILT. `orderType` toggle (ספק/לקוח); supplier approval ≤10→אביאם /
  >10→עמיחי + floating עמיחי nudge; customer approval (אביאם/ניתאי) deducts approver stock → kibbutz + opens an EMS
  "אספקת ציוד" task (queued `createTask` kind) + marks order `supplied` & requirement `fulfilled`. Verified e2e
  (approval matrix, toggle, nudge, customer-approval call sequence). *Note: customer EMS task is created on the next
  EMS connect (field approvers are usually offline) — by design, via the outbound queue.*
- **EMS bubble routing (·48)**: disconnected → in-app EMS login page (`showPage('ems')`); connected → external EMS
  system. Verified both states.
- **Dev sub-issue tree LIVE & verified (·48)**: עידן redeployed the `github` fn → 40 parent cards now nest their
  sub-tasks live (#104 → its 11). The "to light up" step is done.
- **Dev-page full sub-issue tree (·46)**: nests GitHub sub-issues to any depth (📂 topic → card → sub-task → leaf),
  cross-topic children preserved, sub-count badges, nested search. Function returns `t.parent` (graceful). Verified.
- **Dev-page "עומס לפי עדיפות" (·44)**: priority-load tiles in the פיתוח hero (קריטי/גבוהה/בינונית/נמוכה counts),
  fed by the now-live Projects-v2 Priority field.
- **Morning "היום" view REMOVED (·44)**: reverted per request — not wanted in the app right now. (Was added ·42;
  the whole feature incl. remember-last-page landing is gone; app opens on the home page.)
- **Dev-tasks priority/status went live (·43, config)**: `GH_TOKEN` reissued with `repo+read:org+project` + redeploy.
- **Low-stock "appears twice" fix (·43)**: meter shortage no longer doubles for אביאם/עמיחי (banner + company-task
  line) — they keep the banner, the line is skipped; other users keep the line. Verified per-role.
- **Dev-tasks color redesign (·41)**: dark navy KPI hero (4 live tiles + "עומס לפי נושא" bar/legend),
  per-topic color system (spine/pill/rail/bar all share one color), violet "בפיתוח עכשיו" card, filled-red
  critical chip. Pure visual — no data/logic change. Verified desktop 1040 + mobile 375 (2-col, no overflow).
- **Dev-tasks page**: 3-level collapsible tree (topic→אב→בן→detail+body), explicit GitHub button,
  **Projects-v2 Priority+Status via GraphQL**, "בפיתוח עכשיו" by real Status, search/jump chips, mobile-first.
- **Saves fix**: write shim re-mints the auth pass before every upsert → no more "נשמר מקומית" (·36).
- **Mobile QA pass** (≤768px): no overflow, ≥40px targets, my-tasks/attendance/matrix fixes (·33).
- **Version stamp** auto-increments in the footer; home renamed **"דף הבית"**; EMS bubble wording; footer RTL fix.
- **"שמור לגיליון" → "שמור"** (buttons + toasts); removed obsolete company-tasks "שלח לעידן" workaround.
- **Hang prevention**: function fetch timeouts + client 20s timeout + 🔄 retry.
- Earlier: Supabase migration · PWA · EMS login gate · security bridge + write-lockdown + messages-privacy ·
  Stats page · role-based Employee page · meters · "add to calendar" links · module split + build.
