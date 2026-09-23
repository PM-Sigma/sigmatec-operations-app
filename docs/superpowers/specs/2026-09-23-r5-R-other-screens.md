# Package R (Every other screen): implementation plan

STATUS: 🟡 OPEN, planned 23.9, NOT built. Resume: start at Task L1. L tasks can start now (L2 waits for package S's Task L2, which creates `lib/format.ts`). U tasks wait for (a) `r9/DS` merged to `origin/main` with the designer's PASS on it, and (b) package S's L1, L6, L7, L8 and U3 on `origin/main` (`runAdd`, the page-action registry, the Alerts split, the sweep registry, the page-action row). Round order: S → K and V → the rest in parallel; R is in "the rest".

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. `ponytail` on every task, TDD, verification-before-completion, no-ai-slop + humanizer on every UI string.

**Goal:** Every screen that no other round-5 package owns is laid out again on the design-system building blocks, with motion to spec, every state present (loading, empty, error, offline where relevant), copy that passes the gate, and the designer's PASS, so that at the end of the round no screen is left on the legacy look.

**Architecture:** No new product behaviour. Each screen keeps its data layer (TanStack queries, Supabase writes, the pure libs in `app/src/lib/*`) and swaps its markup for `SectionBlock` / `ListRow` / `Tag` / `FilterChip` / `StatTile` / `SegmentedControl` / `BubbleButton` / `Sheet` / `EmptyState`. The L layer moves the copy and icon data that live in libs out of emoji and imperatives, adds the small view-model functions the new layouts need, and pulls three legacy DOM screens (viewer reports, staff messages, push prompt) behind parameterised legacy functions so React can drive them.

**Tech Stack:** React 18 islands (`app/src`, Vite → `ui/sigma-*.js`), Tailwind with `--s-*` tokens, shadcn/Radix (`components/ui/*`), lucide-react, sonner, TanStack Query, Supabase JS, vitest, Playwright (`qa/playwright`), legacy JS (`js/src/*.js` → `node build.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-23-round-5-design.md` (package row "R · Every other screen"; "Kept (you said they work): Hours, Gaps, Usage. They get the new design only"; the zero-allow-list end rule), `docs/superpowers/specs/2026-09-23-design-system-design.md` (§2 components, §3 overlap rules, §4 missing items 2, 3, 9, 11, 12), `docs/design/tools-and-motion.md` (§1 icons/copy/charts, §2 motion, §3 prestige, §4 sign-off). Shell contract: `docs/superpowers/specs/2026-09-23-r5-S-shell.md`.

## Global Constraints
- Phones 360–430 CSS px (360×780, 390, 412×915, 430); desktop holds at 1440 (per build) and 1920/2560/3840 (nightly). Foldable 344 is a warning only.
- Boot chunk `ui/sigma.js` `< 303 * 1024` bytes (`test-sigma-shell.mjs`); every R screen is a lazy chunk, and R adds nothing to boot. New mount blocks in `main.tsx` are a dynamic `import()` each, like the existing ones.
- Tokens only (`--s-*`; z ladder content 0 · sticky 10 · header 20 · nav 30 · FAB 31 · scrim 40 · sheet 50 · confirm 55 · toast 60). No raw hex, px radii, z-index or durations outside `tokens.css`/`styles.css`.
- Motion tokens only: press 90 ms, fast 140 ms, base 200 ms, enter 280 ms, exit 180 ms, stagger 30 ms × max 6, `--s-ease-out cubic-bezier(0.16,1,0.3,1)`, `--s-ease-in cubic-bezier(0.4,0,1,1)`, `--s-ease-standard cubic-bezier(0.2,0,0,1)`, `--s-shift-sm 6px`. List entrance only on a list's first data render; never on refetch, filter change or return; no count-up; skeleton only after 300 ms, then ≥ 400 ms, opacity pulse 0.6↔1 (no shimmer).
- `position:absolute` only for a badge on its own bubble, the grab handle, a focus ring. Logical properties only. `<Text lines>`/`line-clamp` for titles (2) and meta (2); names never truncate below 12 characters.
- Icons: lucide-react, 1.75 stroke, 20 px in rows. Emoji only in text people type. Emoji → lucide map (tools-and-motion §1): 📋 `ClipboardList`, 🔒 `Lock`, 📍 `MapPin`, ✏️ `Pencil`, 🚚 `Truck`, 📗 `FileSpreadsheet`, PDF `FileText`, ⏰ `Clock`, 📅 `CalendarDays`, 👤 `User`, ⚠️ ללא אחראי `UserX`, 📣 `Megaphone`, 💡 `Lightbulb`, 🐞 `Bug`; 🆕/🔴 become a `Tag` with a dot.
- Tag vocabulary is fixed: חדשה = info, דחופה / באיחור = danger, ללא אחראי = warn, בטיפול = info, ממתין ללקוח = neutral.
- Copy: noun-form buttons (שמירה, שליחה, סגירה, ביטול, מחיקה, הוספה, עריכה, ניסיון נוסף), no `!`, no em dash, ׳ ״ not `'` `"`, no "who else sees this" lines, Hebrew `aria-label` on every icon bubble, numbers/dates through `lib/format.ts` inside `<bdi>` with `tabular-nums`. Gate: `test-copy-rules.mjs` vs `qa/copy-rules-baseline.json`.
- One popup type: `Sheet` (bottom sheet on phones, centered dialog from 768 up). `components/ui/dialog.tsx` is not used by any R screen after this package.
- One primary (gradient) action per screen; an action row holds ≤ 3 bubbles (a 4th goes to ⋯); a meta line ≤ 3 tags then "+N". Tap targets ≥ 44×44.
- No new screen enters `qa/playwright/no-overlap-allow.json`. Every screen R touches gets a sweep entry in `qa/playwright/tests/_screens/r.ts` and must pass it with no allow-list line.
- Never edit `js/app.js` / `ui/*.js` by hand. Worktree off `origin/main`, rebase + `node build.mjs` before every push, ff-only (CLAUDE.md).
- Nothing merges without the designer's PASS (tools-and-motion §4) and a non-rising `qa/impeccable-baseline.json`.

## Review Focus
1. **The longest real row at 360.** A Hours row with a long kibbutz name ("קיבוץ גבעת חיים איחוד"), a person, three tags and "לא נשלח" must clamp inside its ListRow with no horizontal page scroll; today the table scrolls sideways (`Hours.tsx:198`). Test pinned in Task U1.
2. **Closing a task, then undo within 5 s.** In המשימות שלי the row keeps its place during the undo window, and "ביטול" leaves the database unchanged. The write is sent only when the window closes. Test pinned in Task U4 (and `myTasks.test.ts` for the pure part in L3).
3. **The viewer on every R screen.** Hours, Gaps, Usage, alerts, my tasks and the reports hub are read-only for the viewer: no edit, nudge, close or add bubble is rendered at all (not disabled, absent). Test pinned in Tasks U1, U2, U4, U12.
4. **Sending feedback with no signal, or closing the sheet mid-dictation.** The text is kept (the existing draft, `feedbackDraftPayload`), the send button says why it is off, and nothing is lost when the sheet closes. Test pinned in Task U6.
5. **The EMS login gate at 360 with the keyboard up.** The PIN/code field and its button stay visible above the keyboard (`visualViewport`), and nothing sits under the fold. Test pinned in Task U14.

---

## 1. Requirements → tasks

The round-5 row: *"Everything not in another package gets the full design-system pass, laid out again on the building blocks, with animation to spec and the designer's PASS: ⏱ Hours, 📋 Gaps, 📊 Usage, המשימות שלי, 🔔 alerts, the idea/bug box and its inbox, holidays, יומן היום (tagged ניסיוני), the home inventory strip, stock report, onboarding, the home top section (drafts/timer), the timer sheets."* Plus the end rule: *"by the end of the round, `no-overlap-allow.json` and `qa/impeccable-baseline.json` are empty/zero, so no screen can be left out."* A survey of `index.html` and `js/src` for screens no package claims found nine more; R takes the unowned ones (R-15…R-24) and names the owner for the rest in §7.

| R-n | Screen / requirement (source) | Tasks |
|---|---|---|
| R-1 | ⏱ Hours page (`Hours.tsx`, `#hours-view`), new design only | L2, U1 |
| R-2 | 📋 Gaps sheet (`Gaps.tsx`), new design only | L1, U2 |
| R-3 | 📊 Usage (`Usage.tsx`), new design only; Recharts stays, desktop + עידן only (motion §1 Charts) | U3 |
| R-4 | המשימות שלי sheet (`MyTasks.tsx`), incl. the close-with-check + 5 s undo (motion §3.4) | L3, U4 |
| R-5 | 🔔 alerts list body (`components/alerts/AlertsPanel.tsx`, split out by S-L7) | U5 |
| R-6 | 📣 idea/bug box (`Feedback.tsx`) | L1, U6 |
| R-7 | 📥 its inbox (`FeedbackInbox.tsx`) | U6 |
| R-8 | 🕎 holidays sheet (`Holidays.tsx`), purple = holiday only | U7 |
| R-9 | 📝 יומן היום (`DayLog.tsx`), tagged "ניסיוני" | U8 |
| R-10 | The inventory strip (`InventoryStrip.tsx`: open orders + minimum-stock sheet). It renders on the מלאי page, not the home (`index.html:414`); the round-5 row calls it "the home inventory strip" | L1, U9 |
| R-11 | Stock report = 🔢 דיווח שינוי במלאי (`StockChange.tsx`); "דוח מלאי" appears nowhere else in the code | L1, U9 |
| R-12 | Onboarding progress (`components/home/OnboardingProgress.tsx`); its placement (open card, under מצב הקיבוץ) is package K's | U10 |
| R-13 | Home top section (drafts/timer) and the home composition around the cards (`Home.tsx`, `Section.tsx`, `FilterChips.tsx`, `SyncHairline.tsx`, `PullToRefresh.tsx`, the footer version line) | U10 |
| R-14 | Timer control + sheets (`WorkTimer.tsx`, `WorkTimerEditSheet.tsx`, `WorkTimerStopSheet.tsx`) | U11 |
| R-15 | Viewer reports hub (`index.html:234-296`, legacy DOM → React) (unowned) | L5, U12 |
| R-16 | Staff messages: the "✉️ הודעה לעובד" compose lives in `CommandBar.tsx:312`, which package X deletes; the login-time unread popup is legacy DOM (`17-messages.js:63-88`) (unowned) | L4, U13 |
| R-17 | Push-permission prompt (`22-push.js:50-95`, legacy DOM, red button, 🔔) (unowned) | L6, U13 |
| R-18 | Login screens: name picker (`#loginModal`, `index.html:942-960`), EMS login gate + viewer PIN (`#emsLoginGate`, `index.html:1210-1248`), the freeze `UpgradeGate` (`15-login-gate.js:182`) (unowned) | U14 |
| R-19 | ReLoginSheet, LoginRequired, EmsGate, TranscribeRetry (shared states) | U14 |
| R-20 | Meeting-summary import + review (`ImportNotes.tsx`, `MeetingReview.tsx`) (unowned; K or M may claim at reconciliation) | U15 |
| R-21 | `ViewSwitcher.tsx` is dead code (no importer; graph agrees) | L7 |
| R-22 | Shared parts the DS review requires on every screen but `r9/DS` did not ship: inline section error (DS §4 Missing 3), ConfirmSheet (§4 Missing 9) | U0 |
| R-23 | Every R screen: loading skeleton per SectionBlock, EmptyState, inline error, offline reason where it writes (DS §4 Missing 1–3) | U1–U15 |
| R-24 | Package gate: sweep entries for every R screen with no allow-list line, impeccable URL scans at 0 on R screens, copy baseline lowered, goldens at 360/412 light+dark, designer PASS | U16 |

## 2. Layers

**L = logic/data layer** (now; no DS dependency): L1–L7. Copy/icon data in R-owned libs, view models, parameterised legacy functions for the three legacy DOM screens, dead code.

**U = screen layer** (after the DS PASS and S's shell contract): U0–U16. Built only on `components/ui/*` as merged from `r9/DS`: `SectionBlock`, `ListRow`, `Tag`, `FilterChip`, `StatTile`/`StatTileGrid`, `SegmentedControl`, `BubbleButton`, `IconBubble`, `EmptyState`, `Sheet*`, `Skeleton`, `select`, `switch`, `textarea`, `toggle-group`, `sonner`, and S's `PageBar` contract (`registerPageAction`). A missing part is requested from the designer, never invented (motion §4.5). Known gaps, handled in U0: `SectionError`, `ConfirmSheet`. Also requested: a date-range field (for the reports hub); until the designer answers, U12 uses period FilterChips plus native date inputs styled on tokens.

## 3. File ownership

### Only R may edit (L layer)
| File | What |
|---|---|
| `app/src/lib/gaps.ts` + `gaps.test.ts` | action labels/icons, summary copy |
| `app/src/lib/feedback.ts` + `feedback.test.ts` | `KIND_LABEL`, `KIND_ICON`, validation copy. **Not** `KIND_PUSH_TITLE` (push copy is package X) |
| `app/src/lib/hours.ts` + `hours.test.ts` | validation copy; `hoursByDay`, `hoursTiles`; `fmtDuration` renamed `fmtHoursCell` (exports only) |
| `app/src/lib/stockChange.ts` + `stockChange.test.ts` | validation copy |
| `app/src/lib/orderStrip.ts` + `orderStrip.test.ts` | `StripNote.icon` → lucide name + tag role |
| `app/src/lib/myTasks.ts` + `myTasks.test.ts` | `taskTags`, `undoWindow` |
| `app/src/lib/staffMessages.ts` (new) + test | compose validation, recipients, popup copy |
| `app/src/lib/viewerReports.ts` (new) + test | period presets |
| `app/src/lib/pushPrompt.ts` (new) + test | prompt copy per mode |
| `js/src/21-excel-export.js` **lines 339–382 only** (`xlHub*`) | take parameters, DOM as fallback |
| `js/src/17-messages.js` **lines 49–95 only** | expose fetch/mark-read; popup → event |
| `js/src/22-push.js` **lines 50–95 only** (`showEnablePrompt`) | DOM → event, keep the legacy DOM as fallback |
| `app/src/components/ViewSwitcher.tsx` | deleted |

### Only R may edit (U layer)
| File | What |
|---|---|
| `app/src/islands/Hours.tsx` | page + edit sheet |
| `app/src/islands/Gaps.tsx` | sheet |
| `app/src/islands/Usage.tsx` (+ `Usage.test.tsx`) | sheet |
| `app/src/islands/MyTasks.tsx` | sheet |
| `app/src/components/alerts/AlertsPanel.tsx` | alerts list body (from S-L7) |
| `app/src/islands/Feedback.tsx` (+ test), `app/src/islands/FeedbackInbox.tsx` (+ test) | box + inbox |
| `app/src/islands/Holidays.tsx` | sheet |
| `app/src/islands/DayLog.tsx` | sheet (+ its `registerMoreItem` at lines 474–486) |
| `app/src/islands/InventoryStrip.tsx`, `app/src/islands/StockChange.tsx` | strip + sheets |
| `app/src/islands/Home.tsx`, `app/src/components/home/Section.tsx`, `FilterChips.tsx`, `app/src/components/SyncHairline.tsx`, `app/src/components/PullToRefresh.tsx` (+ test) | home composition |
| `app/src/components/home/OnboardingProgress.tsx` (+ test) | component only |
| `app/src/components/home/WorkTimer.tsx` (+ test), `WorkTimerEditSheet.tsx`, `WorkTimerStopSheet.tsx` | timer |
| `app/src/islands/ViewerReports.tsx`, `app/src/islands/StaffMessages.tsx`, `app/src/islands/PushPrompt.tsx` (new) | three new islands |
| `app/src/components/ReLoginSheet.tsx` (+ test), `LoginRequired.tsx`, `EmsGate.tsx`, `TranscribeRetry.tsx` | shared states |
| `app/src/islands/ImportNotes.tsx`, `app/src/islands/MeetingReview.tsx` (+ test) | meeting import/review |
| `app/src/components/ui/section-error.tsx`, `confirm-sheet.tsx` (new, U0, **only if not already on `origin/main`** and only with the designer's approval) | shared parts |
| `qa/playwright/tests/_screens/r.ts` (new) + one import line in `_screens/index.ts` | sweep entries |
| `qa/playwright/tests/r-screens.spec.ts` (new) | R behaviour at 360/412 |
| `index.html` **lines 234–296** (viewer hub → `<div id="sigma-viewer-reports"></div>`), **942–960** (`#loginModal`), **1210–1248** (`#emsLoginGate`), **the footer version line (~332)**, and **three new placeholders inserted right after line 1252** (`<div id="sigma-feedback-inbox"></div>`): `#sigma-viewer-reports` is in-page, `#sigma-staff-messages`, `#sigma-push-prompt`; inside the inline `<style>` (line 34, which S splits to one rule per line) **only the gate rules** (`#loginModal`, `[data-gate]`) | only these |
| `js/src/15-login-gate.js` **the gate markup builders only** (UpgradeGate `el.style.cssText` at 182–200; the picker/PIN DOM it writes) | restyle on tokens |
| `app/src/main.tsx` **one new block per new island, appended right after the `sigma-import` block (lines 501–505)** | three lazy mounts |

### Shared files R must NOT touch
- `js/src/00-bridge.js`, `app/src/bridge.ts`: no edits. R reaches legacy through `window.*` globals it exposes in its own legacy lines (`staffFetchMessages`, `staffMarkRead`, `sigmaPushEnable`, parameterised `xlHub*`), typed locally with `(window as any)`.
- `js/src/01-data.js`: no edits.
- `app/src/main.tsx` outside the appended blocks. The `field-journal` registration at `main.tsx:395-408` is package G's (it adds `tag: 'ניסיוני'` there); R adds the same tag in `DayLog.tsx`'s own re-registration.
- `index.html` outside the ranges above, including `#sigma-inventory-strip` inside the מלאי page (package I owns that page's markup and decides where the strip mounts).
- `app/src/islands/Alerts.tsx` (S), `app/src/lib/alerts.ts` (X), `app/src/lib/taskList.ts` (shared with Calendar, package C), `app/src/lib/daylog.ts`, `daylogChain.ts`, `speech.ts` (shared with `Field.tsx`, package V), `app/src/lib/clockify.ts` `timerNudgeFor` (lines 168–176, push copy, package X), `app/src/lib/usageNarrative.ts` / `usageDigest.ts` (the weekly-digest push, X), `app/src/lib/onboarding.ts` (K: placement and steps), `app/src/lib/myTasksBadge.ts` (read by S's header).
- `app/src/components/ui/*` other than the two U0 files, `app/src/styles.css`, `app/tailwind.config.ts` (DS).
- `app/src/components/home/KibbutzCard.tsx`, `KibbutzSheet.tsx`, `InternalTaskSheet.tsx`, `EmsTasks.tsx`, `CardActions.tsx`, `MeetingNotes.tsx`, `Burns.tsx`, `HealthStrip.tsx`, `islands/Health.tsx` (K; `HealthStrip` lives in the kibbutz modal that K turns into KibbutzDetail).
- `qa/playwright/no-overlap-allow.json` (R adds nothing; the `home` line is removed by whichever of K and R lands second, see §7).

## 4. Blast radius (OPS graph) and retirement

Queried 23.9 in this worktree (`python docs/ops-graph/ops_graph.py file <basename>` / `table <name>` / `path <a> <b>`; no `--help`, unknown args print usage). Each task re-runs `file` on what it touches before editing.

| File | Degree | Depends on it | Tables | Retiring nodes |
|---|---|---|---|---|
| `Hours.tsx` | 57 | `index.html #hours-view`, `ui/sigma.js` | `work_sessions` | none |
| `Gaps.tsx` | 59 | `main.tsx`, `index.html` | `day_plans`, `field_checkins` | none |
| `Usage.tsx` | 67 | `index.html`, `chart.tsx` | `usage_events` (inferred) | none |
| `MyTasks.tsx` | 54 | `main.tsx`, `index.html` | `internal_tasks` (inferred) | none |
| `Feedback.tsx` | 95 | `main.tsx`, `FeedbackInbox.tsx`, `index.html` | `feedback` | none |
| `FeedbackInbox.tsx` | 59 | `main.tsx`; links to `supabase/functions/github` | `feedback` | none |
| `Holidays.tsx` | 43 | `main.tsx`, `index.html` | `company_holidays` | none |
| `DayLog.tsx` | 64 | `main.tsx`, `index.html` | — | none |
| `InventoryStrip.tsx` | 47 | `main.tsx`, `index.html #inv-section-stock` | `products` | none; its mount point sits inside the legacy inventory page, which **retires** in package I |
| `StockChange.tsx` | 48 | `main.tsx`, `index.html`, `08-inventory.js openStockChangeSheet()` | `movements`, `stock_recounts` | the `08-inventory.js` caller is `[RETIRING: Legacy inventory 06/07/08]` (package I) |
| `Home.tsx` | 62 | `main.tsx`, `index.html #kibbutz-view`, `ui/sigma.js` | — | none |
| `OnboardingProgress.tsx` | 41 | `KibbutzCard`, `KibbutzSheet`, `Settings` | `onboarding_steps`, `onboarding_templates` | none |
| `WorkTimer.tsx` / `…EditSheet` / `…StopSheet` | 36 / 32 / 40 | `KibbutzCard` → `WorkTimer` → sheets | `site_contacts`, `work_sessions` | none |
| `17-messages.js` | 13 | `00-bridge sigma.staffSendMessage` | `messages` | none (a stale `17-staff.js [NOT ON DISK]` node remains) |
| `CommandBar.tsx` (compose lives here today) | 57 | `main.tsx:283`, `HeaderActions.tsx` | — | **all 10 members `[RETIRING: Ctrl+K CommandBar.tsx]`** → R-16 must land before X deletes it |
| `12-reports.js` | 25 | 19 files | — | contains `[RETIRING: Google Sheet / Apps Script data path]`. **Not an R file**: despite its name it holds the EMS sign-in/proxy code, not a "stock report" |

Tables and migrations R relies on (no schema change, no new RPC, no edge function, no backfill in this package):
- `work_sessions`: `db/work_sessions.sql`, `work_sessions_timer.sql`, `work_sessions_log.sql` (trigger logs every write), `rls_2_00_lockdown.sql`.
- `feedback`: `db/feedback.sql`, `feedback_kinds.sql`, `feedback_admin_update()` (SECURITY DEFINER).
- `company_holidays`: `company_holidays.sql`, `_eves.sql`, `_seed.sql`, `rls_2_00_lockdown.sql`, `rls_viewer_readonly.sql`.
- `usage_events`: `usage_events.sql`. `messages`: `messages.sql`, `rls_viewer_readonly.sql`. `inventory_alerts`: `alert_mark_seen_fix.sql`, `inventory_pool(_v2).sql`. `day_plans`, `field_checkins`, `internal_tasks(_fields)`, `stock_recounts`, `onboarding_steps/templates`, `site_contacts`, `user_settings`: their existing migrations, unchanged.
- **Migration dependencies on other packages:** package X applies `db/rls_viewer_readonly.sql` and the per-person claim, which limits `messages` and `work_sessions` to the person. R's staff-messages island (U13) and Hours (U1) must read through RLS and show `SectionError` on a 401/403 rather than an empty list. No R task waits for X's migration; X's migration must not break R's reads (X's own tests cover that).

Graph discrepancies to report at the U16 rebuild: `17-staff.js [NOT ON DISK]`; `ViewSwitcher.tsx` node after its deletion; the round-5 package specs aren't in the graph yet.

## 5. Tests per task (summary)

| Task | vitest goldens | Playwright (360 + 412, light + dark) | Sweep entry (`_screens/r.ts`) | Copy baseline it lowers (measured on `r9/DS`) |
|---|---|---|---|---|
| L1 | `gaps`, `feedback`, `stockChange`, `orderStrip`, `hours` copy goldens | — | — | emoji −4 (gaps), −2 (feedback); imperatives −2 (gaps), −1 (feedback), −1 (hours), −4 (stockChange); bang −1 (orderStrip) |
| L2 | `hours.test.ts` (`hoursByDay`, `hoursTiles`, `fmtHoursCell`) | — | — | — |
| L3 | `myTasks.test.ts` (`taskTags`, undo) | — | — | — |
| L4 | `staffMessages.test.ts` | — | — | — |
| L5 | `viewerReports.test.ts`; `test-viewer-hub.mjs` (xlHub params) | — | — | — |
| L6 | `pushPrompt.test.ts` | — | — | — |
| L7 | — | — | — | — |
| U0 | component tests for the two parts | — | — | — |
| U1 | — | hours page: filters sheet, rows clamp, viewer read-only, empty/error | `hours` | imperatives −2 (`Hours.tsx`) |
| U2 | — | gaps: own list + admin list, viewer no nudge | `gaps-sheet` | imperatives −1 |
| U3 | `Usage.test.tsx` | usage sheet on desktop, not on phone for others | `usage-sheet` (desktop) | emoji −3 |
| U4 | — | my tasks: tags, close + undo, empty | `my-tasks-sheet` | emoji −5 lines |
| U5 | — | alerts body: unread/read toggle, expand | `alerts-sheet` | emoji −1, imperatives −1 |
| U6 | `Feedback.test.tsx`, `FeedbackInbox.test.tsx` | box offline + close keeps text; inbox status + GitHub | `feedback-sheet`, `feedback-inbox` | bang −2, emoji −7, imperatives −8 |
| U7 | — | holidays list/add | `holidays-sheet` | emoji −1 |
| U8 | — | day log: tag, cards, save all | `daylog-sheet` | emoji −2, imperatives −4 |
| U9 | — | strip stages; stock sheet flows | `stock-change-sheet`, `min-qty-sheet` | emoji −7, imperatives −7 |
| U10 | `OnboardingProgress.test.tsx`, `PullToRefresh.test.tsx` | home top section, filter chips, footer bidi | (shares `home`, see §7) | emoji −10 (Home 4, FilterChips 3, Onboarding 3) |
| U11 | `WorkTimer.test.tsx` | timer sheets | `timer-edit-sheet`, `timer-stop-sheet` | imperatives −4 |
| U12 | — | viewer hub: presets, PDF/Excel call params | `viewer-reports` (viewer) | index.html emoji in the hub (~12) |
| U13 | — | compose from ⋯; login popup; push prompt | `staff-message-sheet`, `push-prompt` | — |
| U14 | `ReLoginSheet.test.tsx` | gate at 360 with keyboard; freeze screen | `login-gate`, `relogin-sheet` | imperatives −3 (ReLogin 2, LoginRequired 1), −1 TranscribeRetry |
| U15 | `MeetingReview.test.tsx` | import + review | `import-notes`, `meeting-review` | emoji −9, imperatives −10 |
| U16 | — | full sweep + nightly; goldens | all of the above | baselines set to the printed numbers |

Impeccable: the static scan (`index.html css/app.css app/src`) attributes almost nothing to R files today (0 findings inside R's `app/src` files on `r9/DS`), so R's gate is the **URL scan per R screen at 360×780 and 412×915 returning 0**, plus the static total not rising. The viewer hub, gates and legacy popups R replaces carry index.html-rendered findings (dark-mode `#334155`/`#64748b` text, the red push button); U12–U14 lower the static total by whatever the scan prints after them.

---

## 6. Tasks

### Task L1: copy and icon data in R-owned libs

**Files:**
- Modify: `app/src/lib/gaps.ts:18-31` (add `actionIcon`), `:152`, `:186`, `:211`, `:255`; `app/src/lib/gaps.test.ts`
- Modify: `app/src/lib/feedback.ts:18-21` (`KIND_LABEL`), add `KIND_ICON`, `:62-63` (validation); `app/src/lib/feedback.test.ts:37`
- Modify: `app/src/lib/hours.ts:103`; `app/src/lib/stockChange.ts:74-92`; their tests
- Modify: `app/src/lib/orderStrip.ts:35` (`StripNote`), `:93-122` (`orderNote`); `app/src/lib/orderStrip.test.ts`
- Modify: the islands that print these fields, only where the field shape changed: `Gaps.tsx:124` (renders `actionLabel`, now emoji-free; the icon is rendered in U2), `InventoryStrip.tsx` (reads `note.icon`; render the icon name as text is wrong, so until U9 render nothing for it)

**Interfaces:**
- Produces: `Gap.actionIcon: 'MapPin' | 'CalendarDays' | 'ExternalLink'`; `Gap.actionLabel` values `'סיכום ביקור'`, `'מילוי נוכחות'`, `'פתיחת המשימה'`; `gapsSummary([])` → `'הכול סגור. אין פערים פתוחים.'`.
- Produces: `KIND_LABEL = { idea: 'רעיון', bug: 'באג או שיפור' }`, `KIND_ICON = { idea: 'Lightbulb', bug: 'Bug' }`; `feedbackValidate` messages `'יש לבחור: רעיון או באג'`, `'יש לכתוב או להקליט משהו'`.
- Produces: `validateHours` `'יש לבחור עובד'`; `stockChangePlan` errors `'יש לבחור פריט'`, `'יש לבחור אם המלאי ירד או עלה'`, `'יש לבחור מה קרה'`, `'יש לבחור הזמנת ספק פתוחה'`.
- Produces: `interface StripNote { icon: 'TriangleAlert' | 'CircleCheck' | 'PackageCheck' | 'Truck' | 'Link' | 'Hourglass'; role: 'danger' | 'ok' | 'info' | 'neutral' | 'warn'; text: string; level: NoteLevel }`.
- Leaves alone: `KIND_PUSH_TITLE` (X), `timerNudgeFor` (X).

- [ ] **Step 1: Write the failing tests**

Append to `app/src/lib/gaps.test.ts`:
```ts
import { gapsFor, gapsSummary } from '@/lib/gaps';

const EMO = /\p{Extended_Pictographic}/u;
const IMP = /(?<![א-ת])(שמור|שלח|סגור|בטל|מחק|ערוך|הוסף|בחר|אשר|פתח|העלה|מלא)(?![א-ת])/;

describe('gaps copy (round 5)', () => {
  it('summary has no emoji or "!"', () => {
    expect(gapsSummary([])).toBe('הכול סגור. אין פערים פתוחים.');
  });
  it('every action label is a noun, emoji-free, with a lucide icon', () => {
    // `fixture` and `range` are the ones the file's existing describe block already builds (gaps.test.ts:80-84);
    // put this case inside that block so it sees them.
    const all = gapsFor('אביאם', fixture, range);
    expect(all.length).toBeGreaterThan(0);
    for (const g of all) {
      expect(g.actionLabel).not.toMatch(EMO);
      expect(g.actionLabel).not.toMatch(IMP);
      expect(['MapPin', 'CalendarDays', 'ExternalLink']).toContain(g.actionIcon);
    }
  });
});
```

In `feedback.test.ts` replace line 37 and add:
```ts
    expect(KIND_LABEL).toEqual({ idea: 'רעיון', bug: 'באג או שיפור' });
    expect(KIND_ICON).toEqual({ idea: 'Lightbulb', bug: 'Bug' });
    expect(feedbackValidate({ kind: 'x', text: '' })).toEqual(['יש לבחור: רעיון או באג', 'יש לכתוב או להקליט משהו']);
```
`orderStrip.test.ts`:
```ts
it('notes carry a lucide icon and a tag role, never an emoji', () => {
  const today = '2026-09-23';
  const cases = [   // orderStage (orderStrip.ts:60-66): delivered=3, arrived=2, ordered=1, anything else=0
    { status: 'delivered' }, { status: 'arrived' },
    { status: 'ordered', expectedDate: '2026-09-20' }, { status: 'ordered', expectedDate: '2026-09-30' },
    { status: 'pending', createdAt: '2026-09-20' },
  ];
  for (const o of cases) {
    const n = orderNote(o as any, today);
    expect(n.icon).toMatch(/^[A-Z][A-Za-z]+$/);
    expect(['danger', 'ok', 'info', 'neutral', 'warn']).toContain(n.role);
    expect(n.text).not.toMatch(/\p{Extended_Pictographic}|!/u);
  }
  expect(orderNote({ status: 'ordered', expectedDate: '2026-09-20' } as any, today)).toMatchObject({ icon: 'TriangleAlert', role: 'danger' });
});
```
`hours.test.ts` / `stockChange.test.ts`: assert the exact new messages listed under Interfaces.

- [ ] **Step 2: Run to verify they fail.** `cd app && npx vitest run src/lib/gaps.test.ts src/lib/feedback.test.ts src/lib/orderStrip.test.ts src/lib/hours.test.ts src/lib/stockChange.test.ts` → FAIL on the old strings.
- [ ] **Step 3: Implement.** Change the strings as listed; add `actionIcon` next to each `actionLabel` (`'MapPin'` visit, `'CalendarDays'` attendance, `'ExternalLink'` task); in `orderNote` map ⚠️→`TriangleAlert`/danger, ✅→`CircleCheck`/ok, 📦→`PackageCheck`/info, 🚚→`Truck`/info, 🔗→`Link`/neutral, ⏳→`Hourglass`/warn. In `Gaps.tsx` nothing else changes yet.
- [ ] **Step 4: Run.** Same vitest command → PASS; then `node test-copy-rules.mjs` and set `qa/copy-rules-baseline.json` to the printed counts (they only drop).
- [ ] **Step 5: Commit.** `git add app/src/lib qa/copy-rules-baseline.json app/src/islands/Gaps.tsx app/src/islands/InventoryStrip.tsx && git commit -m "refactor(r): lib copy in noun form, lucide icon names instead of emoji"`

### Task L2: Hours view model on the shared formatter

**Depends on:** package S Task L2 (`app/src/lib/format.ts`) on `origin/main`.

**Files:**
- Modify: `app/src/lib/hours.ts:41-44` (rename `fmtDuration` → `fmtHoursCell`, used by `hoursPrintHtml` and `hoursXlsxSpec` only), add `hoursByDay`, `hoursTiles`; `app/src/lib/hours.test.ts`
- Modify: `app/src/islands/Hours.tsx:21, 215, 231` (import `fmtDuration` from `@/lib/format` for on-screen durations)

**Interfaces:**
- Produces:
```ts
export interface HoursDay { date: string; label: string; minutes: number; rows: WorkSessionRow[] }
export function hoursByDay(rows: WorkSessionRow[], now?: Date): HoursDay[]      // newest day first; label = fmtDay(date, now)
export interface HoursTile { id: 'total' | 'count' | 'unsent'; label: string; value: string; role?: 'warn' }
export function hoursTiles(rows: WorkSessionRow[]): HoursTile[]                  // סה״כ שעות · רשומות · לא נשלחו ל-Clockify (warn when > 0)
export function fmtHoursCell(min: number): string                                // "4:30", exports only
```
- Consumes: `fmtDay`, `fmtDuration`, `fmtNumber` (`@/lib/format`), `durationMin`, `totals` (existing).

- [ ] **Step 1: Failing test**
```ts
import { fmtHoursCell, hoursByDay, hoursTiles } from '@/lib/hours';

const row = (id: string, started: string, ended: string, extra = {}) =>
  ({ id, person: 'עידן', kibbutz: 'חוקוק', started_at: started, ended_at: ended, tags: [], attendees: [], billable: false, note: '', clockify_id: null, ...extra }) as any;

describe('hours view model', () => {
  const NOW = new Date(2026, 8, 23, 18);
  const rows = [
    row('a', new Date(2026, 8, 23, 9).toISOString(), new Date(2026, 8, 23, 11, 30).toISOString()),
    row('b', new Date(2026, 8, 22, 8).toISOString(), new Date(2026, 8, 22, 9).toISOString(), { clockify_id: 'c1' }),
    row('c', new Date(2026, 8, 23, 13).toISOString(), new Date(2026, 8, 23, 14).toISOString()),
  ];
  it('groups by local day, newest first, with the day label and total', () => {
    const days = hoursByDay(rows, NOW);
    expect(days.map(d => [d.label, d.minutes, d.rows.map(r => r.id)])).toEqual([
      ['היום', 210, ['c', 'a']], ['אתמול', 60, ['b']],
    ]);
  });
  it('tiles', () => {
    expect(hoursTiles(rows)).toEqual([
      { id: 'total', label: 'סה״כ שעות', value: '4 ש׳ 30 ד׳' },
      { id: 'count', label: 'רשומות', value: '3' },
      { id: 'unsent', label: 'לא נשלחו ל-Clockify', value: '2', role: 'warn' },
    ]);
  });
  it('exports keep the h:mm cell', () => { expect(fmtHoursCell(270)).toBe('4:30'); });
});
```
- [ ] **Step 2: Run to verify it fails.** `cd app && npx vitest run src/lib/hours.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
import { fmtDay, fmtDuration, fmtNumber } from '@/lib/format';

export function fmtHoursCell(min: number): string {
  const m = Math.max(0, Math.round(min));
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
}

const localYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function hoursByDay(rows: WorkSessionRow[], now: Date = new Date()): HoursDay[] {
  const by = new Map<string, WorkSessionRow[]>();
  for (const r of rows) { const k = localYmd(r.started_at); by.set(k, [...(by.get(k) ?? []), r]); }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, rs]) => {
      const sorted = rs.slice().sort((x, y) => (x.started_at < y.started_at ? 1 : -1));
      const [y, m, d] = date.split('-').map(Number);
      return { date, label: fmtDay(new Date(y, m - 1, d), now), minutes: sorted.reduce((n, r) => n + durationMin(r), 0), rows: sorted };
    });
}

export function hoursTiles(rows: WorkSessionRow[]): HoursTile[] {
  const unsent = rows.filter(r => !r.clockify_id).length;
  return [
    { id: 'total', label: 'סה״כ שעות', value: fmtDuration(totals(rows).all) },
    { id: 'count', label: 'רשומות', value: fmtNumber(rows.length) },
    { id: 'unsent', label: 'לא נשלחו ל-Clockify', value: fmtNumber(unsent), ...(unsent ? { role: 'warn' as const } : {}) },
  ];
}
```
Rename the old `fmtDuration` to `fmtHoursCell` and update its two export callers; in `Hours.tsx` import `fmtDuration` from `@/lib/format`.
- [ ] **Step 4: Run.** `cd app && npx vitest run src/lib/hours.test.ts` → PASS; `node test-exports.mjs` (Excel/PDF goldens unchanged) → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(r): hours grouped by day, summary tiles, shared duration format"`

### Task L3: my-tasks tags and the undo window

**Files:**
- Modify: `app/src/lib/myTasks.ts`, `app/src/lib/myTasks.test.ts`

**Interfaces:**
- Produces:
```ts
export interface TaskTag { text: string; role: 'danger' | 'info' | 'warn' | 'neutral'; icon?: 'Clock' | 'CalendarDays' | 'Lock' }
export function taskTags(t: { status?: string; due?: string | null; late: boolean; priority?: string | null; internal?: boolean; assignee?: string | null }): TaskTag[]
export const UNDO_MS = 5000;
export function undoable<T>(commit: () => Promise<T>, ms?: number): { cancel: () => boolean; done: Promise<T | null> }
```
Rules: a late due date → `{ text: due, role: 'danger', icon: 'Clock' }` with text prefixed "באיחור · "; a future due date → neutral with `CalendarDays`; a priority "דחופה" → danger; no assignee → `{ text: 'ללא אחראי', role: 'warn' }`; `internal` → neutral `Lock` "פנימית". At most 3 tags; a 4th and later collapse into `{ text: '+N', role: 'neutral' }`. `undoable` runs `commit` only after `ms` unless `cancel()` was called first (returns `true` if it cancelled in time).

- [ ] **Step 1: Failing test**
```ts
import { vi } from 'vitest';
import { UNDO_MS, taskTags, undoable } from '@/lib/myTasks';

describe('taskTags', () => {
  it('late → danger with Clock, ≤3 then +N', () => {
    const t = taskTags({ due: '20.9', late: true, priority: 'דחופה', assignee: null, internal: true });
    expect(t[0]).toEqual({ text: 'באיחור · 20.9', role: 'danger', icon: 'Clock' });
    expect(t.length).toBe(3);
    expect(t[2]).toEqual({ text: '+2', role: 'neutral' });
  });
  it('no emoji anywhere', () => {
    for (const x of taskTags({ due: '30.9', late: false, internal: true, assignee: 'עידן' })) expect(x.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('undoable', () => {
  it('commits after the window', async () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => 'ok');
    const u = undoable(commit);
    vi.advanceTimersByTime(UNDO_MS);
    await expect(u.done).resolves.toBe('ok');
    expect(commit).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('cancel inside the window never writes', async () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => 'ok');
    const u = undoable(commit);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(u.cancel()).toBe(true);
    vi.advanceTimersByTime(10);
    await expect(u.done).resolves.toBeNull();
    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```
- [ ] **Step 2: Run to verify it fails.** `cd app && npx vitest run src/lib/myTasks.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
export const UNDO_MS = 5000;

export function undoable<T>(commit: () => Promise<T>, ms: number = UNDO_MS) {
  let cancelled = false, fired = false;
  let resolve!: (v: T | null) => void, reject!: (e: unknown) => void;
  const done = new Promise<T | null>((res, rej) => { resolve = res; reject = rej; });
  const timer = setTimeout(() => { fired = true; commit().then(resolve, reject); }, ms);
  return {
    cancel: () => { if (fired || cancelled) return false; cancelled = true; clearTimeout(timer); resolve(null); return true; },
    done,
  };
}

export function taskTags(t: { status?: string; due?: string | null; late: boolean; priority?: string | null; internal?: boolean; assignee?: string | null }): TaskTag[] {
  const all: TaskTag[] = [];
  if (t.due) all.push(t.late ? { text: `באיחור · ${t.due}`, role: 'danger', icon: 'Clock' } : { text: t.due, role: 'neutral', icon: 'CalendarDays' });
  if (t.priority === 'דחופה') all.push({ text: 'דחופה', role: 'danger' });
  if (t.assignee === null || t.assignee === '') all.push({ text: 'ללא אחראי', role: 'warn' });
  if (t.internal) all.push({ text: 'פנימית', role: 'neutral', icon: 'Lock' });
  return all.length <= 3 ? all : [...all.slice(0, 2), { text: `+${all.length - 2}`, role: 'neutral' }];
}
```
- [ ] **Step 4: Run.** → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(r): my-tasks tag vocabulary and a 5 s undoable commit"`

### Task L4: staff messages, logic and legacy exposure

**Files:**
- Create: `app/src/lib/staffMessages.ts`, `app/src/lib/staffMessages.test.ts`
- Modify: `js/src/17-messages.js:49-95` (expose `staffFetchMessages`, `staffMarkRead` on `window`; `staffCheckMessages` dispatches `sigma-staff-unread` with the messages when a listener has set `window.__sigmaStaffMessagesReady`, else keeps its current DOM popup)

**Interfaces:**
- Produces (`@/lib/staffMessages`): `MESSAGE_MAX = 500`; `recipientsFor(me: string): string[]` (= `APP_PEOPLE` minus `me`, no viewer); `validateMessage(to: string, text: string): string[]` (`'יש לבחור נמען'`, `'ההודעה ריקה'`, `'ההודעה ארוכה מ-500 תווים'`); `unreadTitle(n: number): string` (`'הודעה חדשה'` / `'2 הודעות חדשות'`).
- Produces (legacy): `window.staffFetchMessages(toPerson, unreadOnly)`, `window.staffMarkRead(ids)`, event `sigma-staff-unread` (`detail: { messages }`).

- [ ] **Step 1: Failing test**
```ts
import { recipientsFor, unreadTitle, validateMessage } from '@/lib/staffMessages';
describe('staff messages', () => {
  it('recipients exclude me and the viewer', () => {
    const r = recipientsFor('עידן');
    expect(r).not.toContain('עידן');
    expect(r).not.toContain('צפייה');
    expect(r).toContain('אביאם');
  });
  it('validation', () => {
    expect(validateMessage('', '')).toEqual(['יש לבחור נמען', 'ההודעה ריקה']);
    expect(validateMessage('אביאם', 'x'.repeat(501))).toEqual(['ההודעה ארוכה מ-500 תווים']);
    expect(validateMessage('אביאם', 'שלום')).toEqual([]);
  });
  it('title', () => { expect(unreadTitle(1)).toBe('הודעה חדשה'); expect(unreadTitle(2)).toBe('2 הודעות חדשות'); });
});
```
- [ ] **Step 2–4:** run → FAIL → implement (import `APP_PEOPLE`, `VIEWER_NAME` from `@/lib/people`) → PASS. Then `node build.mjs && node test-integration.mjs` (it exercises the messages path) → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(r): staff-messages rules; legacy exposes fetch/mark-read and an unread event"`

### Task L5: viewer reports, parameterised

**Files:**
- Create: `app/src/lib/viewerReports.ts`, `app/src/lib/viewerReports.test.ts`, `test-viewer-hub.mjs`
- Modify: `js/src/21-excel-export.js:339-382`

**Interfaces:**
- Produces (`@/lib/viewerReports`): `type Preset = 'this-month' | 'last-month' | 'last-30'`; `presetRange(p: Preset, today: string): { from: string; to: string }`; `monthOf(p: Preset, today: string): string` (`YYYY-MM`); `PRESET_LABEL = { 'this-month': 'החודש', 'last-month': 'החודש הקודם', 'last-30': '30 הימים האחרונים' }`; `REPORTS: Array<{ id: 'visits' | 'attendance' | 'certs' | 'certSummary'; title: string; icon: string; needsPerson: boolean; byMonth: boolean }>` with titles `'דוח ביקורי שטח'`, `'דוח נוכחות חודשי'`, `'דוח תעודות משלוח'`, `'סיכום חודשי של תעודות'`.
- Produces (legacy): `xlHubVisitsPdf(from?, to?)`, `xlHubVisitsXlsx(from?, to?)`, `xlHubCertsPdf(from?, to?)`, `xlHubCertsXlsx(from?, to?)`, `xlHubSumPdf(month?)`, `xlHubSumXlsx(month?)`, `xlHubAttPdf(person?, month?)`, `xlHubAttXlsx(person?, month?)`. With arguments they don't read the DOM; without, they behave exactly as today.

- [ ] **Step 1: Failing tests.** `viewerReports.test.ts`:
```ts
import { monthOf, presetRange } from '@/lib/viewerReports';
it('presets', () => {
  expect(presetRange('this-month', '2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-23' });
  expect(presetRange('last-month', '2026-09-23')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  expect(presetRange('last-30', '2026-09-23')).toEqual({ from: '2026-08-25', to: '2026-09-23' });
  expect(presetRange('last-month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  expect(monthOf('last-month', '2026-09-23')).toBe('2026-08');
});
```
`test-viewer-hub.mjs` (root; evaluates the function bodies with stubs):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('./js/src/21-excel-export.js', import.meta.url), 'utf8');
const start = src.indexOf('function xlHubVisitsPdf'), end = src.indexOf('function xlHubSumXlsx');
const body = src.slice(start, src.indexOf('\n', end + 1) + 1);
const calls = [];
const ctx = {
  document: { getElementById: id => ({ value: 'DOM:' + id }) },
  // the functions 21-excel-export.js:369-382 really call
  openVisitsReportHTMLView: (...a) => calls.push(['openVisitsReportHTMLView', ...a]),
  xlExportVisits: (...a) => calls.push(['xlExportVisits', ...a]),
  certRangeReportRange: (...a) => calls.push(['certRangeReportRange', ...a]),
  xlExportCerts: (...a) => calls.push(['xlExportCerts', ...a]),
  xlExportCertSummary: (...a) => calls.push(['xlExportCertSummary', ...a]),
  xlMonthRange: m => [m + '-01', m + '-31'],
};
vm.createContext(ctx);
vm.runInContext(body + '\nthis.f = { xlHubVisitsPdf, xlHubSumPdf };', ctx);
ctx.f.xlHubVisitsPdf('2026-09-01', '2026-09-23');
assert.ok(JSON.stringify(calls).includes('2026-09-01'), 'the parameters must reach the report');
assert.ok(!JSON.stringify(calls).includes('DOM:'), 'with parameters, the DOM is not read');
calls.length = 0;
ctx.f.xlHubVisitsPdf();
assert.ok(JSON.stringify(calls).includes('DOM:'), 'without parameters, today’s DOM path still works');
console.log('PASS');
```
- [ ] **Step 2: Run to verify they fail.** `node test-viewer-hub.mjs` → FAIL; `cd app && npx vitest run src/lib/viewerReports.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Each `xlHub*` takes optional arguments and falls back to `document.getElementById(...).value` only when they are `undefined`. `presetRange` in pure date arithmetic on `YYYY-MM-DD` strings.
- [ ] **Step 4: Run.** `node build.mjs && node test-viewer-hub.mjs && node test-exports.mjs && cd app && npx vitest run src/lib/viewerReports.test.ts` → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(r): viewer report functions take parameters; period presets"`

### Task L6: push prompt, driven by an event

**Files:**
- Create: `app/src/lib/pushPrompt.ts`, `app/src/lib/pushPrompt.test.ts`
- Modify: `js/src/22-push.js:50-95` (`showEnablePrompt`)

**Interfaces:**
- Produces (legacy): `window.sigmaPushEnable(): Promise<void>` (the current "yes" handler body, single-flight as today, F8); `showEnablePrompt(mode)` dispatches `sigma-push-prompt` (`detail: { mode: 'default' | 'denied' }`) when `window.__sigmaPushPromptReady` is set, and builds the old DOM otherwise (so a failed chunk still asks). The once-per-session latch `window._pushPromptShown` is unchanged.
- Produces (`@/lib/pushPrompt`): `promptCopy(mode)` → `{ title: 'התראות כבויות', body, primary, secondary: 'לא עכשיו' }` where `default` → body "כדי לקבל עדכונים על הזמנות ונוכחות צריך לאפשר התראות במכשיר הזה.", primary "הפעלת התראות"; `denied` → body "ההתראות חסומות במכשיר הזה. אפשר להפעיל אותן בהגדרות האתר בדפדפן, ואז לרענן.", primary "רענון".

- [ ] **Step 1: Failing test**
```ts
import { promptCopy } from '@/lib/pushPrompt';
it('prompt copy per mode, calm and without "!"', () => {
  for (const m of ['default', 'denied'] as const) {
    const c = promptCopy(m);
    expect(`${c.title} ${c.body} ${c.primary} ${c.secondary}`).not.toMatch(/!|\p{Extended_Pictographic}/u);
  }
  expect(promptCopy('default').primary).toBe('הפעלת התראות');
  expect(promptCopy('denied').primary).toBe('רענון');
});
```
- [ ] **Step 2–4:** FAIL → implement → PASS; `node build.mjs && node test-push.mjs && node test-push-actions.mjs` → PASS (the legacy runners still see the prompt path).
- [ ] **Step 5: Commit.** `git commit -am "feat(r): push prompt raised as an event; calm copy"`

(Package X owns the text of pushes themselves; this is the in-app permission prompt, which is not a push.)

### Task L7: delete dead `ViewSwitcher.tsx`

- [ ] **Step 1:** `python docs/ops-graph/ops_graph.py file ViewSwitcher.tsx` and `rg -n "ViewSwitcher" app/src` → no importer.
- [ ] **Step 2:** `git rm app/src/components/ViewSwitcher.tsx`
- [ ] **Step 3:** `node build.mjs && node test-sigma-shell.mjs && cd app && npx vitest run` → PASS.
- [ ] **Step 4: Commit.** `git commit -m "chore(r): remove dead ViewSwitcher"`

---

**U tasks start here. Gate before U0:** `r9/DS` merged with the designer's PASS; S's L1, L6, L7, L8 and U3 on `origin/main`; this worktree rebased (`git rebase origin/main && node build.mjs`).

**Pattern every U task follows** (written once here, and each task lists only what differs):
1. `python docs/ops-graph/ops_graph.py file <each file>` before editing.
2. **Failing Playwright first** in `qa/playwright/tests/r-screens.spec.ts`, plus the sweep entry in `_screens/r.ts`. Openers used by the entries:
```ts
// qa/playwright/tests/_screens/r.ts
import type { Page } from '@playwright/test';
import type { Screen } from './index';
import { openPage } from './index';
import { expect } from '../_helpers';

export async function openByEvent(p: Page, event: string, detail?: unknown): Promise<void> {
  await p.evaluate(([e, d]) => window.dispatchEvent(new CustomEvent(e as string, { detail: d })), [event, detail] as const);
  await expect(p.getByRole('dialog')).toBeVisible();
}
const screens: Screen[] = [
  // each U task appends its entries here
];
export default screens;
```
3. Build the screen on DS parts; states: skeleton per SectionBlock (only after 300 ms, via the existing `showSkeleton`), `EmptyState`, `SectionError` with "ניסיון נוסף" (retries the query), offline reason on write buttons (`useOnline()` from S's `lib/online.ts`: disabled with the reason as the button's `aria-description` and a one-line text under it).
4. Copy through humanizer + no-ai-slop; `node test-copy-rules.mjs`, lower the baseline to the printed numbers.
5. `node build.mjs && node test-sigma-shell.mjs && cd app && npx vitest run && cd .. && npx playwright test --config qa/playwright/playwright.config.ts tests/r-screens.spec.ts tests/no-overlap.spec.ts <the screen's existing specs> --project=mobile-360-light --project=mobile-360-dark --project=mobile-412-light --project=mobile-412-dark --project=desktop-1440-light` → PASS.
6. impeccable URL scan of the screen at `360x780` and `412x915` → 0 findings.
7. Commit (`feat(r): <screen> on the design system`).

### Task U0: the two missing shared parts

**Only if** `app/src/components/ui/section-error.tsx` / `confirm-sheet.tsx` are not already on `origin/main` (package I needs ConfirmSheet for delete-item; whoever is first builds it, the others import). Ask the designer first (motion §4.5); build only what the designer approves.

**Files:** Create `app/src/components/ui/section-error.tsx`, `app/src/components/ui/confirm-sheet.tsx`, tests next to them.

**Interfaces:**
```tsx
export function SectionError({ text, onRetry }: { text: string; onRetry?: () => void }): JSX.Element
// danger ink on surface, TriangleAlert 20 px, the text (14/600), and a tonal sm bubble "ניסיון נוסף"; role="alert"
export function ConfirmSheet({ open, title, lines, confirmLabel, danger, onConfirm, onOpenChange }: {
  open: boolean; title: string; lines?: string[]; confirmLabel: string; danger?: boolean;
  onConfirm: () => void | Promise<void>; onOpenChange: (o: boolean) => void;
}): JSX.Element
// a Sheet at z confirm (55), title, an optional list of what goes, footer [confirm (danger variant when danger), "ביטול"]
```
- [ ] **Step 1: Failing tests** (`section-error.test.tsx`, `confirm-sheet.test.tsx`): render → `getByRole('alert')` has the text and "ניסיון נוסף" calls `onRetry`; ConfirmSheet lists `lines`, confirm calls `onConfirm` once even on a double tap (button disabled while the promise runs), "ביטול" calls `onOpenChange(false)`.
- [ ] **Step 2–5:** per the pattern (vitest only).

### Task U1: ⏱ Hours

**Files:** `app/src/islands/Hours.tsx`; `_screens/r.ts` entry `{ label: 'hours', open: p => openPage(p, 'hours', 'hours-view') }`.

**What changes:**
- Title, back chevron and actions come from S's page-action row: `registerPageAction('hours', { id: 'hours-add', label: 'הוספה ידנית', icon: 'Plus', visible: () => canEditHours(me, isViewer), onSelect })` and `registerPageAction('hours', { id: 'hours-export', label: 'ייצוא', icon: 'FileDown', onSelect: openExportSheet })`. The export sheet has two ListRows: `FileText` "PDF", `FileSpreadsheet` "Excel". The page's own button row goes away.
- The three native `<select>`s become one `Cluster` of `FilterChip`s under the row: "חודש: ספטמבר", "כל העובדים", "כל הקיבוצים", each opening a small Sheet with `ui/select` (one-hand reach, DS §4 Missing 4). A selected chip gets the ink fill + ✓.
- Totals become `StatTileGrid` of `hoursTiles(shown)` (L2); the "לא נשלחו" tile uses the warn role and is plain (not a filter).
- The table becomes, below 768 px, one `SectionBlock` per `hoursByDay(shown)` day (title = day label, count Tag = `fmtDuration(day.minutes)`), children `ListRow`s: title "<kibbutz> · <person>" (2-line clamp), meta "<09:00–11:30> · <2 ש׳ 30 ד׳> · <up to 3 tags then +N>", trailing a warn `Tag` "לא נשלח" when `!clockify_id`, and the whole row opens the edit sheet for editors (viewer: no `onClick`, no chevron). From 768 up the same SectionBlocks hold a `<table>` with `tabular-nums` (no `scroll-x`).
- Edit sheet: DS Sheet, header "עריכת שעות" / "הוספת שעות ידנית" + subtitle "כל שינוי נרשם ביומן השינויים"; fields: עובד (`ui/select`), קיבוץ (`ui/select` over `kibbutzim`; free text via a "אחר" option that reveals an input), התחלה/סיום (`datetime-local` inputs, full width, token-styled, the value wrapped for display in `<bdi>`), תגיות, משתתפים, הערה, "לחיוב" as `ui/switch`; sticky footer: `BubbleButton size="lg" variant="primary"` "שמירה", neutral "ביטול"; "מחיקת השורה" as a danger ListRow at the end opening `ConfirmSheet` ("למחוק את השורה?" + the row's date/kibbutz/duration as `lines`).
- States: `SectionError` "לא הצלחנו לטעון את השעות." (was "לא ניתן לטעון את השעות. בדוק חיבור."); `EmptyState` `Clock` "אין רשומות בסינון הזה." + "אפשר לשנות את הסינון."; the not-allowed line stays but in `EmptyState` form.

- [ ] **Step 1: Failing tests**
```ts
test.describe('hours (R-1)', () => {
  test('a long row clamps at 360 and the page never scrolls sideways', async ({ page }, ti) => {
    test.skip(!String(ti.project.name).startsWith('mobile-360'), '360');
    await boot(page, ti);
    await page.route(`${SB_ORIGIN}/rest/v1/work_sessions*`, r => r.fulfill({ json: [{
      id: 'w1', person: 'עידן', kibbutz: 'קיבוץ גבעת חיים איחוד', started_at: new Date().toISOString(),
      ended_at: new Date(Date.now() + 9e6).toISOString(), tags: ['התקנה', 'בדיקת מונים', 'הדרכה', 'נוסף'],
      attendees: ['ניתאי'], billable: true, note: 'הערה ארוכה מאוד '.repeat(6), clockify_id: null,
    }] }));
    await page.evaluate(() => (window as any).showPage('hours'));
    await expect(page.getByTestId('hours-row').first()).toBeVisible();
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByTestId('hours-row').first()).toContainText('+1');
  });
  test('filters live in chips that open a sheet', async ({ page }, ti) => {
    await boot(page, ti);
    await page.evaluate(() => (window as any).showPage('hours'));
    await expect(page.locator('#hours-view select')).toHaveCount(0);
    await page.getByRole('button', { name: /כל העובדים/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
  test('viewer: no add, no edit', async ({ page }, ti) => {
    await boot(page, ti, { who: 'צפייה' });
    await page.evaluate(() => (window as any).showPage('hours'));
    await expect(page.getByRole('button', { name: 'הוספה ידנית' })).toHaveCount(0);
    await expect(page.getByTestId('hours-row').first().locator('svg.lucide-chevron-left')).toHaveCount(0);
  });
});
```
- [ ] **Steps 2–7:** per the pattern. Existing specs to re-run: `ems-session.spec.ts` (lists the hours page), `test-exports.mjs`.

### Task U2: 📋 Gaps

**Files:** `app/src/islands/Gaps.tsx`; entry `{ label: 'gaps-sheet', who: 'אביאם', open: p => openByEvent(p, 'sigma-open-gaps') }`.

**What changes:** Sheet header "פערים" + the `gapsSummary` line as subtitle. Own list: one `SectionBlock` per kind (סיכומי ביקור / נוכחות / משימות, count Tag), ListRows with leading status dot, title = `gap.text` (2 lines), and — this is a triage list — one `sm` tonal bubble under the meta line with the lucide `gap.actionIcon` and `gap.actionLabel`. Admin view (viewer/עמיחי/עידן): a `SegmentedControl` per person at the top (≤ 4 people, else `Tabs`), then the same blocks; the nudge is an `IconBubble` `Bell` "שליחת תזכורת ל<name>" on the person's block header, hidden for the viewer. States: `EmptyState` `CircleCheck` "אין פערים פתוחים." ; `SectionError` "לא הצלחנו לטעון את הפערים.". Copy: "נסה מהמסך הראשי" → "אפשר לפתוח מהמסך הראשי", "נסה שוב" → "ניסיון נוסף".
- [ ] **Step 1: Failing tests:** open as אביאם → three blocks or EmptyState; the action bubble has its lucide icon and no emoji; open as the viewer → no `Bell` bubble; as עמיחי → the Bell bubble exists.
- [ ] **Steps 2–7:** per the pattern. Re-run `gaps.spec.ts`, `pending-states.spec.ts`, `settings.spec.ts`.

### Task U3: 📊 Usage

**Files:** `app/src/islands/Usage.tsx`, `Usage.test.tsx`; entry `{ label: 'usage-sheet', onlyViewport: 'desktop', open: async p => { await p.evaluate(() => { location.hash = '#usage'; }); await expect(p.getByRole('dialog')).toBeVisible(); } }`.

**What changes:** `ui/dialog` → `Sheet` (a centered dialog at 1440 by the DS rule). Header "שימוש" (no 📈). A `StatTileGrid` (active today, median time-to-first-action, …, from `aggregate`); the heat table inside a `SectionBlock` with `tabular-nums` and heat cells on the ink ramp (tokens, not raw hex); Recharts bars keep their lazy chunk and use the dataviz palette from tokens with direct labels; the weekly-digest box is a `SectionBlock` "השבוע" with ListRows. Emoji out (🔔 → `Bell`). "רענן" → "רענון". It stays עידן-only (`canSeeUsage`), unchanged.
- [ ] **Step 1: Failing tests:** `Usage.test.tsx` renders the Sheet (not the Dialog) with header text "שימוש" and no `\p{Extended_Pictographic}` in the rendered text; Playwright at 1440 opens `#usage`, no overlap.
- [ ] **Steps 2–7:** per the pattern. Re-run `usage.spec.ts`, `test-usage-track.mjs`.

### Task U4: המשימות שלי

**Files:** `app/src/islands/MyTasks.tsx`; entry `{ label: 'my-tasks-sheet', open: p => openByEvent(p, 'sigma-open-my-tasks') }`.

**What changes:** one `SectionBlock` per `MyTaskGroup` (title = kibbutz with a trailing "פתיחה ›" action that opens the kibbutz; the company group has title "כללי"), ListRows: title = task title, meta = status text + `taskTags(...)` rendered as `Tag`s with their lucide icon (L3), trailing: for internal tasks a 40 px `IconBubble` `Check` "סימון כטופל" (only when `canAct`), for EMS tasks the chevron (opens the task). Closing: tap → the check draws (`stroke-dashoffset`, base), `navigator.vibrate?.(10)`, the row stays; a toast "המשימה סומנה כטופלה" with "ביטול" for 5 s; `undoable(() => writeToggleDone(row))` (L3) commits when the window closes, and "ביטול" cancels (no write). After commit the row collapses (`grid-template-rows` 1fr→0fr, base). Emoji ⏰📅🔒🏘️📌 all out. `EmptyState` `ListTodo` "אין משימות פתוחות." + "משימה חדשה נפתחת מכרטיס הקיבוץ.".
- [ ] **Step 1: Failing tests**
```ts
test('closing a task can be undone and writes nothing', async ({ page }, ti) => {
  await boot(page, ti);
  const writes: string[] = [];
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('internal_tasks')) writes.push(r.url()); });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-my-tasks')));
  const btn = page.getByRole('button', { name: 'סימון כטופל' }).first();
  await btn.click();
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'ביטול' }).click();
  await page.waitForTimeout(5500);
  expect(writes).toEqual([]);
  await expect(page.getByRole('button', { name: 'סימון כטופל' }).first()).toBeVisible();
});
test('the viewer sees no close bubble', async ({ page }, ti) => {
  await boot(page, ti, { who: 'צפייה' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-my-tasks')));
  await expect(page.getByRole('button', { name: 'סימון כטופל' })).toHaveCount(0);
});
```
- [ ] **Steps 2–7:** per the pattern. Re-run `my-tasks.spec.ts`, `internal-tasks.spec.ts`, `home-cards.spec.ts`.

### Task U5: 🔔 alerts list body

**Files:** `app/src/components/alerts/AlertsPanel.tsx` only (S owns the bell, the sheet and its header); entry `{ label: 'alerts-sheet', open: async p => { await p.getByTestId('alerts-bell').click(); await expect(p.getByRole('dialog')).toBeVisible(); } }`.

**What changes:** each group is a `ListRow`: leading info dot when unread, title = `g.title` (bold when unread), meta = the time via `fmtDay`/`fmtTime` + the actor; trailing: `IconBubble` `Check` "סימון כנקרא" when unread and not `ems_unlinked`; groups with many rows get a `ChevronDown` expand (collapse animation at base, rows as a 14 px text-2 list). The seen toggle is a neutral `sm` bubble "הצגת מה שנקרא (<bdi>N</bdi>)" / "הסתרת מה שנקרא". Empty: `EmptyState` `Bell` "עוד לא נשלחו התראות." when there are no groups, "הכול נקרא." when all are read. Copy: "סגור פירוט" → "סגירת הפירוט", "סמן כנקרא" → "סימון כנקרא".
- [ ] **Step 1: Failing tests:** the toggle shows the read count; expanding shows sub-rows; no `\p{Extended_Pictographic}` in the dialog text; `alerts.spec.ts` still green (update the two selectors it uses for "סמן כנקרא").
- [ ] **Steps 2–7:** per the pattern.

### Task U6: 📣 the idea/bug box and 📥 its inbox

**Files:** `app/src/islands/Feedback.tsx`, `Feedback.test.tsx`, `app/src/islands/FeedbackInbox.tsx`, `FeedbackInbox.test.tsx`; entries `{ label: 'feedback-sheet', open: p => openByEvent(p, 'sigma-open-feedback') }`, `{ label: 'feedback-inbox', open: async p => { await p.evaluate(() => { location.hash = '#feedback-inbox'; }); await expect(p.getByRole('dialog')).toBeVisible(); } }`.

**What changes (box):** header "רעיון או באג"; kind = `SegmentedControl` with `KIND_ICON` + `KIND_LABEL` (L1); the textarea (16 px, full width); the voice control as an `IconBubble` `Mic`/`Square` "הקלטה"/"עצירת ההקלטה"; "אנונימי" as `ui/switch` with the label "שליחה בלי שם"; sticky footer "שליחה" (primary) + "ביטול". The thank-you line becomes "תודה, נשלח." (no "!", and no "נשלח לעידן ולעמיחי", which breaks the who-sees copy rule). Offline: "שליחה" disabled with "אין חיבור. הטקסט נשמר כאן." under it; the draft (`feedbackDraftPayload`) is saved as today. The box's own ⋯ row (`Feedback.tsx:660-666`) is removed: the gear sheet (S) and the viewer's page-action row now open it.
**What changes (inbox):** `ui/dialog` → `Sheet`; header "תיבה נכנסת" + subtitle "רעיונות, באגים ותלונות"; a `FilterChip` row per status (חדש/נראה/טופל with counts); ListRows: title = preview, meta = kind Tag + date + person (or "בלי שם"), trailing chevron → a pushed detail (close-then-open) with the full text, a `SegmentedControl` for status, and "פתיחת כרטיס ב-GitHub" (`Github` icon) with the parent-area `ui/select` (was a native select). Emoji 🐙📥 out; "רענן" → "רענון", "בחר" → "בחירה", "פתח כרטיס…" / "צור כרטיס…" → "פתיחת כרטיס…" / "יצירת כרטיס…".
- [ ] **Step 1: Failing tests**
```ts
test('offline: send is off with a reason, and closing keeps the text', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await page.getByRole('textbox').fill('הכפתור בכרטיס לא מגיב');
  await page.context().setOffline(true);
  await expect(page.getByRole('button', { name: 'שליחה' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('אין חיבור. הטקסט נשמר כאן.');
  await page.getByRole('button', { name: 'סגירה' }).click();
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('textbox')).toHaveValue('הכפתור בכרטיס לא מגיב');
});
```
Plus `Feedback.test.tsx`: the success line is exactly "תודה, נשלח."; `FeedbackInbox.test.tsx`: no native `select` element in the rendered tree.
- [ ] **Steps 2–7:** per the pattern. Re-run `feedback.spec.ts`, `feedback-refine.spec.ts`, `pending-states.spec.ts`, `test-integration.mjs`.

### Task U7: 🕎 holidays

**Files:** `app/src/islands/Holidays.tsx`; entry `{ label: 'holidays-sheet', open: p => openByEvent(p, 'sigma-holidays-open') }`.

**What changes:** header "חגים וסגירות"; one `SectionBlock titleRole="holiday"` per month with ListRows: leading holiday-purple dot (eves get the holiday ink dot and "ערב חג" in meta), title = name, meta = `fmtDay` date in `<bdi>`, trailing `ui/switch` "סגור" (aria "המשרד סגור ב<name>"); the add row at the bottom: name input + date input + tonal "הוספה". Purple appears only here and nowhere else in R. `EmptyState` `CalendarDays` "אין חגים ברשימה.".
- [ ] **Step 1: Failing tests:** open → the section titles use the holiday ink (`getComputedStyle(h2).color` equals the `--holiday-ink` value); no emoji; the switch toggles and writes once.
- [ ] **Steps 2–7:** per the pattern. Re-run `attendance.spec.ts` (it reads holiday cells).

### Task U8: 📝 יומן היום (ניסיוני)

**Files:** `app/src/islands/DayLog.tsx` (incl. its `registerMoreItem` at 474–486: add `tag: 'ניסיוני'`); entry `{ label: 'daylog-sheet', open: p => openByEvent(p, 'sigma-open-daylog') }`.

**What changes:** header "יומן היום" + a neutral `Tag` "ניסיוני"; the input area (textarea + voice `IconBubble` "דיבור"/"עצירה") and "ניתוח" as a tonal bubble; the AI result as one `SectionBlock` per kibbutz card (no card-in-card), title = kibbutz (`ui/select` "בחירת קיבוץ" when unmatched, was a native select), children = the proposed items as ListRows with a remove `IconBubble` `X` "הסרת הכרטיס"; the link-to-EMS marker `Link` icon instead of 🔗; the toast "🕒 …" loses its emoji; sticky footer "שמירת הכול" (primary) + "ביטול".
- [ ] **Step 1: Failing tests:** the sheet shows the "ניסיוני" tag; the ⋯ row shows it too (S renders `MoreItem.tag`); no native `select`; `daylog.spec.ts`, `transcribe-unavailable.spec.ts` green.
- [ ] **Steps 2–7:** per the pattern.

### Task U9: the inventory strip and the stock-change sheet

**Files:** `app/src/islands/InventoryStrip.tsx`, `app/src/islands/StockChange.tsx`; entries `{ label: 'stock-change-sheet', open: p => openByEvent(p, 'sigma-open-stock-change', { product: '' }) }`, `{ label: 'min-qty-sheet', open: async p => { await openPage(p, 'inventory', 'inventory-view'); await openByEvent(p, 'sigma-open-min-qty'); } }`.

**What changes (strip):** export `InventoryStripPanel` (the component without the mount) so package I's React inventory page renders it where it wants, and keep `mountInventoryStrip` for the legacy page until I retires it. One `SectionBlock` "הזמנות פתוחות" (count Tag), ListRows: title = supplier/customer + qty (`fmtUnit`), meta = the note as a `Tag` in `note.role` with the lucide `note.icon` (L1), and under it a 4-stage `ProgressBar` built as plain SVG/CSS (dataviz mark spec: 2 px surface gaps, the current stage labelled, text in text tokens). The min-qty sheet ("מינימום מלאי") is ListRows with a number stepper per product (`BubbleButton icon` − / + around a `tabular-nums` value) for `canSetMinQty`, read-only values otherwise. Emoji 🧾🎚 out.
**What changes (stock change):** header "דיווח שינוי במלאי"; direction = `SegmentedControl` "ירד" / "עלה"; source = `SegmentedControl` of the valid sources for that direction (סיכום ביקור / ספירה / הזמנת ספק); product = `ui/select` (was native), order = `ui/select` (was native); the routed flows ("פתיחת סיכום ביקור", "פתיחת ההזמנה") are tonal bubbles; footer "שמירה". Copy from L1's `stockChangePlan` errors. Emoji 📍🔢🧾 out.
- [ ] **Step 1: Failing tests:** stock sheet has no native `select`; choosing "עלה" hides "סיכום ביקור"; the strip renders the SVG bar with `aria-label` "שלב <n> מתוך 4"; `alerts.spec.ts` (strip part), `inventory-pool.spec.ts`, `pending-states.spec.ts`, `test-inventory-pool.mjs` green.
- [ ] **Steps 2–7:** per the pattern.

### Task U10: home composition, top section, onboarding component

**Files:** `app/src/islands/Home.tsx`, `components/home/Section.tsx`, `FilterChips.tsx`, `components/SyncHairline.tsx`, `components/PullToRefresh.tsx` (+test), `components/home/OnboardingProgress.tsx` (+test), `index.html` footer line.

**What changes:**
- Top section (`Home.tsx:111-121, 247-250`): a `SectionBlock` titled "טיוטות ושעון פעיל" or "טיוטות פתוחות" with a leading `PenLine` icon (no ✍️), children = the kibbutz cards K renders (R does not restyle the card itself).
- Sections: "לקוחות חדשים" / "לקוחות פעילים" as `SectionBlock collapsible` with count Tags (🆕 / ✅ out); region sub-headings as caption text, not nested cards; first-data-render stagger (30 ms × max 6) only.
- `FilterChips`: DS `FilterChip`s with counts inside ("פעילים 5"), a `Cluster` that wraps, sticky under the page-action row (`inset-block-start: var(--header-h)`, z sticky); emoji 🆕✅🤝 out (the chip for marketing uses `Handshake`). **Remove `sigma.openCommandBar` at line 26** (the command bar is being deleted by X); the "הכול" chip simply clears the filter.
- `SyncHairline`: a 2 px ink bar at `inset-block-start: var(--header-h)`, z sticky, `opacity` transition only (no `width` animation).
- `PullToRefresh`: 64 px threshold, 0.5 resistance, the spinner rotation follows the pull (motion §2.2 #10), z below the header, token colours; `navigator.vibrate` not used here.
- `EmsGate`/`LoginRequired` around the home as in U14.
- Footer version line: `<bdi>` around the whole "גרסה 2.29 · 23.9.26" (fixes "2.29·2026-09-23 גרסה", DS §4 Missing 8), caption size.
- `OnboardingProgress`: a compact progress row (plain SVG bar + "3 מתוך 7") and, expanded, ListRows per step with a `Check` for done steps; the ✏️ edit becomes an `IconBubble` `Pencil` "עריכת השלבים". Placement stays where K puts it.
- States: skeleton per SectionBlock (the real row geometry), `SectionError` "לא הצלחנו לטעון את הקיבוצים.", `EmptyState` `Search` "אין קיבוצים בסינון הזה." when a filter empties the list.
- [ ] **Step 1: Failing tests:** the top section title has no emoji; the chip row wraps at 360 with no horizontal scroll; `FilterChips` never calls `openCommandBar`; the footer version is inside one `<bdi>`; `OnboardingProgress.test.tsx` asserts the "3 מתוך 7" text and the Pencil label.
- [ ] **Steps 2–7:** per the pattern. The sweep `home` screen is in `_screens/shell.ts` and allow-listed for K; R does not remove the line alone (see §7). Re-run `home-cards.spec.ts`, `layout-overflow.spec.ts`, `onboarding.spec.ts`, `PullToRefresh.test.tsx`.

### Task U11: timer control and sheets

**Files:** `components/home/WorkTimer.tsx` (+test), `WorkTimerEditSheet.tsx`, `WorkTimerStopSheet.tsx`; entries `{ label: 'timer-edit-sheet', open: p => openByEvent(p, 'sigma-open-timer') }` and a stop-sheet entry opened from the edit sheet's "סגירת השעות".

**What changes:** the control on the card is an `IconBubble` `Play` "התחלת מדידת שעות" / `Square` "עצירה וסגירת השעות" with the elapsed time in a `tabular-nums` caption beside it (K places it in the closed card). Edit sheet: header "שעון פעיל" + the kibbutz, the elapsed time as a StatTile, "השהיה"/"המשך" as a tonal bubble, start time input, contact (`ui/select`), tags (Chip cluster + "הוספה"), footer "שמירה והמשך" (primary) + "סגירת השעות"; "עצירה ומחיקה" as a danger ListRow at the end → `ConfirmSheet`. The ad-hoc ✕ (`WorkTimerEditSheet.tsx:164`) goes; the Sheet header has the close bubble. Stop sheet: project, contact, tags, footer "שמירת השעות". Toast copy: "עדכן אותו" → "אפשר לעדכן אותו", "פתח" → "פתיחה"; "עצור אותו קודם" → "יש לעצור אותו קודם".
- [ ] **Step 1: Failing tests:** `WorkTimer.test.tsx` asserts the two aria-labels and that there is no element with text "✕"; Playwright opens the edit sheet as עידן, "עצירה ומחיקה" opens a ConfirmSheet. `clockify.spec.ts`, `test-timer-push.mjs` green.
- [ ] **Steps 2–7:** per the pattern.

### Task U12: the viewer reports hub

**Files:** Create `app/src/islands/ViewerReports.tsx`; modify `index.html:234-296` (replace the hub markup with `<div id="sigma-viewer-reports"></div>` at the same place), `app/src/main.tsx` (append after line 505):
```tsx
  if (document.getElementById('sigma-viewer-reports')) {
    import('@/islands/ViewerReports').then(m => m.mountViewerReports()).catch(e => console.warn('[sigma] viewer reports', e));
  }
```
Entry `{ label: 'viewer-reports', who: 'צפייה', open: async () => {} }` (it's on the viewer's landing).

**What changes:** one `SectionBlock` "הפקת דוחות", one ListRow per `REPORTS` item (L5) with its lucide icon; a period `Cluster` of `FilterChip`s (`PRESET_LABEL`) shared by the date-range reports, a person `ui/select` for the attendance report, and per row two `sm` bubbles `FileText` "PDF" and `FileSpreadsheet` "Excel" that call the parameterised `xlHub*` with `presetRange`/`monthOf` (L5). A "טווח אחר" chip reveals two date inputs (token-styled, full width) until the designer's date-range field exists. Rendered only for the viewer (and עידן, who has the Excel exports), exactly as the legacy `body.user-viewer` rule did. Emoji 📍📅🚚🧾📄📗📊 out.
- [ ] **Step 1: Failing tests:** as the viewer, tap "החודש הקודם" then "PDF" on "דוח ביקורי שטח" → `window.xlHubVisitsPdf` was called with `('2026-08-01','2026-08-31')`-shaped arguments (spy installed with `page.exposeFunction`/`evaluate`); `home-viewer` no longer scrolls sideways at 390 (DS §1.12 "`home-viewer` scrolls sideways (824 px)"); `viewer-shell.spec.ts` green.
- [ ] **Steps 2–7:** per the pattern.

### Task U13: staff messages and the push prompt

**Must land before package X deletes `CommandBar.tsx`** (the compose lives there today).

**Files:** Create `app/src/islands/StaffMessages.tsx`, `app/src/islands/PushPrompt.tsx`; `index.html` placeholders `#sigma-staff-messages`, `#sigma-push-prompt` right after line 1252; `app/src/main.tsx` two appended blocks:
```tsx
  if (document.getElementById('sigma-staff-messages')) {
    import('@/islands/StaffMessages').then(m => m.mountStaffMessages()).catch(e => console.warn('[sigma] staff messages', e));
  }
  if (document.getElementById('sigma-push-prompt')) {
    import('@/islands/PushPrompt').then(m => m.mountPushPrompt()).catch(e => console.warn('[sigma] push prompt', e));
  }
```
Entries `{ label: 'staff-message-sheet', open: p => openByEvent(p, 'sigma-open-staff-message') }`, `{ label: 'push-prompt', open: p => openByEvent(p, 'sigma-push-prompt', { mode: 'default' }) }`.

**What changes:**
- `StaffMessages` registers the ⋯ row `{ id: 'staff-message', label: 'הודעה לעובד', icon: 'Mail', visible: non-viewer }` (the same id CommandBar registered, so the ⋯ order in `MoreSheet.APP_ORDER` holds) and renders the compose Sheet: recipient `ui/select` over `recipientsFor(me)`, textarea with a `<bdi>N/500</bdi>` counter, footer "שליחה" (primary, disabled offline with the reason) + "ביטול"; sends through `sigma.staffSendMessage`; toast "ההודעה נשלחה". It sets `window.__sigmaStaffMessagesReady = true` and listens to `sigma-staff-unread` (L4): a Sheet titled `unreadTitle(n)` with one ListRow per message (from, `fmtDay` + `fmtTime`, text), footer "סגירה", which calls `staffMarkRead(ids)` on close.
- `PushPrompt` sets `window.__sigmaPushPromptReady = true`, listens to `sigma-push-prompt`, and shows a Sheet with `promptCopy(mode)` (L6), a `BellOff` icon, footer primary (`default`: `sigmaPushEnable()`; `denied`: `location.reload()`) + "לא עכשיו". No red button: this is not a danger action.
- [ ] **Step 1: Failing tests:** ⋯ → "הודעה לעובד" opens the compose with no command bar present (`page.route('**/sigma-CommandBar*', r => r.abort())` first); an unread fixture raises the unread sheet once per session; the push prompt sheet's primary is "הפעלת התראות" and uses the primary variant (not danger).
- [ ] **Steps 2–7:** per the pattern. Re-run `test-push.mjs`, `test-integration.mjs`.

### Task U14: login screens and shared states

**Decision needed from עידן (default below):** the name picker, the EMS login gate/viewer PIN and the freeze screen paint **before** the island bundle loads, on purpose (the first-frame LCP work in `index.html:60-72` and `15-login-gate.js`). A React rewrite would put the first screen back behind the bundle. **Default: they stay legacy DOM and are restyled to the design system with token CSS** (the inline critical `<style>` rules for `#loginModal`/`[data-gate]`, and classes instead of `style.cssText` in `15-login-gate.js`); ReLoginSheet, LoginRequired, EmsGate and TranscribeRetry (already React) move onto DS parts. If עידן wants React for the gates too, this task splits and the LCP gate in `qa/lighthouse` decides.

**Files:** `index.html:942-960`, `:1210-1248`, the gate rules in the inline `<style>`; `js/src/15-login-gate.js` (UpgradeGate builder at 182–200 and the picker/PIN DOM builders); `components/ReLoginSheet.tsx` (+test), `LoginRequired.tsx`, `EmsGate.tsx`, `TranscribeRetry.tsx`; entries `{ label: 'login-gate', open: async p => { await p.goto('/index.html?login=0&sb=0'); await p.evaluate(() => localStorage.clear()); await p.reload(); } }`, `{ label: 'relogin-sheet', open: async p => { await p.evaluate(() => (window as any).sigmaOpenReLogin?.()); await expect(p.getByRole('dialog')).toBeVisible(); } }`.

**What changes:** the gates on `--s-bg` with a single surface block (radius lg, e1), the Σ mark, one title (title 20/700), inputs 16 px full width, one primary gradient button with on-brand ink (the white-on-gradient 2.2:1 fails today), the viewer PIN as a secondary section; the freeze screen text exactly "המערכת בשדרוג · נעדכן כשהיא חוזרת." (as shipped in 2.28) on the same block, no gradient background (the gradient is kept for the one primary action); keyboard-aware: the block scrolls into view on `visualViewport` resize. ReLoginSheet: DS Sheet, "התחברות מחדש" (was "התחבר מחדש"/"התחבר שוב"). LoginRequired: "התחברות". TranscribeRetry: "ניסיון נוסף", "מחיקת ההקלטה".
- [ ] **Step 1: Failing tests**
```ts
test('EMS gate at 360 with the keyboard up keeps the field and its button visible', async ({ page }, ti) => {
  test.skip(!String(ti.project.name).startsWith('mobile-360'), '360');
  await page.goto('/index.html?sb=0');
  const gate = page.locator('#emsLoginGate');
  await expect(gate).toBeVisible();
  const field = gate.locator('#gatePass');
  await field.focus();
  await page.setViewportSize({ width: 360, height: 420 });   // what a phone keyboard leaves
  await page.waitForTimeout(300);
  const btn = gate.getByRole('button', { name: 'התחברות' });   // today "🔑 התחבר" (index.html gateLogin)
  for (const el of [field, btn]) {
    const b = (await el.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(420);
  }
});
test('the gate button text is not white on the gradient', async ({ page }) => {
  await page.goto('/index.html?sb=0');
  const c = await page.locator('#emsLoginGate').getByRole('button', { name: 'התחברות' }).evaluate(el => getComputedStyle(el).color);
  expect(c).not.toBe('rgb(255, 255, 255)');
});
```
(The gate's fields are `#gateEmail`, `#gatePass`, `#gateOtp`; its buttons today read "🔑 התחבר", "✅ אמת קוד והתחבר", "🔁 שלח קוד שוב", "👁 כניסה לצפייה בלבד" and become "התחברות", "אימות הקוד", "שליחת קוד נוסף", "כניסה לצפייה בלבד". `upgrade-freeze.spec.ts` covers the freeze screen's text; keep it green.)
- [ ] **Steps 2–7:** per the pattern, plus `npm run qa -- --only lighthouse` to prove the first-frame LCP did not regress. Re-run `session-gate.spec.ts`, `ems-session.spec.ts`, `upgrade-freeze.spec.ts`, `test-session-gate.mjs`, `test-upgrade-freeze.mjs`.

### Task U15: meeting-summary import and review

**Files:** `app/src/islands/ImportNotes.tsx`, `app/src/islands/MeetingReview.tsx` (+test); entries opened the way `meeting-review.spec.ts` opens them today.

**What changes:** both become Sheets on DS parts: the paste/parse step as a textarea + "ניתוח" tonal bubble; the parsed meeting as `SectionBlock` per kibbutz with ListRows per bullet; the meeting kind `ui/select` (was native); 🗓 → `CalendarDays`; every imperative label to noun form (MeetingReview has 7, ImportNotes 3). No logic change (`lib/meetingNotes.ts`, `lib/meetingReview.ts` untouched; they are K's/M's).
- [ ] **Step 1: Failing tests:** `MeetingReview.test.tsx` asserts no `\p{Extended_Pictographic}` in the rendered header; `meeting-review.spec.ts`, `meeting-notes.spec.ts` green.
- [ ] **Steps 2–7:** per the pattern. If K or M claims these two files at reconciliation, this task moves there unchanged.

### Task U16: package gate

- [ ] **Step 1: Goldens.** `toHaveScreenshot` in `r-screens.spec.ts` for every R screen at `mobile-360-light/-dark` and `mobile-412-light/-dark` (Usage and FeedbackInbox also at `desktop-1440-*`): default, loading (route delayed 800 ms), empty (route returns `[]`), error (route returns 500), offline where the screen writes, one open sheet, and the longest real content. Mask dates, clocks, the timer. `maxDiffPixelRatio: 0.002`. Generate with `--update-snapshots`; they become goldens only after the PASS.
- [ ] **Step 2: Sign-off packet** (motion §4): PNGs `<screen>__<width>__<theme>.png`; `impeccable detect --json` on every R file and URL scans at `360x780` and `412x915`; the sweep at 344 (warn) / 360 / 390 / 412 / 430 / 1440; axe; `test-copy-rules`; boot size; a 360 video of U4's close-and-undo and U6's send, normal and reduced motion; the list of DS parts used and the requests (date-range field; U0 parts if R built them).
- [ ] **Step 3: Self-check** (round-5 grill round 3): `npm test`; full Playwright, all projects, looped until green; `NIGHTLY=1` for 1920/2560/3840 on Usage and the inbox; `python docs/ops-graph/rebuild.py` then a Sonnet re-extraction of the changed docs; Opus audit of the diff vs this spec, the graph and R-1…R-24; one "checked / result" line for the hourly report.
- [ ] **Step 4: Baselines.** `qa/copy-rules-baseline.json` and `qa/impeccable-baseline.json` set to the printed numbers (down only). `no-overlap-allow.json`: R added nothing; if K has already landed, R removes `home` (see §7).
- [ ] **Step 5: Designer PASS, docs, commit.** CHANGELOG (what + why), backlog, INDEX 🚦 Current state, this spec's STATUS → `✅ SHIPPED`. Push per the parallel-safe loop.

---

## 7. Conflicts and hand-offs with other packages

| With | Item | Resolution |
|---|---|---|
| **S** | Hours' title/back/actions, the alerts sheet frame, the ✅ header bubble, `lib/format.ts`, `lib/online.ts`, the sweep registry | R consumes them (S goes first). R's U tasks can't start before S-L1/L6/L7/L8/U3. |
| **K** | The home screen: K rewrites the cards and KibbutzDetail; R rewrites the page around them (sections, filter chips, top section, hairline, pull-to-refresh, footer) | Ownership: K = `KibbutzCard.tsx` and everything inside a card or the detail; R = `Home.tsx`, `Section.tsx`, `FilterChips.tsx`, `SyncHairline.tsx`, `PullToRefresh.tsx`. The `home` allow-list line (`no-overlap-allow.json`) is removed by **whichever of K and R lands second**, and that package's gate runs the `home` sweep with no allow-list. K must confirm R's claim on `Section.tsx`/`FilterChips.tsx`. |
| **K** | Onboarding: the ruling puts it only inside the open card, under מצב הקיבוץ | K moves the mount (`KibbutzCard.tsx:14` → KibbutzDetail); R restyles `OnboardingProgress.tsx` only. `lib/onboarding.ts` is K's. |
| **K** | Timer: the closed card keeps ▶ | K renders `<WorkTimer>`; R owns the three timer files. |
| **K** | `HealthStrip.tsx` / `Health.tsx` (the kibbutz-modal health strip) | Not R: it lives in the kibbutz modal that K rewrites into KibbutzDetail. |
| **I** | `InventoryStrip` mounts inside the legacy מלאי page (`index.html:414`), which I rewrites in React; `StockChange` is opened by `08-inventory.js:113` (retiring) | R exports `InventoryStripPanel` and keeps `mountInventoryStrip` for the legacy page; I renders the panel in its new page and removes the `#sigma-inventory-strip` mount; I's new page opens StockChange by the same `sigma-open-stock-change` event. |
| **I** | ConfirmSheet (delete item) | Built once (U0 or I's own task, whoever is first), under the designer's approval; everyone imports it. |
| **X** | Staff messaging compose is inside `CommandBar.tsx:312` | R-U13 rebuilds it as `StaffMessages.tsx` with the same ⋯ id; **X must not delete CommandBar before R-U13 is on `origin/main`**, or staff messaging disappears. |
| **X** | Push copy (`KIND_PUSH_TITLE`, `timerNudgeFor`, the weekly digest) and `alerts.ts` recipient rules | X's. R changes only in-app copy. `lib/alerts.ts` is untouched by R. |
| **X** | `FilterChips.tsx:26` calls `sigma.openCommandBar` | R-U10 removes the call; X's deletion of `bridge.ts:290 openCommandBar` then has no caller. |
| **X** | `rls_viewer_readonly.sql` + per-person claim limit `messages` and `work_sessions` | R's Hours and staff messages must show `SectionError` on 401/403, never an empty list. No ordering dependency. |
| **G** | `main.tsx:397` "יומן היום · ניסיוני" is in G's row; `DayLog.tsx` re-registers the same id | Both pass `tag: 'ניסיוני'`; S renders `MoreItem.tag`. R edits only `DayLog.tsx`. |
| **G** | The font picker, the Settings sheet, `ThemeToggle.tsx` | G's. |
| **V** | `lib/daylog.ts`, `daylogChain.ts`, `speech.ts` are shared with `Field.tsx` | R edits none of them. |
| **A** | The attendance reminder modal (`#aviamReminderModal`, `index.html:97`, "חסר תיעוד!") and `#attEditModal` (`:175`) | Not in any package row; they belong to attendance, so **A**. Flagged for A's spec. |
| **I** | `#amichaiApprovalModal` (`:111`), `#orderQModal` (`:125`), `#intakeModal` (`:894`), `#visitsReportModal` (`:1153`), `#invOrderModal`/`#invRequirementModal`/`#invProductModal` | Inventory/orders/certs, so **I**. Flagged. |
| **V** | `#visitQuickModal` (`:135`), `#voiceModal` (`:856`) | Legacy visit flow, removed by **V**. Flagged. |
| **K** | `#emsTaskModal` (`:492`), `#emsDetailModal` (`:605`), `#activityModal` (`:961`), `#modalBackdrop` (`:613`) | Kibbutz card / KibbutzDetail, so **K**. Flagged. |
| **G** | `#burnCardModal`, `#burnAssignModal` (`:597-600`) | Burns page, so **G**. Flagged. |
| **S** | The new-version bar (`19-version-check.js:43-57`) | Top chrome, so **S** (added to the S spec as S-23). |
| **עידן** | Login gates stay legacy DOM restyled (U14 default) vs a React rewrite | He decides before U14 starts. |
