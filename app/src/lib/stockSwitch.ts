// The inventory switch (settings row `stock_enforced`, db/inventory_stock_enforced.sql) as the React side reads it:
// through the bridge's settings snapshot. Missing row / no bridge = on (the pre-switch behaviour). Rule: stockEnforced() in inventory.ts.
import { sigma } from '@/bridge';

export function stockOn(): boolean {
  try { return sigma?.stockEnforced?.() !== false; } catch { return true; }
}
