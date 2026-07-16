# Drop-ship orders (ספק ישיר) + closed supplier list — design

STATUS: ✅ SHIPPED (2026-07-16)

## What
Two small pieces in order management:

### 1. ספק ישיר on customer orders
- The "👤 אחראי על האספקה" picker (customer orders, עידן/עמיחי) gets an option **"🏭 ספק ישיר"**
  (stored literally as `assignee: 'ספק ישיר'` — no schema change).
- Choosing it reveals the supplier field (same field supplier orders use); supplier name saves
  on the order (`supplier` column already exists).
- **Approval of a drop-ship customer order:** NO stock movements, NO EMS task. Just set the order
  to `supplied` + fulfil linked requirements. Confirm text says so explicitly.
- Order row shows "🏭 ספק ישיר · <supplier>" under the kibbutz instead of "👤 אחראי".

### 2. Supplier datalist (closed-ish value range)
- `#invOrderSupplier` gets `list="supplierList"`; a `<datalist id="supplierList">` is filled from
  distinct `supplier` values across `SHEET_DATA.orders` on modal open.
- Typing a new name = adding a supplier (it joins the list once the order saves). No management
  screen, no new table.

## Key code points
- `js/src/07-orders.js`: `isDirectSupply(o)` helper; `approveCustomerOrder` early drop-ship branch;
  row render `who` cell; `invSetOrderType`/assignee-change toggle of supplier wrap;
  `invPopulateSupplierList()` called from `invNewOrder`/`invEditOrder`.
- `index.html`: new option in `#invOrderAssignee` (with `onchange`), datalist on supplier input.

## Testing
`test-dropship.mjs` — pure copies of `isDirectSupply` + supplier-list builder + approval-branch
decision (movements? EMS?) asserted over supplier / regular customer / drop-ship orders.
