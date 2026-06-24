# Changelog

All notable changes to the **Sigmatec Operations App**. Format follows
[Keep a Changelog](https://keepachangelog.com/). Newest first.

> **Per-update protocol:** every change adds an entry here (what + why), updates the relevant
> doc file + [backlog.md](backlog.md) state. Full session detail is captured automatically by
> claude-mem (search with the `mem-search` skill).

## [·70] 2026-06-24
### Added
- **Parse-source toast** — after "נתח לפריטים", a toast shows who answered: **"🤖 נותח ע"י AI — &lt;provider&gt;"**
  (e.g. `gemini:gemini-2.5-flash-lite`) or **"📴 נותח מקומית (ללא AI)"** when it fell back to the offline matcher.
  Mobile-friendly way to confirm the AI is live (no console needed). `parseRawToItems` exposes `window._lastParseSource`.

## [·69] 2026-06-24
### Added — dev page: clickable filter tiles (פיתוח)
- **Every hero tile is now a toggle filter.** Clicking a **priority** tile (קריטי/גבוהה/בינונית/נמוכה) filters
  the whole topic tree to that tier's *open* tasks; clicking a **KPI** tile filters by its dimension
  (בפיתוח עכשיו → In-Progress · עודכנו השבוע → last 7d) while "משימות פתוחות"/"נושאים פעילים" reset. Clicking the
  active tile again clears (toggle). An "מציג: … ✕" chip gives an explicit clear.
- **Filtered tree keeps the hierarchy + the numbers honest.** A topic shows only matching tasks **plus the ancestor
  chain** to reach them (ancestors dimmed `.dev-ctx`, matches highlighted `.dev-match`). Each topic's count badge =
  matching tasks only, with a **"+N כרטיסים בעדיפות אחרת"** note for the rest. The "עומס לפי נושא" bar/legend
  re-breaks-down by the active filter. GitHub links preserved throughout; spotlight hidden while filtering.
- **Mechanics:** filtering is client-side over the already-fetched tasks — `renderDevTasks` caches the built data in
  `window._devData`, and `devSetFilter`→`devPaint` re-renders instantly (no re-fetch). Search query survives re-paints.
  Verified in-browser with mock data (5 קריטי + 3 בינוני → badge 5, note "+3", toggle back to 8).

## [·67] 2026-06-24
### Changed
- **MOCK banner → left-edge "🧪 DEV" notch.** Was a full-width bottom bar that overlapped the bottom nav;
  now a small vertical tab on the left edge (mock mode only / localhost). Doesn't cover any UI.

## [·65] 2026-06-24
### Fixed
- **Order date now persists.** ·64 renamed the field to `orderDate`, but orders save to a fixed column set
  (`01-data.js`) that reads `expectedDate`→`expected_date` — so it silently dropped. Now mapped to the existing
  `expected_date` column (repurposed as "תאריך הזמנה"); `created_at` stays the immutable system-entry date.
### Added
- **Updater's current stock shown for existing items** (`📦 N` badge per catalog row, red if 0) and as a hint
  on the conversational questions ("איזה סאטק?"/"איזה בקר?" → "· במלאי שלך: N"). Uses `computeStock()[updater]`.
- **Delivery date shown** in the orders list ("📦 סופק: <date>") from the `delivered_at` column. Supplier orders
  already stamp it on delivery; customer-order auto-stamp (on EMS task closure) needs the EMS-sync below.
### Note
- **Customer delivery auto-sync (EMS task closure) needs a schema add.** Orders persist to fixed columns with no
  `ems_task_id`, so an order can't yet be linked to its EMS task to detect closure. SQL + wiring tracked next.

## [·64] 2026-06-24
### Fixed — offline parser (ran because EMS was disconnected → AI 401 → local fallback)
- **משנ"ז 250 vs 400 double-match** — products distinguished only by a number now require THAT number in the text
  (no more matching both on the shared word "משנז").
- **"לנדיס חד" → Landis+Gyr E360SP** (was defaulting to E360PP). Added the alias; `לנדיס תלת` → E360PP.
- **Quantities** now read the number *immediately before* the term ("5 סאטק", "3 משנז 400"), not a ±18 window
  that grabbed a neighbour's number.
- **Fallback catalog names → real Sheet names** (`Satec EM133`, `Landis+Gyr E360*`, `Robustel/PUSR Controller`,
  `Partner/Cellcom Sim`) in `09-visits.js`, so offline/mock mode matches production.
### Added
- **Ambiguous "סאטק" → asks which model** (Satec EM133 / PM135) via the conversational modal — unless a qualifier
  (רגיל/133/135/שנאי/מקביל/תלת/חד) is present. Runs for both order types.
### Changed
- **"תאריך אספקה צפוי" → "תאריך הזמנה"** (editable, defaults to today). `createdAt` stays as the immutable
  system-entry date; the order list shows `orderDate` (falls back to `createdAt`).

## [·63] 2026-06-24
### Removed
- **"💡 מילוי מהיר" quick-fill example chips** removed from the new-order modal (per request). Dropped
  `ORDER_QUICK_EXAMPLES` + `renderQuickExamples()` + the `#invOrderExamples` container. Paste box + type toggle unchanged.

## [·62] 2026-06-24
### Changed — accessory model reworked + conversational Q&A
- **New accessory rule:** *every* Landis meter (incl. **E570**) → **1 SIM directly**. *Every non-Landis meter*
  (Satec, Carlo, …) → **1 controller** each. Every controller (added + explicitly-ordered) → **1 SIM + 1 antenna
  + 1 power-supply**. SIM total = Landis meters + all controllers. (Replaces the old Satec→Robustel/comm-point model.)
- **Controller & power-supply TYPE are now user choices via a conversational modal** (`#orderQModal` + `askChoice`):
  the app *asks* ("איזה בקר?" Robustel/PUSR · "איזה ספק כוח?" פס-דין/שקע) with big tap buttons instead of dropdowns.
  Accessories are tagged `auto` so re-parsing recomputes cleanly. `accessoryPlan()` is pure + unit-tested (7 cases).
### Added — FLOW fixes
- **Non-catalog items at save → ask, don't silently accept.** For each item not in the catalog the app asks
  (same modal): **➕ הוסף לקטלוג** (creates the product → enters inventory management) or **🗑️ הסר מההזמנה**
  (drops the line, order continues). Empty order after removals is blocked.
- **Every text-based order → learning example.** On save, `{raw → base items}` is sent to `parse_corrections`
  (accessories excluded, so the AI learns base products only). A newly catalog-added product is a base item, so
  it's captured as a new recognition example automatically. Stored order items cleaned to `{name,qty}`.

## [·61] 2026-06-24
### Added
- **Non-catalog items are flagged ⚠️** in the order grid (amber row + "לא בקטלוג" option). Orders never
  auto-add products to the catalog — an unknown name stays an orphan (no stock link). The flag makes that visible.
### Changed
- **Glossary aligned to the REAL catalog names** (confirmed live): `Satec EM133/PM135`, `Landis+Gyr E360PP/SP/CT`,
  `PUSR Controller`, `Robustel Controller`, `Partner Sim`, `Carlo Gavazzi E341`. The AI now copies exact strings
  that link to stock. Self-check (`test-autoadd.mjs`) updated to the real catalog + a Carlo (non-catalog) case.
### Note
- **Carlo is not yet a catalog product.** Add it in מלאי → מוצרים as **`Carlo Gavazzi E341`** so Carlo orders
  link to stock (the AI is already aligned to that exact name).

## [·60] 2026-06-24
### Fixed
- **Customer accessories are now deterministic (code, not AI).** Live test showed the AI returned only the
  literal meters and skipped the controllers/SIMs/antenna entirely. Moved `applyCustomerAutoAdd` to run **after
  parsing in `orderParseRaw`** for both the AI and offline paths, so accessories are always computed in code.
  The AI prompt now says: customer orders → parse only what's written, the app adds accessories.
- **`משנז 250/400` no longer misparsed as a meter.** Hardened the rule: only "מונה משנ"ז" (with the word מונה)
  → E360CT; a bare "משנז" with a number → the physical `משנ"ז 250/400`, never E360CT.
- ⚠️ **KNOWN: accessory regexes need the real catalog names.** Live catalog uses `Landis+Gyr E360PP`,
  `Satec EM133`, `Carlo Gavachi E341` (not `מונה …`). Meters match by substring; SIM/controller/antenna/
  power-supply names still need confirming so their auto-add regexes match. (Tracked in backlog.)

## [·59] 2026-06-24
### Added
- **ספק כוח per controller — with a click-to-choose row.** Every controller (PUSR + Robustel) on a customer
  order needs a power supply, but the *type* (פס-דין / שקע) is a human decision. After parsing, an unresolved
  **"בחר סוג" row** is appended (qty = controller count) rendered as **click buttons** (📥 פס-דין / 🔌 שקע) instead
  of a dropdown, with a prompt toast. Save is blocked until the type is picked. The AI is told NOT to add a power
  supply (the client owns that choice). `invChooseProduct()` resolves the row; reusable for any future click-choice.

## [·58] 2026-06-24
### Added
- **אנטנה auto-add — 1 per controller (PUSR + Robustel)** on customer orders (AI prompt + offline matcher).
### Fixed
- **Catalog-name matching corrected (was silently broken).** The live catalog uses **`בקר PUSR`** (not PURS),
  **`סים Partner`** (not פרטנר), `בקר Robustel`. The ·56/·57 regexes (`/purs/`, `/סים פרטנר/`) didn't match those,
  so SIM auto-add never fired against the real Sheet catalog. Matching is now spelling-tolerant
  (PUSR/PURS, Partner/פרטנר). Extracted the rule into `applyCustomerAutoAdd()` + a `test-autoadd.mjs` self-check
  (5 cases: Landis-only, ASIC+SATEC, pre-listed accessories, standalone Robustel, physical משנ"ז).

## [·57] 2026-06-24
### Changed
- **SIM auto-add now counts comm points, not meters (·57).** A SIM goes with every *communication point*:
  direct-comm meters (Landis E360 / Carlo) + **every controller (PUSR + Robustel)**. SATEC meters (EM133/PM135)
  no longer take a direct SIM — their SIM lives in the Robustel. Same total in the symmetric case, but correct
  when Robustels are ordered standalone. Applied in both the AI prompt and the offline matcher.

## [·56] 2026-06-24
### Added
- **Extended product catalog + auto-add rules in `parse-order` (AI + local fallback)**
  - New aliases: **Carlo Gavachi E341** (קרלו/Carlo/E341), **מונה PM135** (סאטק שנאי/מונה מקביל/סאטק משני זרם),
    **בקר PURS** (בקר אסיק), **בקר ROBUSTEL** (extended), **סים פרטנר** (default SIM).
  - Auto-add rules for **הזמנת לקוח** (customer orders): 1 SIM per metering point (meter or PURS controller),
    1 ROBUSTEL per SATEC meter (EM133/PM135). Supplier orders: no auto-add.
  - Local fallback (offline matcher) applies the same rules when AI is unavailable.
  - PM135 / EM133 conflict: "סאטק משני זרם" now routes to PM135 instead of EM133.
  - Quick-example chips above the raw-text parse box (per order type: customer/supplier).
- **Groq backup wired** — default model updated to `llama-3.1-8b-instant`; Gemini (`gemini-2.5-flash-lite`)
  still goes first; Groq activates when `GROQ_API_KEY` secret is set. `orderType` now passed to the function.

## [Unreleased — fn-only]
### Changed
- **`parse-order` is now a provider chain — Gemini → Groq, first valid answer wins.** עידן's Gemini key
  returned `429 quota exceeded` even on a single call. Default Gemini model `gemini-2.5-flash-lite` (confirmed
  200 OK). Groq (`GROQ_API_KEY`, default `llama-3.1-8b-instant`) as fallback.

### Fixed
- **Order parsing: catastrophic all-meters match + Landis/CT rules (·53-55)** — a generic "מונה"/"מונים"
  matched *every* meter (an email "3 מונים לנדיס" returned all 6 meters ×3). Root cause: "מונה" is a token in
  every meter name. Fix: `INTAKE_STOP = ['מונה','מונים']` excludes it as a match token + removed the generic
  aliases. Added the business rules (both AI glossary + offline matcher): **generic "מונה לנדיס" → מונה E360PP
  default**; **"מונה משנ"ז" (with the word מונה) → מונה E360CT**, while a **bare "משנ"ז 250/400" → the physical
  CT** (not E360CT). Verified: the reported email now → `מונה E360PP ×3`. *(Offline fallback still imperfect on a
  bare "משנ"ז 250" qty — the AI handles it.)* **Re-deploy `parse-order`** to load the updated AI glossary.

### Added
- **Parser alias glossary — taught 4 business mappings (·52)** — explicit term→product rules, applied by both
  the AI (`parse-order` prompt glossary) and the offline matcher (`INTAKE_ALIASES`): **"133"/סאטק → מונה EM133**
  *(confirmed by עידן — catalog has no PM133; EM133 is the "133")*, **לנדיס ישיר לקו → מונה E360PP**, **לנדיס חד
  פאזי → מונה E360SP**, **לנדיס משנה-זרם/משנ"ז (Landis context) → מונה E360CT**. Scoped so a bare `משנ"ז 250/400`
  still maps to the physical CT hardware, not E360CT. Verified in the offline matcher. **Activate the AI side by
  re-deploying `parse-order`** (the glossary lives in its prompt); to add more aliases later, edit the `ALIASES`
  array in `supabase/functions/parse-order/index.ts` (+ `INTAKE_ALIASES`) — or just let it learn from accepted orders.
- **AI order-parsing — frontend + function ready, awaiting key (·51)** — new-order modal now leads with a single
  free-text box (📥 paste email/WhatsApp) → **🪄 נתח לפריטים** → editable rows; the AI box shows for **both**
  order types; a big full-width **➕ הוסף שורה** for manual rows. Parsing now calls a new `parse-order` Edge
  Function (**Gemini** free tier + the live catalog + recent **`parse_corrections` as few-shot** → learns from
  every accepted order); **graceful fallback** to the local matcher until it's deployed, so nothing breaks now.
  Wrote `supabase/functions/parse-order/index.ts`, `db/parse_corrections.sql`, and the `parseCorrection` write
  path (`01-data.js`) that captures `{raw text → accepted items}` on save. **To activate:** see
  `operations.md` → "Edge Function (parse-order)" — 3 steps (free Gemini key → deploy fn + set `GEMINI_API_KEY`
  → run the SQL). Verified: box shows for both types, calls `parse-order`, falls back cleanly when absent.
- **Visit return → "↩️ למלאי" checkbox (·50)** — in the visit summary's "ציוד שהוחזר" rows, a per-item checkbox.
  Checked = the item is intact → goes back to the **visiting employee's** available stock (movement
  kibbutz→visitor, `return_restock`) and is logged as already-`restocked` (won't sit pending in the returns
  tracker). Unchecked = defective → the `תקול` bucket as before. (`05-meeting-returns.js` row UI,
  `09-visits.js` save routing, `01-data.js` returns-row status.)
- **Inventory two-type order flow (·49)** — orders now carry an explicit **`orderType`** with a toggle in the
  new-order modal:
  - 🏭 **הזמנת ספק** (raises stock): approval routed by size — **≤10 items → אביאם**, **>10 → עמיחי**
    (`orderTotalQty` = sum of quantities). >10 orders also trigger a **floating approval nudge for עמיחי**
    (`maybeShowAmichaiApprovalReminder`, mirrors the attendance reminder; once/session, re-fires per login).
    Approve → `pending` → existing purchase flow (delivery+distribution still raises stock).
  - 🧑‍🌾 **הזמנת לקוח** (consumes stock): kibbutz picker; approval by **אביאם/ניתאי**. On approve →
    **deduct each item from the approver's stock → the kibbutz** (movement `customer_supply`), **open a real EMS
    "אספקת ציוד" task** assigned to the approver (queued via the new `createTask` queue kind → created on the next
    connect by anyone), mark the order **`supplied`** (row kept) + the linked requirement **`fulfilled`**.
  - Orders list shows a **type chip** (ספק/לקוח, "ספק 10+" flag) + **ספק/קיבוץ** column; the approve button only
    shows for the correct approver, others see who it's waiting on. New `supplied` status.
  - Verified end-to-end against the bundle: approval matrix (5/12/customer × roles), the toggle, the עמיחי nudge,
    and the customer-approval call sequence (movement → EMS queue → supplied → requirement fulfilled).
- **Dev-page full sub-issue tree (·46)** — the פיתוח tree now reflects GitHub **native sub-issues** (the team's
  real hierarchy), not just the `topic|sub|desc` title text. Cards like #104 (11 sub-issues) whose children point
  at *different* topics were being scattered across the page; now they nest under their card, to **any depth**
  (📂 topic → card → sub-task → … → leaf), each row expandable with its full detail. Cross-topic children keep
  their full path; same-topic prefixes are stripped for readability; a count badge shows each card's sub-tasks;
  search reveals the path to deep matches. **`github` function** change: returns each issue's `parent` via one
  added GraphQL query (graceful → flat grouping if unavailable). **Needs a `github` function redeploy** to light up.
  Verified with a stubbed hierarchy (3 levels deep, cross-topic child preserved, counts correct).
- **Dev-page "עומס לפי עדיפות" (·44)** — a priority-load breakdown in the פיתוח hero: 4 color-coded tiles
  (קריטי / גבוהה / בינונית / נמוכה) with live counts of open tickets per tier, fed by the now-live Projects-v2
  Priority field. Sits below the overview KPIs, above "עומס לפי נושא". Reuses the `.dev-kpi` tile styling.
  Verified: counts bucket correctly (test set 3/2/1/1 → קריטי=3, גבוהה=2, בינונית=1, נמוכה=1).

### Removed
- **Footer dev-hint (·47)** — removed "לחזרה לגיליון הוסף ?sb=0 לכתובת" from the footer (the `?sb=0` flag
  still works; it's just no longer advertised to users). Kept the version stamp.
- **Morning "היום" view (·44)** — removed per request ("לא רוצה את זה באפליקציה כרגע"). Reverted the whole
  ·42 feature: the 🌅 nav page, `js/src/19-today.js`, the today-view dispatch, and the remember-last-page /
  new-day landing (`landOnStartPage`). The app opens on the home page again (·41 behavior). Streamlining /
  automation ideas are being collected separately to brainstorm.
- **Morning "היום" view + smart landing (·42, `19-today.js`):** a new **first** nav page (🌅 היום) that
  aggregates what needs attention *now* — role-aware, pure client-side (no backend/secrets): **דורש טיפול**
  (orders awaiting *your* approval + low-stock relevant to you), **המשימות שלי** (open EMS tasks assigned to
  you → link to the full משימות page), **סטטוס הקמה** (kibbutz pipeline counts). Dark hero greeting + subtle
  load-in animation (`prefers-reduced-motion` respected). **Remember-last-page:** `showPage` persists the page
  + date; `landOnStartPage()` (fired once from `refreshData`) **reopens the last page within the same day**, but
  **lands on היום on a new day** (morning briefing). Verified: render, role-aware user, both landing branches,
  mobile 375 (no overflow). *Note: the recommendations doc's "bottom-nav" and "dev-page 404" items were stale —
  bottom-nav already exists (fixed bar ≤768px), dev page is live (·41).*
- **Dev-tasks color redesign + KPI hero (·41):** the פיתוח page led with a pale, near-styleless tree.
  Added a **dark navy "mission-control" hero band** carrying the page title + **4 live KPI tiles**
  (משימות פתוחות / בפיתוח עכשיו / עודכנו השבוע / נושאים פעילים — all computed from the already-fetched
  ticket list, no new data) and a **"עומס לפי נושא" distribution bar** with a clickable legend that
  **replaces the old jump-chips**. Introduced a **per-topic color system** (`DEV_TOPIC_COLORS`): each
  topic owns one color reused across the bar segment, its legend dot, and its tree section (colored
  **spine** + count pill + body rail) — so a bar slice, its legend chip, and its section read as one color.
  The **"בפיתוח עכשיו"** box became a real **violet card** (violet = "in development" across the app, was
  a near-invisible right-rail only — `.card` was never even defined in CSS). **קריטי/דחוף** priority chip
  is now a **filled red** (was washed-out tint). Static `index.html` heading removed (the hero carries it).
  Verified via computed styles + a static harness at desktop (1040) and mobile (375: 2-col KPIs, no overflow).
- **Visible version stamp** (`גרסה {date}·{N}`) in the footer, **auto-incremented** by `build.mjs`
  from a `VERSION` counter on every build — so each deploy is visibly newer (continues the old ·NN scheme).
- **Dev-tasks interactive navigation:** topic **chips** (click = jump + open the group), **collapsible**
  topic groups (native `<details>`), live **search** box, and a **"🔨 בפיתוח עכשיו"** section
  (open tickets by most-recent activity; `github` fn now returns `updatedAt`). Verified live (build ·30).
- **Dev-tasks visual redesign (·31):** centered max-width column + **3-level hierarchy via nested rails**
  (📂 topic → ↳ sub-topic that *owns* its tasks → task row), rows as full-row links with the **#issue-number
  de-emphasized** to a muted reference (it is *not* a priority), an **optional** priority chip that appears only
  when a ticket actually sets one, and a **mobile-first** layout (≥44px touch targets, no edge-to-edge smear).
  Chosen via a 3-approach design panel (nested-rails won on hierarchy, merged with mobile-comfort spacing).
- **Dev-tasks interactive tree (·34):** reworked to a real 3-level collapsible tree — 📂 topic → **אב parent**
  (click = show/hide its children) → **בן task** (click = expand its **detail**: state, assignee, priority, dates,
  and the ticket **body**). **GitHub is now an explicit icon button** (does NOT toggle the row / is no longer the
  default click). Grouping unified so a 2-part ticket `T|S` and 3-part `T|S|D` with the **same** sub-name **merge**
  into one parent; parents sorted A→Z (Hebrew) so near-identical names sit adjacent (e.g. `ייצוא אקסל` next to
  `ייצוא לאקסל` — they only fully merge if the ticket titles are spelled identically). `github` fn now returns the
  issue **body** (needs a redeploy to populate the detail panel). Verified on a 375px rig (grouping, collapse,
  detail, git-button-doesn't-toggle, search, no overflow).
- **Planning/reference docs:** `docs/vision-budget.md` (what a funded version unlocks) and `docs/team.md`
  (employee roles, field/office split, per-role metrics — basis for the role-based employee cards).
- **Project memory/docs system** under `docs/`: [INDEX](INDEX.md) → architecture, modules,
  data-and-security, operations, backlog. Index-to-small-files layout (load only what's needed).
- This **CHANGELOG**.
- **Stats page** (`stats.html`): fixed rendering (Heebo + emoji fonts, RTL charts, mobile
  table scroll, back-link → index.html) + interactive **time-period** & **region** filters.
- **Employee-management page** (`js/src/17-staff.js`, gated to עידן + עמיחי): per-employee task
  load + status breakdown, system-usage by actions (visits/edits/attendance), upcoming vacations,
  progress bar, and leave-a-message (Supabase `messages` table) + unread popup on next login.
- **`calendar` Edge Function** (`supabase/functions/calendar`): office-calendar read+add via a
  Google service account — EMS-login-gated, least-privilege (single shared calendar, fixed id).
- **Dev-tasks page** (`js/src/18-dev-tasks.js` + `github` Edge Function, gated to עידן + עמיחי):
  read-only live view of the GitHub tickets (`Sigmatec-Energy/tasks`) grouped by **topic → sub-topic**
  (parsed from the title `נושא | תת-נושא | תיאור`), auto-updating. **Working** (pulls 100+ live tickets). Editing (priority/sprint) = phase 2.
- **`github` Edge Function** added to the repo (`supabase/functions/github`) — read-only GitHub-issues
  proxy, EMS-gated, default repo `Sigmatec-Energy/tasks`, with pagination. Token authorized → returns live tickets.
- **EMS connection bubble** + visit-doc **FAB gated to field staff**.
- **Recommendations doc** (`docs/RECOMMENDATIONS-he.md`) — next-stage plan by domain (Hebrew), informed
  by the EMS-validation + BGU-BI projects.
### Changed
- **Calendar backend:** Apps Script → **Supabase service account** (Workspace blocks public
  Apps Script web apps, so the org-owned script couldn't be reached from the public app).
- **`ems-auth` Edge Function** hardened: reads `JWT_SECRET` **per-request** (not at module
  load, so a freshly-set secret is always picked up) and returns an **env diagnostic**
  (variable names + lengths, no values) instead of a cryptic 500 when the secret is missing.
- **Main page decluttered:** "My Tasks" bar moved into the **משימות** page; category **counts merged
  onto the filter chips** (search bar) and the separate stat squares under "company tasks" removed.
- **Stats:** removed the "סוג לקוח" (client-type) chart + wavering list (not tracked).
- **Header:** removed the "העתק קישור" button; **meeting-mode** badge shown only to עידן.
- **Access/roles:** עמיחי (CEO) sees everything (incl. attendance); מתניה no longer sees מלאי;
  עמיחי dropped from the employee cards (CEO, not a managed employee).
- **Employee page → role-based cards:** עידן = company **go-live pipeline** (not a personal bar);
  אביאם/ניתאי = field metrics; מתניה = office/dev (dev-load placeholder pending the task source).
- **EMS connection bubble** in the header — live status + a link to the EMS web system.
  Wording: **🟢 מחובר ל-EMS** / **🔴 אין חיבור ל-EMS** (red when disconnected).
- **Visit-doc FAB** now shows only for field staff (אביאם/ניתאי) with the attendance-type picker;
  hidden for office (עידן/מתניה/עמיחי).
- **Overall-progress bar:** per-color hover tooltips + tap-to-show legend (mobile).
- **Home page renamed** "קיבוצים" → **"דף הבית"** (nav icon → 🏠).
- **Footer version line** RTL fix — version + `?sb=0` isolated with `<bdi>` and split to two lines so the
  mixed Hebrew/latin text stops flipping.
- **EMS bubble** wording → **🟢 מחובר ל-EMS** / **🔴 אין חיבור ל-EMS** (red when disconnected).
### Fixed
- **EMS bubble routing (·48)** — when **disconnected**, the header bubble (🔴 אין חיבור ל-EMS) now opens the
  **in-app EMS connection page** (`showPage('ems')` → `emsLoginPanel`) instead of the external site you can't
  use yet; when **connected** (🟢) it opens the EMS system as before. Verified both states.
- **Dev-tasks priority/status now live (2026-06-23, config-only)** — the `GH_TOKEN` blocker is resolved: the
  token was reissued with `repo + read:org + project` and the `github` fn redeployed. Verified live (127 status
  badges + priority chips over 130 tickets; "בפיתוח עכשיו" from real In-Progress). No code change. *(Confirmed
  Sigmatec-Energy has no SAML SSO, so the previously-assumed SSO-authorize step wasn't needed.)*
- **Low-stock alert "appears twice" (·43)** — for אביאם/עמיחי a meter shortage surfaced **both** in the red
  banner *and* as a red line in the company-orders task list. Root cause: `renderLowStockAlert` added the
  company-task line for everyone, but אביאם/עמיחי also get meters in the banner. Fix: skip the company-task
  meter line for the two banner-users; everyone else (עידן/מתניה/ניתאי, who have no banner) still gets the
  line. Verified in a rig: עמיחי → 1 (banner only); עידן → 1 (line only). *(The benign double-call from
  `refreshData`+`renderInventory` was a red herring — it's idempotent, guarded.)*
- **Priority "קריטי" (·40)** now maps to the top red chip (was falling through unmapped). Tier order: קריטי/דחוף → גבוה → בינוני → נמוך.
- **Dev-tasks now reads GitHub Projects-v2 fields** (·39) — the real source of priority. The function added a
  **GraphQL** query against project **"Sigmatec EMS — Roadmap"** (Sigmatec-Energy #1) and merges **Priority +
  Status** (also type/sprint) by issue number. These live on the **project board**, not the issues — which is why
  labels/body showed nothing (118/122 items have Priority, 122/122 have Status). UI: priority chip + colored
  **Status badge**, and **"בפיתוח עכשיו" is now driven by real Status=In-Progress** (activity-sort fallback).
  Requires `GH_TOKEN` to have the **`project`** scope + a redeploy; **graceful** if absent (tickets still load).
- **Dev-tasks priority now reads a GitHub label** (·38) — not just the body `## עדיפות`. A label containing
  `דחוף`/`גבוה`/`high` → גבוהה, `בינוני`/`medium` → בינונית, `נמוך`/`low` → נמוכה (also 🔴/🟡/🟢). Client-side
  (the function already returns labels) so **no redeploy needed** — the chip appears the moment a ticket is labeled.
  *(Confirmed via `gh`: 0/100 tickets currently have any priority — no labels, no body field — which is why none showed.)*
- **`github` function can no longer hang for minutes** (the dev-tree "cold/stuck" stall). Root cause: the
  EMS-validation `fetch` had **no timeout**, so a slow EMS API stalled the whole function. Added an
  **AbortController timeout** (`fetchT`) on the EMS-validation (8s) + GitHub (12s) calls → worst case fails
  fast. Client: `devFetchTasks` now has a **20s timeout** + a **🔄 נסה שוב** retry button (no more endless
  spinner; shows "השרת מתעורר (cold start)" on timeout). *(Cold starts are inherent to serverless; these make them a brief retry, not a hang.)*
- **Removed the obsolete "📱 שלח לעידן" note + button** from the company-tasks modal — it predated the shared
  database; saving now updates the whole team directly (like the kibbutz cards). Dead `sendCompanyTasksToTeam` removed.
- **Saves no longer fail to "נשמר מקומית/לוקאלית"** (the recurring company-tasks / priority-lists bug). Root
  cause: writes need the **authenticated** Supabase bridge pass, but when it lapsed the write went out as
  **anon** (read-only post-lockdown) and was rejected → localStorage fallback. The write shim now **re-mints
  the pass before every upsert** (`01-data.js`), so all save paths (company-tasks, requirements, tasks, visits,
  orders, attendance…) write authenticated. **`saveCompanyTasks`** also awaits properly with a 12s timeout,
  shows an accurate result, and keeps a local safety copy. Verified on a 375px rig (success + failure paths).
- **Wording (post-Sheets migration):** save buttons "💾 שמור לגיליון" → **"💾 שמור"**; save toasts
  "✅ נשמר/נוסף לגיליון" → **"✅ נשמר/נוסף"** (data now goes to Supabase, not a sheet).
- **Mobile QA pass (≤768px)** — audited every view/modal/nav at ~375px via a 6-area agent sweep + a real
  375px test rig, then one desktop-safe patch (build ·33): **my-tasks bar** was white-on-white **invisible** →
  solid surface + dark labels; **attendance table** scrolled the whole page sideways → wrapped in a scroller;
  **inventory matrix** first column (פריט/קיבוץ name) pinned sticky so it stays while scrolling; **tap targets**
  raised to ≥40px (filter chips, header-meta pills, day-type buttons); **comment-hint** ("לחץ לשליחת הערה")
  was hover-only → now visible on touch; EMS filter-bar controls stack full-width; progress-legend enlarged.
  Verified: no horizontal overflow on any view at 375px; desktop untouched (media-scoped).
- **Low-stock alert** meter label `מונה PM` → full name **`מונה PM135`** (+ precise `PM135` match
  so it can't accidentally bucket other meters).
- **Stats** period filter labeled "(ביקורים/חלוקה)" — it scopes the activity sections, not the
  current-state task KPIs (was misleading; review finding).
- **Staff messages** popup: in-flight guard + removes any existing popup → no double-popup race.
- **Bridge token auto-refresh** (~50 min) so writes don't silently fail after the write-lockdown.
- **Attendance** hidden from עידן (only אביאם/ניתאי see their own; עידן logs in as them if needed).
- **Card "מי מעדכן" field removed** from the edit modal — the updater is auto-recorded as the
  logged-in user (no picker for עידן, no label for others).
- **Login 5xx** (e.g. 502 during an EMS deploy) now shows "⏳ המערכת בעליית גרסה — נא לנסות שוב
  בעוד מספר דקות" instead of the misleading "wrong email/password".
### Security (in progress — #4)
- STEP 1 RLS applied; auth bridge ON (self-verifying, anon fallback).
- `ems-auth` mints an `authenticated` token; `JWT_SECRET` set = the project **Legacy JWT Secret**.
- **VERIFIED ✅:** mint→RLS returns 200 and the on-load bridge logs `🔒 Supabase pass active`.
- **STEP 2 write-lockdown applied + verified** (anon write → 401; reads still work).
- **Review/QA (2 agents)** done. **Pending your SQL:** drop anon-read on `messages` (private notes
  are otherwise readable via the public key). Follow-ups: stronger EMS-token validation, per-user
  message RLS, query-based lockdown, `ems-auth` CORS lock. Full read-lockdown + rotate `service_role` later.

## [2026-06-22] — Supabase migration · PWA · EMS login
### Added
- **EMS login gate** (email/password + 2FA OTP) as the app gate; badge = logout; login spinner.
- **PWA**: manifest, network-first service worker, install button, cache-busting build.
- **Meters** on EMS tasks (⚡/💧 + serial number + admin link).
- One-click **"📅 add to my calendar"** links on calendar events.
- **EMS→Supabase auth bridge** (`ems-auth` Edge Function) + `USE_SB_BRIDGE` flag + STEP 1 RLS.
- **Org Apps Script backend (Option B)** drafted — EMS proxy + office calendar (not yet deployed).
### Changed
- Backend **migrated Google Sheets → Supabase** (Postgres + PostgREST + RLS); verified read parity.
- Monolithic HTML **split into `js/src/*.js` modules** built by `build.mjs`.
- Project relocated to **`Sigmatec Operations App`**; legacy `kibbutz-dashboard` archived.

## [pre-migration] — builds ·20–·29 (Google Sheets era)
- Original dashboard on Google Sheets + Apps Script. History in `archive/changelog/` + git log.
