# Unified company inventory + product display names + inventory alerts — design spec

STATUS: 🟢 APPROVED in principle by עידן 17.9.26 (chat) — NOT built. Open decisions in §8. Builds after the cards
redesign (`2026-09-17-kibbutz-cards-redesign-design.md`, Tasks 0–7) as Tasks 8–10 of the same plan.
Requested by עידן, 17.9.26: "עוברים לניהול מלאי אחוד לחברה ללא שיוך לעובד לאור פער ביכולת דיווח".

## 0. What עידן asked for

1. **One company-wide stock pool.** No more per-employee "bag" (אביאם / ניתאי / משרד locations). Reason: the field
   workers' reporting is not reliable enough to keep per-person balances honest.
2. **Two names per product.** A **technical name** (what אביאם, ניתאי, עמיחי see and work with) and a **display name**
   for reports and for the viewer/reports user. עידן edits both; reports show the display name.
3. **Orders keep their logic.** Only change: whenever an order changes stock, it moves against the unified pool.
4. **Alerts for everything.** Every stock change is visible as an alert; **עמיחי gets a digest of stock movements
   twice a day at fixed hours, 12:00 and 17:00** (Israel time).

## 1. Current model (what changes)

| Today | File | After |
|-------|------|-------|
| `movements` ledger: `from_location`/`to_location` are **person names** (אביאם, ניתאי, משרד…) or kibbutz names; stock = net per location (`08-inventory.js` builds `stock[location][product]`) | `08-inventory.js`, `07-orders.js`, `09-visits.js` | Company pool = one internal location **`חברה`**. Kibbutzim stay as *destinations* (what was supplied where). People are no longer locations. |
| Visit summary deducts issued products **from the visitor's location** | `09-visits.js:346-389` | Deducts from `חברה` → kibbutz. `created_by` = visitor (who did it stays on the row). |
| Customer-order approval deducts from the **responsible's** location; supplier delivery credits the **distribution** per person | `07-orders.js:512-560, 1275-1300` | Approval: `חברה` → kibbutz. Delivery: supplier → `חברה` (distribution UI collapses to one line: quantity received). Drop-ship unchanged (no movement). |
| SIMs checked against the holder's own stock | `08-inventory.js:24-60` | Against the pool. |
| Transfer between locations (person ↔ person) | `08-inventory.js:106-…` | **Removed** (no persons). Replaced by **"דיווח שינוי במלאי"** (§4b) — every change is linked to a visit, an order or a recount. |
| `products(id,name,category,active)` | `db/supabase_schema.sql:50` | + `display_name text`, `technical_name` = existing `name` (renamed in UI only), + `unit text default 'יח׳'`, + `min_qty numeric null` (low-stock alert threshold). |
| Viewer exports (stock by location / by kibbutz) | `21-excel-export.js` | Stock = pool; product column = display name. |
| Alerts: order approvals only | `push-send`, `22-push.js` | + inventory events + 12:00/17:00 digest. |

## 2. Data

### 2.1 Migration (one-shot, reversible: append-only ledger)
- Add `display_name`, `unit`, `min_qty` to `products`. Backfill `display_name = name`.
- **Pool consolidation:** for every person-location `L` in `INV_LOCATIONS` (not kibbutzim, not `חברה`) and every
  product with non-zero net at `L`, insert one movement `L → חברה` (qty = net, `reason='pool_migration'`,
  `ref_id='2026-09-xx'`, `created_by='עידן'`). Net per person becomes 0; pool = sum. Ledger history is untouched, so
  "who held what before" stays queryable.
- `INV_LOCATIONS` → `['חברה']` + kibbutz names as before; `NON_KIBBUTZ_LOCATIONS = ['חברה','ספק']`.

### 2.2 New table `inventory_alerts` (what the UI lists; the push is a side effect)
```
id uuid pk · kind text ('movement'|'low_stock'|'digest') · product text · qty numeric · from_location text ·
to_location text · reason text · ref_id text · actor text · created_at timestamptz default now() ·
seen_by text[] default '{}'
```
Written by a **Postgres trigger on `movements` insert** (so every path — visits, orders, adjust, migration —
produces one alert with zero client changes). The same trigger checks `min_qty` and inserts a `low_stock` alert
when the pool drops below it.

## 3. Product names

- Products page (`06-products.js`) gets two columns: **שם טכני** (`name`) and **שם לדוחות** (`display_name`), both
  editable in the product modal; only עידן (`isIdan()`) can edit `display_name`; technical name stays editable by
  אביאם/ניתאי/עמיחי/עידן as today.
- Helper `productLabel(name, {forReport})` → `display_name` when `forReport` or `isViewer()`, else `name`.
  Used by: viewer stock/kibbutz Excel, visits PDF/Excel, delivery-cert PDF **only when the cert is issued from the
  reports hub as a viewer** (a field-issued cert keeps technical names — the recipient signs for what is written on
  the box), monthly cert summary, "מלאי לפי קיבוץ".
- Visit checkboxes, order item pickers, EMS task text, inventory tables for staff: technical name.
- Contract test: for every export builder, no output cell contains a technical name that has a different display
  name (fixture with `name:'E360CT-3P', display_name:'מונה חשמל תלת-פאזי'`).

## 4. Orders (unchanged logic, new target)

- Supplier flow: `pending_approval → pending → ordered → arrived → delivered`. On `delivered`, movements
  `ספק → חברה` per item (one line, quantity = received; the per-person **distribution** step is removed from the
  form and from `orders.distribution` writes — column kept, unused).
- Customer flow: approval → movements `חברה → <kibbutz>` + EMS "אספקת ציוד" task as today (`orders_ems_task_id`,
  assignee, due date unchanged). Stock hint on each item = pool quantity.
- Drop-ship: no movement (unchanged). Idempotency guards unchanged (`refId` + `reason`).

## 4a. Orders on the inventory page — only the decisive stages, with an active note (עידן 18.9)
The order module keeps its full flow, but the inventory page shows orders as a **compact strip**: one row per open
order with only the stages that matter — **ממתין לאישור → הוזמן → הגיע → סופק** (4 dots; drop-ship shows `ספק ישיר`).
Each row carries **one active note** computed from the data, never free text: `⏳ ממתין לאישור עמיחי 3 ימים` ·
`🚚 הוזמן, צפוי 24.9` · `⚠️ באיחור 5 ימים מהתאריך הצפוי` · `📦 הגיע — לסמן סופק כדי שייכנס למלאי` · `🔗 לקוח: משימת EMS
פתוחה` · `⚠️ פריט לא בקטלוג`. Rows sorted by urgency (late → needs action → waiting → in transit). Tap → the existing
order modal. Closed orders are not on this page (they live in the orders history). The strip is also the "increase via
order" picker for §4b. Pure `orderNote(order, today)` → `{icon, text, level}` with goldens for each state.

## 4b. Reporting a stock change (עידן 17.9 — "חייב להיות מקושר כמו שצריך")

There is no free "adjust". A stock change is always one of three linked things, and the UI forces the link:

| Direction | The dialog asks | Result |
|-----------|-----------------|--------|
| **ירידה** (less in the pool) | "מה קרה?" → **📍 יצא בביקור** or **🔢 ספירה מחדש** | Visit: opens the visit form for the kibbutz with the product/qty pre-checked → the visit's normal movement `חברה → kibbutz` (reason `visit_supply`, `ref_id` = visit id) + the delivery-cert gate applies as always. Recount: user enters the **counted quantity** (not a delta); system computes `delta = counted − pool`, writes one movement `חברה → ספירה` (reason `recount`, note required, `ref_id` = recount id). |
| **עלייה** (more in the pool) | "מאיפה?" → **🧾 הזמנה** or **🔢 ספירה מחדש** | Order: pick an open supplier order (status ordered/arrived) → marks it delivered through the existing order flow → movement `ספק → חברה` (reason `order_delivery`, `ref_id` = order id). No matching order → the dialog offers "צור הזמנת ספק" (existing create flow) or falls back to recount. Recount: counted quantity → `ספירה → חברה` (reason `recount`). |

- Entry points: **📦 מלאי → "דווח שינוי"** button and the ⋯ on a product row; also from the visit form ("ציוד שסופק"
  is already this path) and from the order delivery step (already this path). Roles: all inventory actors (עידן,
  עמיחי, אביאם, ניתאי) may report a recount; every recount raises an alert to עידן + עמיחי (§5) with the note.
- `movements.reason` becomes an enum in the UI: `visit_supply` · `customer_supply` · `order_delivery` · `recount` ·
  `pool_migration` (legacy `manual` rows stay readable). `ref_id` is **required** for visit/order reasons; `recount`
  rows carry `ref_id` = a `stock_recounts(id, product, counted, before, delta, note, actor, created_at)` row so the
  count itself is auditable. The alerts list and the digest show the reason and a link to the visit/order/recount.
- Pure builders: `stockChangePlan({product, pool, direction, source, counted?, visitId?, orderId?, note?})` →
  `{movements:[…], recount?:{…}, requires:'visit'|'order'|null, errors:[…]}`; goldens: decrease via recount 38→35 →
  one `חברה → ספירה` ×3; increase via order → routes to the order flow (no direct movement); decrease via visit →
  routes to the visit form (no direct movement); recount without note → error `'חובה להזין הערה לספירה'`;
  recount equal to pool → error `'הספירה זהה למלאי — אין שינוי'`.

## 5. Alerts

### 5.1 In-app
- Bell icon in the header (React island `#sigma-alerts`, TanStack query `['inventoryAlerts']`, realtime via
  supabase-js `channel('inventory_alerts')`): list of alerts newest first, unseen count badge; row text
  `↘ 3 × E360CT · חברה → גבים · אביאם · 14:02 · סיכום ביקור`. Tap → opens the source (visit / order). Mark seen per
  user (`seen_by`).
- Who sees: עידן, עמיחי, אביאם, ניתאי (all inventory actors). Viewer: no bell (reports only).

### 5.2 Push
- **Immediate** push on `low_stock` to עידן + עמיחי (`push-send` mode `inventoryAlert`, fired by a DB webhook /
  `pg_net` call from the trigger — same mechanism as the existing order pushes).
- **Digest for עמיחי at 12:00 and 17:00 Israel** (עידן 17.9): `push-send` mode `inventoryDigest`, called by the
  existing hourly pg_cron job path (`attendanceCron` pattern: gate on `israelNow().hh === 12 || 17`; idempotent via
  `push_log` tag `inv-digest-<date>-<hh>`). Content: movements since the previous digest window (17:00→12:00 and
  12:00→17:00), grouped: `📦 תנועות מלאי 12:00 · 7 תנועות` / body lines `↗ +20 בקר 504 (ספק → חברה, הזמנה #123)`,
  `↘ −3 E360CT → גבים (אביאם, ביקור)`, `⚠️ מלאי נמוך: SIM 1NCE 4 יח׳`. Empty window → no push. Button **📦 פתח מלאי**
  → `#inventory`. Recipient list is a constant `INV_DIGEST_TO = ['עמיחי']`; עידן can add himself in the ⋯ settings
  later (not in scope).

## 6. UI changes (React islands, same stack as the cards redesign)

- Inventory page keeps its legacy structure this release but its stock matrix collapses to **one column (חברה)** +
  per-kibbutz "supplied" view; the transfer form is removed; the **דיווח שינוי במלאי** sheet (§4b) replaces any
  free adjust; product table gets the second name column.
- Bell + alerts list island; digest is server-only.
- RTL rule from the cards spec §6 applies (numbers LTR inside RTL rows: `<bdi>` around quantities and codes).

- **KPI tiles are tappable (עידן 17.9):** the three tiles at the top of the inventory page act as filters/links —
  **פריטים במאגר** → clears filters (full list); **תנועות היום** → opens the alerts list filtered to today's
  movements; **מלאי נמוך** → filters the product list to items below `min_qty` (and the chip row reflects it). Same
  pattern for the dashboard KPIs elsewhere (attendance KPIs → filtered day list; section counts → filter chips).

## 7. Tests (methodology)

- Pure `poolStock(movements)` → `{product: qty}` golden (incl. migration rows); `poolMigrationRows(stockByLocation)`
  golden (persons only, zero-net skipped, kibbutzim untouched).
- Orders: approval builder emits `חברה → kibbutz` rows; delivery builder emits `ספק → חברה`; drop-ship none; idempotent
  re-approve emits nothing.
- Visits: `visitMovementRows(visit)` from `חברה`.
- `productLabel` matrix (role × forReport); export builders contract (§3).
- Digest: `digestWindow(now)` (12:00 → since yesterday 17:00; 17:00 → since 12:00), `digestBody(rows)` golden Hebrew,
  hour gate, idempotency tag. Trigger SQL tested by inserting into a throwaway schema in a Supabase branch.
- Role matrix: viewer cannot adjust stock; only עידן edits `display_name`.

## 8. Open decisions for עידן

| # | Question | Default |
|---|----------|---------|
| I1 | Migration date / who runs it (moves every personal balance into `חברה` in one commit) | עידן runs `db/pool_migration.sql` after the release smoke |
| I2 | Should the digest also go to עידן? | No (עמיחי only), configurable later |
| I3 | Low-stock threshold per product (`min_qty`) — set now for the top items (בקר 504, E360CT, SIM)? | Leave null (no low-stock alerts) until עידן fills them in the product modal |
| I4 | Viewer delivery-cert PDF: display names (as spec) or technical names? | Display names for viewer-issued/viewed; technical on field-issued |
