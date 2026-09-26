// 📦 Inventory boot glue (page island + nudges) — pulled out of main.tsx's boot chunk (26.9,
// boot-ceiling fix): both `#sigma-inventory`/`#sigma-inventory-nudges` mount points are always in
// index.html regardless of page, so the two `if (getElementById) import(...)` checks used to run
// unconditionally on EVERY boot as boot-chunk-eager code. Neither needs to be: this file is
// itself one dynamic import from main.tsx, so the checks (and the two imports they trigger) live
// in a lazy chunk instead — one extra network hop the very first time either fires, same as every
// other lazy island, and zero bytes in ui/sigma.js.
//
// StockChange and InventoryCert do NOT belong here even though they look like the same shape:
// both need their open-event LISTENER attached before the first tap can fire it (the visit
// form's "הפקת תעודה" / the מלאי page's "דיווח שינוי" button dispatch the raw event with no retry
// if nobody's listening yet), and stacking them behind this file's own dynamic import added one
// more network hop of latency that raced ahead of a fast test click (regression caught by
// qa/playwright/tests/inventory/certs.spec.ts F17/F17b) — so they stay directly in main.tsx.
// Inventory/InventoryNudges have no such race: nothing dispatches their open event synchronously
// at boot, so the extra hop is free.
export function mountInventoryBoot(): void {
  import('@/islands/Inventory').then(m => m.mountInventory()).catch(e => console.warn('[sigma] inventory island failed', e));
  import('@/islands/InventoryNudges').then(m => m.mountInventoryNudges()).catch(e => console.warn('[sigma] inventory-nudges island failed', e));
}
