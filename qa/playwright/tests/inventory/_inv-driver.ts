// The driver contract L1b–L1d write flows against (legacy today; a react driver lands in U1).
// Same specs, same assertions, two implementations — that is what proves the React rewrite
// really does what the old screens do, not just what the plan says they do.
import type { Page, TestInfo } from '@playwright/test';
import { boot, installRoutes, watchConsole, type Who } from '../_helpers';
import { INVENTORY, toSheet } from './_inv-fixtures';
import { recordLegacyWrites } from './_inv-ledger';
import { legacyDriver } from './_inv-legacy';

export type InvTab = 'orders' | 'stock' | 'certs' | 'kibbutz' | 'returns' | 'products';
export interface NewOrder {
  type: 'supplier' | 'customer';
  supplier?: string; kibbutz?: string; createdBy?: string;
  items: Array<{ name: string; qty: number }>;
  raw?: string;
}

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

/** Which driver a spec runs against: `INV_DRIVER=react npx playwright test …` (default: legacy).
 * The react driver lands in task U1 (behind INV_REACT, gated — not built by package L). */
export function driverFor(): InvDriver {
  if (process.env.INV_DRIVER === 'react') {
    throw new Error('INV_DRIVER=react: the react driver (_inv-react.ts) is a U1 task, not built yet.');
  }
  return legacyDriver;
}

/** Deliberate legacy↔react differences (the fixes/rulings named DELTAS in §7/§9). Both drivers'
 * specs branch on `d.name` and cite the matching key so a reviewer sees WHY, not just a diff. */
export const DELTAS = {
  P13: 'toggle active no longer blanks name/category (PATCH instead of full-row upsert)',
  O4: 'נכנס למלאי (quick arrived→delivered) posts ספק → חברה once',
  O18a: 'saving an arrived order unchanged keeps it arrived (no re-delivery)',
  O18b: 'saving a pending_approval order from the edit sheet keeps pending_approval',
  O27: 'a non-catalog order line is blocked at save ("הסרת השורות"), no add-to-catalog path',
  S19: 'tab order is the round-5 ruling order',
  P17: 'products can be deleted (react only, עידן only)',
} as const;

/**
 * Boot the app for an inventory flow spec: SHEET_DATA (products/orders/movements/requirements/
 * returns) is seeded from the one fixture set BEFORE any page script runs, via the `?sb=0` mock
 * seam (js/src/01-data.js `mockSheetData()` → `...window.__MOCK_EXTRA`) — same fast, hermetic
 * path every other spec in this suite boots through. `installRoutes({inventory:true})` also
 * seeds the real-Supabase-backed stores (harmless and unused under sb=0; it's what the certs
 * boot path below, and a future react driver, read instead).
 */
export async function bootInv(page: Page, ti: TestInfo, who: Who, d: InvDriver, opts: { query?: string; nudges?: boolean; ready?: string; storage?: Record<string, string> } = {}) {
  // Registered BEFORE navigation: a push deep link (F21) can fire a confirm() before boot()'s
  // own wait resolves, and an unhandled dialog is auto-DISMISSED (not accepted) by Playwright.
  page.on('dialog', x => x.accept());
  await page.addInitScript(([sheet, suppress]) => {
    (window as any).__MOCK_EXTRA = sheet;
    // עמיחי's floating ">10 items" nudge and the approved-order notice are Task 20 (nudges.spec.ts)
    // territory, not this driver's — every other spec presets the once-per-session latch off.
    if (suppress) { (window as any)._amichaiApprovalShown = true; (window as any)._orderNotifShown = true; }
  }, [toSheet(INVENTORY), opts.nudges !== true] as const);
  const booted = await boot(page, ti, { who, inventory: true, query: opts.query, ready: opts.ready, storage: opts.storage } as any);
  // Registered AFTER boot() (so it wins over installRoutes's broad /rest+functions catch-all —
  // Playwright tries the LAST-registered matching handler first): the AI parser (parse-order) is
  // never deployed in this harness, and falling through the generic /functions/v1/ 401 catch-all
  // also fires emsRequireLogin() on the way (js/src/07-orders.js parseRawToItems, its
  // `r.status===401` branch), popping the app-wide ReLoginSheet and blocking every click after
  // it. 503 ("not deployed") is what a real undeployed function returns, and falls back to the
  // local parser without that side effect.
  await page.route('**/functions/v1/parse-order', route => route.fulfill({ status: 503, body: '' }));
  await recordLegacyWrites(page);
  return booted;
}

/**
 * Certificates only: js/src/20-delivery-cert.js's `_sbCertGet` (and therefore the whole certs
 * tab, `?cert=`, and the send panel's site_contacts lookup) is wired up ONLY on the real-Supabase
 * boot path (`sb=1` — see js/src/01-data.js `USE_SUPABASE`); under the sb=0 mock `_sbCertGet`
 * stays undefined and the tab always shows "לא זמין במצב הדגמה" (confirmed against the existing
 * qa/playwright/tests/inventory-pool.spec.ts "certificates tab" spec, which boots the same way).
 * `login=0` still skips the EMS gate, so no PIN/EMS login flow gets in the way.
 */
export async function bootInvCerts(page: Page, ti: TestInfo, who: Who) {
  page.on('dialog', x => x.accept());
  const rec = watchConsole(page);
  await installRoutes(page, { inventory: true });
  await page.route('**/functions/v1/parse-order', route => route.fulfill({ status: 503, body: '' }));
  const role = who === 'צפייה' ? 'viewer' : (who === 'עידן' ? 'idan' : 'team');
  await page.addInitScript(entries => {
    try { for (const [k, v] of Object.entries(entries as Record<string, string>)) localStorage.setItem(k, v); } catch { /* private mode */ }
    (window as any)._pushPromptShown = true;
    (window as any)._attReminderShown = true;
    (window as any)._fieldPromptShown = true;
  }, { dashboard_user_v1: who, dashboard_role_v1: role, dashboard_auth_v4: 'ok', theme: 'light' });
  await page.goto('/index.html?login=0&sb=1', { waitUntil: 'domcontentloaded' });
  await page.locator('#sigma-nav').waitFor({ state: 'attached' });
  await page.waitForSelector('#sigma-home .kibbutz', { timeout: 30_000 });
  await recordLegacyWrites(page);
  return { rec };
}
