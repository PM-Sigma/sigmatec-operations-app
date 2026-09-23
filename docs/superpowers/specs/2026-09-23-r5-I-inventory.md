# Package I · Inventory rewrite (06 · 07 · 08 + the UI of 20): spec and implementation plan

STATUS: 🟡 OPEN, NOT built. Planning only (23.9.26, branch `r9/plan-PD`). Resume: start with Task L1a. The L tasks
can start now. The U tasks wait for the gate in §3.4 (Phase 2 components merged and PASSed, and package S merged).

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy inventory page (`js/src/06-products.js`, `07-orders.js`, `08-inventory.js` and the UI half
of `20-delivery-cert.js`) with React screens on the round 5 design system. All stock, order and certificate rules
move into one tested home, `app/src/lib/inventory.ts`. Every legacy caller keeps working at every commit, and the
customer `?cert=` view and the certificate PDF keep working throughout.

**Architecture:** two lanes.
- **L = logic and data.** Starts now. The rules are pure TS in `app/src/lib/inventory.ts`. Goldens recorded from
  **today's legacy code** lock today's numbers. `build.mjs` compiles the same file into the legacy bundle as
  `window.SigmaInv`, so the legacy files delegate to it and there is one copy of each rule. A SECURITY DEFINER RPC
  pair implements the ruled item delete. `app/src/lib/inventoryApi.ts` is the React data layer.
- **U = screens.** Starts after the designer's PASS. The screens are React islands behind one flag (`INV_REACT`). A
  Playwright suite written against the **old** UI first, through a two-driver page object, has to pass on both UIs.
  Then comes the cutover (flag on), and after that the deletion.

**Tech stack:** React 18 + TanStack Query + supabase-js (existing `app/`), Vite lazy chunks, esbuild (already in
`build.mjs`), vitest, node legacy runners (`test-*.mjs`), Playwright (4 projects), Postgres plpgsql on Supabase.

**Spec inputs (binding):** `docs/superpowers/specs/2026-09-23-round-5-design.md` (package I and the rulings),
`2026-09-17-unified-inventory-design.md`, `2026-09-23-design-system-design.md`, `docs/design/tools-and-motion.md`,
`docs/ops-graph/graphify-out/RETIREMENT_MAP.md` (finding #2 and the two inventory sections).

## Global constraints

- **Tab order (ruling):** הזמנות · מלאי חברה · תעודות משלוח · מלאי בקיבוצים · החזרות · פריטים. The first tab is the default.
- **Delete item (ruling):** a real delete of the item **and its movements, order lines and cert lines**. Text summaries
  stay. A confirmation screen lists what goes before anything is deleted. This spec extends the list in §6, and D1–D4
  are open for עידן's yes.
- **No draft item on close:** closing the product sheet never writes a row.
- **The "➕ הוסף לקטלוג" path inside an order is removed** (`07-orders.js:1156-1176`).
- **SIM is already out:** no auto-add, no low-stock rule, and the items are archived. Nothing here may bring SIM back.
- **Breakpoint is done:** stock is computed from `public.movements` only, which starts at `reason='opening_balance'`.
  `archive.movements_pre_breakpoint` is never read.
- **Boot bundle:** `ui/sigma.js` < 303 kB (`test-sigma-shell.mjs`), with about 150 B of headroom. Every new island is
  a lazy chunk, and nothing in this package is imported from `main.tsx` statically.
- **Copy:** noun-form, gender-neutral buttons (שמירה, אישור, ביטול, מחיקה…). No `!`, no emoji in UI strings (lucide
  icons instead), ״ and ׳ instead of `"`/`'`, and Hebrew `aria-label`s. Gate: `test-copy-rules.mjs` plus a humanizer read.
- **Design:** only `--s-*` tokens, `absolute` only in the 3 allowed places, logical properties, one Sheet plus one
  ConfirmSheet at most, Toast with a 5 s undo, and the motion tokens from `tools-and-motion.md` §2.1 only.
- **Viewer:** reads everything, writes nothing, and keeps Excel. מתניה has no inventory page (`00-bridge.js:230`).
- **Never modify another repo.** Commit on a `feat/inventory-*` branch cut from `dev`, and only the files this package
  owns (§4).
- **Production side effects** (the SQL migration) wait for עידן's explicit "כן". The SQL test runs **only on a Supabase
  branch**, because the `delivery_certs` number sequence is not transactional.

## Review focus

1. **Editing an order that is still `pending_approval` wipes its status.** The legacy status `<select>` has no
   `pending_approval` option, so saving writes `status:''` and the order can never be approved again (O18b). The React
   sheet has to keep the status. Test: `inventory.test.ts › orderSavePlan keeps pending_approval on edit`.
2. **Opening an `arrived` order and pressing שמירה delivers it and posts stock** (O18a). The legacy dropdown maps
   arrived to delivered. Test: `orderSavePlan does not deliver an arrived order that was saved unchanged` and PW-F09.
3. **"נכנס למלאי" (quick arrived → delivered) credits no stock today** (O4). After the fix it posts `ספק → חברה`
   exactly once, even on a double tap or when the edit sheet already posted it. Tests: `orderStatusPlan posts
   delivery rows once` and PW-F08.
4. **Deleting a product that appears in a visit, a cancelled cert and a half-used order.** The confirmation must list
   each one, visit summaries stay, an emptied cert or order is listed as "נמחק כולו", and a second tab that changed the
   data in between aborts the delete. Tests: `db/tests/inventory_delete_product.test.sql`, PW-F15.
5. **A certificate issued offline** (the insert fails) still opens as an unnumbered draft, does not reach the
   registry, and never marks the visit's cert gate. Test: `inventoryApi.test.ts › issueCert without a number` and PW-F17.

---

## 1. Scope

**In:**
- The React rewrite of every screen and popup that `06-products.js`, `07-orders.js`, `08-inventory.js` and the UI part
  of `20-delivery-cert.js` render.
- The returns tab. It is rendered today by `05-meeting-returns.js:82-174`, and its functions are deleted here in U10.
- The inventory block of `index.html` (`337-460`) and its modals (`111-132`, `894-925`, `987-1075`, `1114-1148`).
- Moving every rule into `lib/inventory.ts`.
- The delete RPC.
- The bug fixes listed as **F** in §2, each with a golden that records the old value and asserts the fixed one.

**Out (other packages own it):**
- The visit form, the voice modal and `onVisitorChange`'s call sites (**V**).
- The home screen and its low-stock banner, `InventoryStrip.tsx`, `StockChange.tsx` and `Alerts.tsx` (**R** gives
  them the design pass; I embeds `InventoryStrip` and dispatches `StockChange`'s event unchanged).
- Ctrl+K search in `11-search-login.js` (**X**).
- The header (**S**).
- `03-requirements.js` (dead UI, kept as is).
- `21-excel-export.js` builders (kept; I calls them).

**Stays working unchanged at every step:**
- The customer view `?cert=<uuid>` (`20-delivery-cert.js:438-476`).
- `certDocHtml` output, byte for byte, apart from the year stamp in the footer.
- `certIssuedForVisit` (the visit gate).
- `issueDeliveryCert`'s persistence contract.
- The Drive archive `doc_html` patch.

---

## 2. Behaviour inventory (graph + code)

Sources:
- `RETIREMENT_MAP.md`: 109 nodes in 06/07/08 with 94 code dependencies, and 30 UI nodes in 20 with 28 dependencies.
- A full read of the four files, their `index.html` markup, `05-meeting-returns.js:82-174` and `02-init-attendance.js:324-339`.

**Disposition key:**
- **K**: kept as is.
- **F**: fixed (the old value is recorded in a golden, the new one asserted).
- **R**: changed by a round 5 ruling.
- **D**: dropped because it's dead. No caller was found by grep over `js/src`, `app/src` and `index.html`, and
  dropping it needs the ack in §9.
- **C**: copy rewritten to the copy gate, same meaning.
- **→X**: owned by another package.

"Home" names the lib function (L) or the screen (U).

### 2.1 Products (`06-products.js`, `index.html:1114-1148`)

| ID | Behaviour today | Disp | Home |
|---|---|---|---|
| P1 | `getActiveProducts()`: active rows from `SHEET_DATA.products`; an **empty** catalog falls back to `PRODUCT_LIST` (09) as `{name,active:true,category:''}` | K | `activeProducts()` |
| P2 | List sorted by name (he collation). Columns: technical name, category (— when empty), active, report name (— when empty or the same as the name), "תצוגה בדוח", then ערוך and השבת/הפעל | K C | ProductsTab ListRow |
| P3 | Empty catalog text ("אין פריטים בגיליון עדיין…") | C | EmptyState |
| P4 | Loading placeholder until `dataLoaded` ("⏳ טוען נתונים מהגיליון…", stale Sheet copy) | C | Skeleton rules (tools §2.2.9) |
| P5 | Wiring status "🔗 מחובר למחולל הדוחות ✓" or red: every **active** product has a non-empty `display_name` | K C | `reportWiringOk()` + Tag |
| P6 | `productLabel(p,{forReport,role})` gives `display_name` for a report or a viewer role when it's set and trimmed, else `name`. A string argument gives the name | K | `productLabel()` (existing `productLabel.ts`, re-exported) |
| P7 | `reportPreview(p)` = `productLabel(p,{forReport:true})` per row | K | same |
| P8 | New product: edit permission (a viewer gets an alert), blank fields, active ticked | K C | ProductSheet |
| P9 | Edit product: fields filled; the report-name field is blank when it equals the name | K | ProductSheet |
| P10 | The report-name field is disabled unless `isIdan()`, with tooltip "עריכת שם לדוחות זמינה לעידן בלבד" | K C | `canEditDisplayName()` |
| P11 | Save: name required; body `{name,category,active}`; `display_name` only from עידן (`dn‖name`); refresh after 1 s | K | `productSavePlan()` |
| P12 | Active toggle: a pending label on the button, error + retry, refresh | K C | ProductsTab row action |
| P13 | **Bug:** the toggle posts `{type:'product',id,active}` through `W.product`, a *full-row* upsert, so it **blanks `name`, `category`, `created_at` and `created_by`** (`01-data.js:614`). This is a likely source of the nameless "empty item" עידן saw | F | PATCH `{active}` only |
| P14 | **Bug:** `readSnapshot` drops `display_name/min_qty/unit` (`01-data.js:595`) and `W.product` never writes `display_name`. Legacy `productLabel` callers (20, 21) therefore always print technical names, and עידן's report-name edits are lost | F | `01-data.js` read mapping + React writes |
| P15 | Category options `'' מונה בקר סים כרטיס תקשורת משנ״ז אחר`. `STOCK_CATEGORY_ORDER` spells `משנ"ז` with ASCII `"`, so a modal-set `משנ״ז` sorts into the "unknown" bucket | F | one spelling `משנ״ז`, with both accepted when sorting |
| P16 | Renaming the technical name leaves movements and lines on the old name, so stock splits | K (D12) | rename warning line only |
| P17 | There is no delete today | R | §6 delete + ConfirmSheet |
| P18 | SIM items are archived (`active=false`) and never offered | K | `activeProducts()` |

### 2.2 Stock, kibbutz stock, returns (`08-inventory.js`, `05:82-174`, `02:324-339`)

| ID | Behaviour today | Disp | Home |
|---|---|---|---|
| S1 | `computeStock()`: net per location. `from` subtracts and `to` adds; a blank product or location is skipped; qty `parseFloat‖0`; product names are **not trimmed**; zero cells are kept | K | `stockByLocation()` (aligned: no trim) |
| S2 | `poolStockMap()`: חברה only, with zero nets dropped | K | `poolStock()` (aligned: no trim) |
| S3 | `METER_RULES` (5 rules: 360PP 15, 360SP 15, 360CT 15, E570 10, PM135 5). `lowStockReport`: pool products that **start with "מונה"** and contain `match` are summed per rule, and only `found && total<min` counts | K (D11) | `METER_RULES`, `lowStockReport()` |
| S4 | `renderLowStockAlert()`: for every user except אביאם/עמיחי, a red task line in `.company-task-group.orders ol`. For אביאם/עמיחי, a dismissible banner at the top of `#kibbutz-view`, removed when there are no lines | K →R | legacy shim (moved verbatim) over `lowStockLines()` |
| S5 | The sigmaBus `stock-changed` event re-renders the pool and the banner | K | island subscribes via `useSigmaEvent` |
| S6 | `openStockChangeSheet(p)` dispatches `sigma-open-stock-change`, with a 600 ms "עוד נטען" alert if StockChange isn't mounted | K →R | shim kept |
| S7 | Category order + `productCategoryMap` (default `אחר`, covers **all** products) + `sortByCategoryThenName` | K | same names in lib |
| S8 | Pool filter `''`/`'low'`; tapping the selected tile again clears it | K | StatTile `aria-pressed` |
| S9 | Pool KPIs: פריטים במאגר (count over the whole pool, clears the filter), יחידות (sum over the **shown** rows; it is tappable and clears the filter too), מלאי נמוך (count, filters). A 🔢 דווח שינוי button is hidden for the viewer | K | `poolView()`. יחידות becomes a plain tile (design rule: a non-filter tile isn't tappable). D-note |
| S10 | Low row = name starts with "מונה" and contains a low rule's match; red + 🔴; a negative qty gets the `neg` class | K C | `isLowItem()` + danger Tag |
| S11 | Pool list grouped by category labels; header "חברה · N יח׳ · M פריטים" (over the filtered rows) | K | `poolView().groups` |
| S12 | Empty texts: "אין פריטים מתחת לקו האדום." / "אין מלאי במאגר החברה." | K C | EmptyState |
| S13 | Kibbutz stock: locations = keys not in `NON_KIBBUTZ` ∪ legacy persons, non-empty. Phone (<768): an accordion per kibbutz (he sort, non-zero items, total, kibbutz skipped when empty, "אין נתונים"). Desktop: a matrix of products non-zero anywhere, with a total column. Empty "עדיין לא סופקו…" | K | `kibbutzCards()` / `kibbutzMatrix()`, container-query breakpoint |
| S14 | CSV pool: `['פריט','חברה']`, he-sorted, BOM, `"` escaped, `inventory_pool.csv` | K | `poolCsvRows()` + `csvText()` |
| S15 | CSV kibbutz: **every** product that appears at any kibbutz, including zero nets (unlike the matrix), plus a total; `inventory_by_kibbutz.csv` | K | `kibbutzCsvRows()` |
| S16 | Excel buttons (עידן + viewer): `xlExportStockXlsx`, `xlExportKibbutzXlsx` (21) | K | bridge `xlExport*` |
| S17 | `#sigma-inventory-strip` (orders strip + מינימום מלאי) inside the stock tab | K →R | `<InventoryStrip/>` embedded |
| S18 | Returns: date-desc list, "ממתינים להחלטה: N פריטים", status labels. For open rows: החזר למלאי (permission; qty>0; kibbutz known; confirm; idempotent on `return_restock`+refId; movement `<kibbutz> → חברה`; patch `restocked`) and תקול (confirm; pending label; patch `defective`). Empty text | K C | `restockPlan()` + ReturnsTab |
| S19 | Tabs: `invShowTab(t)` falls back to `orders` for an unknown tab. `renderInventory()` repaints all tabs on every 15 s poll and on resize; the certs tab fetches only while active | R K | Tabs (ruled order) + query cache (no repaint loop) |
| S20 | `renderInventory()` also calls `renderLowStockAlert()` | K | shim keeps the call |

### 2.3 Orders (`07-orders.js`, `index.html:111-132, 337-410, 987-1075`)

| ID | Behaviour today | Disp | Home |
|---|---|---|---|
| O1 | Statuses: `pending_approval pending in_transit stuck at_port arrived delivered supplied` (+ `cancelled`/`deleted` read-only) with labels | K C | `ORDER_STATUS_LABEL` (stale "טרם חולקה/וחולקה" dropped) |
| O2 | List: hides `deleted`. Filter: open (not `delivered/supplied/cancelled/deleted`) · all · one status. Sorted `createdAt` desc | K | `filterOrders()` |
| O3 | Row: date `expectedDate‖createdAt` + "סופק d.m"; type chip לקוח/ספק (+"10+"); for a customer the kibbutz plus an אחראי or ספק ישיר line, for a supplier the supplier; items and notes (escaped, expandable); נוצר ע״י | K C | OrdersTab ListRow + OrderSheet |
| O4 | Quick action (supplier only): pending→in_transit "הוזמן", in_transit→at_port "בנמל", at_port→arrived "התקבל", stuck→arrived, arrived→delivered "נכנס למלאי". It writes **status only**, so **no `ספק → חברה` movement** is posted: a bug | K + F (D6) | `quickAction()` + `orderStatusPlan()` |
| O5 | "סמן כתקוע": supplier, status not in `delivered supplied stuck pending_approval` | K | `canMarkStuck()` |
| O6 | `orderType`: the field, else notes ~ "בקשת לקוח" gives customer, else supplier | K | `orderType()` |
| O7 | `isDirectSupply`: customer ∧ `assignee==='ספק ישיר'` | K | `isDirectSupply()` |
| O8 | `orderKibbutz`: the field, then notes regex `בקשת לקוח — X`, then the linked requirement | K | `orderKibbutz(o, reqs)` |
| O9 | Approval: עמיחי approves anything; a customer order needs אביאם/ניתאי; a supplier order ≤10 needs אביאם; >10 needs עמיחי. **עידן can't approve.** Waiting texts. `canApproveOrders` = the group | K C | `canApproveThisOrder()`, `approvalWaitingMsg()` |
| O10 | `approveOrder(id)`: not found → alert; no permission → alert + the waiting text | K C | `approvalPlan().error` |
| O11 | Supplier approval: confirm, then `status:'pending'`, mark seen, track `order-approved`, push `approved`, toast, refresh | K C | `approvalPlan` kind `supplier` |
| O12 | Drop-ship approval: confirm, then `supplied`, linked unfulfilled requirements → `fulfilled`, seen, track, push, toast. No movement, no EMS | K C | kind `dropship` |
| O13 | Customer approval: responsible = `assignee‖me`; errors for no items / no kibbutz / **no EMS site** (`kibbutzHasSite`); confirm. Movements `חברה → kibbutz` `customer_supply` (skipped when already posted). EMS `createTask` "אספקת ציוד: X" with the exact `• name ×qty` description (a parser in 20 depends on it), live or queued, and `emsAfterWrite` when sent. Then `supplied`, requirements fulfilled, seen, push, and a toast that depends on queued. (No `track` here: kept.) Legacy posts one row per line, unmerged; lib merges same-named lines (net identical) | K | kind `customer` |
| O14 | עמיחי nudge: עמיחי only, once per session, lists `pending_approval ∧ needsAmichai` rows; "לאישור עכשיו" goes to inventory, "אחר כך" closes | K C | `amichaiPending()` + Nudges |
| O15 | Approved-order notice: group אביאם/ניתאי/עמיחי; a per-user localStorage seen set capped at 800 (key `orders_notif_seen_<user>`); the first run seeds and never floods; fresh = approved ∧ unseen ∧ not created by me; once per session; up to 10 rows + "+ עוד N"; "הצג הזמנות" | K C | `freshApprovedOrders()` + Nudges (same storage key) |
| O16 | New order: permission; date today; created-by = me; type toggle shown; supplier `<datalist>` from past orders; new orders are **always** `pending_approval` (status picker hidden, note shown) | K C | `distinctSuppliers()`, OrderSheet |
| O17 | Field visibility by type: supplier field (supplier, or customer+ספק ישיר); kibbutz (customer); אחראי picker (customer ∧ עידן/עמיחי) with options המאשר/אביאם/ניתאי/עמיחי/ספק ישיר; raw box on new orders only; status options by type | K | `orderFormFields()` |
| O18a | **Trap:** editing an `arrived` order shows "delivered" in the dropdown, so saving it unchanged **delivers it and posts stock** | F (D7) | `editStatusOptions()` keeps `arrived` |
| O18b | **Bug:** editing a `pending_approval` order leaves the select with no matching option (`value=''`), so saving writes `status:''` and the order drops out of approval forever | F | `orderSavePlan()` keeps the status; no picker while pending approval |
| O19 | "✅ אשר ואספק" inside the edit sheet (`pending_approval ∧ canApprove`). Today it closes the sheet **before** the confirm answer | F | ConfirmSheet over the sheet |
| O20 | Items editor: a select over the unique active catalog; a stock badge = pool qty (blue >0, red ≤0); a not-in-catalog row with ⚠️ and its own option; qty; remove; "choose" rows (power supply) as buttons with `psLabel` | K C | OrderSheet ItemRow |
| O21 | Add row: the first active product, else "מונה 360PP" | K | `newItemRow()` |
| O22 | AI parse: raw required; busy label; `parse-order` edge fn with the EMS token, 15 s abort, 401 → `emsRequireLogin`; items with qty>0; else the local parser; source badge Gemini/Groq/Offline + toast; nothing found → alert; merged into non-auto rows | K C | `inventoryApi.parseOrderText()` + `orderParse.ts` |
| O23 | Local parser rules (aliases, the leading-number qty, model-number guard, the E360PP default meter and its anchors, מונה משנ״ז → E360CT, PM135 over EM133, the EM133-משנ״ז variant, dedupe) | K | `parseLocalToItems()` (goldens recorded from the old one) |
| O24 | Customer accessories: strip auto rows; one controller per non-Landis meter (chosen when ≥2 exist, with a stock hint); antenna = controllers; power supply = controllers (chosen) | K C | `accessoryPlan()` + `accessoryQuestions()` |
| O25 | `askChoice` modal ("the app asks, you tap"), with progress text | K C | a choice step inside OrderSheet (not a 2nd popup) |
| O26 | Ambiguous "סאטק" (no model given): ask EM133 or PM135 | K C | `ambiguousSatecQuestion()` |
| O27 | Save: ≥1 item; unresolved choose rows block; created-by required on new; kibbutz required on a new customer order. Non-catalog lines: "הוסף לקטלוג" / "הסר" | K · **R** | only "הסרת השורות" (D8) |
| O28 | Save body; raw appended to notes `📥 דרישת לקוח גולמית:` (stored data, kept verbatim); `kibbutz` for customer; `assignee` only when set; push `pending` for new; a learn row in `parse_corrections` (base items only, no auto rows); delivered transition (`delivered ∧ orig≠delivered ∧ not posted`) posts `ספק → חברה` with `parseInt` qty + `stock-changed`; requirement links (imported ones → in_progress/fulfilled; on a fresh delivery the linked ones → fulfilled) | K | `orderSavePlan()` |
| O29 | `invToggleDistribution` no-op; `orders.distribution` column kept, never written | K | dropped function, column kept |
| O30 | Intake modal (`openIntake…intakeSave`, `index.html:894-925`): no caller opens it | D (D10) | none |
| O31 | `importOpenRequirements`: no caller | D (D10) | none |
| O32 | Voice modal (`openVoice…applyVoiceResult`): target is the legacy visit form, button `display:none` | →V | moved into the compat file until V deletes the form (U10 step 3) |
| O33 | `onVisitorChange` (visit form) | →V | moved verbatim into the compat file |
| O34 | Bridge: `sigma.openOrder → invEditOrder`, `sigma.markOrderDelivered → quickOrderStatus(id,'delivered')` | K | shims → React OrderSheet / `orderStatusPlan` |
| O35 | Push deep link `?pushact=approve&oid=` → `approveOrder(oid)` (22) | K | shim → approval ConfirmSheet |
| O36 | Ctrl+K result → `goToInventoryTab('orders')` + `invEditOrder` (11) | →X | shims keep working until X removes it |
| O37 | Activity report reads `orderType/orderKibbutz` (10) | K | shims |
| O38 | Alerts bell and InventoryStrip tap → `sigma.openOrder` | K | shim |
| O39 | Static "📐 זרימת הזמנה" help card (5 steps; stale "חולק למיקומים") | D (D10) | none |
| O40 | Filter option texts (stale "טרם חולקה", "סופקה וחולקה") | C | FilterChips from `ORDER_STATUS_LABEL` |

### 2.4 Delivery certificates, UI half (`20-delivery-cert.js:41-311, 479-1034`, `index.html:347-370`)

| ID | Behaviour today | Disp | Home |
|---|---|---|---|
| C1 | Cert editor fields: customer name, ח.פ., address, contact, date; signature button + status; item rows (datalist = active catalog, else `PRODUCT_LIST`); add row; notes ("למשל: לא לחיוב"); ביטול / תצוגה מקדימה / הפקה | K C | CertSheet |
| C2 | `openDeliveryCert(pre)`: resets the signature and `reissueOf`. The customer comes from `pre.customer`, else `kibbutz_details` (cached per session, `{}` on failure); name = legal_name‖kibbutz; address = address‖kibbutz; contact = pre‖details; date = pre‖today; items, or one blank row; carries kibbutz/source/refId/noPrint | K | `certPrefill()` + CertSheet |
| C3 | Signature pad: name prefilled from the signature or the contact; DPR-scaled canvas; pointer drawing; clear; confirm needs ink; status "נחתם ע״י…/לא נחתם…" + remove | K C | CertSignature (inside CertSheet, pushed view) |
| C4 | Collect: lines with name ∧ qty>0; kibbutz = carried‖customer name | K | `certCollect()` |
| C5 | Issue: viewer blocked; items required; customer name required. The print window opens **synchronously** on the tap (popup blockers), except `noPrint`; a blocked popup gets an alert. Insert → number/id; failure → an unnumbered draft; visit cache + `paintVisitCertStatus`; a `doc_html` snapshot patch; print window or overlay; a reissue auto-cancels the old cert (cache fixed); source `ems` gets an EMS comment with the view link; registry unshift; `track('cert-issued')`; close; the send sheet (not with noPrint); toast variants | K C | `inventoryApi.issueCert()` + CertSheet |
| C6 | `certIssuedForVisit(visitId)`: cache, then the DB (active, newest) | K | pipeline, stays in `20-delivery-cert.js` |
| C7 | `certViewUrl`: canonical live base | K | lib `certViewUrl()` |
| C8 | `certDocHtml(cert,{screen})`: the printed document | K | `certDoc.ts` (byte-identical golden) |
| C9 | `?cert=` route + `certFetchRow` (RPC `cert_by_id`, one legacy fallback) | K | stays in 20, calls `SigmaInv.certDocHtml` |
| C10 | Overlay: print · שלח (when there's an id) · דרייב link (validated URL) · ✕ | K C | CertViewer |
| C11 | `certItemsForView`: a viewer sees display names in the in-app view only; print and reissue keep what was issued | K | `certItemsForView()` |
| C12 | View from the registry | K | CertViewer |
| C13 | Draft preview (no number) | K | CertSheet |
| C14 | Send panel: `site_contacts` (active, kibbutz, ordered role,name); `certSendPlan` (emailable, all selected, WhatsApp); a checkbox + WA link per row; an add-contact form opened when nobody is emailable (validates, inserts with the token, then mailto even when the insert fails); העתק קישור (toast); מייל לנבחרים (≥1) | K C | CertSend |
| C15 | `certRowForVisit / certSendForVisit / certDownloadForVisit` (visit summary buttons), with "עדיין לא נרשמה" | K | shims → React |
| C16 | Certs tab: range chips הכל · חודש נוכחי · חודש שעבר · 7 ימים · 30 ימים (single-select, the second tap returns to הכל); manual from/to clears the chips; first render = הכל; an empty from = the current month; fetch ordered by number desc; no repaint when the data is unchanged; search over kibbutz/customer/number; the viewer loses new/send/reissue/cancel; columns; cancelled rows faded + "→ N"; actions view · Drive · send · ✉️ · reissue · cancel; "N תעודות · M פעילות"; "לא זמין במצב הדגמה" without Supabase | K C | CertsTab + `certRange()`, `certSearch()` |
| C17 | ✉️ button: calls `certSendOpen` (the fallback `certSendByEmail` doesn't exist), so it's a duplicate of 📤 | D (D10) | one שליחה action |
| C18 | `certReprint`: no caller | D (D10) | none |
| C19 | Reissue: opens the editor with today, the customer snapshot, items, source/ref and `reissueOf` | K | `certReissuePrefill()` |
| C20 | Cancel: confirm "התעודה תישאר ברישום כמבוטלת…", pending label, patch `cancelled`, cache cleared, refresh | K C | ConfirmSheet |
| C21 | Prefill `certFromVisitForm` (reads the legacy form DOM), `certFromVisitObj`, `certFromVisit(id)` (bridge) | K →V | `certPrefillFromVisit()`; `certFromVisitForm` shim kept until V |
| C22 | `certFromEmsTask`, `certFromOrder`: no caller | D (D10) | none |
| C23 | Visits-report picker (`openVisitCertPicker`): the range + visitor from `#visitsReport*`, deduped, only visits with items, date desc, "🚚 הפק" | K C | CertPicker (the report modal keeps calling the name) |
| C24 | Range report PDF (`certRangeReport`, `certMonthlyFromTab`, and `certRangeReportRange` from the 21 hub): grouped by `certGroupName`; totals **exclude cancelled**; display names (`certReportLabel`); cancelled rows struck through; auto-print window | K | `certRangeGroups()` + `certRangeReportHtml()` |
| C25 | Excel from the tab (`xlExportCertsFromTab`) reads `#invCertsFrom/To` | K | the CertsTab calls `xlExportCerts(from,to)` via the bridge |

### 2.5 Global names that untouched callers still reach (the compat contract)

These must resolve at every commit. The graph's inbound edges and a grep agree on the list.

| Name | Callers | After U10 |
|---|---|---|
| `getActiveProducts` | 00-bridge (`products`, `productNames`), 03, 05, 09 | `06-inventory.js` → `SigmaInv.activeProducts` |
| `computeStock`, `productCategoryMap` | 09 (legacy form), 21 | shims |
| `poolStockMap` | 00-bridge (`poolStock`), 02 | shim |
| `orderType`, `orderKibbutz` | 10 | shims |
| `productLabel`, `reportWiringOk`, `reportPreview` (window) | 20 report, 21 | shims |
| `approveOrder` | 22 (push deep link) | shim → `sigma-inv-open {kind:'approve'}` |
| `invEditOrder`, `quickOrderStatus` | 00-bridge, 11 | shims |
| `maybeShowAmichaiApprovalReminder`, `maybeShowOrderNotifications` | 10 (`_refreshDataInner`) | shims → `{kind:'nudges'}` |
| `renderLowStockAlert` | 02, 10, the stock-changed listener | moved verbatim (→R) |
| `openStockChangeSheet` | legacy callers | moved verbatim |
| `onVisitorChange` (+ voice fns while `#voiceModal` exists) | 02, 05, 09, 00-bridge | moved verbatim (→V) |
| `invShowTab`, `renderInventory` | 02, 10, 11 | rewritten in 02 to dispatch |
| `openDeliveryCert`, `certFromVisitForm`, `certFromVisit`, `certSendOpen`, `certView`, `certSendForVisit`, `certDownloadForVisit`, `certRowForVisit`, `openVisitCertPicker`, `certRangeReport`, `certRangeReportRange` | Field.tsx (bridge), 09, 21, `index.html:1187-1188` | kept in 20 as shims → the React cert island |
| `certIssuedForVisit`, `certViewUrl`, `_certFetchRow` | 09, Field.tsx, tests | pipeline, unchanged |
| `invLoadingPlaceholder` | 03 | stays in 05 (not ours) |

**Inventory size:** 18 product + 20 stock + 41 order (O18 has a/b) + 25 certificate = **104 behaviours**, plus
**34 global names** in the compat contract.
- By disposition:
  - 7 F rows (P13 P14 P15 O4 O18a O18b O19).
  - 3 R rows (P17, O27, S19).
  - 6 D rows (O30 O31 O39 C17 C18 C22), covering 7 functions.
  - 7 hand-offs to V/R/X (S4 S6 S17 O32 O33 O36 C21).
  - The other 88 rows are K, most of them also C (copy).
- Nothing is dropped without a D row and the ack in §9.

---

## 3. Architecture

### 3.1 One home for the rules
- `app/src/lib/inventory.ts` is the **only import path** for inventory rules. It holds stock, products, low stock,
  kibbutz views, CSV, the order machine, approval and save plans, returns, cert rules and the delete-preview types.
- It re-exports two siblings that are split out for size only:
  - `orderParse.ts`: the local text parser and accessory questions.
  - `certDoc.ts`: the printed certificate and the range report HTML.
- It also re-exports the existing `productLabel.ts` and `certSend.ts`.
- `stockChange.ts`, `orderStrip.ts`, `alerts.ts` and `productSearch.ts` keep their own files (owned by R/S). They
  import constants from `inventory.ts` where they already do.

### 3.2 The legacy bundle gets the same code
`build.mjs` esbuild-bundles `app/src/lib/inventory.ts` as an IIFE, `globalName: 'SigmaInv'`, and prepends it to the
concatenated `js/src` source before minifying. Legacy code calls `SigmaInv.poolStock(…)` and so on.
- It is not in `ui/sigma.js`, so the 303 kB boot ceiling is untouched.
- `js/app.js` grows by about 20–25 kB minified until U10 deletes about 2,800 lines of legacy UI.
- Node legacy runners load it through `scripts/sigma-inv.mjs`.

### 3.3 Data
- The React screens read Supabase directly through TanStack Query (`inventoryApi.ts`, keys under `['inv', …]`). Reason:
  they need `display_name/min_qty/unit`, which the legacy snapshot drops.
- Writes go through `sbWrite` (auth re-mint, 15 s timeout, Hebrew login error). They use row mappers identical to
  `01-data.js` `writeOrder`/`W.movement`.
- After every write: `sigmaEmit('stock-changed')` + `sigma.refreshData()` (so the legacy `SHEET_DATA` readers catch
  up), then `queryClient.invalidateQueries({queryKey:['inv']})`.
- The islands also invalidate on `stock-changed` and on the legacy 15 s poll event, so a visit saved in legacy code
  shows up.

### 3.4 Flag, events, and the U gate
- **Flag:** `const INV_REACT = false` in `00-consts.js` + `invReact()` (localStorage `sigma-inv-react` = `'1'`/`'0'`
  overrides it, for QA only).
  - Legacy entry points check it on their first line and route to React when it is on.
  - U9 flips the default to `true`, and U10 removes the flag with the legacy code.
- **Events** (window `CustomEvent`, queued in `window.__sigmaInvQueue` until the island mounts, the same open latch as
  `StockChange.tsx`):
  - `sigma-inv-open` `{kind:'tab'|'order'|'new-order'|'approve'|'status'|'nudges'|'cert'|'cert-send'|'cert-view'|'cert-picker', id?, status?, tab?, pre?}`
  - `sigma-inventory-refresh`
- **Islands:**
  - `#sigma-inventory` (the page, lazy, inside `#inventory-view`).
  - `#sigma-cert` (always listening: the cert sheet/send/viewer/picker can be opened from any page, lazy but loaded
    at boot like `#sigma-stock-change`).
  - `#sigma-inventory-nudges` (lazy, loaded after the first data load).
- **U gate:** Phase 2 components (`AppHeader, PageActionRow, SectionBlock, BubbleButton, Tag, FilterChip, ListRow,
  Sheet, ConfirmSheet, Tabs, StatTile, EmptyState, Toast, Stack/Row/Cluster/Grid, Text`) are merged in
  `app/src/components/ui/` with the designer's PASS, and package S is merged. Each U screen then goes through the
  designer's sign-off protocol (`tools-and-motion.md` §4) before it merges.

---

## 4. File ownership

**Exclusive to package I** (no other package edits these while I is open):

| Path | Note |
|---|---|
| `app/src/lib/inventory.ts` (+ `.test.ts`), `orderParse.ts` (+test), `certDoc.ts` (+test), `inventoryApi.ts` (+test), `productLabel.ts`, `certSend.ts` | `productLabel/certSend` move from "shared" to I |
| `app/src/lib/__fixtures__/inventory/*` | goldens recorded from legacy code (synthetic data only; this repo is public) |
| `app/src/islands/Inventory.tsx`, `InventoryOrders.tsx`, `InventoryOrderSheet.tsx`, `InventoryStock.tsx`, `InventoryKibbutzim.tsx`, `InventoryReturns.tsx`, `InventoryProducts.tsx`, `InventoryProductSheet.tsx`, `InventoryCerts.tsx`, `InventoryCert.tsx` (sheet+signature+send+viewer+picker island), `InventoryNudges.tsx` | new |
| `js/src/06-products.js`, `07-orders.js`, `08-inventory.js`, `20-delivery-cert.js`, new `js/src/06-inventory.js` | 20 keeps its pipeline part |
| `db/inventory_delete_product.sql`, `db/tests/inventory_delete_product.test.sql` | new |
| `scripts/sigma-inv.mjs`, `scripts/inventory-goldens-record.mjs`, `scripts/inventory-golden-prod.mjs` | new |
| `qa/playwright/tests/inventory/*` | new (driver page objects + flow specs) |
| `test-inventory-parity.mjs` (new); migrated: `test-inventory-pool.mjs`, `test-autoadd.mjs`, `test-dropship.mjs`, `test-order-site-gate.mjs`, `test-cert-removals.mjs`, `test-delivery-cert.mjs`, `test-cert-pdf.mjs`; the inventory parts of `test-exports.mjs`, `test-order-patch.mjs`, `test-push.mjs`, `test-usage-track.mjs` | legacy runners |

**Shared files, claimed line ranges only** (touch nothing else in them):

| File | Claim | Task |
|---|---|---|
| `build.mjs` | the SigmaInv block before `esbuild.transformSync` | L6 |
| `index.html` | `337-460` (inventory-view), `111-132` (amichai + orderQ modals), `894-925` (intake), `987-1075` (order modal), `1114-1148` (product modal); new placeholders `#sigma-cert`, `#sigma-inventory-nudges` next to `#sigma-stock-change` (`1261`) | U1, U4, U7, U10 |
| `js/src/00-consts.js` | `INV_REACT` + `invReact()` | U1, U10 |
| `js/src/00-bridge.js` | one block after `refreshData` (`426`): `pushNotify`, `emsAfterWrite`, `xlExportStock`, `xlExportKibbutz`, `xlExportCerts`, `canExportExcel` | L8 |
| `app/src/bridge.ts` | the matching `Sigma` type fields | L8 |
| `js/src/01-data.js` | `readSnapshot` products mapping (`595`); the mock seam `...(window.__MOCK_EXTRA‖{})` after `emsQueue` (`355`) | L6, L1a |
| `js/src/02-init-attendance.js` | `invShowTab` + `renderInventory` (`324-339`) | U1 |
| `js/src/05-meeting-returns.js` | delete `invRenderReturns`, `returnToStock`, `markReturnDefective` (`82-174`) | U10 |
| `js/src/00-guard.js` | remove `intakeModal`, `invOrderModal`, `invProductModal` from `GUARDED_INPUT_MODALS` (`546-549`) | U10 |
| `app/src/main.tsx` | three lazy-mount blocks next to the StockChange/InventoryStrip blocks (`180-202`) | U1, U4, U7 |
| `qa/playwright/tests/_helpers.ts` | `installRoutes(page,{inventory:true})` stores + RPC stubs | L1a |
| `qa/playwright/tests/_fixtures.ts` | export `INVENTORY` | L1a |

**Read-only for I** (must keep working, never edited here):
- `03-requirements.js`, `09-visits.js`, `10-activity.js`, `11-search-login.js`, `21-excel-export.js`, `22-push.js`.
- `Field.tsx`, `Alerts.tsx`, `InventoryStrip.tsx`, `StockChange.tsx`, `alerts.ts`, `orderStrip.ts`, `stockChange.ts`,
  `productSearch.ts`.

**Coordination:**
- V owns the visit form and `#voiceModal`. U10 step 3 checks whether they are gone.
- X adds the per-person name claim. The RPC already honours a `name` claim if one is present (§6).
- R redoes the home banner, `renderLowStockAlert` (moved verbatim here).

---

## 5. Migration order (every step leaves every legacy caller working)

| Step | Tasks | State of the app after it | Why the callers still work |
|---|---|---|---|
| M0 | L1a–L1d | unchanged code; the old UI is covered by the flow suite | nothing touched |
| M1 | L2–L5 | the lib grows, the old code is unchanged, and the goldens from the old code pass on the lib | nothing touched |
| M2 | L6 | 06/07/08/20 internals delegate to `SigmaInv`; the UI is unchanged | same globals, same DOM; the flow suite + legacy runners are green |
| M3 | L7, L8 | the RPC is in the repo (applied after "כן"); the React data layer exists | not wired to any UI yet |
| M4 | U1–U7 | React screens behind `INV_REACT=false`; QA flips it per device | flag off = the old paths; the flow suite runs both drivers |
| M5 | U8, U9 | designer PASS; `INV_REACT=true`; the legacy UI is still present as the fallback | entry functions route to React; the old code is still there for one release |
| M6 | U10 | legacy UI deleted; `06-inventory.js` compat shims; 20 trimmed to the pipeline | the §2.5 names resolve to shims |
| M7 | (after V/R/X) | shims removed one by one as their callers are rewritten | tracked in `06-inventory.js` header |

---

## 6. Delete cascade (ruling "delete item", with extensions for עידן to confirm)

- **One confirmation lists everything.**
  - `inventory_delete_preview(p_name)` returns counts and ids, plus a `fingerprint` (md5 of the preview).
  - `inventory_delete_product(p_name, p_fingerprint)` recomputes the preview and aborts with
    `inventory_changed` if it differs. Otherwise it deletes in one transaction.
  - Both functions are `security definer`. `delivery_certs` has no delete policy on purpose, and this is the one
    audited path that may trim it.
- **What goes:**
  - `movements` rows of the product (this includes its `opening_balance`).
  - `orders` lines (and an order whose **only** lines were this item, **D2**).
  - `delivery_certs` lines (and a cert that becomes empty, **D2**, number shown).
  - Extensions, **D1**: the product's `stock_recounts`, `inventory_alerts`, `returns`, and lines in
    `visits.products`, `requirements.items` and `parse_corrections.items`. A requirement or example left empty is
    deleted; a visit row never is.
  - The `products` row(s) with that name.
- **What stays:**
  - `visits.summary/open_items` (text summaries, the ruling).
  - `delivery_certs.doc_html` + `drive_url` (the printed record, **D3**).
  - `archive.movements_pre_breakpoint` (**D4**).
  - `requirements.linked_order_id` values (harmless).
- **Why D1 matters:** a visit edit posts the **delta** against `visits.products` (`09-visits.js:1156-1163`). A line
  left behind would re-create stock for a deleted item on the next edit.
- **Who:**
  - The client allows עידן only (D5).
  - The server refuses the viewer claim and, once package X adds a `name` claim, anyone but עידן.
- **Undo:** the design system's one confirm pattern (§4.9): ConfirmSheet → a 5 s "ביטול" toast. The RPC fires when the
  toast expires, and closing the app in those 5 s means nothing is deleted. Recovery after that is the nightly backup.

---

## 7. Order status machine and approval (the tested table)

| From | Action | Who | To | Side effects |
|---|---|---|---|---|
| (new) | שמירה | any non-viewer | `pending_approval` | push `pending`; `parse_corrections` when there was raw text |
| `pending_approval` supplier ≤10 | אישור | אביאם, עמיחי | `pending` | push `approved`, track, seen |
| `pending_approval` supplier >10 | אישור | עמיחי | `pending` | same |
| `pending_approval` customer | אישור ואספקה | אביאם, ניתאי, עמיחי | `supplied` | `חברה → kibbutz` ×lines (once), EMS task, requirements fulfilled, push, seen |
| `pending_approval` customer + ספק ישיר | אישור | same | `supplied` | requirements fulfilled, push; **no** movement/EMS |
| `pending` | הוזמן | non-viewer | `in_transit` | — |
| `in_transit` | בנמל | non-viewer | `at_port` | — |
| `at_port` / `stuck` | התקבל | non-viewer | `arrived` | — |
| `arrived` | נכנס למלאי | non-viewer | `delivered` | **F (D6):** `ספק → חברה` ×lines once; `delivered_at`; linked requirements fulfilled |
| any supplier except `delivered/supplied/stuck/pending_approval` | סימון כתקוע | non-viewer | `stuck` | — |
| supplier (edit sheet) | status picker | non-viewer | `pending in_transit stuck at_port arrived delivered` | → `delivered` posts as above (once) |
| customer (edit sheet) | status picker | non-viewer | `supplied` | none (no movement from the picker) |
| `pending_approval` (edit sheet) | — | — | **unchanged** (F, O18b) | the picker is hidden; approval only |

---

## 8. Tests

| Layer | What | Where |
|---|---|---|
| Stock goldens | recorded from **old** `computeStock/poolStockMap/lowStockReport/kibbutz views/CSV` over 6 synthetic ledgers (every reason incl. `opening_balance`, padded name, blank product/location, negatives, person-locations, string qty) | `__fixtures__/inventory/legacy-goldens.json`, `inventory.test.ts` |
| Production golden | the old code's numbers on last night's backup JSON, recorded **locally** once before L6; verified after L6, U9 and U10 (nothing committed) | `scripts/inventory-golden-prod.mjs` |
| Order goldens | every §7 row, approval rules matrix (5 users × 4 order kinds), plans, notices, parser corpus (recorded from old `parseLocalToItems`), accessory plan | `inventory.test.ts`, `orderParse.test.ts` |
| Cert goldens | `certDocHtml` byte-identical to the old one for 4 certs (numbered, draft, cancelled+replaced, signed); range groups/totals | `certDoc.test.ts` |
| Parity runner | evaluates **old** 07/08/20 sources and compares them against `SigmaInv` (runs until U10, then deleted) | `test-inventory-parity.mjs` |
| SQL | the preview + delete + fingerprint abort, in one rolled-back transaction, **on a Supabase branch** | `db/tests/inventory_delete_product.test.sql` |
| Data layer | mappers identical to `01-data.js` writers; orchestration with a fake client | `inventoryApi.test.ts` |
| Flows | PW-F01…F24 through `InvDriver`; the legacy driver first (M0), both drivers at M4–M5, react only after U10; the assertion is the **write ledger** + visible numbers; deliberate differences are named in `DELTAS` | `qa/playwright/tests/inventory/*.spec.ts` |
| Role matrix | עידן, עמיחי, אביאם, ניתאי, אבצן, מתניה (no page), viewer | `inventory-roles.spec.ts` |
| Gates | `npm test`, Playwright 4 projects, the overlap sweep at 344(warn)/360/390/412/430/1440/1920/2560/3840, axe, impeccable ≤ baseline, `test-copy-rules`, boot size, reduced-motion video | U8 |

Flow list:
- F01 list and filters
- F02 new supplier order
- F03 new customer order + offline parse + accessories
- F04 non-catalog line (R)
- F05 approval rights
- F06 customer approval
- F07 drop-ship
- F08 quick chain + stuck + נכנס למלאי (F)
- F09 edit → delivered once; F09b arrived saved unchanged (F); F09c pending edit keeps status (F)
- F10 pool + KPIs + recount
- F11 CSVs
- F12 kibbutz views
- F13 returns
- F14 products + display name gate + toggle (F)
- F15 delete (R)
- F16 certs tab actions
- F17 issue from a visit (noPrint) + offline draft
- F18 `?cert=`
- F19 range report
- F20 nudges
- F21 push approve link
- F22 bell/strip open order
- F23 roles
- F24 low-stock banner/line

---

## 9. Open decisions for עידן (defaults apply unless he says otherwise)

| # | Question | Default |
|---|---|---|
| D1 | Also delete the item's recounts, alerts, returns, and its lines in visits/requirements/AI examples? | Yes (otherwise a visit edit brings the stock back) |
| D2 | An order or cert left with no lines after the delete | Deleted as well, and listed in red with its number (a cert number disappears from the series) |
| D3 | The frozen cert print (`doc_html`, Drive PDF) | Untouched: it's the signed record |
| D4 | `archive.movements_pre_breakpoint` | Untouched |
| D5 | Who may delete an item | עידן only |
| D6 | "נכנס למלאי" today doesn't add to stock | Fix: it posts the delivery once |
| D7 | Opening an "arrived" order and saving delivers it | Fix: arrived stays arrived |
| D8 | An order line not in the catalog, on save | Blocked, with one tap "הסרת השורות" (ruling: no add-to-catalog) |
| D9 | FYI, no decision needed: the השבת/הפעל toggle blanks the item's name and category today (P13), probably the "empty item" | Fixed |
| D10 | Dead parts: intake window, "import open requirements", reprint, cert from order/EMS task, the ✉️ duplicate, the static flow diagram | Removed |
| D11 | Two low-stock systems: fixed meter red lines (home banner) and per-item מינימום (bell) | Keep both as today |
| D12 | Renaming an item that has movements splits its stock | Keep today's behaviour and show "N תנועות נשארות על השם הקודם" in the sheet |

---

## 10. Risks

1. **Stock regression.** Mitigation: goldens recorded from the old code, the production-backup golden at three
   checkpoints, the write-ledger flows on both drivers, and the parity runner until U10.
2. **Two data paths** (legacy `SHEET_DATA` and React Supabase reads) disagree for ≤15 s after a write. Mitigation:
   emit + `refreshData()` + invalidate after every write, in both directions (§3.3).
3. **Boot bundle has 150 B left.** Every island is `import()`-ed, and `test-sigma-shell.mjs` is in every task's verify
   step. SigmaInv lives in `js/app.js`, not `ui/sigma.js`.
4. **`js/app.js` grows about 25 kB** until U10 (Lighthouse gate). U10 removes more than it added.
5. **Cert immutability vs delete.** Only the SECURITY DEFINER RPC trims certs. The SQL test runs on a branch only
   (sequence gaps, and the movements trigger inserts alerts).
6. **No per-person claim until package X.** The server can only refuse the viewer today. The client gate is עידן-only.
7. **Parallel packages in `index.html`, `main.tsx`, `00-bridge.js`.** Line-range claims (§4), worktree off
   `origin/main`, and the rebase + rebuild loop from `CLAUDE.md` before every push.
8. **Popup blockers.** The cert print window must open synchronously in the tap handler, before any `await`. It is
   tested with a Playwright popup expectation.
9. **The EMS proxy is still Apps Script** for `parseRequest/transcribe`. `parse-order` stays the primary parser and
   the local parser is the fallback. Nothing changes here.
10. **The public repo.** No production rows in fixtures. The production golden writes only under
    `C:\Users\idann\Backups\Sigmatec Operations\`.
11. **Fixing D6/D7/O18b changes stock-affecting behaviour.** Every fix is idempotent on `ref_id+reason`, so no double
    posting even if an old order was already delivered through the sheet.
12. **The idempotency guard reads stale data today.** Legacy checks `SHEET_DATA.movements` (≤15 s old), so two saves
    inside the refresh window post the delivery twice. Mitigation: `inventoryApi` re-reads
    `movements?ref_id=eq.X&reason=eq.Y` from the server right before every delivery, customer-supply or restock insert
    (L8), not the cached query.

---

## 11. Tasks

Counts: **L = 11 tasks** (L1a L1b L1c L1d L2 L3 L4 L5 L6 L7 L8) and **U = 10 tasks** (U1–U10). **21 in total.**

**Before any task:**
- Run `python docs/ops-graph/ops_graph.py file <each file you touch>`.
- Work in a worktree off `origin/main` (`CLAUDE.md` parallel rule).
- ponytail: shortest diff, no scaffolding.

**Every task's verify step includes:**
- `npm test`
- `node test-sigma-shell.mjs`
- `npx playwright test --config qa/playwright/playwright.config.ts qa/playwright/tests/inventory`

---

### Task L1a: Characterization harness (fixtures, route stores, write ledger, legacy driver)

**Files:**
- Create: `qa/playwright/tests/inventory/_inv-fixtures.ts`, `_inv-ledger.ts`, `_inv-driver.ts`, `_inv-legacy.ts`
- Modify: `qa/playwright/tests/_helpers.ts` (`installRoutes` opts), `qa/playwright/tests/_fixtures.ts` (export `INVENTORY`), `js/src/01-data.js:355` (mock seam)

**Interfaces:**
- Produces:
  - `INVENTORY: { products, orders, movements, requirements, returns, delivery_certs, kibbutz_details, site_contacts }`
    (DB snake_case rows) and `toSheet(INVENTORY)` (legacy camelCase).
  - `installRoutes(page, { inventory: true })`.
  - `bootInv(page, ti, who, driverName)`.
  - `ledger(page): Promise<LedgerRow[]>` with `LedgerRow = { table: string; op: 'insert'|'patch'|'upsert'|'rpc'|'ems'; match?: string; row: Record<string, unknown> }`.
  - `interface InvDriver` (below).
  - `legacyDriver: InvDriver`.
  - `DELTAS: Record<string, string>`.

- [ ] **Step 1: Add the mock seam** in `js/src/01-data.js` `mockSheetData()`. Change `        emsQueue: M.queue` to:

```js
        emsQueue: M.queue,
        // 🧪 inventory flow suite (package I): a spec may add rows before boot. Localhost mock only.
        ...(window.__MOCK_EXTRA || {})
```

- [ ] **Step 2: Write the fixture** `_inv-fixtures.ts`. It must contain at least the following. Keep the existing mock
  products/movements so the current numbers (E360PP 37, בקר 504 12, סים 1NCE 4, PM135 2) stay valid.

```ts
export const INV_ORDERS = [
  { id: 'ord-s-small', created_at: '2026-09-20T08:00:00Z', created_by: 'ניתאי', supplier: 'לנדיס', status: 'pending_approval', items: [{ name: 'בקר 504', qty: 4 }], expected_date: '2026-09-20', notes: '', delivered_at: '', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' },
  { id: 'ord-s-big', created_at: '2026-09-20T09:00:00Z', created_by: 'אביאם', supplier: 'לנדיס', status: 'pending_approval', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 11 }], expected_date: '', notes: '', delivered_at: '', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' },
  { id: 'ord-c', created_at: '2026-09-21T08:00:00Z', created_by: 'עידן', supplier: '', status: 'pending_approval', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 2 }, { name: 'בקר 504', qty: 1 }], expected_date: '', notes: 'בקשת לקוח: חוקוק', delivered_at: '', distribution: {}, order_type: 'customer', kibbutz: 'חוקוק', assignee: '' },
  { id: 'ord-d', created_at: '2026-09-21T09:00:00Z', created_by: 'עידן', supplier: 'סאטק', status: 'pending_approval', items: [{ name: 'מונה PM135', qty: 3 }], expected_date: '', notes: '', delivered_at: '', distribution: {}, order_type: 'customer', kibbutz: 'דגניה', assignee: 'ספק ישיר' },
  { id: 'ord-3', created_at: '2026-09-17T08:00:00Z', created_by: 'עמיחי', supplier: 'לנדיס', status: 'arrived', items: [{ name: 'מונה Landis+Gyr E360PP', qty: 20 }], expected_date: '', notes: '', delivered_at: '', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' },
  { id: 'ord-old', created_at: '2026-08-01T08:00:00Z', created_by: 'עמיחי', supplier: 'לנדיס', status: 'delivered', items: [{ name: 'בקר 504', qty: 12 }], expected_date: '', notes: '', delivered_at: '2026-08-10T08:00:00Z', distribution: {}, order_type: 'supplier', kibbutz: '', assignee: '' },
];
export const INV_REQUIREMENTS = [
  { id: 'req-1', created_at: '2026-09-21T08:00:00Z', created_by: 'עידן', kibbutz: 'חוקוק', contact_name: '', items: [{ name: 'בקר 504', qty: 1 }], notes: '', status: 'in_progress', linked_order_id: 'ord-c', fulfilled_at: '', last_updated: '' },
];
export const INV_RETURNS = [
  { id: 'ret-1', visit_id: 'vis-אביאם', date: '2026-09-19', kibbutz: 'חוקוק', visitor: 'אביאם', product: 'מונה Landis+Gyr E360PP', qty: 1, reason: 'לא מתקשר', status: 'open' },
  { id: 'ret-2', visit_id: 'vis-אביאם', date: '2026-09-19', kibbutz: 'חוקוק', visitor: 'אביאם', product: 'בקר 504', qty: 1, reason: '', status: 'open' },
];
export const INV_CERTS = [
  { id: '00000000-0000-4000-8000-000000001041', cert_number: 1041, cert_date: '2026-09-02', kibbutz: 'חוקוק', customer: { name: 'חוקוק אגש״ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' }, items: [{ name: 'מונה Landis+Gyr E360PP', qty: 3 }], notes: '', source: 'visit', ref_id: 'vis-אביאם', created_by: 'אביאם', status: 'active', replaced_by: 0, recipient: 'דני', signature: '', doc_html: '', drive_url: '' },
  { id: '00000000-0000-4000-8000-000000001042', cert_number: 1042, cert_date: '2026-09-15', kibbutz: 'דגניה', customer: { name: 'דגניה', company_id: '', address: 'דגניה', contact: '' }, items: [{ name: 'בקר 504', qty: 1 }], notes: 'לא לחיוב', source: 'manual', ref_id: '', created_by: 'עידן', status: 'cancelled', replaced_by: 1043, recipient: '', signature: '', doc_html: '', drive_url: '' },
];
export const INV_CONTACTS = [{ id: 'sc-1', kibbutz: 'חוקוק', name: 'דני', role: 'site_manager', email: 'dani@example.com', phone: '0501234567', active: true }];
export const INV_DETAILS = [{ kibbutz: 'חוקוק', legal_name: 'חוקוק אגש״ח', company_id: '570000001', address: 'חוקוק', contact: 'דני' }];
```

  - `toSheet()` maps these exactly as `01-data.js` `readSnapshot` does (`created_at→createdAt`, `order_type→orderType`,
    …).
  - `INVENTORY.products` = the 4 mock products + `display_name`, `min_qty`, `unit`.
  - `INVENTORY.movements` = the 5 mock movements in snake case.

- [ ] **Step 3: Route stores.** In `installRoutes`, when `opts.inventory`:
  - Seed real stores for `products orders requirements returns delivery_certs kibbutz_details site_contacts parse_corrections`
    from `INVENTORY`, reusing the existing `movements`/`stock_recounts` stores (seeded with `INVENTORY.movements`).
  - Support GET with `eq.`/`gte.`/`lte.`/`order=`, POST insert (returning when `Prefer: return=representation`,
    assigning `cert_number = max+1` for `delivery_certs`), and PATCH by `id=eq.`.
  - Stub `rpc/cert_by_id`, `rpc/inventory_delete_preview` and `rpc/inventory_delete_product` over the stores with the
    §6 semantics.
  - Keep writes **allowed** in this mode (the flow suite asserts writes).
  - Every write also appends `{table, op, match, row}` to `window.__invRouteWrites` via
    `page.exposeFunction('__invRecord', …)`. An array insert records one entry per row. An RPC records
    `{table: '<function name>', op: 'rpc', row: <the JSON args>}`.

- [ ] **Step 4: Write the ledger** `_inv-ledger.ts`:

```ts
import type { Page } from '@playwright/test';
export interface LedgerRow { table: string; op: 'insert' | 'patch' | 'upsert' | 'rpc' | 'ems'; match?: string; row: Record<string, unknown> }
const DROP = new Set(['id', 'date', 'created_at', 'last_updated', 'delivered_at', 'fulfilled_at', 'at']);
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !DROP.has(k)));
/** Legacy router body → the same canonical row the React path writes (01-data.js W / writeOrder mapping). */
export function fromRouterBody(b: any): LedgerRow | null {
  if (!b || !b.type) return null;
  if (b.type === 'movement') return { table: 'movements', op: 'insert', row: clean({ product: b.product, from_location: b.fromLocation, to_location: b.toLocation, quantity: Number(b.quantity), reason: b.reason || 'manual', ref_id: b.refId || '', created_by: b.createdBy || '' }) };
  if (b.type === 'order') return b.id
    ? { table: 'orders', op: 'patch', match: b.id, row: clean(snakeOrder(b)) }
    : { table: 'orders', op: 'insert', row: clean(snakeOrder(b)) };
  if (b.type === 'requirement') return { table: 'requirements', op: b.id ? 'patch' : 'insert', match: b.id, row: clean({ status: b.status, linked_order_id: b.linkedOrderId }) };
  if (b.type === 'return') return { table: 'returns', op: 'patch', match: b.id, row: { status: b.status } };
  if (b.type === 'product') return { table: 'products', op: 'upsert', match: b.id, row: clean({ name: b.name ?? '', category: b.category ?? '', active: b.active !== false, ...(b.display_name !== undefined ? { display_name: b.display_name } : {}) }) };
  if (b.type === 'deliveryCert') return { table: 'delivery_certs', op: 'insert', row: clean({ kibbutz: b.cert.kibbutz, items: b.cert.items, source: b.cert.source, ref_id: b.cert.refId, notes: b.cert.notes, customer: b.cert.customer }) };
  if (b.type === 'deliveryCertCancel') return { table: 'delivery_certs', op: 'patch', match: b.id, row: clean({ status: 'cancelled', ...(b.replacedBy ? { replaced_by: b.replacedBy } : {}) }) };
  if (b.type === 'deliveryCertDoc') return { table: 'delivery_certs', op: 'patch', match: b.id, row: { doc_html: '<html>' } };
  if (b.type === 'parseCorrection') return { table: 'parse_corrections', op: 'insert', row: { raw_text: b.rawText, items: b.items } };
  if (b.type === 'ems') return { table: 'ems', op: 'ems', row: clean(b.payload || b) };
  return null;
}
function snakeOrder(b: any) {
  const m: Record<string, string> = { status: 'status', items: 'items', supplier: 'supplier', expectedDate: 'expected_date', notes: 'notes', createdBy: 'created_by', orderType: 'order_type', kibbutz: 'kibbutz', assignee: 'assignee' };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(m)) if (b[k] !== undefined) out[m[k]] = b[k];
  return out;
}
/** Install after boot: wraps the app's fetch (which already wraps the mock router) so every legacy write is seen. */
export async function recordLegacyWrites(page: Page) {
  await page.evaluate(() => {
    const w = window as any; w.__invWrites = [];
    const inner = w.fetch;
    w.fetch = function (url: any, opts: any) {
      if (typeof url === 'string' && url.indexOf('sigma:write-router') === 0 && opts && opts.body) {
        try { w.__invWrites.push(JSON.parse(opts.body)); } catch { /* not JSON */ }
      }
      return inner.apply(this, arguments as any);
    };
  });
}
export async function ledger(page: Page): Promise<LedgerRow[]> {
  const { legacy, routes } = await page.evaluate(() => ({ legacy: (window as any).__invWrites || [], routes: (window as any).__invRouteWrites || [] }));
  const rows = [...legacy.map(fromRouterBody).filter(Boolean), ...routes.map((r: LedgerRow) => ({ ...r, row: clean(r.row) }))] as LedgerRow[];
  return rows.sort((a, b) => (a.table + a.op + (a.match || '') + JSON.stringify(a.row)).localeCompare(b.table + b.op + (b.match || '') + JSON.stringify(b.row)));
}
```

  EMS writes: legacy `emsWriteOrQueue` in mock mode goes to the mock EMS proxy. The recorder also captures
  `EMS_PROXY_URL` POST bodies `{type:'ems',…}` and `emsQueueAdd` items as `{table:'ems'}`.

- [ ] **Step 5: Write the driver interface** `_inv-driver.ts`:

```ts
import type { Page } from '@playwright/test';
export type InvTab = 'orders' | 'stock' | 'certs' | 'kibbutz' | 'returns' | 'products';
export interface NewOrder { type: 'supplier' | 'customer'; supplier?: string; kibbutz?: string; createdBy?: string; items: Array<{ name: string; qty: number }>; raw?: string }
export interface InvDriver {
  name: 'legacy' | 'react';
  openTab(page: Page, tab: InvTab): Promise<void>;
  tabOrder(page: Page): Promise<string[]>;
  poolQty(page: Page, product: string): Promise<number | null>;
  kpi(page: Page, key: 'items' | 'units' | 'low'): Promise<number>;
  tapKpi(page: Page, key: 'items' | 'low'): Promise<void>;
  poolNames(page: Page): Promise<string[]>;
  setOrdersFilter(page: Page, f: '' | 'all' | string): Promise<void>;
  orderIds(page: Page): Promise<string[]>;
  orderRowText(page: Page, id: string): Promise<string>;
  hasApprove(page: Page, id: string): Promise<boolean>;
  approve(page: Page, id: string): Promise<void>;          // answers every confirm with yes
  quick(page: Page, id: string): Promise<void>;
  stuck(page: Page, id: string): Promise<void>;
  newOrder(page: Page, o: NewOrder): Promise<void>;         // fills and saves
  parseRaw(page: Page, raw: string, answers: string[]): Promise<Array<{ name: string; qty: number }>>;
  editOrder(page: Page, id: string, patch: { status?: string } | null): Promise<void>; // null = open + save unchanged
  kibbutzQty(page: Page, kibbutz: string, product: string): Promise<number | null>;
  download(page: Page, which: 'pool-csv' | 'kibbutz-csv'): Promise<string>;
  restock(page: Page, returnId: string): Promise<void>;
  defective(page: Page, returnId: string): Promise<void>;
  saveProduct(page: Page, p: { id?: string; name: string; category?: string; active?: boolean; display_name?: string }): Promise<void>;
  toggleProduct(page: Page, id: string): Promise<void>;
  displayNameEditable(page: Page, id: string): Promise<boolean>;
  wiringOk(page: Page): Promise<boolean>;
  certRange(page: Page, r: 'all' | 'thisMonth' | 'lastMonth' | 'last7' | 'last30'): Promise<void>;
  certSearch(page: Page, q: string): Promise<void>;
  certNumbers(page: Page): Promise<number[]>;
  certCancel(page: Page, n: number): Promise<void>;
  certReissue(page: Page, n: number): Promise<void>;       // opens prefilled, issues
  certViewText(page: Page, n: number): Promise<string>;
  certSendRows(page: Page, n: number): Promise<string[]>;
}
```

- [ ] **Step 6: Write the legacy driver** `_inv-legacy.ts`. It implements every method with today's selectors:
  - `[data-inv-tab=…]`, `#invOrdersFilter`, rows under `#invOrdersList` found by an action `onclick` containing the id,
    `[data-kpi]`, `[data-testid=inv-pool] .item-row`, `#invOrderModal` fields, `#orderQOptions button` by text, the
    `#invKibbutzMatrix` table/details, `#invReturnsList`, `#invProductModal`, `#inv-section-certs .btn-quick-date`,
    `#invCertsSearch`, `#invCertsList`, `#certModal`, `#certViewOverlay iframe`, `#certSendModal`.
  - `page.on('dialog', d => d.accept())` is installed once in `bootInv`.
  - Downloads use `page.waitForEvent('download')` and read the file as utf8.

- [ ] **Step 7: Write `bootInv`**:

```ts
export async function bootInv(page: Page, ti: TestInfo, who: Who, d: InvDriver) {
  await page.addInitScript(([sheet, flag]) => { (window as any).__MOCK_EXTRA = sheet; try { localStorage.setItem('sigma-inv-react', flag); } catch {} },
    [toSheet(INVENTORY), d.name === 'react' ? '1' : '0'] as const);
  const b = await boot(page, ti, { who, inventory: true } as any);
  await recordLegacyWrites(page);
  page.on('dialog', x => x.accept());
  return b;
}
export const driverFor = (): InvDriver => (process.env.INV_DRIVER === 'react' ? require('./_inv-react').reactDriver : legacyDriver);
export const DELTAS = {
  P13: 'toggle active no longer blanks name/category (PATCH instead of full-row upsert)',
  O4: 'נכנס למלאי posts ספק → חברה once',
  O18a: 'saving an arrived order unchanged keeps it arrived',
  O18b: 'saving a pending_approval order keeps pending_approval',
  O27: 'non-catalog lines: only "הסרת השורות" (no add-to-catalog)',
  S19: 'tab order is the ruling order',
  P17: 'products can be deleted (react only)',
} as const;
```

  (`boot()` forwards `inventory` to `installRoutes`: a two-line change in `_helpers.ts`.)

- [ ] **Step 8: Smoke-test the harness.** Create `inventory/harness.spec.ts`:

```ts
import { test, expect } from '../_helpers';
import { bootInv, driverFor } from './_inv-driver';
import { ledger } from './_inv-ledger';
test('harness: pool reads the mock ledger and no write happens on open', async ({ page }, ti) => {
  const d = driverFor(); await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');
  expect(await d.poolQty(page, 'מונה Landis+Gyr E360PP')).toBe(37);
  expect(await ledger(page)).toEqual([]);
});
```

  Run: `npx playwright test --config qa/playwright/playwright.config.ts inventory/harness`. Expected: PASS in 4 projects.

- [ ] **Step 9: Commit.**

```bash
git add qa/playwright/tests/inventory qa/playwright/tests/_helpers.ts qa/playwright/tests/_fixtures.ts js/src/01-data.js
git commit -m "test(inventory): characterization harness — fixtures, route stores, write ledger, legacy driver"
```

**Acceptance:** the harness spec is green on 4 projects; every other Playwright spec is unchanged and green (the
`inventory` routes are opt-in).

---

### Task L1b: Order flows on the OLD code (F01–F09, F21, F22)

**Files:** Create `qa/playwright/tests/inventory/orders.spec.ts`.

**Interfaces:** Consumes `bootInv`, `driverFor`, `ledger`, `DELTAS` (L1a).

- [ ] **Step 1: Write the specs.** Each test asserts the visible outcome **and** the ledger. For example:

```ts
import { test, expect } from '../_helpers';
import { bootInv, driverFor, DELTAS } from './_inv-driver';
import { ledger } from './_inv-ledger';
const d = driverFor();
const mov = (l: any[]) => l.filter(r => r.table === 'movements');

test('F05 approval rights: אביאם approves ≤10, not >10; עמיחי approves both; עידן approves none', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d); await d.openTab(page, 'orders');
  expect(await d.hasApprove(page, 'ord-s-small')).toBe(true);
  expect(await d.hasApprove(page, 'ord-s-big')).toBe(false);
  expect(await d.orderRowText(page, 'ord-s-big')).toContain('ממתין לאישור עמיחי');
});
test('F05b עידן sees no approve button on any kind', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d); await d.openTab(page, 'orders');
  for (const id of ['ord-s-small', 'ord-s-big', 'ord-c', 'ord-d']) expect(await d.hasApprove(page, id)).toBe(false);
});
test('F06 customer approval moves חברה → kibbutz once, opens EMS, supplies, fulfils the requirement', async ({ page }, ti) => {
  await bootInv(page, ti, 'ניתאי', d); await d.openTab(page, 'orders');
  await d.approve(page, 'ord-c');
  const l = await ledger(page);
  expect(mov(l).map(r => r.row)).toEqual([
    { product: 'בקר 504', from_location: 'חברה', to_location: 'חוקוק', quantity: 1, reason: 'customer_supply', ref_id: 'ord-c', created_by: 'ניתאי' },
    { product: 'מונה Landis+Gyr E360PP', from_location: 'חברה', to_location: 'חוקוק', quantity: 2, reason: 'customer_supply', ref_id: 'ord-c', created_by: 'ניתאי' },
  ]);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', op: 'patch', match: 'ord-c', row: { status: 'supplied' } }));
  expect(l).toContainEqual(expect.objectContaining({ table: 'requirements', op: 'patch', match: 'req-1', row: { status: 'fulfilled' } }));
  const ems = l.filter(r => r.table === 'ems');
  expect(JSON.stringify(ems)).toContain('אספקת ציוד: חוקוק');
  expect(JSON.stringify(ems)).toContain('• מונה Landis+Gyr E360PP ×2');
});
test('F07 drop-ship approval writes no movement and no EMS task', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d); await d.openTab(page, 'orders');
  await d.approve(page, 'ord-d');
  const l = await ledger(page);
  expect(mov(l)).toEqual([]); expect(l.filter(r => r.table === 'ems')).toEqual([]);
  expect(l).toContainEqual(expect.objectContaining({ table: 'orders', match: 'ord-d', row: { status: 'supplied' } }));
});
test('F08 quick chain on ord-3: arrived → delivered (' + DELTAS.O4 + ')', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d); await d.openTab(page, 'orders');
  await d.quick(page, 'ord-3');
  const m = mov(await ledger(page));
  if (d.name === 'legacy') expect(m).toEqual([]);           // O4 today: no stock credit
  else expect(m.map(r => r.row)).toEqual([{ product: 'מונה Landis+Gyr E360PP', from_location: 'ספק', to_location: 'חברה', quantity: 20, reason: 'order_delivery', ref_id: 'ord-3', created_by: 'עמיחי' }]);
});
test('F09 edit → delivered posts ספק → חברה once; a second save posts nothing', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d); await d.openTab(page, 'orders');
  await d.editOrder(page, 'ord-3', { status: 'delivered' });
  await d.editOrder(page, 'ord-3', null);
  // Legacy: the idempotency guard reads SHEET_DATA, which the mock router never updates, so the second save posts
  // again. That is today's real race inside the ≤15 s refresh window (risk 12). React re-reads the server first.
  expect(mov(await ledger(page))).toHaveLength(d.name === 'legacy' ? 2 : 1);
});
test('F09b arrived saved unchanged (' + DELTAS.O18a + ')', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d); await d.openTab(page, 'orders');
  await d.editOrder(page, 'ord-3', null);
  const m = mov(await ledger(page));
  expect(m).toHaveLength(d.name === 'legacy' ? 1 : 0);
});
test('F09c pending_approval saved from the edit sheet (' + DELTAS.O18b + ')', async ({ page }, ti) => {
  await bootInv(page, ti, 'עידן', d); await d.openTab(page, 'orders');
  await d.editOrder(page, 'ord-s-small', null);
  const patch = (await ledger(page)).find(r => r.table === 'orders' && r.match === 'ord-s-small')!;
  expect(patch.row.status).toBe(d.name === 'legacy' ? '' : 'pending_approval');
});
```

  Also write:
  - **F01:** default open filter hides `ord-old`, "all" shows it, the `stuck` filter works.
  - **F02:** new supplier order → ledger `orders insert {status:'pending_approval', order_type:'supplier', items, created_by}`.
  - **F03:** customer order with raw text `"2 סאטק"`: `parse-order` stubbed 503, the local parser runs, choices are
    answered, and the items include a controller, an antenna and a power supply.
  - **F04:** a non-catalog line. Legacy: the question shows "הוסף לקטלוג"; react: blocked with "הסרת השורות"
    (`DELTAS.O27`).
  - **F21:** `?pushact=approve&oid=ord-s-small` as אביאם reaches the confirm, and approving writes `status:'pending'`.
  - **F22:** `sigma.openOrder('ord-3')` opens the order editor.

- [ ] **Step 2: Run on the old code.** `INV_DRIVER=legacy npx playwright test … inventory/orders`. Expected: all PASS.
  A failure means the characterization is wrong: fix the test, never the app.

- [ ] **Step 3: Commit.** `git commit -m "test(inventory): order flows characterized on the legacy UI"`.

**Acceptance:** F01–F09c, F21, F22 are green on 4 projects with `INV_DRIVER=legacy`.

---

### Task L1c: Stock, kibbutz, returns, products flows on the OLD code (F10–F14, F24)

**Files:** Create `qa/playwright/tests/inventory/stock.spec.ts` and `products.spec.ts`.

- [ ] **Step 1: Write the specs.**
  - **F10:** פריטים במאגר = 4, יחידות = 55, מלאי נמוך = 1; tapping low leaves only PM135; the recount writes both rows
    (keep the existing `inventory-pool.spec.ts` assertions and move them here).
  - **F11:**

```ts
test('F11 CSVs are byte-identical to today', async ({ page }, ti) => {
  const d = driverFor(); await bootInv(page, ti, 'עידן', d);
  await d.openTab(page, 'stock');
  expect(await d.download(page, 'pool-csv')).toBe('\uFEFF"פריט","חברה"\n"בקר 504","12"\n"מונה Landis+Gyr E360PP","37"\n"מונה PM135","2"\n"סים 1NCE","4"');
  await d.openTab(page, 'kibbutz');
  expect(await d.download(page, 'kibbutz-csv')).toBe('\uFEFF"קיבוץ","מונה Landis+Gyr E360PP","סה""כ"\n"חוקוק","3","3"');
});
```

  - **F12:** `kibbutzQty('חוקוק','מונה Landis+Gyr E360PP') === 3` at 390 (accordion) and 1440 (matrix).
  - **F13:** restock ret-1 → ledger `movements {חוקוק → חברה, 1, return_restock, ref ret-1}` + `returns patch
    restocked`, and the row then offers no action (legacy sets the status locally); defective ret-2 → `returns patch
    defective` only. The react run also asserts the server re-check (a second `restockReturn('ret-1')` call through
    `page.evaluate` writes nothing).
  - **F14:**
    - A new product as עידן with display_name → `products upsert {name, category, active, display_name}`.
    - As אביאם, the display-name field is not editable.
    - The wiring line is red with the mock data.
    - Toggle p-2 → legacy ledger `{name:'', category:'', active:false}` (P13 recorded); react `products patch {active:false}`.
  - **F24:** as אביאם the home shows the low-stock banner "מונה PM135: נותרו 2 (קו אדום 5)"; as עידן the company-task
    line appears instead.

- [ ] **Step 2: Run** `INV_DRIVER=legacy …inventory/stock inventory/products`. Expected: PASS.

- [ ] **Step 3: Commit** `test(inventory): stock/kibbutz/returns/products flows characterized on legacy`.

**Acceptance:** green on 4 projects. The CSV strings match exactly.

---

### Task L1d: Certificate, nudge and role flows on the OLD code (F16–F20, F23)

**Files:** Create `qa/playwright/tests/inventory/certs.spec.ts`, `nudges.spec.ts`, `roles.spec.ts`.

- [ ] **Step 1: Write the specs.**
  - **F16:**
    - The range "all" lists 1042, 1041; the search "דגניה" lists only 1042.
    - Cancel 1041 → `delivery_certs patch {status:'cancelled'}`.
    - Reissue 1041 → an insert with the same items + a cancel patch `{replaced_by: 1043}`.
    - The view text contains "תעודת משלוח 1041" and "מסמך ממוחשב".
    - The send rows contain "דני".
  - **F17:** from the visit sheet (`sigma.openDeliveryCert({kibbutz:'חוקוק', items:[…], source:'visit', refId:'vis-אביאם', noPrint:true})`):
    - Issue → the overlay shows, and `certIssuedForVisit('vis-אביאם')` resolves to the new number.
    - With the `delivery_certs` insert route forced to 500 → the toast "טיוטה" appears and there is no insert in the ledger.
  - **F18:** `page.goto('/index.html?cert=00000000-0000-4000-8000-000000001041')` renders "תעודת משלוח 1041" and the
    app shell is absent.
  - **F19:** the `certMonthlyFromTab()` popup contains "חוקוק" with total 3 and the "דגניה" group with total 0 (its
    only cert is cancelled).
  - **F20:**
    - עמיחי sees the approval nudge listing "11 פריטים".
    - אביאם, with `orders_notif_seen_אביאם` seeded without `ord-old`, sees "הזמנה חדשה אושרה".
    - With no seed, the first run shows nothing and seeds.
  - **F23:**
    - The viewer sees all 6 tabs, no write controls (new order, approve, quick, report change, new product, cert
      new/cancel/reissue/send) and the Excel buttons.
    - For מתניה, `showPage('inventory')` bounces to kibbutz.
    - אבצן sees the page and can create an order but not approve.

- [ ] **Step 2: Run** with the legacy driver. Expected: PASS.

- [ ] **Step 3: Commit** `test(inventory): certificate, nudge and role flows characterized on legacy`.

**Acceptance:** F16–F20, F23 green on 4 projects. The `?cert=` test also passes with the upgrade freeze on.

---

### Task L2: Stock and product rules in `inventory.ts`, with goldens recorded from the old code

**Files:**
- Create: `scripts/sigma-inv.mjs`, `scripts/inventory-goldens-record.mjs`, `scripts/inventory-golden-prod.mjs`, `app/src/lib/__fixtures__/inventory/ledgers.json`, `…/legacy-goldens.json` (generated)
- Modify: `app/src/lib/inventory.ts`, `app/src/lib/inventory.test.ts`

**Interfaces:**
- Produces:
  - `activeProducts(products, fallback): ProductRow[]`
  - `STOCK_CATEGORY_ORDER`
  - `productCategoryMap(products): Record<string,string>`
  - `sortByCategoryThenName(names, catMap): string[]`
  - `METER_RULES`
  - `lowStockReport(pool): {meters: LowMeter[]}`
  - `isLowItem(name, report): boolean`
  - `lowStockLines(report, user): {taskLines: string[]; bannerLines: string[]}`
  - `poolView(pool, catMap, report, filter): PoolView`
  - `KIBBUTZ_EXCLUDED`
  - `kibbutzLocations(stock): string[]`
  - `kibbutzCards(stock): KibbutzCard[]`
  - `kibbutzMatrix(stock): KibbutzMatrix`
  - `poolCsvRows(pool): string[][]`
  - `kibbutzCsvRows(stock): (string|number)[][]`
  - `csvText(rows): string`
  - `stockByLocation`/`poolStock` aligned to the legacy trim rule.

- [ ] **Step 1: Write the ledger fixtures** `ledgers.json`. Six named ledgers:
  - `mock`: the 5 mock rows.
  - `reasons`: one row of each of `opening_balance visit_supply visit_supply_edit customer_supply order_delivery recount pool_migration return_restock return_defective manual`.
  - `padded`: `" בקר 504"` and `"בקר 504"`.
  - `blanks`: a blank product, a blank from/to.
  - `negative`: a pool that ends at −2.
  - `persons`: legacy person-location rows and a kibbutz.

  Plus a `products` list with categories that include `משנ״ז` and `משנ"ז`.

- [ ] **Step 2: Write `scripts/sigma-inv.mjs`**:

```js
// Compiles app/src/lib/inventory.ts into the IIFE the legacy bundle carries (window.SigmaInv).
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
export function sigmaInvSource() {
  const r = esbuild.buildSync({
    entryPoints: [root + 'app/src/lib/inventory.ts'], bundle: true, format: 'iife', globalName: 'SigmaInv',
    write: false, target: 'es2017', tsconfig: root + 'app/tsconfig.json', logLevel: 'silent', legalComments: 'none',
  });
  return r.outputFiles[0].text;
}
export function loadSigmaInv() { return new Function(sigmaInvSource() + '\nreturn SigmaInv;')(); }
```

- [ ] **Step 3: Write `scripts/inventory-goldens-record.mjs`.** It evaluates the **current** `js/src/08-inventory.js`
  exactly the way `test-inventory-pool.mjs:36-60` does (the same stubs). Then:

```js
import { readFileSync, writeFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const { ledgers, products } = JSON.parse(read('app/src/lib/__fixtures__/inventory/ledgers.json'));
const PERSONS = ['עמיחי', 'אביאם', 'ניתאי', 'משרד'];
const NONK = ['חברה', 'ספירה', 'ספק', 'תקול', ...PERSONS];
function legacy08(movements, user) {
  const csv = []; const doc = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) };
  const win = { innerWidth: 1440, SHEET_DATA: { movements, products }, sigmaBus: { addEventListener() {} } };
  const fn = new Function('window', 'document', 'POOL_LOCATION', 'INV_LOCATIONS', 'NON_KIBBUTZ_LOCATIONS', 'getCurrentUser', 'isViewer', 'checkEditPermission', 'invLoadingPlaceholder', 'getActiveProducts', 'alert', 'setTimeout', 'Blob', 'URL',
    read('js/src/08-inventory.js') +
    '\ninvDownloadCSV = (rows) => window.__csv.push(rows);' +
    '\nreturn { computeStock, poolStockMap, lowStockReport, productCategoryMap, sortByCategoryThenName, invExportStock, invExportKibbutzInventory };');
  win.__csv = csv;
  const api = fn(win, doc, 'חברה', ['חברה'], NONK, () => user, () => false, () => true, () => null, () => products.filter(p => p.active), () => {}, () => 0, function () {}, { createObjectURL() {}, revokeObjectURL() {} });
  api.invExportStock(); api.invExportKibbutzInventory();
  return { stock: api.computeStock(), pool: api.poolStockMap(), low: api.lowStockReport(), cat: api.productCategoryMap(),
    sorted: api.sortByCategoryThenName(Object.keys(api.poolStockMap()), api.productCategoryMap()), poolCsv: csv[0], kibbutzCsv: csv[1] };
}
const out = {};
for (const [name, rows] of Object.entries(ledgers)) out[name] = legacy08(rows, 'עמיחי');
writeFileSync(new URL('../app/src/lib/__fixtures__/inventory/legacy-goldens.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('recorded', Object.keys(out).length, 'ledgers from the legacy 08-inventory.js');
```

  (`invDownloadCSV` is a function declaration inside the source. The reassignment after it captures the rows instead
  of creating a Blob.)

  Run: `node scripts/inventory-goldens-record.mjs`. Expected: "recorded 6 ledgers …". Commit the JSON. **It is never
  regenerated after L6.** The header comment says so, and `test-inventory-parity.mjs` fails if its `recordedFrom` sha
  differs from the old 08 sha stored in it.

- [ ] **Step 4: Write the failing tests** in `inventory.test.ts`:

```ts
import goldens from './__fixtures__/inventory/legacy-goldens.json';
import fx from './__fixtures__/inventory/ledgers.json';
describe('stock = today (goldens recorded from js/src/08-inventory.js)', () => {
  for (const [name, rows] of Object.entries(fx.ledgers)) {
    const g = (goldens as any)[name];
    it(name + ': stockByLocation', () => expect(stockByLocation(rows as any)).toEqual(g.stock));
    it(name + ': poolStock', () => expect(poolStock(rows as any)).toEqual(g.pool));
    it(name + ': lowStockReport', () => expect(lowStockReport(poolStock(rows as any))).toEqual(g.low));
    it(name + ': category map + sort', () => {
      expect(productCategoryMap(fx.products)).toEqual(g.cat);
      expect(sortByCategoryThenName(Object.keys(poolStock(rows as any)), productCategoryMap(fx.products))).toEqual(g.sorted);
    });
    it(name + ': CSV rows', () => {
      expect(poolCsvRows(poolStock(rows as any))).toEqual(g.poolCsv);
      expect(kibbutzCsvRows(stockByLocation(rows as any))).toEqual(g.kibbutzCsv);
    });
  }
  it('csvText matches invDownloadCSV byte for byte', () => {
    expect(csvText([['פריט', 'חברה'], ['a"b', 3]])).toBe('\uFEFF"פריט","חברה"\n"a""b","3"');
  });
  it('lowStockLines: task line for others, banner for אביאם/עמיחי', () => {
    const r = { meters: [{ label: 'מונה PM135', match: 'PM135', total: 2, min: 5, found: true }] };
    expect(lowStockLines(r, 'עידן')).toEqual({ taskLines: ['🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם 2 מסוג "מונה PM135" (קו אדום: 5)'], bannerLines: [] });
    expect(lowStockLines(r, 'אביאם')).toEqual({ taskLines: [], bannerLines: ['מונה PM135: נותרו 2 (קו אדום 5)'] });
  });
  it('activeProducts falls back to the built-in list only when the catalog is empty', () => {
    expect(activeProducts([], ['X'])).toEqual([{ name: 'X', active: true, category: '' }]);
    expect(activeProducts([{ name: 'A', active: false }], ['X'])).toEqual([]);
  });
  it('poolView: יחידות counts the shown rows, פריטים the whole pool', () => {
    const v = poolView({ 'מונה PM135': 2, 'בקר 504': 12 }, { 'מונה PM135': 'מונה', 'בקר 504': 'בקר' }, lowStockReport({ 'מונה PM135': 2 }), 'low');
    expect([v.productCount, v.totalUnits, v.lowCount, v.names]).toEqual([2, 2, 1, ['מונה PM135']]);
  });
});
```

  Run: `cd app && npx vitest run src/lib/inventory.test.ts`. Expected: FAIL (functions not defined; `padded` differs
  because the lib trims today).

- [ ] **Step 5: Implement in `inventory.ts`.** Add:

```ts
export interface ProductRow { id?: string; name: string; category?: string | null; active?: boolean | null; display_name?: string | null; min_qty?: number | string | null; unit?: string | null }
export function activeProducts(products: ReadonlyArray<ProductRow> | null | undefined, fallback: ReadonlyArray<string> = []): ProductRow[] {
  const all = products || [];
  if (all.length === 0) return fallback.map(name => ({ name, active: true, category: '' }));
  return all.filter(p => !!p && !!p.active);
}
export const STOCK_CATEGORY_ORDER = ['מונה', 'בקר', 'סים', 'משנ"ז', 'אנטנה', 'ספק כוח', 'כרטיס תקשורת'];
const catKey = (c: string) => c.replace(/״/g, '"');   // P15: משנ״ז and משנ"ז are one category
export function productCategoryMap(products: ReadonlyArray<ProductRow> | null | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of products || []) m[p.name] = p.category || 'אחר';
  return m;
}
export function sortByCategoryThenName(names: ReadonlyArray<string>, catMap: Record<string, string>): string[] {
  return names.slice().sort((a, b) => {
    const ca = catMap[a] || 'אחר', cb = catMap[b] || 'אחר';
    if (ca !== cb) {
      const ia = STOCK_CATEGORY_ORDER.indexOf(catKey(ca)), ib = STOCK_CATEGORY_ORDER.indexOf(catKey(cb));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || ca.localeCompare(cb, 'he');
    }
    return a.localeCompare(b, 'he');
  });
}
export const METER_RULES = [
  { label: 'מונה Landis+Gyr E360PP', match: '360PP', min: 15 },
  { label: 'מונה Landis+Gyr E360SP', match: '360SP', min: 15 },
  { label: 'מונה E360CT', match: '360CT', min: 15 },
  { label: 'מונה E570', match: 'E570', min: 10 },
  { label: 'מונה PM135', match: 'PM135', min: 5 },
] as const;
export interface LowMeter { label: string; match: string; total: number; min: number; found: boolean }
export function lowStockReport(pool: Record<string, number>): { meters: LowMeter[] } {
  const meters = METER_RULES.map(rule => {
    let total = 0, found = false;
    for (const [p, q] of Object.entries(pool || {})) if (p.indexOf('מונה') === 0 && p.indexOf(rule.match) !== -1) { total += q; found = true; }
    return { label: rule.label, match: rule.match, total, min: rule.min, found };
  }).filter(m => m.found && m.total < m.min);
  return { meters };
}
export const isLowItem = (name: string, r: { meters: LowMeter[] }) => name.indexOf('מונה') === 0 && r.meters.some(m => name.indexOf(m.match) !== -1);
export function lowStockLines(r: { meters: LowMeter[] }, user: string) {
  const orderers = user === 'אביאם' || user === 'עמיחי';
  return {
    taskLines: orderers ? [] : r.meters.map(m => `🔴 מלאי המונים בחברה ירד מתחת לקו האדום, ישנם ${m.total} מסוג "${m.label}" (קו אדום: ${m.min})`),
    bannerLines: orderers ? r.meters.map(m => `${m.label}: נותרו ${m.total} (קו אדום ${m.min})`) : [],
  };
}
export interface PoolView { productCount: number; totalUnits: number; lowCount: number; names: string[]; groups: Array<{ category: string; rows: Array<{ name: string; qty: number; low: boolean; negative: boolean }> }> }
export function poolView(pool: Record<string, number>, catMap: Record<string, string>, report: { meters: LowMeter[] }, filter: '' | 'low'): PoolView {
  let names = sortByCategoryThenName(Object.keys(pool), catMap);
  if (filter === 'low') names = names.filter(n => isLowItem(n, report));
  const groups: PoolView['groups'] = [];
  for (const n of names) {
    const category = catMap[n] || 'אחר';
    if (!groups.length || groups[groups.length - 1].category !== category) groups.push({ category, rows: [] });
    groups[groups.length - 1].rows.push({ name: n, qty: pool[n], low: isLowItem(n, report), negative: pool[n] < 0 });
  }
  return { productCount: Object.keys(pool).length, totalUnits: names.reduce((s, n) => s + pool[n], 0),
    lowCount: Object.keys(pool).filter(n => isLowItem(n, report)).length, names, groups };
}
export const KIBBUTZ_EXCLUDED = [...NON_KIBBUTZ_LOCATIONS, ...LEGACY_PERSON_LOCATIONS];
export const kibbutzLocations = (stock: Record<string, Record<string, number>>) =>
  Object.keys(stock).filter(l => l && !KIBBUTZ_EXCLUDED.includes(l)).sort((a, b) => a.localeCompare(b, 'he'));
export interface KibbutzCard { kibbutz: string; items: Array<[string, number]>; totalUnits: number }
export function kibbutzCards(stock: Record<string, Record<string, number>>): KibbutzCard[] {
  return kibbutzLocations(stock).map(k => {
    const items = Object.entries(stock[k] || {}).filter(([, q]) => q !== 0).sort((a, b) => a[0].localeCompare(b[0], 'he'));
    return { kibbutz: k, items, totalUnits: items.reduce((s, [, q]) => s + q, 0) };
  }).filter(c => c.items.length > 0);
}
export interface KibbutzMatrix { kibbutzim: string[]; products: string[]; cells: number[][]; totals: number[] }
export function kibbutzMatrix(stock: Record<string, Record<string, number>>): KibbutzMatrix {
  const kibbutzim = kibbutzLocations(stock);
  const all = new Set<string>(); kibbutzim.forEach(k => Object.keys(stock[k]).forEach(p => all.add(p)));
  const products = [...all].filter(p => kibbutzim.some(k => (stock[k]?.[p] || 0) !== 0)).sort((a, b) => a.localeCompare(b, 'he'));
  const cells = kibbutzim.map(k => products.map(p => stock[k]?.[p] || 0));
  return { kibbutzim, products, cells, totals: cells.map(r => r.reduce((s, q) => s + q, 0)) };
}
export const poolCsvRows = (pool: Record<string, number>): Array<Array<string | number>> =>
  [['פריט', POOL], ...Object.keys(pool).sort((a, b) => a.localeCompare(b, 'he')).map(p => [p, pool[p]])];
export function kibbutzCsvRows(stock: Record<string, Record<string, number>>): Array<Array<string | number>> {
  const ks = kibbutzLocations(stock);
  const all = new Set<string>(); ks.forEach(k => Object.keys(stock[k]).forEach(p => all.add(p)));
  const products = [...all].sort((a, b) => a.localeCompare(b, 'he'));
  return [['קיבוץ', ...products, 'סה"כ'], ...ks.map(k => { const row = products.map(p => stock[k]?.[p] || 0); return [k, ...row, row.reduce((s, q) => s + q, 0)]; })];
}
export const csvText = (rows: ReadonlyArray<ReadonlyArray<string | number>>) =>
  '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
```

  Align `poolStock`/`stockByLocation` to legacy (S1/S2): replace `String(m?.product ?? '').trim()` with
  `String(m?.product ?? '')` and skip it only when `!product.trim()`, keeping the untrimmed key. Update the existing
  `inventory.test.ts` "ignores blank product names" case accordingly.

  If `sortByCategoryThenName`'s `catKey` normalisation (the P15 fix) breaks the `sorted` golden on the fixture, keep the
  golden as the old order and add a separate `it('P15 fix: משנ״ז sorts with משנ"ז')` expectation. **The legacy
  goldens stay untouched.** Every fix is its own named test.

- [ ] **Step 6: Run the tests.** `cd app && npx vitest run src/lib/inventory.test.ts`. Expected: PASS.

- [ ] **Step 7: Write the production golden script** `scripts/inventory-golden-prod.mjs`:

```js
// node scripts/inventory-golden-prod.mjs --record <backup.json>   (BEFORE L6 — evaluates the old 08)
// node scripts/inventory-golden-prod.mjs --verify <backup.json>   (after L6, U9, U10 — evaluates SigmaInv)
// Output lives ONLY in the local backup folder: this repo is public.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSigmaInv } from './sigma-inv.mjs';
const [mode, file] = process.argv.slice(2);
const OUT = 'C:/Users/idann/Backups/Sigmatec Operations/inventory-golden.json';
const snap = JSON.parse(readFileSync(file, 'utf8'));
const t = snap.tables || {};
if (!Array.isArray(t.movements) || !Array.isArray(t.products)) { console.error('backup has no movements/products'); process.exit(2); }
const movements = t.movements.map(m => ({ product: m.product || '', fromLocation: m.from_location || '', toLocation: m.to_location || '', quantity: parseFloat(m.quantity) || 0 }));
if (mode === '--record') {
  const { legacy08 } = await import('./inventory-goldens-record.mjs');   // export legacy08 from the record script
  const g = legacy08(movements, 'עמיחי');
  writeFileSync(OUT, JSON.stringify({ taken_on: snap.taken_on, stock: g.stock, pool: g.pool }, null, 1));
  console.log('recorded prod golden for', snap.taken_on);
} else {
  const want = JSON.parse(readFileSync(OUT, 'utf8'));
  const inv = loadSigmaInv();
  const got = { stock: inv.stockByLocation(movements), pool: inv.poolStock(movements) };
  const same = JSON.stringify(got.stock) === JSON.stringify(want.stock) && JSON.stringify(got.pool) === JSON.stringify(want.pool);
  console.log(same ? 'PROD GOLDEN OK (' + want.taken_on + ')' : 'PROD GOLDEN MISMATCH'); process.exit(same ? 0 : 1);
}
```

  Export `legacy08` from the record script (guard its main body with
  `if (import.meta.url === pathToFileURL(process.argv[1]).href)`).

  Verify against the **same** backup file that `--record` used (the ledger changes daily). Record it now:

  ```
  node scripts/inventory-golden-prod.mjs --record "C:/Users/idann/Backups/Sigmatec Operations/<latest>.json"
  ```

- [ ] **Step 8: Commit.** `git add scripts/sigma-inv.mjs scripts/inventory-goldens-record.mjs scripts/inventory-golden-prod.mjs app/src/lib && git commit -m "feat(inventory-lib): stock/product/low-stock/kibbutz/CSV rules with goldens recorded from legacy"`.

**Acceptance:** all goldens pass; the prod golden is recorded locally; `git status` shows no backup data.

---

### Task L3: Order rules — the status machine, approval, plans and notices

**Files:** Modify `app/src/lib/inventory.ts` and `inventory.test.ts`. Create `test-inventory-parity.mjs`.

**Interfaces:**
- Produces:
  - `ORDER_STATUS_LABEL`
  - `CLOSED_STATUSES`
  - `orderType(o): 'customer'|'supplier'`
  - `isDirectSupply(o)`
  - `orderKibbutz(o, reqs)`
  - `orderTotalQty(o)`
  - `orderNeedsAmichai(o)`
  - `canApproveThisOrder(o, me)`
  - `approvalWaitingMsg(o)`
  - `canApproveOrders(me)`
  - `quickAction(o): {next,label}|null`
  - `canMarkStuck(o)`
  - `editStatusOptions(o): string[]`
  - `filterOrders(orders, filter)`
  - `distinctSuppliers(orders)`
  - `orderFormFields(type, assignee, me, isNew)`
  - `newItemRow(catalog)`
  - `approvalPlan(o, ctx): ApprovalPlan`
  - `orderSavePlan(draft, ctx): SavePlan`
  - `orderStatusPlan(o, next, ctx): StatusPlan`
  - `amichaiPending(orders, me)`
  - `freshApprovedOrders(orders, seen, me)`
  - `restockPlan(ret, ctx)`

  The types (exported):

```ts
export interface ReqLike { id: string; kibbutz?: string; linkedOrderId?: string; status?: string }
export interface Ctx { me: string; movements: ReadonlyArray<Partial<Movement>>; requirements: ReadonlyArray<ReqLike>; hasSite?: (k: string) => boolean }
export interface EmsTaskPlan { kind: 'createTask'; kibbutz: string; title: string; description: string; assigneeName: string }
export interface ApprovalPlan { kind: 'supplier' | 'dropship' | 'customer'; error?: string; confirm: string; patch: { status: 'pending' | 'supplied' }; movements: Movement[]; ems?: EmsTaskPlan; fulfil: string[] }
export interface StatusPlan { error?: string; patch: { status: string }; movements: Movement[]; fulfil: string[] }
export interface DraftItem { name: string; qty: number; auto?: boolean; choose?: string[]; label?: string }
export interface OrderDraft { id?: string; orderType: 'supplier' | 'customer'; supplier?: string; kibbutz?: string; assignee?: string; expectedDate?: string; notes?: string; raw?: string; status?: string; origStatus?: string; createdBy?: string; items: DraftItem[]; importedReqIds?: string[] }
export interface SavePlan { errors: string[]; unknown: string[]; body: Record<string, unknown>; delivery: boolean; fulfil: string[]; reqLinks: Array<{ id: string; status: string; linkedOrderId: string }>; learn?: { rawText: string; items: Array<{ name: string; qty: number }> }; pushPending: boolean }
```

- [ ] **Step 1: Write the failing tests.** This is the whole §7 table plus the rules. Key cases, verbatim:

```ts
const o = (x: Partial<OrderLike & { createdBy: string; notes: string; orderType: string }>) => ({ id: 'o1', status: 'pending_approval', items: [{ name: 'בקר 504', qty: 4 }], ...x }) as any;
describe('approval rules (O9) — 5 users × 4 kinds', () => {
  const kinds = { small: o({ orderType: 'supplier' }), big: o({ orderType: 'supplier', items: [{ name: 'x', qty: 11 }] }), cust: o({ orderType: 'customer', kibbutz: 'חוקוק' }), drop: o({ orderType: 'customer', kibbutz: 'חוקוק', assignee: 'ספק ישיר' }) };
  const want: Record<string, Record<string, boolean>> = {
    'עידן': { small: false, big: false, cust: false, drop: false },
    'עמיחי': { small: true, big: true, cust: true, drop: true },
    'אביאם': { small: true, big: false, cust: true, drop: true },
    'ניתאי': { small: false, big: false, cust: true, drop: true },
    'אבצן': { small: false, big: false, cust: false, drop: false },
  };
  for (const [me, row] of Object.entries(want)) for (const [k, ok] of Object.entries(row))
    it(`${me} × ${k} → ${ok}`, () => expect(canApproveThisOrder((kinds as any)[k], me)).toBe(ok));
  it('waiting texts', () => {
    expect(approvalWaitingMsg(kinds.cust)).toBe('ממתין לאישור אביאם או ניתאי');
    expect(approvalWaitingMsg(kinds.big)).toBe('מעל 10 פריטים, ממתין לאישור עמיחי');
    expect(approvalWaitingMsg(kinds.small)).toBe('ממתין לאישור אביאם');
  });
});
describe('orderType / orderKibbutz fallbacks (O6, O8)', () => {
  it('notes mark a customer order', () => expect(orderType({ notes: 'בקשת לקוח: גבים' } as any)).toBe('customer'));
  it('kibbutz from notes, then from the linked requirement', () => {
    expect(orderKibbutz({ id: 'a', notes: 'בקשת לקוח — גבים (דני)' } as any, [])).toBe('גבים');
    expect(orderKibbutz({ id: 'a' } as any, [{ id: 'r', linkedOrderId: 'a', kibbutz: 'יגור' }])).toBe('יגור');
  });
});
describe('quick actions (O4, O5)', () => {
  it('supplier chain', () => {
    expect(['pending', 'in_transit', 'at_port', 'stuck', 'arrived', 'delivered'].map(s => quickAction(o({ orderType: 'supplier', status: s }))?.next ?? null))
      .toEqual(['in_transit', 'at_port', 'arrived', 'arrived', 'delivered', null]);
  });
  it('customer orders have none', () => expect(quickAction(o({ orderType: 'customer', status: 'pending' }))).toBeNull());
  it('stuck is offered except on delivered/supplied/stuck/pending_approval', () =>
    expect(['pending', 'in_transit', 'at_port', 'arrived', 'delivered', 'supplied', 'stuck', 'pending_approval'].map(s => canMarkStuck(o({ orderType: 'supplier', status: s }))))
      .toEqual([true, true, true, true, false, false, false, false]));
});
describe('orderStatusPlan (D6 fix)', () => {
  const ctx = (movements: any[] = []) => ({ me: 'עמיחי', movements, requirements: [{ id: 'r1', linkedOrderId: 'ord-3', status: 'in_progress' }] });
  const arrived = o({ id: 'ord-3', orderType: 'supplier', status: 'arrived', items: [{ name: 'E360PP', qty: 20 }] });
  it('posts delivery rows once and fulfils linked requirements', () => {
    const p = orderStatusPlan(arrived, 'delivered', ctx());
    expect(p.movements).toEqual([{ product: 'E360PP', fromLocation: 'ספק', toLocation: 'חברה', quantity: 20, reason: 'order_delivery', refId: 'ord-3', createdBy: 'עמיחי' }]);
    expect(p.fulfil).toEqual(['r1']);
  });
  it('posts nothing when the ledger already has them', () =>
    expect(orderStatusPlan(arrived, 'delivered', ctx([{ refId: 'ord-3', reason: 'order_delivery' }])).movements).toEqual([]));
  it('non-delivery transitions post nothing', () => expect(orderStatusPlan(arrived, 'stuck', ctx()).movements).toEqual([]));
  it('parseInt quantity like the legacy delivery (2.5 → 2)', () =>
    expect(orderStatusPlan(o({ ...arrived, items: [{ name: 'X', qty: '2.5' }] }), 'delivered', ctx()).movements[0].quantity).toBe(2));
});
describe('orderSavePlan (O27, O28, O18a, O18b)', () => {
  const base = { orderType: 'supplier' as const, supplier: 'לנדיס', createdBy: 'עמיחי', items: [{ name: 'בקר 504', qty: 3 }] };
  const ctx = { catalog: ['בקר 504'], movements: [], requirements: [], me: 'עמיחי' };
  it('a new order is always pending_approval and pushes', () => {
    const p = orderSavePlan({ ...base, status: 'delivered' }, ctx);
    expect([p.body.status, p.pushPending, p.delivery]).toEqual(['pending_approval', true, false]);
  });
  it('raw text goes into the notes and into a learn row of base items only', () => {
    const p = orderSavePlan({ ...base, raw: '3 בקרים', items: [...base.items, { name: 'בקר 504', qty: 1, auto: true }] }, ctx);
    expect(p.body.notes).toBe('📥 דרישת לקוח גולמית:\n3 בקרים');
    expect(p.learn).toEqual({ rawText: '3 בקרים', items: [{ name: 'בקר 504', qty: 3 }] });
  });
  it('blocks non-catalog lines (no add-to-catalog path)', () => {
    const p = orderSavePlan({ ...base, items: [{ name: 'פריט חדש', qty: 1 }] }, ctx);
    expect(p.unknown).toEqual(['פריט חדש']); expect(p.errors[0]).toBe('פריטים שלא בקטלוג: פריט חדש. אפשר להסיר אותם מההזמנה');
  });
  it('O18b: editing a pending_approval order keeps its status', () =>
    expect(orderSavePlan({ ...base, id: 'x', origStatus: 'pending_approval', status: '' }, ctx).body.status).toBe('pending_approval'));
  it('O18a: an arrived order saved unchanged stays arrived and posts nothing', () => {
    const p = orderSavePlan({ ...base, id: 'x', origStatus: 'arrived', status: 'arrived' }, ctx);
    expect([p.body.status, p.delivery]).toEqual(['arrived', false]);
  });
  it('errors in the legacy order', () => {
    expect(orderSavePlan({ ...base, items: [] }, ctx).errors[0]).toBe('צריך לפחות פריט אחד');
    expect(orderSavePlan({ ...base, items: [{ name: '', qty: 1, choose: ['ספק כוח פס-דין', 'ספק כוח שקע'] }] }, ctx).errors[0]).toBe('יש שורת ספק כוח בלי סוג. בחירה: פס-דין או שקע');
    expect(orderSavePlan({ ...base, createdBy: '' }, ctx).errors[0]).toBe('חסר מי יצר את ההזמנה');
    expect(orderSavePlan({ ...base, orderType: 'customer', kibbutz: '' }, ctx).errors[0]).toBe('חסר קיבוץ להזמנת לקוח');
  });
});
describe('approvalPlan (O11–O13)', () => {
  const ctx = { me: 'ניתאי', movements: [], requirements: [{ id: 'r1', linkedOrderId: 'c', status: 'in_progress' }], hasSite: (k: string) => k !== 'בלי-אתר' };
  it('customer: movements, EMS text byte-exact, supplied, fulfil', () => {
    const p = approvalPlan(o({ id: 'c', orderType: 'customer', kibbutz: 'חוקוק', items: [{ name: 'A', qty: 2 }] }), ctx);
    expect(p.kind).toBe('customer'); expect(p.patch).toEqual({ status: 'supplied' }); expect(p.fulfil).toEqual(['r1']);
    expect(p.ems).toEqual({ kind: 'createTask', kibbutz: 'חוקוק', title: 'אספקת ציוד: חוקוק', description: 'אספקת ציוד לחוקוק: אושר ע"י ניתאי\n• A ×2', assigneeName: 'ניתאי' });
  });
  it('the site gate blocks', () =>
    expect(approvalPlan(o({ orderType: 'customer', kibbutz: 'בלי-אתר' }), ctx).error).toBe('לקיבוץ "בלי-אתר" אין אתר EMS מקושר. צריך לקשר או ליצור את האתר ב-EMS לפני אישור ההזמנה.'));
  it('drop-ship: no movement, no EMS', () => {
    const p = approvalPlan(o({ id: 'c', orderType: 'customer', kibbutz: 'חוקוק', assignee: 'ספק ישיר' }), ctx);
    expect([p.kind, p.movements, p.ems]).toEqual(['dropship', [], undefined]);
  });
  it('supplier → pending', () => expect(approvalPlan(o({ orderType: 'supplier' }), { ...ctx, me: 'אביאם' }).patch).toEqual({ status: 'pending' }));
  it('no permission', () => expect(approvalPlan(o({ orderType: 'supplier' }), { ...ctx, me: 'עידן' }).error).toBe('אין הרשאה לאשר את ההזמנה הזו. ממתין לאישור אביאם'));
});
describe('notices (O14, O15)', () => {
  it('first run seeds and shows nothing', () => expect(freshApprovedOrders([o({ id: 'a', status: 'pending' })], null, 'אביאם')).toEqual({ seed: ['a'], fresh: [] }));
  it('fresh = approved, unseen, not mine', () =>
    expect(freshApprovedOrders([o({ id: 'a', status: 'pending' }), o({ id: 'b', status: 'pending', createdBy: 'אביאם' }), o({ id: 'c' })], [], 'אביאם').fresh.map(x => x.id)).toEqual(['a']));
  it('amichaiPending lists only >10 supplier orders, only for עמיחי', () => {
    const big = o({ orderType: 'supplier', items: [{ name: 'x', qty: 11 }] });
    expect(amichaiPending([big, o({})], 'עמיחי')).toEqual([big]); expect(amichaiPending([big], 'אביאם')).toEqual([]);
  });
});
describe('restockPlan (S18)', () => {
  it('kibbutz → חברה once', () => {
    const r = { id: 'ret-1', kibbutz: 'חוקוק', product: 'A', qty: 1, status: 'open' };
    expect(restockPlan(r, { me: 'עידן', movements: [] }).movements).toEqual([{ product: 'A', fromLocation: 'חוקוק', toLocation: 'חברה', quantity: 1, reason: 'return_restock', refId: 'ret-1', createdBy: 'עידן' }]);
    expect(restockPlan(r, { me: 'עידן', movements: [{ refId: 'ret-1', reason: 'return_restock' }] }).error).toBe('הפריט כבר הוחזר למלאי, לא נרשמה תנועה נוספת');
    expect(restockPlan({ ...r, kibbutz: '' }, { me: 'עידן', movements: [] }).error).toBe('לא ידוע מאיזה קיבוץ הוחזר הפריט, אי אפשר להחזיר למלאי');
  });
});
```

  Run: `cd app && npx vitest run src/lib/inventory.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement.** Port each legacy function 1:1 (`07-orders.js:455-491`, `608-631`, `790-794`, `1148-1268`,
  `05:123-156`). Change only the copy strings above and:
  - `orderSavePlan`: status = `draft.id ? (draft.origStatus === 'pending_approval' ? 'pending_approval' : (draft.status || draft.origStatus || 'pending')) : 'pending_approval'`;
    `delivery = !!draft.id && status === 'delivered' && draft.origStatus !== 'delivered'`. Movements for a delivery are
    built by `orderDeliveryRows` with `orderLineQty = parseInt(...)||0`.
  - `approvalPlan` customer: build rows with `orderApprovalRows` (lines merged; see O13) and return `[]` when
    `alreadyPosted(movements, o.id, 'customer_supply')`. The EMS description lists the filtered lines **unmerged**, in
    order, exactly like `07:564`, so it stays byte-exact.
  - `editStatusOptions(o)`: `[]` when `pending_approval` (no picker); supplier
    `['pending','in_transit','stuck','at_port','arrived','delivered']`; customer `['supplied']`.
  - `orderLineQty` replaces `qty()` in `orderItems()` (legacy delivery uses `parseInt`). Update the existing
    `orderDeliveryRows` goldens.

- [ ] **Step 3: Write the parity runner** `test-inventory-parity.mjs`. It lifts the **old** order helpers out of
  `js/src/07-orders.js` (the approach of `test-autoadd.mjs`: `new Function('window','document','getActiveProducts','getCurrentUser','localStorage', src + '\nreturn {getOrderQuickAction, orderType, orderKibbutz, isDirectSupply, orderNeedsAmichai, canApproveThisOrder, orderTotalQty, distinctSuppliers, accessoryPlan, parseLocalToItems, intakeNormalize};')`)
  and compares against `loadSigmaInv()` over:
  - 200 generated orders (every status × type × size × assignee) for all five users;
  - the parser corpus (L4).

  Before L6, differences are errors except the named `DELTAS` (O4/O18/copy). The runner skips itself with a message
  once `js/src/07-orders.js` no longer exists (after U10).

- [ ] **Step 4: Run.** `cd app && npx vitest run src/lib/inventory.test.ts && cd .. && node test-inventory-parity.mjs`.
  Expected: PASS.

- [ ] **Step 5: Commit.** `feat(inventory-lib): order machine, approval and save plans; parity runner against legacy 07`.

**Acceptance:** the whole §7 table is covered; parity is green; the D6/D7/O18b fixes are asserted as named tests.

---

### Task L4: Order text parser → `orderParse.ts`

**Files:**
- Create: `app/src/lib/orderParse.ts`, `orderParse.test.ts`, `app/src/lib/__fixtures__/inventory/parse-corpus.json`
- Modify: `inventory.ts` (`export * from './orderParse'`), `scripts/inventory-goldens-record.mjs` (records parser outputs)

**Interfaces:**
- Produces:
  - `INTAKE_ALIASES`, `HE_NUMWORDS`, `INTAKE_STOP`
  - `intakeNormalize(s)`
  - `intakeQtyNear(norm, idx)`
  - `parseLocalToItems(raw, catalog): Array<{name,qty,uncertain}>`
  - `accessoryPlan(items)`
  - `accessoryQuestions(items, catalog, pool): Question[]`
  - `ambiguousSatecQuestion(raw, items, catalog, pool): Question|null`
  - `psLabel(name)`, `ctrlLabel(name)`
  - `parseSourceLabel(src): {kind:'gemini'|'groq'|'offline'|'', model: string}`
- Note: `parseLocalToItems` takes the **catalog array** instead of calling `getActiveProducts()`.

- [ ] **Step 1: Write the corpus** `parse-corpus.json`:
  - `catalog`: `["מונה Landis+Gyr E360PP","מונה Landis+Gyr E360SP","מונה Landis+Gyr E360CT","מונה Landis+Gyr E570","Satec EM133","Satec PM135","Satec EM133 משנ\"ז","משנ\"ז 250","משנ\"ז 400","Carlo Gavazzi E341","Robustel R1510","PUSR Controller","אנטנה","ספק כוח פס-דין","ספק כוח שקע"]`
  - `texts`: `["5 סאטק","3 משנז 400","מונה לנדיס","4 מונים תלת פזי\nמונה משנה זרם","מונה סאטק 133 משנז","2 משנז 250","סאטק משני זרם","EM133 משנז","3 מונים לפה ו-2 שם, סה\"כ 6 מונים","שני מונים חד פאזי","5 קרלו","2 בקרים רובסטל","שלושה PM135","לנדיס ישיר לקו 7","בקשה בלי פריטים"]`

- [ ] **Step 2: Record.** Extend the record script: lift `parseLocalToItems`, `accessoryPlan` and `intakeNormalize`
  from the **old** 07 (with `getActiveProducts = () => catalog.map(name => ({name}))`) and store
  `legacy-goldens.json.parse = {text → items}` and `.accessory = {case → plan}` for the `test-autoadd.mjs` cases A–G.
  Run it.

- [ ] **Step 3: Write the failing tests:**

```ts
import goldens from './__fixtures__/inventory/legacy-goldens.json';
import corpus from './__fixtures__/inventory/parse-corpus.json';
describe('parseLocalToItems = today', () => {
  for (const t of corpus.texts) it(JSON.stringify(t), () => expect(parseLocalToItems(t, corpus.catalog)).toEqual((goldens as any).parse[t]));
});
describe('accessoryPlan = today (test-autoadd cases)', () => {
  for (const [k, c] of Object.entries((goldens as any).accessory)) it(k, () => expect(accessoryPlan((c as any).items)).toEqual((c as any).plan));
});
it('accessoryQuestions asks controller then power supply, with pool hints', () => {
  const q = accessoryQuestions([{ name: 'Satec EM133', qty: 2 }], corpus.catalog, { 'Robustel R1510': 4 });
  expect(q.map(x => x.title)).toEqual(['בחירת בקר', 'בחירת ספק כוח']);
  expect(q[0].options[0].hint).toBe('Robustel R1510 · במלאי: 4');
});
```

- [ ] **Step 4: Implement** by moving the functions from `07-orders.js:8-219, 911-963, 995-1030, 1068-1083` into
  `orderParse.ts`. Keep them pure: `window.intakeItems`, `askChoice` and DOM are removed, and a question is data:
  `interface Question { title: string; progress: string; text: string; options: Array<{label: string; value: string; hint: string}>; apply: 'controller'|'ps'|'satec'; qty: number }`.
  Hint copy: `במלאי: N` (was "במלאי שלך", and there is no personal stock any more).

- [ ] **Step 5: Run.** `npx vitest run src/lib/orderParse.test.ts` and `node test-inventory-parity.mjs`. Expected: PASS.

- [ ] **Step 6: Commit.** `feat(inventory-lib): order text parser and accessory questions, goldens from legacy`.

**Acceptance:** every corpus text gives the legacy output exactly.

---

### Task L5: Certificate rules and `certDoc.ts`

**Files:**
- Create: `app/src/lib/certDoc.ts`, `certDoc.test.ts`
- Modify: `inventory.ts` (cert rules + `export * from './certDoc'`, `export * from './certSend'`, `export { productLabel, reportWiringOk, reportPreview, canEditDisplayName } from './productLabel'`), `scripts/inventory-goldens-record.mjs`

**Interfaces:**
- Produces:
  - `CERT_COMPANY`, `certEsc`, `certFmtDate`
  - `certDocHtml(cert, {screen?, logo, year?}): string`
  - `certRangeReportHtml(certs, from, to, {logo, label, now}): string`
  - `certViewUrl(id)`
  - `certShareText(c)`
  - `certRange(range, today): {from,to}`
  - `certSearch(rows, q)`
  - `CERT_SOURCE_LABEL`
  - `certGroupName(c)`
  - `certRangeGroups(certs, label): Group[]`
  - `certItemsForView(items, isViewer, map)`
  - `certReissuePrefill(c, today)`
  - `certPrefillFromVisit(v)`
  - `certPrefill(pre, details, catalog, today)`
  - `certCollect(form): CertDraft`
  - `certIssueErrors(draft, isViewer): string[]`

- [ ] **Step 1: Record.** Evaluate the **old** `20-delivery-cert.js` (its `typeof location === 'undefined'` guard keeps
  the route off in node). Pass `CERT_LOGO='LOGO'`, `SB_URL`, `SB_ANON`, `WRITE_ROUTER_URL`, and freeze
  `Date.prototype.getFullYear = () => 2026` during the call. Record `certDocHtml` for 4 certs:
  - numbered,
  - draft (`number:null`),
  - cancelled + `replacedBy`,
  - signed (a data URL),
  each with and without `{screen:true}`. Also record `certGroupName` and `certSendPlan`, and the range report HTML
  with `new Date().toLocaleString` pinned (stub `Date.prototype.toLocaleString = () => 'NOW'`). Store them in
  `legacy-goldens.json.certs`.

- [ ] **Step 2: Write the failing tests:**

```ts
for (const [k, g] of Object.entries((goldens as any).certs.doc))
  it('certDocHtml ' + k, () => expect(certDocHtml((g as any).cert, { ...(g as any).opts, logo: 'LOGO', year: 2026 })).toBe((g as any).html));
it('range groups exclude cancelled certs from totals but list them', () => {
  const g = certRangeGroups([{ cert_number: 1, kibbutz: 'א', customer: {}, items: [{ name: 'A', qty: 2 }], status: 'active' }, { cert_number: 2, kibbutz: 'א', customer: {}, items: [{ name: 'A', qty: 5 }], status: 'cancelled' }] as any, n => n);
  expect(g).toEqual([{ name: 'א', certs: [expect.objectContaining({ cert_number: 1 }), expect.objectContaining({ cert_number: 2 })], totals: [['A', 2]] }]);
});
it('certRange', () => {
  expect(certRange('thisMonth', '2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  expect(certRange('lastMonth', '2026-09-23')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  expect(certRange('last7', '2026-09-23')).toEqual({ from: '2026-09-17', to: '2026-09-23' });
  expect(certRange('last30', '2026-09-23')).toEqual({ from: '2026-08-25', to: '2026-09-23' });
  expect(certRange('all', '2026-09-23')).toEqual({ from: '2000-01-01', to: '2099-01-01' });
});
it('certIssueErrors', () => {
  expect(certIssueErrors({ items: [], customer: { name: 'x' } } as any, false)).toEqual(['אין פריטים בתעודה. צריך לפחות פריט אחד.']);
  expect(certIssueErrors({ items: [{ name: 'A', qty: 1 }], customer: { name: '' } } as any, false)).toEqual(['חסר שם לקוח.']);
  expect(certIssueErrors({ items: [{ name: 'A', qty: 1 }], customer: { name: 'x' } } as any, true)).toEqual(['משתמש צפייה לא מפיק תעודות.']);
});
```

- [ ] **Step 3: Implement.**
  - Move `certDocHtml` (`20:335-422`) verbatim into `certDoc.ts`, with two changes: `${CERT_LOGO}` becomes
    `${opts.logo}`, and `new Date().getFullYear()` becomes `opts.year ?? new Date().getFullYear()`.
  - Move the range report body (`20:975-1023`) into `certRangeReportHtml`; the window handling stays in the caller.
  - Port the date math from `certSetRange` (`20:686-711`).

- [ ] **Step 4: Run.** Expected: PASS, byte-identical.

- [ ] **Step 5: Commit.** `feat(inventory-lib): certificate rules; certDoc.ts byte-identical to legacy certDocHtml`.

**Acceptance:** 8/8 `certDocHtml` goldens are identical; the range groups match.

---

### Task L6: The legacy bundle carries `SigmaInv`; 06/07/08/20 delegate; display_name reaches the snapshot

**Files:** Modify `build.mjs`, `js/src/06-products.js`, `07-orders.js`, `08-inventory.js`, `20-delivery-cert.js`,
`js/src/01-data.js:595`, and the legacy runners that eval these files (`test-inventory-pool.mjs`, `test-autoadd.mjs`,
`test-dropship.mjs`, `test-order-site-gate.mjs`, `test-cert-removals.mjs`, `test-delivery-cert.mjs`, `test-exports.mjs`,
`test-cert-pdf.mjs`).

**Interfaces:** Consumes `sigmaInvSource()` (L2) and all the lib exports (L2–L5). Produces `window.SigmaInv` in `js/app.js`.

- [ ] **Step 1: Write the failing check** in `test-inventory-parity.mjs`:

```js
check('js/app.js carries SigmaInv before the legacy modules', () => {
  const app = read('./js/app.js');
  assert.ok(/SigmaInv/.test(app) && app.indexOf('SigmaInv') < app.indexOf('getActiveProducts'));
});
```

- [ ] **Step 2: Inject in `build.mjs`** right after `for (const f of files) bundle += …`:

```js
// 📦 package I: the inventory rules are ONE TypeScript file (app/src/lib/inventory.ts). The legacy modules reach it as
// window.SigmaInv — compiled here, prepended, minified with the rest. Not in ui/sigma.js, so the 303 kB boot ceiling
// is untouched.
const { sigmaInvSource } = await import('./scripts/sigma-inv.mjs');
bundle = sigmaInvSource() + '\n' + bundle;
```

- [ ] **Step 3: Delegate.** Replace the bodies and keep every name and signature. Examples:

```js
// 08-inventory.js
function computeStock() { return SigmaInv.stockByLocation((window.SHEET_DATA && window.SHEET_DATA.movements) || []); }
function poolStockMap() { return SigmaInv.poolStock((window.SHEET_DATA && window.SHEET_DATA.movements) || []); }
function lowStockReport() { return SigmaInv.lowStockReport(poolStockMap()); }
function productCategoryMap() { return SigmaInv.productCategoryMap((window.SHEET_DATA && window.SHEET_DATA.products) || []); }
function sortByCategoryThenName(names, catMap) { return SigmaInv.sortByCategoryThenName(names, catMap); }
// 06-products.js
function getActiveProducts() { return SigmaInv.activeProducts((window.SHEET_DATA && window.SHEET_DATA.products) || [], typeof PRODUCT_LIST !== 'undefined' ? PRODUCT_LIST : []); }
function productLabel(p, opts) { return SigmaInv.productLabel(p, opts || {}); }
// 07-orders.js
function orderType(o) { return SigmaInv.orderType(o); }
function orderKibbutz(o) { return SigmaInv.orderKibbutz(o, (window.SHEET_DATA && window.SHEET_DATA.requirements) || []); }
function canApproveThisOrder(o) { return SigmaInv.canApproveThisOrder(o, getCurrentUser()); }
function parseLocalToItems(raw) { return SigmaInv.parseLocalToItems(raw, getActiveProducts().map(p => p.name)); }
// 20-delivery-cert.js
function certDocHtml(cert, opts) { return SigmaInv.certDocHtml(cert, Object.assign({ logo: CERT_LOGO }, opts || {})); }
function certGroupName(c) { return SigmaInv.certGroupName(c); }
// certRangeReportRange keeps its window handling (open, "⏳ טוען", fetch) and writes
// SigmaInv.certRangeReportHtml(certs, from, to, { logo: CERT_LOGO, label: certReportLabel, now: new Date().toLocaleString('he-IL') }).
```

  The render functions (`invRender*`) keep their DOM code but read numbers from `SigmaInv.poolView/kibbutzCards/
  kibbutzMatrix`. The text builders for the old UI stay as they are (copy is U work).
  `productLabel`'s `role: VIEWER_NAME` branch: `SigmaInv.productLabel` uses `isViewerToken`, which covers both spellings.

- [ ] **Step 4: Fix the snapshot (P14).** In `01-data.js` `readSnapshot` products mapping, append
  `display_name: p.display_name || '', min_qty: p.min_qty == null ? null : Number(p.min_qty), unit: p.unit || ''`.
  In the legacy `W.product`, write `display_name` only when `b.display_name !== undefined`. (The React path replaces
  it at U10; this makes the old UI honest meanwhile.)

  **Do not** change `W.product`'s upsert shape (P13 stays recorded until U10). The test F14 expects it.

- [ ] **Step 5: Adapt the legacy runners** that `new Function` these files. Each gets `SigmaInv` injected:
  `import { loadSigmaInv } from './scripts/sigma-inv.mjs'`, then pass `loadSigmaInv()` as a `SigmaInv` parameter.

- [ ] **Step 6: Run everything.**
  - `node build.mjs && npm test`
  - `INV_DRIVER=legacy npx playwright test --config qa/playwright/playwright.config.ts inventory`
  - `node scripts/inventory-golden-prod.mjs --verify "<the same backup file>"`

  Expected: all green, `PROD GOLDEN OK`.

- [ ] **Step 7: Commit.** `refactor(inventory): legacy 06/07/08/20 delegate to SigmaInv (one copy of every rule); snapshot carries display_name`.

**Acceptance:**
- The flow suite is unchanged and green on the legacy driver.
- The parity runner and the prod golden are green.
- `ui/sigma.js` is unchanged in size.
- `js/app.js` growth is printed in the build log (expected < 30 kB).

---

### Task L7: Delete cascade — SQL, SQL test, client wrapper

**Files:**
- Create: `db/inventory_delete_product.sql`, `db/tests/inventory_delete_product.test.sql`
- Modify: `app/src/lib/inventory.ts` (`DeletePreview` type + `deleteSummaryLines()`), `inventory.test.ts`

**Interfaces:**
- Produces: the RPCs `inventory_delete_preview(p_name text) → jsonb` and
  `inventory_delete_product(p_name text, p_fingerprint text) → jsonb`, and
  `interface DeletePreview { product: string; exists: number; movements: number; orders_deleted: string[]; orders_trimmed: string[]; certs_deleted: number[]; certs_trimmed: number[]; visits_trimmed: number; requirements_trimmed: number; requirements_deleted: number; returns: number; recounts: number; alerts: number; parse_examples: number; fingerprint: string }`
  plus `deleteSummaryLines(p: DeletePreview): Array<{ text: string; danger: boolean }>`.

- [ ] **Step 1: Write the migration** `db/inventory_delete_product.sql`:

```sql
-- 🗑 מחיקת פריט (round 5 package I, ruling "delete item"): the item AND its movements, order lines and cert lines,
-- plus (D1) recounts, alerts, returns and its lines in visits / requirements / AI examples. Text summaries stay.
-- Two calls: a preview the confirmation screen lists, and a delete that refuses if anything changed since.
-- SECURITY DEFINER because delivery_certs has no delete policy on purpose; this is the one audited path.
-- Idempotent. Apply only after עידן's "כן". Test: db/tests/inventory_delete_product.test.sql (Supabase BRANCH only).

create or replace function public.inventory_line_name(e jsonb) returns text
language sql immutable as $$
  select case when jsonb_typeof(e) = 'string' then e #>> '{}' else e ->> 'name' end
$$;

create or replace function public.inventory_delete_guard() returns void
language plpgsql stable as $$
begin
  if coalesce(auth.jwt() ->> 'viewer', 'false') = 'true' then
    raise exception 'viewer' using errcode = '42501';
  end if;
  -- package X adds a per-person `name` claim; from that day only עידן passes.
  if (auth.jwt() ? 'name') and (auth.jwt() ->> 'name') is distinct from 'עידן' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function public.inventory_delete_preview(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.inventory_delete_guard();
  with
  o as (select x.id, bool_and(public.inventory_line_name(e) = p_name) as only_this
        from orders x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
        group by x.id having bool_or(public.inventory_line_name(e) = p_name)),
  c as (select x.cert_number, bool_and(public.inventory_line_name(e) = p_name) as only_this
        from delivery_certs x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
        group by x.cert_number having bool_or(public.inventory_line_name(e) = p_name)),
  r as (select x.id, bool_and(public.inventory_line_name(e) = p_name) as only_this
        from requirements x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
        group by x.id having bool_or(public.inventory_line_name(e) = p_name)),
  vi as (select distinct x.id from visits x cross join lateral jsonb_array_elements(coalesce(x.products, '[]'::jsonb)) e
         where public.inventory_line_name(e) = p_name),
  pc as (select distinct x.id from parse_corrections x cross join lateral jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e
         where public.inventory_line_name(e) = p_name)
  select jsonb_build_object(
    'product', p_name,
    'exists', (select count(*) from products where name = p_name),
    'movements', (select count(*) from movements where product = p_name),
    'orders_deleted', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from o where only_this),
    'orders_trimmed', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from o where not only_this),
    'certs_deleted', (select coalesce(jsonb_agg(cert_number order by cert_number), '[]'::jsonb) from c where only_this),
    'certs_trimmed', (select coalesce(jsonb_agg(cert_number order by cert_number), '[]'::jsonb) from c where not only_this),
    'visits_trimmed', (select count(*) from vi),
    'requirements_deleted', (select count(*) from r where only_this),
    'requirements_trimmed', (select count(*) from r where not only_this),
    'returns', (select count(*) from returns where product = p_name),
    'recounts', (select count(*) from stock_recounts where product = p_name),
    'alerts', (select count(*) from inventory_alerts where product = p_name),
    'parse_examples', (select count(*) from pc)
  ) into v;
  return v || jsonb_build_object('fingerprint', md5(v::text));
end $$;

create or replace function public.inventory_delete_product(p_name text, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := public.inventory_delete_preview(p_name);
  if v ->> 'fingerprint' is distinct from p_fingerprint then
    raise exception 'inventory_changed' using errcode = 'P0001', hint = 'הנתונים השתנו מאז התצוגה';
  end if;
  delete from movements where product = p_name;
  delete from stock_recounts where product = p_name;
  delete from inventory_alerts where product = p_name;
  delete from returns where product = p_name;
  -- whole rows whose every line is this item (D2), then trim the rest
  delete from orders x where x.id in (select value #>> '{}' from jsonb_array_elements(v -> 'orders_deleted'));
  delete from delivery_certs x where x.cert_number in (select (value #>> '{}')::bigint from jsonb_array_elements(v -> 'certs_deleted'));
  delete from requirements x where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name)
    and not exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) is distinct from p_name);
  update orders x set items = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(x.items) with ordinality t(e, i) where public.inventory_line_name(e) is distinct from p_name), last_updated = now()::text
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);
  update delivery_certs x set items = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(x.items) with ordinality t(e, i) where public.inventory_line_name(e) is distinct from p_name)
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);   -- doc_html / drive_url untouched (D3)
  update requirements x set items = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(x.items) with ordinality t(e, i) where public.inventory_line_name(e) is distinct from p_name), last_updated = now()::text
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);
  update visits x set products = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(x.products) with ordinality t(e, i) where public.inventory_line_name(e) is distinct from p_name)
    where exists (select 1 from jsonb_array_elements(coalesce(x.products, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);   -- summary / open_items untouched
  delete from parse_corrections x where not exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) is distinct from p_name)
    and exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);
  update parse_corrections x set items = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(x.items) with ordinality t(e, i) where public.inventory_line_name(e) is distinct from p_name)
    where exists (select 1 from jsonb_array_elements(coalesce(x.items, '[]'::jsonb)) e where public.inventory_line_name(e) = p_name);
  delete from products where name = p_name;
  return v;
end $$;

revoke all on function public.inventory_delete_preview(text) from public, anon;
revoke all on function public.inventory_delete_product(text, text) from public, anon;
grant execute on function public.inventory_delete_preview(text) to authenticated;
grant execute on function public.inventory_delete_product(text, text) to authenticated;
```

- [ ] **Step 2: Write the SQL test** `db/tests/inventory_delete_product.test.sql`:

```sql
-- Supabase BRANCH only (delivery_certs.cert_number is a sequence; a rollback does not return the number).
begin;
insert into products(id, name, category, active) values ('t-p1', '__DEL__', 'מונה', true), ('t-p2', '__KEEP__', 'מונה', true);
insert into movements(id, date, product, from_location, to_location, quantity, reason, ref_id, created_by) values
  ('t-m1', '2026-09-23', '__DEL__', 'ספק', 'חברה', 5, 'order_delivery', 't-o1', 't'),
  ('t-m2', '2026-09-23', '__KEEP__', 'ספק', 'חברה', 3, 'order_delivery', 't-o2', 't');
insert into orders(id, status, items) values
  ('t-o1', 'delivered', '[{"name":"__DEL__","qty":5}]'),
  ('t-o2', 'delivered', '[{"name":"__DEL__","qty":1},{"name":"__KEEP__","qty":3}]');
insert into delivery_certs(kibbutz, items) values ('t', '[{"name":"__DEL__","qty":1}]'), ('t', '[{"name":"__KEEP__","qty":1},{"name":"__DEL__","qty":2}]');
insert into visits(id, kibbutz, date, visitor, products, summary) values ('t-v1', 't', '2026-09-23', 't', '[{"name":"__DEL__","qty":2},"__KEEP__"]', 'סיכום נשאר');
do $$
declare v jsonb; n1 bigint; n2 bigint;
begin
  select min(cert_number), max(cert_number) into n1, n2 from delivery_certs where kibbutz = 't';
  v := public.inventory_delete_preview('__DEL__');
  assert (v ->> 'movements')::int = 1, 'movements count';
  assert v -> 'orders_deleted' = '["t-o1"]'::jsonb, 'orders_deleted ' || (v -> 'orders_deleted')::text;
  assert v -> 'orders_trimmed' = '["t-o2"]'::jsonb, 'orders_trimmed';
  assert v -> 'certs_deleted' = jsonb_build_array(n1), 'certs_deleted';
  assert v -> 'certs_trimmed' = jsonb_build_array(n2), 'certs_trimmed';
  assert (v ->> 'visits_trimmed')::int = 1, 'visits_trimmed';
  begin
    perform public.inventory_delete_product('__DEL__', 'stale');
    raise exception 'stale fingerprint was accepted';
  exception when raise_exception then
    if sqlerrm <> 'inventory_changed' then raise; end if;
  end;
  perform public.inventory_delete_product('__DEL__', v ->> 'fingerprint');
  assert not exists (select 1 from products where name = '__DEL__'), 'product gone';
  assert not exists (select 1 from movements where product = '__DEL__'), 'movements gone';
  assert exists (select 1 from movements where id = 't-m2'), 'other movements kept';
  assert not exists (select 1 from orders where id = 't-o1'), 'emptied order deleted';
  assert (select items from orders where id = 't-o2') = '[{"name":"__KEEP__","qty":3}]'::jsonb, 'order trimmed';
  assert not exists (select 1 from delivery_certs where cert_number = n1), 'emptied cert deleted';
  assert (select items from delivery_certs where cert_number = n2) = '[{"name":"__KEEP__","qty":1}]'::jsonb, 'cert trimmed';
  assert (select products from visits where id = 't-v1') = '["__KEEP__"]'::jsonb, 'visit line trimmed';
  assert (select summary from visits where id = 't-v1') = 'סיכום נשאר', 'visit summary kept';
end $$;
rollback;
```

- [ ] **Step 3: Run on a branch.**
  - `mcp__supabase__create_branch` (cost confirmation by עידן).
  - Apply `db/inventory_delete_product.sql`.
  - Execute the test.
  - Expected: `ROLLBACK` with no assertion error.
  - Delete the branch.

- [ ] **Step 4: Write `deleteSummaryLines` and its test.** Golden: for
  `{movements:3, orders_deleted:['ord-9'], orders_trimmed:['ord-2'], certs_deleted:[1050], certs_trimmed:[], visits_trimmed:2, requirements_trimmed:0, requirements_deleted:0, returns:1, recounts:0, alerts:4, parse_examples:0}`
  it returns:

```ts
[
  { text: '3 תנועות מלאי', danger: false },
  { text: 'שורה בהזמנה אחת', danger: false },
  { text: 'הזמנה ord-9 נמחקת כולה', danger: true },
  { text: 'תעודה 1050 נמחקת כולה, והמספר ייעלם מהרצף', danger: true },
  { text: 'שורות ב-2 ביקורים (הסיכומים נשארים)', danger: false },
  { text: 'החזרה אחת', danger: false },
  { text: '4 התראות', danger: false },
]
```

  Zero counts are omitted. Hebrew singular/plural is handled for 1.

- [ ] **Step 5: Commit** `feat(inventory-db): item delete preview + cascade RPC (fingerprinted), SQL test on a branch`.
  **Production apply waits for עידן's "כן"** and is logged in `docs/HANDOFF-עידן.md`.

**Acceptance:** the SQL test passes on a branch; the summary golden passes; nothing is applied to production without the "כן".

---

### Task L8: The React data layer `inventoryApi.ts` + bridge additions

**Files:**
- Create: `app/src/lib/inventoryApi.ts`, `inventoryApi.test.ts`
- Modify: `js/src/00-bridge.js` (one block after `refreshData`, line 426), `app/src/bridge.ts` (types)

**Interfaces:**
- Consumes the plans from L3/L5/L7.
- Produces:
  - `INV_KEYS`
  - `fetchInventory(): Promise<InvData>` with `InvData = { products: ProductRow[]; orders: OrderLike[]; movements: Movement[]; requirements: ReqLike[]; returns: ReturnRow[] }`
  - `useInventory()`
  - `movementRow(m)`, `orderInsertRow(body, id, now)`, `orderPatchRow(body, now)`
  - `saveOrder(draft, data, me): Promise<{id: string}>`
  - `approveOrder(id, data, me)`
  - `setOrderStatus(id, next, data, me)`
  - `restockReturn(id, data, me)`, `markDefective(id)`
  - `saveProduct(draft, isIdan)`, `setProductActive(id, active)`
  - `deletePreview(name)`, `deleteProduct(name, fp)`
  - `parseOrderText(raw, type, catalog): Promise<{items, source}>`
  - `fetchCerts(from, to)`, `issueCert(draft, me, win: Window|null): Promise<{number: number|null; id: string|null}>`, `cancelCert(id, replacedBy?)`
  - `fetchContacts(kibbutz)`, `addContact(row)`
  - `kibbutzDetails()`
  - `afterWrite(source)`

- [ ] **Step 1: Bridge block** in `00-bridge.js`:

```js
      // 📦 package I — what the React inventory calls in legacy code it does not own.
      pushNotify: function (ev, id, by) { return call('pushNotify', [ev, id, by]); },
      emsAfterWrite: function () { return call('emsAfterWrite', [], Promise.resolve()); },
      canExportExcel: function () { return !!call('canExportExcel', [], false); },
      xlExportStock: function () { return call('xlExportStockXlsx'); },
      xlExportKibbutz: function () { return call('xlExportKibbutzXlsx'); },
      xlExportCerts: function (from, to) { return call('xlExportCerts', [from, to]); },
```

  Add the same fields (optional, `?:`) to the `Sigma` interface in `bridge.ts`.

- [ ] **Step 2: Write the failing tests** with a fake supabase (`vi.mock('@/lib/supabase')`, a recording `from()`
  builder):
  - `orderInsertRow`/`orderPatchRow` equal `01-data.js` `writeOrder` for 6 bodies. Lift `orderUpdateRow` from
    `01-data.js` the way `test-order-patch.mjs` does and compare.
  - `saveOrder` on a fresh delivery inserts the movements once and patches the requirements.
  - `setOrderStatus('ord-3','delivered')` inserts 1 movement, then called again with the refreshed data inserts 0.
  - `setProductActive` sends `update({active})` only (P13 fix).
  - `saveProduct` by a non-עידן never sends `display_name`.
  - `approveOrder` for a customer calls `sigma.emsWrite` with `EmsTaskPlan`, `sigma.pushNotify('approved', id, me)` and
    `sigma.track('order-approved', id)` (only for supplier/drop-ship, like today).
  - `issueCert` with the insert failing returns `{number:null,id:null}` and makes no doc patch.
  - `issueCert` with a reissue calls `cancelCert(old, newNumber)`.
  - `issueCert` for source `ems` calls `sigma.emsWrite({kind:'comment', …})` with the view link.

- [ ] **Step 3: Implement.** Each mutation runs its plan, performs the writes with `sbWrite`, and then calls
  `afterWrite(source)`:

```ts
export function afterWrite(source: string) {
  try { (window as any).sigmaEmit?.('stock-changed', { source }); } catch { /* no bus */ }
  try { sigma.refreshData?.(); } catch { /* legacy not up */ }
  void queryClient.invalidateQueries({ queryKey: ['inv'] });
}
```

  The `parse-order` call is ported from `07:226-249`: the 15 s abort, the 401 → `sigma` re-login, and the local
  fallback via `parseLocalToItems`.

  Server re-check (risk 12): before inserting `order_delivery`, `customer_supply` or `return_restock` rows, run
  `sb.from('movements').select('id').eq('ref_id', refId).eq('reason', reason).limit(1)`. When a row comes back, insert
  nothing and continue with the status patch. Test: `setOrderStatus` with an empty cache but a server row inserts 0.

  `issueCert(draft, me, win)`: the **caller** opens `win` synchronously before calling (popup rule). `issueCert` only
  writes into it (`win.document.write(certDocHtml(...))`).

- [ ] **Step 4: Run.** `npx vitest run src/lib/inventoryApi.test.ts` and `node test-sigma-shell.mjs` (`inventoryApi`
  is not imported by `main.tsx`). Expected: PASS, boot size unchanged.

- [ ] **Step 5: Commit** `feat(inventory-api): React data layer over the plans; bridge adds pushNotify/emsAfterWrite/xlExport*`.

**Acceptance:** mapper parity with `01-data.js`; every write path is covered; boot unchanged.

---

### Task U1: The page island, tabs in the ruled order, the flag, the react driver

**Gate:** Phase 2 components and package S merged and PASSed.

**Files:**
- Create: `app/src/islands/Inventory.tsx`, `qa/playwright/tests/inventory/_inv-react.ts`
- Modify: `js/src/00-consts.js` (flag), `index.html:337-460` (wrap the legacy markup in `<div id="inventoryLegacy">` and add `<div id="sigma-inventory"></div>` first), `js/src/02-init-attendance.js:324-339`, `app/src/main.tsx` (lazy mount)

**Interfaces:**
- Produces:
  - `INV_TABS = [{id:'orders',label:'הזמנות'},{id:'stock',label:'מלאי חברה'},{id:'certs',label:'תעודות משלוח'},{id:'kibbutz',label:'מלאי בקיבוצים'},{id:'returns',label:'החזרות'},{id:'products',label:'פריטים'}]`
  - `openInv(detail)` (drains `window.__sigmaInvQueue`)
  - `reactDriver: InvDriver`

- [ ] **Step 1: The flag** (`00-consts.js`):

```js
  // 📦 package I cutover switch. false = the legacy inventory UI; true = the React islands. QA may override per
  // device with localStorage 'sigma-inv-react' = '1' | '0'. Removed with the legacy code (U10).
  const INV_REACT = false;
  function invReact() { try { const o = localStorage.getItem('sigma-inv-react'); if (o === '1') return true; if (o === '0') return false; } catch (e) {} return INV_REACT; }
  function invReactOpen(detail) {
    (window.__sigmaInvQueue = window.__sigmaInvQueue || []).push(detail);
    try { window.dispatchEvent(new CustomEvent('sigma-inv-open', { detail: detail })); } catch (e) {}
  }
```

- [ ] **Step 2: Route the legacy entry points** (`02-init-attendance.js`):

```js
  function invShowTab(tab) {
    if (invReact()) { invReactOpen({ kind: 'tab', tab: tab }); return; }
    …the existing body…
  }
  function renderInventory() {
    if (invReact()) { try { window.dispatchEvent(new CustomEvent('sigma-inventory-refresh')); } catch (e) {} if (typeof renderLowStockAlert === 'function') renderLowStockAlert(); return; }
    …the existing body…
  }
```

- [ ] **Step 3: The island.**
  - `Inventory.tsx` renders `PageActionRow` (title "מלאי") and `Tabs` (the design-system scrollable Tabs, the scroll
    starts at the right, the selected tab scrolls into view) over `INV_TABS`. The default is `orders`; an unknown tab
    goes to `orders`.
  - Each tab body is a lazy child (`React.lazy(() => import('./InventoryOrders'))` …).
  - It uses `useInventory()` and, on mount, hides `#inventoryLegacy` when `invReact()`.
  - It subscribes to `sigma-inv-open {kind:'tab'}` and `sigma-inventory-refresh` (invalidate `['inv']`) and to
    sigmaBus `stock-changed`.
  - It exposes `data-testid="inv-tab-<id>"` and `data-testid="inv-panel-<id>"`.
  - `main.tsx`: `if (document.getElementById('sigma-inventory')) import('@/islands/Inventory').then(m => m.mountInventory())`.

- [ ] **Step 4: Write the react driver** `_inv-react.ts`. It implements `InvDriver` with `data-testid`s only. Every U
  task adds the testids it needs (listed in each task).
  - `tabOrder()` reads `[data-testid^=inv-tab-]` text.
  - Add a test to `orders.spec.ts`:
    `test('S19 tab order', async … expect(await d.tabOrder(page)).toEqual(d.name === 'react' ? ['הזמנות','מלאי חברה','תעודות משלוח','מלאי בקיבוצים','החזרות','פריטים'] : ['🧾 הזמנות','🏘 מלאי בקיבוצים','🚚 תעודות משלוח','🏢 מלאי החברה','🔧 החזרות','📋 פריטים']))`.

- [ ] **Step 5: Verify.**
  - `node build.mjs && npm test`
  - `INV_DRIVER=legacy` flows all green (flag off by default).
  - `INV_DRIVER=react npx playwright test … inventory/orders -g "S19"` green.
  - `node test-sigma-shell.mjs` green.

- [ ] **Step 6: Commit** `feat(inventory-ui): page island + ruled tab order behind INV_REACT`.

**Acceptance:** with the flag off nothing changes; with `sigma-inv-react=1` the tabs render in the ruled order.

---

### Task U2: Orders tab + order sheet (O1–O29, §7)

**Files:**
- Create: `app/src/islands/InventoryOrders.tsx`, `InventoryOrderSheet.tsx`
- Modify: `js/src/07-orders.js` (the first line of `invEditOrder`, `invNewOrder`, `approveOrder`, `quickOrderStatus`: `if (invReact()) return invReactOpen({...});`), `_inv-react.ts`

**Screens:**
- **OrdersTab**:
  - A FilterChip row: פתוחות (default) · הכל · one chip per supplier status, with counts.
  - `SectionBlock` of `ListRow`s. Leading: a type Tag (לקוח/ספק, + "10+"). Title: the kibbutz or supplier. Meta: date ·
    items count · created-by. Trailing: a chevron.
  - Up to 2 sm bubbles under the meta (a triage list): the approval bubble (`אישור` / `אישור ואספקה`) for the rightful
    approver, else a waiting Tag; the quick bubble (`quickAction().label`); `סימון כתקוע` goes in ⋯.
  - The primary action is `הזמנה חדשה` (PageActionRow).
  - The whole row opens the OrderSheet.
- **OrderSheet** (Sheet; phone bottom, a dialog from 768 up):
  - A segmented type control (new only).
  - Fields by `orderFormFields()`.
  - An items editor with `ItemRow` (select, stock Tag = pool qty, a not-in-catalog Tag, qty, remove) and `הוספת שורה`.
  - A raw text area + `ניתוח לפריטים` (new only) with a source Tag (Gemini/Groq/מקומי).
  - The questions appear **inside the sheet** as a pushed step with a back chevron (one Sheet rule), not a second modal.
  - A status picker from `editStatusOptions()`.
  - Notes, created-by.
  - Footer: `שמירה` (primary) + `אישור ואספקה` when allowed (it opens a ConfirmSheet with `approvalPlan().confirm`).
  - The dirty guard is `useUnsavedGuard`.

**Testids:** `inv-order-row-<id>`, `inv-order-approve-<id>`, `inv-order-quick-<id>`, `inv-order-more-<id>`,
`inv-order-stuck-<id>`, `inv-orders-filter-<key>`, `inv-new-order`, `os-type-<t>`, `os-supplier`, `os-kibbutz`,
`os-assignee`, `os-date`, `os-raw`, `os-parse`, `os-item-<i>-name`, `os-item-<i>-qty`, `os-add-row`, `os-status`,
`os-notes`, `os-created-by`, `os-save`, `os-approve`, `os-q-option-<n>`, `os-remove-unknown`, `confirm-yes`,
`confirm-no`.

- [ ] **Step 1: Write the component tests** (`@testing-library/react`, mocked `inventoryApi`):
  - the approval bubble matrix against `canApproveThisOrder`;
  - a `pending_approval` order shows no status picker;
  - unknown lines block שמירה and `os-remove-unknown` removes them;
  - the questions render as a step, not a dialog.

  Expected: FAIL.

- [ ] **Step 2: Implement** the two components over L3/L4/L8. Toast texts:
  - supplier approve: `הזמנת הספק אושרה`
  - drop-ship: `אספקה ישירה מהספק אושרה`
  - customer: `סופק ללקוח, נפתחה משימת EMS`, or when queued `סופק ללקוח, משימת EMS תיפתח בהתחברות הבאה`
  - status: `הסטטוס עודכן`
  - save: `ההזמנה נשמרה`
  - parse: `נותח ע״י AI` / `נותח מקומית, בלי AI`

  Errors use `toast.error` with `נסה שוב` → the same action.

- [ ] **Step 3: Fill the react driver** methods for orders.
  - Run `INV_DRIVER=react npx playwright test … inventory/orders`. Expected: all green, with the `DELTAS` branches
    taken.
  - Run `INV_DRIVER=legacy …`. Expected: still green.

- [ ] **Step 4: Commit** `feat(inventory-ui): orders tab + order sheet (status machine, approvals, parse, questions)`.

**Acceptance:** F01–F09c, F21, F22 green on both drivers; the vitest component tests green; boot unchanged.

---

### Task U3: Company stock + kibbutz stock tabs (S1–S17, S19, S20)

**Files:**
- Create: `app/src/islands/InventoryStock.tsx`, `InventoryKibbutzim.tsx`
- Modify: `_inv-react.ts`

**Screens:**
- **StockTab**:
  - StatTiles (2 per row under 480, 4 from 640): פריטים במאגר (filter clear, `aria-pressed`), יחידות (plain), מלאי נמוך
    (filter).
  - `<InventoryStrip/>` (imported component, unchanged).
  - A `SectionBlock` per category of ListRows: name, qty in `<bdi>` tabular, a danger Tag "נמוך" when low, and a danger
    ink for a negative qty.
  - PageActionRow bubbles: `דיווח שינוי` (hidden for the viewer; it dispatches `sigma-open-stock-change`) and ⋯
    (`ייצוא CSV` via `csvText(poolCsvRows())` + a Blob download named `inventory_pool.csv`; `Excel` when
    `sigma.canExportExcel()` → `sigma.xlExportStock()`).
  - Empty states per S12.
- **KibbutzTab**:
  - Container query: under 560 px, a collapsible SectionBlock per kibbutz (`kibbutzCards()`); from 560 up, a matrix
    Grid (`kibbutzMatrix()`) with a sticky first column, `data-truncate` headers, and the zero cells at text-2.
  - ⋯ `ייצוא CSV` (`inventory_by_kibbutz.csv`) / `Excel`.

**Testids:** `inv-kpi-items`, `inv-kpi-units`, `inv-kpi-low`, `inv-pool-row-<name>`, `inv-report-change`,
`inv-export-csv`, `inv-export-xlsx`, `inv-kib-card-<k>`, `inv-kib-cell-<k>-<p>`.

- [ ] **Step 1: Write the tests.** Unit: the tile states against `poolView`. Playwright: F10–F12 with the react driver.
  Expected: FAIL.

- [ ] **Step 2: Implement.** No count-up and no entrance animation on refetch (tools §2.3). The list gets the entrance
  only on the first data render.

- [ ] **Step 3: Run both drivers.** Expected: F10–F12 and F24 green. F11's CSV strings are byte-identical.

- [ ] **Step 4: Commit** `feat(inventory-ui): company stock + kibbutz stock tabs`.

**Acceptance:** identical numbers and CSVs on both drivers; InventoryStrip works inside the tab; StockChange opens.

---

### Task U4: Certificates (tab + the always-listening cert island) (C1–C25)

**Files:**
- Create: `app/src/islands/InventoryCerts.tsx`, `app/src/islands/InventoryCert.tsx`
- Modify:
  - `index.html` (add `<div id="sigma-cert"></div>` next to `#sigma-stock-change`)
  - `app/src/main.tsx` (non-deferred lazy mount, like StockChange)
  - `js/src/20-delivery-cert.js`: the first line of `openDeliveryCert`, `certSendOpen`, `certView`,
    `openVisitCertPicker`, `certSendForVisit`, `certDownloadForVisit` becomes
    `if (invReact()) return invReactOpen({kind:'cert'…})`; `certRangeReport*` stay legacy (they call the lib HTML since L6).
  - `_inv-react.ts`

**Screens (`InventoryCert.tsx`, one island, one Sheet at a time with pushed views):**
- **CertSheet:**
  - A customer block (4 inputs), a date, item rows (a datalist from `activeProducts`), `הוספת פריט`, notes.
  - A pushed **Signature** view: canvas, `ניקוי`, `אישור חתימה`, and a status Tag "נחתם ע״י X" / "לא נחתם".
  - Footer: `הפקת תעודה` (primary) + `תצוגה מקדימה`.
  - On `הפקת תעודה` the handler **first** does `const w = noPrint ? null : window.open('', '_blank')` (synchronously),
    then `await issueCert(draft, me, w)`.
- **CertViewer:** a full-height Sheet (a dialog from 768 up) with an `iframe srcdoc`, and `הדפסה` · `שליחה` (when there's
  an id) · `הקובץ בדרייב` (validated URL).
- **CertSend:** contacts (checkbox rows + a WhatsApp bubble), `העתקת קישור`, `מייל לנבחרים`, and an "הוספת איש קשר"
  collapsible, open when `needsContact`.
- **CertPicker:** visits in the range from `#visitsReportFrom/To/Visitor` (still legacy inputs), each with a `הפקה` bubble.
- **CertsTab** (`InventoryCerts.tsx`):
  - FilterChips for the ranges (single-select, the second tap → הכל), two date inputs (a manual change clears the
    chips), and a search.
  - ListRows: number (struck through when cancelled, with Tag "בוטלה → N"), date, customer, items, a source Tag,
    created-by, a signature Tag.
  - ⋯ per row: הצגה · שליחה · הפקה מתוקנת · ביטול (the last three hidden for the viewer).
  - PageActionRow: `תעודה חדשה` (hidden for the viewer), ⋯ (`סיכום תקופתי` → `certRangeReportRange(from,to)`,
    `Excel` → `sigma.xlExportCerts(from,to)`, `רענון`).
  - Footer text "N תעודות · M פעילות".
  - The query key includes the range, so there is no repaint when the data is unchanged.

**Testids:** `inv-certs-range-<r>`, `inv-certs-from`, `inv-certs-to`, `inv-certs-search`, `inv-cert-row-<n>`,
`inv-cert-more-<n>`, `inv-cert-view-<n>`, `inv-cert-send-<n>`, `inv-cert-reissue-<n>`, `inv-cert-cancel-<n>`,
`cert-sheet`, `cert-issue`, `cert-preview`, `cert-sign-open`, `cert-sign-canvas`, `cert-sign-ok`, `cert-viewer`,
`cert-send-row-<i>`, `cert-copy-link`, `cert-email`, `cert-add-contact`.

- [ ] **Step 1: Write the tests.**
  - Unit: the popup ordering (a `window.open` spy is called before the `issueCert` mock resolves).
  - Unit: the viewer hides the write actions.
  - Playwright F16, F17, F18, F19 with the react driver; add
    `test('C5 print window opens synchronously', async ({ page }) => { const pop = page.waitForEvent('popup'); …click cert-issue…; await pop; })`.

  Expected: FAIL.

- [ ] **Step 2: Implement.** The `?cert=` route is **not touched** (legacy file, runs before React).

- [ ] **Step 3: Run both drivers + `node test-delivery-cert.mjs`.** Expected: green, and F18 green with the freeze on.

- [ ] **Step 4: Commit** `feat(inventory-ui): certificates tab + cert sheet/signature/viewer/send/picker island`.

**Acceptance:**
- F16–F19 green on both drivers.
- Field.tsx's `sigma.openDeliveryCert({noPrint:true})` opens the React sheet when the flag is on.
- The visit gate (`certIssuedForVisit`) still resolves.

---

### Task U5: Returns tab (S18)

**Files:** Create `app/src/islands/InventoryReturns.tsx`. Modify `_inv-react.ts`.

**Screen:**
- A summary Tag "ממתינים להחלטה: N".
- ListRows (date · kibbutz · item × qty · returned by · a status Tag ממתין/הוחזר למלאי/תקול).
- For open rows 2 sm bubbles: `החזרה למלאי` (ConfirmSheet "להחזיר את X (×N) למלאי החברה?") and `סימון כתקול`
  (ConfirmSheet "הפריט יישאר מחוץ למלאי הזמין").
- EmptyState: "עדיין אין ציוד שהוחזר במעקב." / "ציוד שנרשם בסיכום ביקור תחת ציוד שהוחזר מופיע כאן."

**Testids:** `inv-return-row-<id>`, `inv-return-restock-<id>`, `inv-return-defective-<id>`.

- [ ] **Step 1: Test.** F13 with the react driver. Expected: FAIL.
- [ ] **Step 2: Implement** over `restockPlan` + `restockReturn/markDefective`.
- [ ] **Step 3: Run both drivers.** Expected: green.
- [ ] **Step 4: Commit** `feat(inventory-ui): returns tab`.

**Acceptance:** F13 green on both drivers; a double restock writes nothing.

---

### Task U6: Products tab + product sheet + delete (P1–P18)

**Files:** Create `app/src/islands/InventoryProducts.tsx`, `InventoryProductSheet.tsx`. Modify `js/src/06-products.js`
(the first line of `invNewProduct`, `invEditProduct`: route when `invReact()`), `_inv-react.ts`.

**Screens:**
- **ProductsTab:**
  - ListRows sorted he: title = the technical name; meta = category · the Tag "פעיל"/"מושבת" · "בדוח: <reportPreview>".
  - The whole row opens the ProductSheet.
  - A status line Tag: "מחובר למחולל הדוחות" (success) or "יש פריטים פעילים בלי שם לדוחות" (warn) from `reportWiringOk`.
  - PageActionRow `פריט חדש` (hidden for the viewer).
- **ProductSheet:**
  - Fields: name, category (the §2.1 P15 options, one spelling), an active switch, and the report name (disabled unless
    עידן, with helper "עריכת שם לדוחות זמינה לעידן בלבד").
  - A rename warning line when the name changed and movements exist (D12).
  - Footer: `שמירה`; ⋯ → `השבתה`/`הפעלה`, and `מחיקה` (עידן only).
  - **Closing never writes** (no draft row).
  - `מחיקה`: `deletePreview(name)` opens a ConfirmSheet titled `מחיקת <name>` with `deleteSummaryLines()` (danger lines in
    danger ink). Footer: `מחיקה סופית` (danger) + `ביטול`. After confirm, the Toast `הפריט נמחק` + `ביטול` runs for 5 s;
    on expiry `deleteProduct(name, fp)`. `inventory_changed` → toast "הנתונים השתנו מאז התצוגה. לפתוח שוב את המחיקה" and
    reopen the preview.

**Testids:** `inv-product-row-<id>`, `inv-new-product`, `ps-name`, `ps-category`, `ps-active`, `ps-display`, `ps-save`,
`ps-more`, `ps-toggle`, `ps-delete`, `del-line-<i>`, `del-confirm`, `toast-undo`.

- [ ] **Step 1: Tests.**
  - Unit: close without saving → no `saveProduct` call.
  - Unit: a non-עידן never sees `ps-delete`.
  - Unit: the undo inside 5 s → no `deleteProduct` call.
  - Playwright F14 (react branch: `products patch {active:false}`) and F15:

```ts
test('F15 delete lists what goes, waits for undo, then deletes with the fingerprint', async ({ page }, ti) => {
  const d = driverFor(); test.skip(d.name === 'legacy', DELTAS.P17);
  await bootInv(page, ti, 'עידן', d); await d.openTab(page, 'products');
  await page.getByTestId('inv-product-row-p-2').click(); await page.getByTestId('ps-more').click(); await page.getByTestId('ps-delete').click();
  await expect(page.getByTestId('del-line-0')).toContainText('תנועות מלאי');
  await page.getByTestId('del-confirm').click();
  await page.waitForTimeout(5500);
  const rpc = (await ledger(page)).filter(r => r.op === 'rpc');
  expect(rpc).toEqual([expect.objectContaining({ table: 'inventory_delete_product', row: expect.objectContaining({ p_name: 'בקר 504' }) })]);
});
```

  Expected: FAIL.

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run both drivers.** Expected: green.
- [ ] **Step 4: Commit** `feat(inventory-ui): products tab + product sheet + ruled item delete`.

**Acceptance:** F14/F15 green; the P13 fix is shown by the react branch; no draft row on close.

---

### Task U7: Nudges, deep links, bell and strip entry points (O14, O15, O34–O38)

**Files:**
- Create: `app/src/islands/InventoryNudges.tsx`
- Modify: `index.html` (`<div id="sigma-inventory-nudges"></div>`), `app/src/main.tsx` (lazy mount after the first data load), `js/src/07-orders.js` (the first line of `maybeShowAmichaiApprovalReminder` and `maybeShowOrderNotifications`: route when `invReact()`), `_inv-react.ts`

**Screens:**
- **Amichai nudge** (Sheet): "הזמנות לאישורך" + rows (N פריטים · supplier · created-by); `לאישור` → the orders tab with
  the pending filter; `אחר כך`.
- **Approved-orders notice** (Sheet): the title singular/plural, up to 10 rows + "ועוד N", `הצגת ההזמנות`.
- Both keep today's once-per-session latch (`window._amichaiApprovalShown`, `window._orderNotifShown`) and the
  localStorage key `orders_notif_seen_<user>` (so the switch doesn't re-notify).
- `approve` deep link: `{kind:'approve'}` opens the ConfirmSheet over the orders tab.
- `order`/`status` kinds open the OrderSheet or run `setOrderStatus`.

**Testids:** `nudge-amichai`, `nudge-approved`, `nudge-go`, `nudge-later`.

- [ ] **Step 1: Test.** F20, F21, F22 with the react driver. Expected: FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run both drivers.** Expected: green.
- [ ] **Step 4: Commit** `feat(inventory-ui): approval nudges, deep links, bell/strip entry points`.

**Acceptance:** F20–F22 green on both drivers; the seen set is shared across the switch.

---

### Task U8: Designer sign-off and the package gates

**Files:** No product code unless the fix list asks for it. Modify: `qa/impeccable-baseline.json` (only downwards),
`no-overlap-allow.json` (remove inventory entries).

- [ ] **Step 1: Capture** every screen and state at 360×780 and 412×915, light and dark, in mock mode with
  `sigma-inv-react=1`: default, loading, empty, error, offline, one open sheet, and the longest real content.
  - The screens: orders, order sheet, the question step, approval confirm, stock, the low filter, kibbutz (both
    layouts), certs, cert sheet, signature, viewer, send, picker, returns, products, product sheet, delete confirm +
    undo toast, both nudges.
  - Name them `<screen>__<width>__<theme>.png`.
- [ ] **Step 2: Run the evidence.**
  - `impeccable detect --json` on the changed files, plus URL scans at `360x780` and `412x915`.
  - The overlap sweep at 344(warn)/360/390/412/430/1440/1920/2560/3840.
  - axe in both themes.
  - `node test-copy-rules.mjs`.
  - The boot size.
  - A Playwright video at 360 of F06 and F17, normal and with reduced motion.
- [ ] **Step 3: Send** the bundle to the designer (`tools-and-motion.md` §4) and apply the numbered P0/P1 fixes. At most
  one fix round and one confirm round.
- [ ] **Step 4: Commit** the fixes and the PASSed PNGs as `toHaveScreenshot` goldens (masked dates).

**Acceptance:** the designer's written PASS; impeccable ≤ baseline and 0 in the changed files; the sweep green; axe 0
serious; the copy gate green; boot < 303 kB.

---

### Task U9: Cutover

**Files:** Modify `js/src/00-consts.js` (`const INV_REACT = true;`), `docs/CHANGELOG.md`, `docs/backlog.md`,
`docs/INDEX.md`.

- [ ] **Step 1: Flip the flag.**
- [ ] **Step 2: Run everything.** `node build.mjs && npm test`, the full Playwright suite (4 projects) with
  `INV_DRIVER=react`, and again with `INV_DRIVER=legacy` + `sigma-inv-react=0` (the fallback still works), and
  `node scripts/inventory-golden-prod.mjs --verify …`. Expected: all green, `PROD GOLDEN OK`.
- [ ] **Step 3: Run the self-check chapter** (round 5 grill round 3): `rebuild.py` + a Sonnet re-extraction of the
  changed docs, then an Opus audit of the diff against this spec, the graph and the QA rows.
- [ ] **Step 4: Commit + CHANGELOG entry** (what changed, the D6/D7/O18b fixes named).
  `git commit -m "release: package I — React inventory on (legacy kept as fallback for one release)"`.

**Acceptance:** both drivers green; עידן and עמיחי (the only users during the freeze) see the new page; the flag is
reversible in one line.

---

### Task U10: Delete the legacy inventory UI

**Files:**
- Delete: `js/src/06-products.js`, `07-orders.js`, `08-inventory.js`.
- Create: `js/src/06-inventory.js` (compat shims).
- Modify:
  - `js/src/20-delivery-cert.js` (keep only `_certIssuedFor`, `certIssuedForVisit`, `CERT_VIEW_BASE/certViewUrl`,
    `certFetchRow` + `certViewRoute`, the shims of §2.5, `certRangeReport/certMonthlyFromTab/certRangeReportRange`
    over `SigmaInv.certRangeReportHtml`, `certGroupName`/`certReportLabel` shims)
  - `index.html` (remove `#inventoryLegacy`, `111-132`, `894-925`, `987-1075`, `1114-1148`)
  - `js/src/05-meeting-returns.js:82-174`
  - `js/src/00-guard.js` (the modal list)
  - `js/src/00-consts.js` (remove `INV_REACT`, keep `invReactOpen` renamed `invOpen`)
  - `js/src/02-init-attendance.js` (drop the legacy branches)
  - `js/src/01-data.js` (`W.product` removed: no writer remains)
  - the legacy runners (delete the 07/08 source contracts, keep the behaviour assertions against `SigmaInv`)
  - `test-inventory-parity.mjs` (self-skips)
  - docs

- [ ] **Step 1: Write the compat file** `js/src/06-inventory.js`:

```js
  // ========== 📦 INVENTORY — legacy compat (round 5 package I) ==========
  // The rules: app/src/lib/inventory.ts (window.SigmaInv, injected by build.mjs). The screens: app/src/islands/Inventory*.tsx.
  // These are only the NAMES that legacy callers still reach. Delete a line when its last caller is rewritten:
  //   getActiveProducts (00-bridge, 03, 05, 09) · computeStock/productCategoryMap (09, 21) · poolStockMap (00-bridge)
  //   orderType/orderKibbutz (10) · productLabel & co (20, 21) · approveOrder (22) · invEditOrder/quickOrderStatus (00-bridge, 11)
  //   maybeShow* (10) · renderLowStockAlert (02, 10 → package R) · openStockChangeSheet · onVisitorChange (→ package V)
  const _sd = () => window.SHEET_DATA || {};
  function getActiveProducts() { return SigmaInv.activeProducts(_sd().products || [], typeof PRODUCT_LIST !== 'undefined' ? PRODUCT_LIST : []); }
  function computeStock() { return SigmaInv.stockByLocation(_sd().movements || []); }
  function poolStockMap() { return SigmaInv.poolStock(_sd().movements || []); }
  function productCategoryMap() { return SigmaInv.productCategoryMap(_sd().products || []); }
  function orderType(o) { return SigmaInv.orderType(o); }
  function orderKibbutz(o) { return SigmaInv.orderKibbutz(o, _sd().requirements || []); }
  function productLabel(p, opts) { return SigmaInv.productLabel(p, opts || {}); }
  function reportWiringOk(ps) { return SigmaInv.reportWiringOk(ps || []); }
  function reportPreview(p) { return SigmaInv.reportPreview(p); }
  window.productLabel = productLabel; window.reportWiringOk = reportWiringOk; window.reportPreview = reportPreview;
  function approveOrder(id) { invOpen({ kind: 'approve', id: id }); }
  function invEditOrder(id) { invOpen({ kind: 'order', id: id }); }
  function quickOrderStatus(id, status) { invOpen({ kind: 'status', id: id, status: status }); }
  function maybeShowAmichaiApprovalReminder() { invOpen({ kind: 'nudges' }); }
  function maybeShowOrderNotifications() { invOpen({ kind: 'nudges' }); }
  window.maybeShowAmichaiApprovalReminder = maybeShowAmichaiApprovalReminder;
  window.maybeShowOrderNotifications = maybeShowOrderNotifications;
  function renderLowStockAlert() {
    const lines = SigmaInv.lowStockLines(SigmaInv.lowStockReport(poolStockMap()), getCurrentUser());
    // (the DOM part of 08-inventory.js:62-100, moved verbatim, fed by `lines`)
  }
  // openStockChangeSheet + the stock-changed listener: 08-inventory.js:111-132, moved verbatim.
  // onVisitorChange: 07-orders.js:1119-1136, moved verbatim (package V deletes it with the legacy visit form).
```

  The two "moved verbatim" blocks are real code copied byte for byte from the named line ranges. The commit diff must
  show them as moves (`git diff -M --color-moved`).

- [ ] **Step 2: Remove the flag branches.** Every `if (invReact())` becomes unconditional (the React path).
- [ ] **Step 3: Voice code (O32).** Run `grep -c 'id="voiceModal"' index.html`.
  - If it prints `1`, package V hasn't removed the legacy form yet: move `07-orders.js:305-453` (the voice functions)
    verbatim into `06-inventory.js` under a header "→ package V".
  - If it prints `0`, delete them.
- [ ] **Step 4: Delete and rebuild.** `git rm js/src/06-products.js js/src/07-orders.js js/src/08-inventory.js`,
  delete the markup and functions listed, then `node build.mjs`.
- [ ] **Step 5: Run everything.**
  - `npm test`
  - the full Playwright suite (4 projects, `INV_DRIVER=react`; the legacy driver file is deleted)
  - `node scripts/inventory-golden-prod.mjs --verify …`
  - `grep -rn "invRenderOrders\|invRenderStock\|invRenderProducts\|invRenderKibbutzInventory\|invRenderReturns\|invRenderCerts\|invOrderModal\|invProductModal\|intakeModal" js/src index.html app/src`

  Expected: all green; the grep returns nothing.
- [ ] **Step 6: Graph and docs.**
  - Run `python docs/ops-graph/rebuild.py` and a Sonnet re-extraction of the changed docs.
  - Update `docs/modules.md`, `click-map.md` (via `scripts/click-map.mjs`), `integration-map.md` (build), INDEX,
    backlog, CHANGELOG.
  - This spec's STATUS becomes ✅ SHIPPED.
  - Tell the graph session.
- [ ] **Step 7: Commit** `refactor(inventory): delete the legacy inventory UI; 06-inventory.js compat shims only`.

**Acceptance:**
- Every §2.5 name resolves (a runner `test-inventory-compat.mjs` evaluates `js/app.js` in a DOM double and asserts
  `typeof window[name] === 'function'` for each).
- `?cert=` works.
- Every flow is green.
- `js/app.js` is smaller than before L6.
- `RETIREMENT_MAP.md`'s inventory targets show 0 remaining code dependencies apart from the compat shims.

---

## 12. Self-review

- **Spec coverage:**
  - Tab order → U1 (S19 test).
  - Real delete → L7 + U6 (F15).
  - No draft on close → U6 unit test.
  - The add-to-catalog path removed → L3 (`orderSavePlan` test) + U2 (F04).
  - SIM out → L2 (no SIM rule; `activeProducts` keeps archived rows out).
  - Breakpoint → only `public.movements` is read (L8 `fetchInventory`), and archive is untouched (L7).
  - Finding #2 → L2–L6 + the U10 compat file.
  - Legacy callers → §2.5 + §5 + the U10 compat runner.
  - `?cert=` + PDF → L5 byte goldens, F18 at every step.
  - Design gate → U8.
  - Playwright on the old code first → L1a–L1d before any lib change.
- **Placeholders:** none. The "moved verbatim" blocks in U10 name exact source line ranges to move, and the diff must
  show them as moves.
- **Type consistency:**
  - `Movement`, `OrderLike`, `ProductRow`, `ReqLike`, `ApprovalPlan`, `SavePlan`, `StatusPlan` and `DeletePreview` are
    defined in L2/L3/L7 and used with the same names in L8/U2–U7.
  - `InvDriver` is defined in L1a; `legacyDriver`/`reactDriver` implement it.
  - `invReactOpen` (U1) is renamed `invOpen` in U10: the only rename, and it's done in the same commit as the flag removal.
- **Review focus:** O18b (L3 test + F09c), O18a (L3 + F09b), D6 (L3 + F08), delete cascade (L7 SQL + F15), offline
  cert (L8 + F17). Each has its test in the owning task.
