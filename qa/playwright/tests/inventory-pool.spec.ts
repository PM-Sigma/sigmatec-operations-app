// 📦 מלאי אחוד — the pool view and 🔢 דיווח שינוי במלאי (inventory spec §1, §4b, Task 8).
//
// What only a real browser can answer: the מלאי page really collapsed to ONE column (חברה) and
// the transfer / free-adjust forms are gone from the DOM; the visit form's מלאי מקור offers the
// pool and nothing else; and the 🔢 sheet's recount round trip WRITES BOTH ROWS — the auditable
// `stock_recounts` row and its `חברה → ספירה` movement — with the counted quantity and the note
// on them. The rules themselves are goldens (app/src/lib/inventory.test.ts + stockChange.test.ts)
// and the legacy half is test-inventory-pool.mjs.
import { boot, expect, expectNoConsoleErrors, expectRtl, installRoutes, shot, test, watchConsole, SB_ORIGIN } from './_helpers';

/** The rows the harness stored, read back through the page (the routes are page-scoped). */
async function rows(page: any, table: string): Promise<any[]> {
  return await page.evaluate(async ([origin, t]: string[]) => {
    const r = await fetch(origin + '/rest/v1/' + t + '?select=*', { headers: { apikey: 'anon' } });
    return await r.json();
  }, [SB_ORIGIN, table]);
}

async function openStockTab(page: any) {
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.locator('[data-inv-tab="stock"]').click();
  await expect(page.getByTestId('inv-pool')).toBeVisible({ timeout: 15_000 });
}

test('the מלאי page is ONE pool — and the retired forms are not in the DOM', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  const pool = page.getByTestId('inv-pool');
  await expect(pool).toContainText('חברה');
  // 40 delivered − 3 supplied on a visit = 37 (js/src/01-data.js mock ledger).
  await expect(pool).toContainText('מונה Landis+Gyr E360PP');
  await expect(pool).toContainText('37');
  // Nobody's name is a location any more.
  for (const person of ['אביאם', 'ניתאי', 'משרד', 'עמיחי']) {
    await expect(pool).not.toContainText(person);
  }
  // The transfer form and the free הוספה/הפחתה card are gone (§1, §4b).
  await expect(page.locator('#transferFrom')).toHaveCount(0);
  await expect(page.locator('#adjustLocation')).toHaveCount(0);
  await expect(page.locator('#invReportChange')).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'pool');
  await expectNoConsoleErrors(rec);
});

test('מלאי נמוך is a tappable filter', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  await expect(page.getByTestId('inv-pool')).toContainText('בקר 504');
  await page.locator('[data-kpi="low"]').click();
  // מונה PM135 is 2 in the pool, under its red line (min 5); the בקר is not a red-line item at
  // all, and SIM has no red line any more (round 5 Phase 1, עידן 23.9).
  await expect(page.getByTestId('inv-pool')).toContainText('מונה PM135');
  await expect(page.getByTestId('inv-pool')).not.toContainText('בקר 504');
  await expect(page.getByTestId('inv-pool')).not.toContainText('סים 1NCE');
  await shot(page, ti, 'low-filter');
  await expectNoConsoleErrors(rec);
});

test('🔢 a recount writes the stock_recounts row AND its חברה → ספירה movement', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  await page.locator('#invReportChange').click();
  const sheet = page.getByTestId('stock-change-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });

  await sheet.getByTestId('sc-product').selectOption('סים 1NCE');
  await sheet.getByTestId('sc-dir-decrease').click();
  await sheet.getByTestId('sc-src-recount').click();
  await sheet.getByTestId('sc-counted').fill('1');
  await sheet.getByTestId('sc-note').fill('נספר במחסן');
  await expectRtl(page);
  await shot(page, ti, 'recount');
  await sheet.getByTestId('sc-submit').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  const recounts = await rows(page, 'stock_recounts');
  expect(recounts).toHaveLength(1);
  expect(recounts[0].product).toBe('סים 1NCE');
  expect(recounts[0].counted).toBe(1);
  expect(recounts[0].before).toBe(4);
  expect(recounts[0].delta).toBe(-3);
  expect(recounts[0].note).toBe('נספר במחסן');

  const moves = await rows(page, 'movements');
  expect(moves).toHaveLength(1);
  expect(moves[0].from_location).toBe('חברה');
  expect(moves[0].to_location).toBe('ספירה');
  expect(moves[0].quantity).toBe(3);
  expect(moves[0].reason).toBe('recount');
  expect(String(moves[0].ref_id)).toMatch(/^rc-/);

  await expectNoConsoleErrors(rec);
});

test('🔢 a decrease that went out on a visit ROUTES to the visit form — it writes nothing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await openStockTab(page);

  await page.locator('#invReportChange').click();
  const sheet = page.getByTestId('stock-change-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await sheet.getByTestId('sc-product').selectOption('בקר 504');
  await sheet.getByTestId('sc-dir-decrease').click();
  await sheet.getByTestId('sc-src-visit').click();
  await sheet.getByTestId('sc-submit').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  expect(await rows(page, 'movements')).toHaveLength(0);
  expect(await rows(page, 'stock_recounts')).toHaveLength(0);
  await expectNoConsoleErrors(rec);
});

test('the visit form supplies from חברה and from nowhere else', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);
  await page.waitForSelector('#sigma-home .kibbutz');

  const values = await page.evaluate(() => {
    const sel = document.getElementById('visitSource') as HTMLSelectElement | null;
    return sel ? Array.from(sel.options).map(o => o.value) : [];
  });
  expect(values).toEqual(['חברה']);
  await expectNoConsoleErrors(rec);
});

// P1: the certificates tab used to repaint on every renderInventory() call — including the 15s
// home-data poll and the resize-breakpoint re-render — even when the fetched rows were byte-identical
// to what was already on screen ("רענונים כל הזמן"). invRenderCerts() now skips the DOM rebuild when
// an unforced call's fetch comes back unchanged for the same from/to/search. Proven here by counting
// actual repaints (a MutationObserver on #invCertsList, since a `<tbody>` and a placeholder div both
// count as one "childList" mutation each time innerHTML is reassigned) across several renderInventory()
// calls that mimic the poll while nothing in the data changed.
test('🚚 the certificates tab does not repaint on repeated renderInventory() calls with unchanged data', async ({ page }, ti) => {
  // window._sbCertGet only exists on the REAL Supabase boot path (js/src/01-data.js) — every
  // other spec in this file boots with the legacy `sb=0` mock, where invRenderCerts always
  // shows the static "לא זמין במצב הדגמה" placeholder and the caching logic under test never
  // runs. Boot the same way boot-console.spec.ts's `supabase` mode does: `sb=1` + a stubbed
  // EMS pass, so the certs tab actually fetches from the (route-stubbed) Supabase REST API.
  const rec = watchConsole(page);
  await installRoutes(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dashboard_user_v1', 'עידן');
      localStorage.setItem('dashboard_role_v1', 'idan');
      localStorage.setItem('dashboard_auth_v4', 'ok');
      localStorage.setItem('ems_token_v1', 'stub-token');
      localStorage.setItem('ems_token_at_v1', String(Date.now()));
    } catch { /* private mode */ }
    (window as any)._pushPromptShown = true;
    (window as any)._attReminderShown = true;
    (window as any)._fieldPromptShown = true;
  });
  await page.goto('/index.html?login=0&sb=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#sigma-nav')).toBeAttached();
  await page.waitForSelector('#sigma-home .kibbutz', { timeout: 30_000 });

  // a stray Radix overlay (ReLoginSheet or similar, outside boot()'s usual once-per-session
  // latches) can be mounted-but-hidden on this manual sb=1 boot path and still swallow the
  // click; this spec is about the certs-tab repaint count, not that overlay, so drive the tab
  // switch through the same global the onclick handler calls instead of a real click.
  await page.evaluate(() => (window as any).showPage('inventory'));
  await page.evaluate(() => (window as any).invShowTab('certs'));
  await expect(page.locator('#inv-section-certs')).toHaveClass(/active/);
  // first paint (the "⏳ טוען" placeholder → the real table/empty-state) has already happened via
  // invShowTab's renderInventory() call above — wait for the loading placeholder to clear and
  // confirm the demo-mode message is NOT what we're looking at (i.e. the real fetch path ran).
  await expect(page.locator('#invCertsList')).not.toContainText('טוען תעודות', { timeout: 15_000 });
  await expect(page.locator('#invCertsList')).not.toContainText('לא זמין במצב הדגמה');

  const repaints = await page.evaluate(async () => {
    const root = document.getElementById('invCertsList')!;
    let count = 0;
    const obs = new MutationObserver(() => { count++; });
    obs.observe(root, { childList: true, subtree: false });
    // simulate the 15s home-data poll firing five times in a row with nothing changed.
    // renderInventory() itself fires invRenderCerts() WITHOUT awaiting it (fire-and-forget,
    // same as production) — call the exact same function it calls, but awaited, so five
    // simulated poll ticks run one after another instead of racing each other.
    for (let i = 0; i < 5; i++) {
      await (window as any).invRenderCerts();
    }
    obs.disconnect();
    return count;
  });

  expect(repaints).toBe(0);
  await expectNoConsoleErrors(rec);
});
