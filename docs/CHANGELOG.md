# Changelog

All notable changes to the **Sigmatec Operations App**. Format follows
[Keep a Changelog](https://keepachangelog.com/). Newest first.

> **Per-update protocol:** every change adds an entry here (what + why), updates the relevant
> doc file + [backlog.md](backlog.md) state. Full session detail is captured automatically by
> claude-mem (search with the `mem-search` skill).

## [1.26.x] 2026-07-15 — cert test automation (green) + kibbutz_details seed generated from EMS
עידן's /loop ask: verify every cert trigger point + the edit flow with test automation until bug-free.
- **`test-delivery-cert.mjs`** — 26 checks (DOM-stubbed): escaping, doc generation (numbered/draft,
  totals, no-price, XSS-escape, logo), prefill from kibbutz_details (hit+fallback), **edit roundtrip**
  (date/customer/items; empty/zero rows excluded), EMS description parsing, visit/order mapping. GREEN.
- **`test-cert-pdf.mjs`** — end-to-end print pipeline: certDocHtml → headless Edge → PDF → **markitdown**
  extraction; 33 assertions (number vs טיוטה, quantities+total, item names, both ח.פ., email, date,
  no ₪/$, exactly 1 page). Handles the Hebrew reversed-glyph extraction artifact. GREEN.
- **Live browser sweep** (production data, all 5 triggers): visit form · saved visit (real כנרת visit) ·
  EMS task (parsed 2 items from description) · customer order (real אלומות order, 3 items) · report
  picker (29 in-range visits) + full in-modal edit roundtrip. ALL PASS; no app bugs found.
- **kibbutz_details seed** — generated from the prod EMS `sites` table (read-only user): 47 kibbutz
  cards keyed by KIBBUTZ_SITE_MAP; swapped company_name/company_id rows auto-corrected; להשלים/test
  placeholders blanked (6 kibbutzim blank → editable on the cert). Kept OUT of the public repo (real
  customer ח.פ./contact data) — delivered at `C:\Users\idann\Documents\seed_kibbutz_details.sql`;
  ⚠️ needs עידן to run it in the Supabase SQL editor (kibbutz_details writes are authenticated-only).

## [1.26] 2026-07-14 — cert shapes redesign + 👁 view-only reports user (viewer role)
עידן's follow-ups on 1.22: fresher shapes (text layout approved), DB setup finished, and a view-only
user for internal reports (הנהלת חשבונות וכד') — no editing, only attendance/visits/cert reports.
- **DB verified live:** עידן ran `db/delivery_certs.sql` — anon read 200 on both tables, anon insert
  correctly rejected (42501) → numbering engages on the first cert issued from a logged-in session.
  `kibbutz_details` seeding from the EMS `sites` table still pending (needs DB access — see backlog).
- **Cert shapes redesign:** solid circles → brand **gradient frame strips** (top 3.5mm, bottom 2mm,
  dark-teal→teal→lime), a **ring + gradient-blob cluster** top-left, small teal ring top-right, subtle
  echo dots bottom-left (clear of the footer). Verified single-page via headless-Edge print-to-PDF.
- **👁 Viewer role (`role='viewer'`, user "צפייה"):** new "כניסה לצפייה בלבד (הפקת דוחות)" entry on the
  EMS login gate — PIN-based (const `VIEWER_PIN` in `15-login-gate.js`, currently **6210**), no EMS
  account needed. Gets: kibbutz cards (read), visits report, **attendance reports incl. the
  אביאם/ניתאי person toggle** (was isIdan-only), cert **range report**. Blocked: **every write** —
  hard guard in the Supabase router (one chokepoint, toast "משתמש צפייה — אין הרשאת עריכה") +
  `checkEditPermission()` false + **cert issuing blocked** (consumes a number; range report stays open).
  Hidden: inventory/staff/dev navs, quick-visit FAB. Returning viewer is NOT nagged by the EMS
  re-login modal. Badge shows 👁 + `user-viewer` body class.
- **Fix (all roles):** the quick-visit FAB showed for everyone on initial load until the first page
  switch re-ran the gate — now gated at init too (`initVisitFabDrag`).

## [1.22] 2026-07-14 — 🚚 delivery certificates (תעודות משלוח) [⚠️ needs db/delivery_certs.sql + kibbutz_details seeding]
עידן's ask: issue a branded PDF delivery certificate (like the iCount sample, cert 6210) from anywhere
equipment leaves — items + quantities, **no prices**, signature line, Sigmatec logo colors, editable
before issuing. Own numbering series (explicitly NOT continuing iCount); accounting copies the data
monthly, grouped by kibbutz.
- **New module `js/src/20-delivery-cert.js`** (+`20-delivery-cert-logo.js` — the logo extracted from the
  official PDF as a data URI). Flow: trigger → `openDeliveryCert(prefill)` editable modal (customer block,
  date, item rows with catalog datalist, notes) → `issueDeliveryCert()` persists to Supabase
  `delivery_certs` (running number from **1001**) → print window → browser-native **Save as PDF**
  (RTL-safe, zero PDF libs; window opened synchronously so popup blockers don't bite). If the insert
  fails (offline/sb=0/table missing) the cert is issued visibly as **טיוטה** without consuming a number.
- **The document**: A4, brand circles (lime/teal/dark-teal) mirroring the sample, logo, company block
  (ח.פ. 515923084 etc.), customer block, פירוט/כמות table, green "סה"כ פריטים" band, notes,
  שם המקבל + חתימה lines, footer. Verified via headless-Edge print-to-PDF — single clean page.
- **Trigger points (all prefilled):** visit form (checked products) · last-visit box + history rows (🚚,
  shown only when the visit has items) · visits-report modal ("🚚 תעודת משלוח מביקור" picker of in-range
  visits with items) · EMS task detail (items parsed from the "• name ×qty" description lines of
  אספקת-ציוד tasks) · customer orders in the orders table (🚚 per row).
- **Accounting report:** "📄 דוח תעודות משלוח" in the visits-report modal — issued certs in the chosen
  range **grouped by kibbutz** with per-item totals per kibbutz, print/PDF via the same pathway.
- **Data:** `db/delivery_certs.sql` (NOT yet run) — `delivery_certs` (immutable: insert-only RLS, anon
  read) + `kibbutz_details` (kibbutz → legal name/ח.פ./address/contact; **to be seeded from the EMS
  `sites` table** — needs a DB session with `SIGMATEC_DB_READONLY_PASSWORD`; until seeded the customer
  block simply starts blank and is editable). Router: new `deliveryCert` write type in `01-data.js`
  (gets the auth re-mint + 401-retry for free) + `window._sbCertGet` read handle.

## [1.20] 2026-07-06 — order parsing: E360 default rule + order assignee (עידן) [⚠️ needs parse-order redeploy + orders_schedule_fields.sql]
Real misparse (עידן's kibbutz email, Groq path): "4 מונים תלת פזי + מונה תלת פאזי משנה זרם" returned
4× Satec EM133 instead of 4× מונה Landis+Gyr E360PP + 1× E360CT. Business rule clarified: **Satec=EM133
only when סאטק/133 is explicit; the GENERAL default for brand-less meters is Landis E360 (PP)**.
- **Learning loop verified live:** the manually-corrected order was captured in `parse_corrections`
  (raw email → 4×PP + 1×CT + 1×Cellcom Sim) — feeds every future parse as a few-shot example.
- **AI glossary (`parse-order/index.ts`)**: Satec alias reworded (explicit-only), new default-meter
  alias → מונה Landis+Gyr E360PP, "מונה תלת-פאזי משנה זרם" added to the E360CT alias, prompt now
  states the default rule + that one email can carry both PP and CT lines. **Needs redeploy.**
- **Offline matcher (`07-orders.js`)** aligned: 'משנה זרם' (spelled out) → E360CT; brand-less generic
  meter ask → E360PP default (a CT match alone doesn't suppress it); qty anchor prefers the
  number-adjacent "מונ" after "סה"כ" (explicit total beats per-line partials); the EM133-משנ"ז variant
  now requires BOTH contexts (סאטק/133 AND משנז) so "5 סאטק 133"/"2 משנז 250" no longer pull it in;
  a leading model-number (133/250/400/485…) that appears in the product's own name is never trusted as
  a quantity. Verified in-browser: the real email → 4×PP(confident)+1×CT(flagged), all regression cases green.
- **Order assignee (עידן + עמיחי — 1.21 widened the gate):** new "👤 אחראי על האספקה" picker on customer orders (אביאם/ניתאי/עמיחי,
  default = the approver). On approval: stock deducts from the **assignee's** bag (they physically supply)
  and the EMS task opens **assigned to them**; movement `createdBy` stays the approver; confirm text +
  task description show the assignee; orders list shows an "👤 אחראי" chip. Persisted via the `assignee`
  column — **run `db/orders_schedule_fields.sql` first** (additive; the client omits the field when unset,
  so order saves keep working before the SQL — setting an assignee before it errors loudly).

## [1.16] 2026-07-02 — dev board: weighted layout, real 2K width, drag-move (עידן), release button isolated
עידן's feedback on 1.15: the board still felt like a GitHub mirror, compressed and unreadable, with big
dead margins on his 2K screen; the 🚀 button invited accidental clicks; wanted the ability to move a task.
- **Weighted board (≥1100px):** the active columns — ספרינט קרוב / בפיתוח עכשיו / בשלבי בדיקות — get the
  width (1.35fr each, RTL-first); **ממתין לפיתוח** is a narrower side pool; **גמר פיתוח + עלה לאוויר**
  drop to a collapsed bottom row. "הרחבה של הפתוחות והספרינט הקרוב" — not a uniform 6-way split.
- **≥1700px full-bleed:** the board breaks out of the 1400px container (`margin-inline: calc(50% - 50vw
  + 32px)`) → ~2500px wide on 2K, active column ~660px, no dead margins, no h-scroll. Mobile untouched.
- **Drag-to-move — עידן only, desktop only:** drag a card between columns → optimistic repaint →
  `github` fn `setStatus` (its synonym matcher already covers all 6 stages — **no fn redeploy**) →
  revert + Hebrew alert on failure; offline cache synced; hint line "✋ אפשר לגרור משימה בין עמודות".
  Verified: drop→optimistic→revert cycle; מתניה gets zero drag affordances.
- **"עלתה גרסה" isolated:** dashed ghost button pushed to the far LEFT edge (`margin-inline-start:auto`),
  warning tooltip; the existing confirm stays. Everyday buttons stay right.
- **Open (recorded):** the page still *presents* raw GitHub content — a further content-level pass
  (friendlier naming/grouping, less issue-tracker jargon) is a candidate next iteration.

## [1.12–1.15] 2026-07-02 — full-project audit + 4-phase fix sweep (P0 bugs → dev-page width → connection hardening → design polish)
Three parallel audit agents scanned the whole project (UI/UX+mobile, inter-module data flow,
connection resilience) → ~30 findings → all four fix phases applied on dev, one commit per phase.

### [1.12] P0 — critical bugs
- **`sbDelete` used an undefined var `H`** (`01-data.js:474`) → every `emsQueueClear` threw →
  the EMS queue was never cleared server-side → **other devices re-sent the whole queue**
  (duplicate EMS comments/status/tasks). Fixed to `baseH()`.
- **Customer orders flipped to supplier after refresh**: `orderType`/`kibbutz` were posted but the
  `orders` table had no columns — dropped on save, classification fell back to a notes-regex that
  misses modal-created customer orders → wrong approval routing, no stock deduction, no EMS task.
  Fixed: `db/orders_type_kibbutz.sql` (**run BEFORE releasing to main**) + `writeOrder`/
  `orderUpdateRow`/`readSnapshot` mappings.
- **Global search → requirements landed on a blank inventory page** (tab was removed but search
  still routed there). Search now routes to orders; `invShowTab` falls back to orders for any
  missing section.
- **`ems_cache` RLS 401 root fix**: `sbBridge` lived inside the login gate, which early-returns in
  PIN mode (`?login=0`) → `_sbBridge` never existed → every write went anon. Moved OUTSIDE the
  gate + **single-flight** (concurrent callers share one mint) + 15s timeout.

### [1.13] Dev page (פיתוח) — uses the whole screen
- `.dev-wrap` stays 880px for the topic tree, but the **status board** gets `dev-wrap-board` →
  **1400px**, and the 6 stages render as a real kanban grid: **3 columns ≥1100px, 6 ≥1600px**
  (was: stacked full-width rows inside an 880px column — "צר במסך גדול").
- Debounced **resize listener repaints** the dev page (layout was decided once per paint).
- `.dev-selbar` on mobile lifted above the fixed bottom nav.

### [1.14] Connection hardening
- `emsProxyCall`: **20s abort + JSON guard** → `{error}` per contract (was: infinite hang on a
  stalled Apps Script; `Unexpected token '<'` on HTML error pages). Every EMS action covered.
- `parse-order` client: 15s abort; **401 → emsRequireLogin** (was silent offline downgrade).
  `devFetchTasks` 401 → emsRequireLogin too.
- `approveCustomerOrder`: **idempotency guard** — a failed step-3 + re-click no longer
  double-deducts stock; live `createTask` now calls `emsAfterWrite()` so the task shows on
  kibbutz cards immediately (was: next session).
- `refreshData`: in-flight guard (slow stale responses no longer overwrite fresh data) +
  re-renders open calendar/my-tasks views each poll.
- **EMS queue truly-offline fallback**: enqueue failure parks the item in
  `ems_local_queue_v1` (localStorage) and drains on the next flush (was: write lost + alert).
- Version watcher: auto-reload capped at 2/version (CDN-propagation reload-loop guard).
- **sw.js v3**: cache key strips the query string + only 2xx cached (was: a new cache entry per
  2-min version probe forever; mid-deploy 404s could be cached as the offline shell);
  `app.js`+`app.css` added to the pre-cached shell.
- **Edge fns [need redeploy]**: `parse-order` CORS now reflects githack/localhost dev-preview
  origins (was pinned to prod → AI silently off in previews); `ems-auth` 8s EMS-validation timeout.

### [1.15] Design polish — "הנפשות צנועות ומחייבות"
- **Animations**: modal open (backdrop fade + card pop, ~180ms), page-switch entrance
  (`.page-enter`), button `:active` press on all button systems, **global
  `prefers-reduced-motion` guard**.
- `:disabled` finally looks disabled; toast z-index above the JS overlays (was hidden).
- JS-built overlays (`orderNotifModal`, `emsReloginModal`) rebuilt on the shared
  `.modal-backdrop`/`.modal` classes → inherit animation + mobile sizing. **Esc closes the
  topmost modal** (login/auth gates + `orderQModal` excluded).
- Orders table wrapped in `overflow-x:auto` (no overflow at 769–1100px).
- **Activity report now covers inventory**: order created (ספק/לקוח) + stock movements
  (קליטת הזמנה / אספקה ללקוח / תנועת מלאי) with actor + details.
- **Customer orders locked out of the supplier pipeline** (no quick-status/stuck buttons,
  supplier statuses hidden in the edit picker, distribution hidden) — editing one could post
  *inbound* stock for goods that left.
- PWA `theme-color` `#15BFC2` (teal, matched nothing) → `#1b2a4a` (navy primary).

**Verified in preview** (localhost, mock): requirements-search lands on orders (no blank page);
`_sbBridge` defined in PIN mode; orders table wrapped; dev board = 6 grid columns at 1600px with
auto repaint on resize; modal `modalPop`/`fadeIn` animations; Esc closes invOrderModal but NOT
orderQModal. **Not yet released to main. Before release: run `db/orders_type_kibbutz.sql` +
redeploy `parse-order` & `ems-auth`.**

## [1.11] 2026-07-01 — independent stock add/remove for עידן (no more DB access needed)
- **New "🛠️ הוספה/הפחתה עצמאית של מלאי" card** in "מלאי לפי מיקום", visible **only to עידן**
  (`isIdan()` gate, both on visibility and inside the write function itself as defense-in-depth).
  Picks any of the 4 locations (עמיחי/אביאם/ניתאי/משרד) + any active catalog product + ➕הוספה/➖הפחתה
  + quantity → writes a plain `movement` (one side of from/to left empty, same shape the earlier
  SQL-seeded "מלאי התחלתי" rows used) via the existing `type:'movement'` write path — no schema/backend
  change. A live hint shows the current balance at the chosen location; **הפחתה is capped at that balance**
  (can't go negative), mirroring the existing stock-transfer tool's max-quantity guard.
- **Closes the loop from the EM133-משנ"ז/בקר-485 session:** those needed a direct SQL insert because there
  was no "opening stock" UI (only transfer between existing balances). This is exactly that missing piece —
  future onboarding of a new item's initial stock, or ad-hoc corrections, no longer need DB access.
- Verified in-browser: card hidden for ניתאי, visible for עידן with both dropdowns populated; hint shows
  the real balance (3× בקר 485 for ניתאי); over-limit הפחתה blocked with the current balance in the message;
  the write function itself no-ops (no alert, no request) when called for a non-עידן session.

## [1.10] 2026-07-01 — minimal category separators in stock-by-location (both views)
- **Rows/items in "מלאי לפי מיקום" now grouped by category** (מונה/בקר/סים/משנ"ז/אנטנה/ספק כוח/כרטיס
  תקשורת), fixed order, with a small muted label row between groups — desktop matrix (`.matrix-cat-row`)
  and mobile accordion (`.item-cat-label`). Pure CSS/sort change, no data touched. Category comes from
  the live `products.category` field (`productCategoryMap()` in `08-inventory.js`).
- **Known gap (pre-existing, not introduced here):** items whose *movement* ledger name doesn't match the
  *catalog* name (e.g. movements say "בקר PUSR"/"סים Cellcom"/"מונה EM133"/"מונה PM135" while the catalog
  row is "PUSR Controller"/"Cellcom Sim"/"Satec EM133"/"Satec PM135") fall into a catch-all "אחר" group —
  same class of drift the 1.08 E360PP/SP fix addressed for just those two meters. Say the word to extend
  that unification to the rest of the catalog (controllers/SIMs/EM133/PM135/E360CT/E570) and this grouping
  will sort cleanly everywhere.
- **Tab/header rename ("מלאי לפי מיקום" → something more formal) — not yet applied,** naming options
  given to עידן for a pick.

## [1.09] 2026-07-01 — new catalog items (EM133 משנ"ז fix + בקר 485) + AI glossary (on dev; ⚠️ needs SQL run + redeploy)
- **`db/add-em133-mashneze-and-485.sql`** (not yet run): fixes the "EM133 משנ"ז" product name to
  **`מונה EM133 משנ"ז`** (missing the מונה prefix — no auto-prefix behavior exists on the product form,
  same gap the 1.08 fix flagged); adds a new catalog product **`בקר 485`**; enters ניתאי's stock (2× EM133
  משנ"ז, 3× בקר 485, +1× בקר PUSR — he was at 0). A brand-new catalog item with zero movements can't show
  in by-location/kibbutz stock (those views sum `movements`) — there's no "opening stock" UI, only
  transfer-between-existing-locations, so this goes through SQL like the earlier אביאם/ניתאי seeding did.
- **AI glossary updated** (`parse-order/index.ts` ALIASES + prompt): the live product catalog sent to the
  AI is already dynamic (`getActiveProducts()`), so the two new items appear automatically once the SQL
  runs — no catalog-list change needed. What needed updating: business-rule phrasing —
  EM133 mentioned with משנ"ז/CT context (not "משני זרם"/"שנאי", that's PM135) → the new variant; plain
  EM133 → unchanged Satec EM133. `בקר 485` needs no special rule (RS485 numeric token).
- **Offline fallback (`07-orders.js`)**: same EM133/משנ"ז disambiguation added to the local matcher
  (mirrors the existing PM135/EM133 collision guard) so a bare "EM133" mention doesn't double-match both
  variants when the AI is unavailable. `בקר 485`'s digit token already gets the same protection the
  משנ"ז 250/400 numeric-token guard provides — no extra code needed.
- **Needs:** run the SQL + redeploy `parse-order`.

## [1.08] 2026-07-01 — unify Landis E360PP/E360SP meter names (on dev; SQL run + parse-order redeployed ✅)
- **Problem:** the by-location inventory + reports showed the SAME meter under several name
  strings (movements/visits drifted): `Landis+Gyr E360PP` · `מונה E360PP` · `מונה 360PP` · a
  byte-**corrupted** `<garbled> E360PP`; ditto E360SP. Canonical is now **`מונה Landis+Gyr E360PP`** /
  **`מונה Landis+Gyr E360SP`** (English catalog name + מונה prefix, per request).
- **Data migration — `db/unify_e360_meter_names.sql`** (run in Supabase SQL editor, transactional):
  folds every name variant in **movements**, **visits.products** (jsonb), **returns** into the
  canonical name; renames the two catalog rows; and **DELETES two corrupted duplicate movement rows**
  (`mov_1781426327919_ezaa` SP-135, `mov_1781426329912_yj7r` PP-10) that are garbled re-entries of
  clean rows עידן entered 3 min later — keeping them would double the stock. Includes BEFORE/AFTER/
  LEFTOVER verification SELECTs. **Run by עידן — verified clean:** 11 rows/732 qty
  `מונה Landis+Gyr E360PP`, 4 rows/337 qty `מונה Landis+Gyr E360SP`, zero non-canonical variants left.
- **Code aligned so new writes never re-introduce the short form:** `09-visits.js` PRODUCT_LIST,
  `08-inventory.js` METER_RULES labels, `05-meeting-returns.js` default, `parse-order/index.ts`
  ALIASES + prompt. Zero short-form `מונה E360PP/SP` left in the bundle (incl. comments). Bonus: the
  low-stock rule only counts names starting with `מונה`, so the לנדיס-order stock (was `Landis+Gyr…`,
  no prefix) is now counted too. **`parse-order` redeployed** with the new aliases — verified.
- **Still open: deploy `dev`→`main`** so the live bundle carries the aligned code (the SQL/redeploy are
  DB/function-side and already live; only the client bundle is pending).
- **Out of scope (flagged, not touched):** the same drift exists for E360CT / E570 / EM133 / PM135 /
  controllers / SIMs (+ a corrupted `<garbled> E360CT` movement, + one empty-name catalog row). Say the
  word to extend the same normalization to all meters/accessories.

## [1.06] 2026-06-29 — draggable quick-visit FAB + drag hint + role gate (released to main)
*(Merged `feat/draggable-visit-fab` → dev → main. Covers the 1.04–1.06 work below.)*
### FAB visible only for עמיחי/אביאם/ניתאי
- The quick-visit FAB now shows for **עמיחי, אביאם, ניתאי only** (explicit allow-list) — hidden from עידן and
  everyone else. Label is **"תיעוד נוכחות"** for the attendance pair (אביאם/ניתאי) and **"תיעוד ביקור"** for
  עמיחי (he gets the plain quick-visit flow, not the attendance day-types). `02-init-attendance.js` showPage gate.

### Drag-hint arrows (1.05)
- The **"📍 תיעוד ביקור" FAB is now free-draggable** anywhere on screen; position is **persisted per device**
  (`localStorage visit_fab_pos_v1`) and restored on load, clamped into the viewport. A ~6px move threshold keeps
  **tap = open the form, drag = reposition**. ponytail: native pointer events, no library; `setProperty(...,
  'important')` beats the mobile `#visitFab{left:16px!important}` rule.
- **Drag hint:** four small arrows (▲▼◀▶) around the FAB, glowing in the bubble's blue (`#2563eb`) with a gentle
  opacity pulse, so it reads as movable. They **fade out after the first drag** (`.vfab-placed`) and respect
  `prefers-reduced-motion`. The label moved into a `.vfab-label` span so the per-page text update doesn't wipe
  the arrows. Verified at 375px (4 arrows positioned + colored + glowing, fade-after-drag, label intact, drag/
  persist/restore/tap all still work).

## [1.03] 2026-06-29 — pre-merge review pass (ponytail + superpowers) → released to main
- **Independent code review (superpowers) + ponytail pass** over the whole unreleased batch (·95→1.02) before
  merging to `main`. Verdict: ready to merge — no critical/important issues; the delta is mostly deletions +
  reuse. One minor nit applied: `changeEmsStatus` (14-calendar.js) no longer sets the task-detail status
  **optimistically when the change was only queued offline** (avoids showing a status that isn't applied yet).
- Added `db/orders_schedule_fields.sql` (additive `assignee` + `due_date` on `orders`) for the upcoming
  order→task scheduling flow (Spec A) — harmless until that flow ships.

## [1.02] 2026-06-28 — fix: "401 RLS" on save when the EMS session lapsed
- **Saving (e.g. a kibbutz status from the משימות page) could fail with a raw `401 … row violates RLS for
  table tasks`.** Cause: writes need the **authenticated** Supabase pass minted by `sbBridge()` from a valid
  EMS token; when the EMS session had lapsed, the silent re-mint produced no pass → the write went out **anon**
  → RLS rejected it. Fix (01-data.js write shim): on a `401/42501` the shim now **forces one fresh mint +
  retries**; if it still fails it triggers **EMS re-login** (`emsRequireLogin`) and shows
  "יש להתחבר מחדש ל-EMS כדי לשמור" instead of the cryptic Postgres error. Applies to every save path.

## [1.01] 2026-06-28 — visit→status change, mobile QA, calendar guide  *(version rolled ·100 → 1.01)*
- **Visit report no longer written into the kibbutz status (per request).** `autoAppendVisitToStatus` is no
  longer called on visit save (09-visits.js); the card's **"📍 ביקור אחרון"** line now shows **date + who only**
  (dropped the summary snippet — the full summary still lives on the visit record). (`applyCardLastVisit`,
  10-activity.js.)
- **Mobile QA (notifications · tasks · reports).** Verified at 375px: the approved-order notification modal
  (fits, 41px buttons), the משימות page (no overflow), and the visits-report modal. **Fix:** the report
  date-range buttons (`.btn-quick-date`) were 28px tall — raised to **≥40px** tap targets on ≤768px (css/app.css).
  No console errors; no horizontal overflow on any of the three.
- **Calendar connection guide — `docs/calendar-setup.md`.** Comprehensive English guide for wiring the office
  calendar: it uses **service-account calendar-sharing (NOT Domain-Wide Delegation)** — share the calendar with
  the SA email + set the Supabase secrets + redeploy. Includes Google Cloud steps, secrets table, curl tests,
  troubleshooting, security notes, and the **remaining client-fetch wiring** snippet (the UI doesn't call the
  `calendar` function yet — `SHEET_DATA.calendar` is unpopulated).
- **Version scheme rolled over:** this is the first **decimal** build (`1.01`) — `·100` was the last `·N` counter.

## [·99] 2026-06-28 — EMS-task flow: end-to-end audit + fixes; tasks now on the calendar
Parallel read-only audit of the whole EMS-task flow (open/close triggers, visits, calendar, orders↔stock).
**Headline: no second order-class data-loss bug exists** — every write builder was checked; visits re-send
full content (only `created_at` was resetting), movements are insert-only, EMS status PATCH hits the external
EMS API (normal partial update). Fixes shipped:
- **Calendar shows EMS tasks (requested).** The month grid + day panel now render open EMS tasks on their
  `expectedCompletionDate`, reusing the agenda's exact filter + the `.cal-ems` chip (`collectCalendarEvents`,
  14-calendar.js). Closed tasks and tasks without a due date are skipped.
- **#1 createTask completeness (13-ems.js).** A transient site-lookup error during queue flush was swallowed,
  creating a **site-less task** that was then dead-lettered (never retried). Now a lookup error throws → the
  item stays queued and retries next connect; assignee stays best-effort.
- **#2 task-detail status is queue-aware (14-calendar.js `changeEmsStatus`).** Was a live-only PATCH that just
  errored offline; now uses `emsWriteOrQueue` so an offline status/close is queued and applied on next connect
  (same model as closing from the visit form).
- **#4 `writeVisit` preserves `created_at` on edit (01-data.js).** Editing a visit no longer resets its creation
  date (the full-row upsert now omits `created_at` on edit so the merge keeps the original).
- **#5 delivered-without-distribution (07-orders.js).** Marking an order "סופקה" without setting a distribution
  silently downgraded to "התקבל" with no stock update — now it **confirms** first (cancel → set distribution).
- **Hardening (07-orders.js):** requirement-fulfillment no longer re-POSTs when re-saving an already-delivered
  order; delivery movements skip blank product names (no orphan movement rows).
- **Deferred (design, needs schema):** `ems_task_id` link between an order/visit and its EMS task (so closing a
  task reconciles the visit/order) — tracked, needs a DB column + SQL run. The acknowledged `ponytail:`
  shortcuts (last-writer-wins cache sync, per-browser flush dedup) are intentional, rare + reversible — left as-is.

## [tooling] 2026-06-28 — version-stamp scheme
- **New versioning in `build.mjs` (`nextVersion`).** The `·N` counter runs to **·100**; the build after that
  **rolls to `1.01`** and the minor auto-increments each build (`1.01 → 1.02 …`). A **big, sweeping update**
  bumps the major via **`node build.mjs major`** (→ `2.00`); the whole `·NN` + `1.xx` history is "major 1".
  `test-version.mjs` guards it. (Per request — recorded in `docs/operations.md` → Versioning.)

## [·97] 2026-06-28
### Fixed — dev page (פיתוח): sprint board now places cards by their OWN status (push actually moves them)
- **Symptom (reported):** pushing tickets to a sprint "felt broken" and the cards looked wrong.
- **Root cause:** the status board (`devBoard`) bucketed **only roots** by stage and rendered each root's
  **whole subtree nested** under that one column (·92 tree-nesting). So a **child** pushed to "ספרינט קרוב"
  changed its GitHub Status but stayed drawn under its parent's column → looked like the push did nothing.
  And the column count showed **root count** while rendering all descendants (count ≠ cards shown).
- **Fix:** the board is now **per-ticket** — every ticket (parent or child) sits in the column matching its
  **own** `devStage`, rendered as a flat card. Pushes always relocate the card; column counts equal the cards
  shown; "בפיתוח עכשיו" reflects real per-ticket In-Progress. The full אב→בנים tree still lives in the
  **"לפי נושא"** view. Because cards are flat, each is **directly selectable** in בחר-משימות — the parent-cascade
  (`devCascadeParents`) is gone, which also removes its bug (moving all children could **demote** an
  In-Progress/Done epic back to Ready). `test-devboard.mjs` guards per-ticket placement + counts.
- **Docs:** corrected the `github` fn header — Status **writes** need the full `project` scope, not `read:project`
  (comment only; no function redeploy needed).

## [·96] 2026-06-28
### Fixed — inventory: order/requirement details wiped on status change (DATA LOSS bug)
- **Symptom (reported):** עמיחי created a supplier order (700 לנדיס תלת + 100 חד) — it saved fine, but after
  approval + pushing it through statuses, **all its items vanished**.
- **Root cause:** the `order` (and `requirement`) Supabase write builder in `01-data.js` always emitted a
  **full row with empty defaults** (`items: b.items || []`, `supplier: ''`, `notes: ''`, `distribution: {}`),
  and `sbUpsert` is a full-row merge-upsert. So a **status-only** POST (`{type:'order', id, status}`) — exactly
  what `approveSupplierOrder` / `quickOrderStatus` / `approveCustomerOrder` send — rebuilt the whole row and
  overwrote `items` with `[]`. The customer flow hit the same bug on `requirements` (`in_progress`/`fulfilled`
  by-id updates wiped items/kibbutz).
- **Fix:** order + requirement writes are now **partial-safe** (`writeOrder`/`writeRequirement`): a NEW record
  (no id) inserts the full row as before; an UPDATE (id present) **PATCHes only the fields actually sent** via a
  new `sbPatch` helper, leaving untouched columns intact. Pure mappers `orderUpdateRow`/`reqUpdateRow` +
  `test-order-patch.mjs` (status-only body must not carry `items`). The old full-row `W.order`/`W.requirement`
  builders were removed.
- **⚠️ Pre-existing data:** orders already wiped before this build are not recovered — items must be re-entered.

## [·95] 2026-06-25
### Added — inventory: approved-order notifications (אביאם · ניתאי · עמיחי)
- **When one of the group approves an order, the others get notified.** On their next app-open they see a
  **"🔔 N הזמנות חדשות אושרו"** modal listing each order (ספק/לקוח · מספק/לקיבוץ · qty) with a **📦 הצג הזמנות**
  button → the inventory orders list. e.g. עמיחי approves → אביאם + ניתאי notified; אביאם approves → ניתאי + עמיחי.
- **Lazy / no schema change.** A per-user "seen" set in `localStorage` (`orders_notif_seen_<user>`); the approver
  marks the order seen on approval (no self-notify); the creator is excluded; first run seeds the set so it never
  floods on rollout. Fires from the post-data-load hook (`maybeShowOrderNotifications` in `07-orders.js`,
  alongside the attendance/עמיחי nudges). Verified: plural/singular title, creator-excluded, no-repeat-once-seen.

## [·92] 2026-06-25
### Fixed — dev page: restored tree hierarchy in the status board + tree-aware selection (פיתוח)
- **Hierarchy back in the board.** The status board flattened everything into a per-status list (lost אב→בנים).
  Now it groups each top-level **task-tree by its root's stage** and renders the **full subtree nested**
  (`devBoard` → `devMobileNodes`): epic = thin label + count, children nested beneath. (`.dev-mepic*` CSS moved
  global so nesting renders on desktop too, not just mobile.)
- **Selection is tree-aware.** In "בחר משימות", checkboxes appear **only on child/leaf tasks** — a parent (אב) with
  children is not directly selectable (only via its children). A parent with no children is itself a leaf → selectable.
- **Move-all-children → moves the parent.** `devCascadeParents`: when every child of a parent is in the selection,
  the parent is added to the move too (cascades up the whole tree), so pushing all of a sub-topic's tasks advances
  the entire epic. Self-tested.

## [·91] 2026-06-25
### Changed — inventory
- **Orders actions column** header → **"פעולות על ההזמנה — שנה סטטוס ל:"**, and the column's cells (and header)
  are now **left-aligned** so the status buttons line up to the left edge.

## [·89] 2026-06-25
### Changed — dev page (פיתוח)
- **Button renamed** "🟢 דחוף ל-Ready" → **"🟢 העבר משימות לספרינט הקרוב"** (loading "⏳ מעביר…").
- **Detailed write errors now live** — when a push fails, the toast/alert lists `#num — <reason>` + the project's
  actual Status option names (was just a count). Shipped to surface why דחוף-ל-Ready returns `0 · נכשלו:1`.

## [·87] 2026-06-25
### Fixed — dev page: sprint writes robustness (פיתוח) [needs `github` fn redeploy]
- **דחוף ל-Ready returned `0 · נכשלו:1`.** Two hardenings in `github` fn `setProjectStatus`:
  - **Synonym option-matching** — the target ("Ready"/"Committed") now matches the project's actual Status option
    by keyword (English **or** Hebrew), so e.g. `Ready` hits a column named `ספרינט קרוב`/`מוכן` and `Committed`
    hits `עלה לאוויר`. (The board already read Hebrew statuses; only the write was literal-matching.)
  - **Auto-add to the board** — if a selected ticket is a backlog repo-issue **not yet a Project item**, the fn now
    fetches its node id and `addProjectV2ItemById` before setting Status (so pushing from backlog just works).
- **Client surfaces the real reason** — on any failure the toast/alert now lists `#num — <error>` + the project's
  actual Status option names (was just a count). **Needs the `github` function redeployed.**

## [·86] 2026-06-25 — sprint board LIVE (merged from feat/dev-sprint-board)
### Added — dev page: sprint board (פיתוח)
- **Status board** — new default "לפי סטטוס" view: 6 named columns — **ממתין לפיתוח** (Backlog) · **ספרינט קרוב**
  (Ready) · **בפיתוח עכשיו** (In Progress) · **בשלבי בדיקות** (In Review) · **גמר פיתוח ממתין לגרסה** (Done) ·
  **עלה לאוויר** (Committed) — each listing its tickets with assignee, sorted by priority. `devStage()` maps the
  Projects-v2 Status → column; Backlog/Done/Committed start collapsed. View toggle "לפי סטטוס / לפי נושא"
  (topic tree still available); priority filters + search work over the board.
- **Sprint writes** — "☑️ בחר משימות" multi-select (checkbox per card) + a sticky bar → **🟢 דחוף ל-Ready**;
  and **🚀 עלתה גרסה** moves everything in גמר פיתוח (Done) → עלה לאוויר (Committed). Via the `github` fn
  `mode:"setStatus"` (`setProjectStatus()` resolves project/Status-field/option ids → `updateProjectV2ItemFieldValue`).
  EMS-gated; needs the `GH_TOKEN` Projects-v2 write scope + a **Committed** Status option (added in the Roadmap project).
- **Status-entry day-stamps** — tiny gray `Backlog 1.6 · Ready 5.6 · …` chain per card, fed by the Supabase
  `dev_status_log` table (forward-tracking, day granularity; `db/dev_status_log.sql`). The shared task card
  (`.dev-mtask`) now serves the board + the mobile tree.

## [·82] 2026-06-25
### Changed — dev page access (פיתוח)
- **אליה (developer) can now see the פיתוח page too**, alongside מתניה + עידן + עמיחי. Names are inlined in
  `canSeeDevTasks()` (no module-level `var` — the gate runs during nav init, before a hoisted var would be
  assigned). Field staff (אביאם/ניתאי) + anon still excluded (verified: אליה/מתניה/עמיחי/עידן true, others false).

## [·81] 2026-06-25
### Changed — dev page access (פיתוח)
- **מתניה (the developer) can now see the פיתוח page.** `canSeeDevTasks()` now allows מתניה in addition to
  עידן + עמיחי (via `canManageStaff`). One gate covers the nav tab, the page guard, and the render. Field
  staff (אביאם/ניתאי) and anon still can't see it (verified).

## [·80] 2026-06-25
### Removed — dev page (פיתוח)
- **Dropped the bottom "פתח ב-GitHub ↗" link** from the task detail (desktop tree + mobile card). The task
  row already has the GitHub icon button, so the footer link was redundant.

## [·79] 2026-06-25
### Changed — dev page: fetch once per connection (פיתוח)
- **The GitHub fetch now runs once per session, not on every page open.** Tickets download once and are
  cached; opening פיתוח again in the same session reuses the cache (instant, no fetch). Since a successful
  EMS connect always triggers `location.reload()`, "once per session" == "refreshed on each connection".
  The 🔄 button (and the retry buttons) still force an immediate fresh fetch. (`window._devFetched` per state.)

## [·78] 2026-06-24
### Changed — dev page: simpler mobile tree (פיתוח, ≤768px)
- **Mobile gets a flattened, card-based tree** (desktop tree unchanged). A topic opens straight to its tasks
  as clean, color-coded **cards** — priority-colored edge + soft fill, title on its own line, a compact meta line
  (status · `#num` · assignee), GitHub icon at the row end; one tap opens the detail.
- **Generic parent (אב) cards are gone.** An epic collapses to a thin **label + "N תת-משימות"** (with a GitHub
  link) — you read past it instead of tapping a generic container card; its sub-tasks list directly beneath.
- **Topic header shows the critical count** ("N קריטי") so urgency is visible before opening.
- `devMobileNodes`/`devMobileCard` render the mobile path (picked at paint via `matchMedia`); `devFilter` now
  matches both desktop (`.dev-task`) and mobile (`.dev-mtask`) via `[data-s]`, so search works on both.

## [·77] 2026-06-24
### Added — dev page: offline ticket cache (פיתוח)
- **Tickets now persist in `localStorage`** (`dev_tasks_cache_v1`, keyed by open/all) so the פיתוח page
  **paints instantly from cache** — even before EMS login (a returning עידן keeps access via the persisted
  `dashboard_user_v1`/role, independent of the EMS token). No more waiting for a full GitHub fetch every time.
- **Refresh-on-connect:** when an EMS token is present the page still fetches in the background and repaints
  when it returns; the cache is updated. A status line shows **"📦 נשמר מקומית · עודכן <מתי> · מרענן…"**, and a
  failed refresh keeps the cached view (flagged "רענון נכשל") instead of erroring out.
- Refactor: `devBuild(tasks)` (tasks → `_devData`+hierarchy) is shared by the cache paint and the live fetch;
  the active filter now survives a background refresh (only `devSetState` resets it).

## [·75] 2026-06-24
### Changed — dev page: priority-colored branches (פיתוח)
- **Four distinct priority colors** (was: קריטי and גבוהה shared one color, confusing). קריטי=**red** `#dc2626` ·
  גבוהה=**dark-orange** `#e8590c` · בינונית=**dark-yellow** `#a16207` · נמוכה=**blue** `#2563eb` — applied to the
  priority chips, the "עומס לפי עדיפות" hero tiles, AND each task row. `devPriority` now returns a `crit` tier of
  its own (new `.dev-pr-crit`).
- **Prioritized task = colored card.** A task with a priority gets a tinted row (soft fill + high-contrast dark
  text, never the blue accent) inside a same-color **frame that wraps the task and all its sub-issues**. Children
  sit on a lighter shade of the branch color, indented a touch more, with a `↲` branch arrow. Nested prioritized
  tasks get a colored spine only (no boxes-inside-boxes). Hover darkens the tint instead of flashing blue.

## [·76] 2026-06-24
### Changed — EMS re-login UX
- **Open the app disconnected → prompt re-login.** If you're signed in but the EMS connection is gone, on open
  the "🔌 החיבור ל-EMS נותק — התחבר מחדש" modal now pops automatically and leads you to the EMS sign-in.
- **After a successful sign-in → hard refresh.** Previously you landed back on the page but the UI still showed
  disconnected until a manual reload. Now login (gate **and** the EMS-page/bubble flow) does
  `await emsOnConnected()` (flush queued writes + sync) then `location.reload()`, so the connected state (🟢 bubble,
  data, Supabase pass) updates immediately. The page you were on is preserved across the reload via
  `sessionStorage` and restored on load (else home).

## [·74] 2026-06-24
### Changed — EMS session & navigation
- **EMS tab hidden for everyone** — the EMS system is reached only via the header bubble link / the re-login flow
  (`navEms` always `display:none`). `showPage('ems')` still works for the login form.
- **Connection stays alive on-page** — the client session cap was a self-imposed 60 min; raised to **12h**
  (bubble threshold matched). A *real* EMS-token expiry is now caught lazily on the next call (401), not by a
  proactive 60-min logout.
- **Disconnect → re-login modal → return to last page.** On a 401 (or the 12h cap), a modal **"🔌 החיבור ל-EMS
  נותק — התחבר מחדש"** pops; its button opens the EMS sign-in (the universal login gate). After a successful
  sign-in the app returns you to the **page you were on** (`window._currentPage`), or the home page if none.
  (`emsRequireLogin()` in `12-reports.js`; redirect wired into the gate's `onAuthed`.)

## [·73] 2026-06-24
### Added — new-version watcher (`19-version-check.js`)
- The app now **detects a new deploy** (polls the live `index.html` `app.js?v=` stamp every 2 min + on tab focus):
  - **Active user** → non-blocking top banner **"🔄 עלתה גרסה חדשה — רענן עכשיו"** (reload keeps them logged in).
  - **Idle ≥5 min or hidden tab** → **auto-reload** onto the new version.
- Reload only — login persists (EMS token in localStorage is never cleared). Per עידן's choice (reload, not full logout).
- Note: only protects users already on ·73+. Current ·72 users get it from their next load onward.

## [·72] 2026-06-24
### Changed
- **Parse-source badge moved inline** to the end of the "📦 פריטים בהזמנה:" label (was on its own line under the
  parse button — easy to miss on desktop). Same Gemini/Groq/Offline icon + model.
- **AI parsing verified live end-to-end** (עידן, connected to EMS on dev): free-text → correct base items,
  conversational accessory questions, and the source badge showing the real provider.

## [·71] 2026-06-24
### Added
- **Persistent parse-source badge** below the "נתח לפריטים" button (`#invParseSource`): a **Gemini** spark icon,
  a **Groq** mark, or an **Offline 📴** pill — each with the model name (e.g. `Gemini · gemini-2.5-flash-lite`).
  Replaces relying on the transient toast (which was easy to miss on desktop). Cleared when a new order opens.

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
