// The shell (round 5, package S-U): AppHeader cluster (🔔 · ✅ · ⚙️; Σ is the static
// brand-mark), PageBar, GearSheet, the desktop ⋯ עוד, the offline banner. U1 step 1 pins the
// badge-collision regression (round-5 grill "General 1"); every other test here is the one the
// U-task table calls for its own island.
import { boot, expect, expectNoConsoleErrors, expectRtl, SB_ORIGIN, test } from './_helpers';

test.describe('AppHeader cluster', () => {
  test('bell + my-tasks + gear are on screen, and the two badges never touch (S-1)', async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { ready: '#sigma-header-actions [aria-label="הגדרות"]' });
    const cluster = page.locator('#sigma-header-actions');
    const bell = page.getByTestId('alerts-bell');
    const tasks = page.getByTestId('header-my-tasks');
    const gear = cluster.getByRole('button', { name: 'הגדרות' });
    await expect(bell).toBeVisible();
    await expect(tasks).toBeVisible();
    await expect(gear).toBeVisible();

    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`, kind: 'movement', product: `p${i}`, qty: 1, from_location: 'חברה', to_location: 'חוקוק',
      reason: 'visit', ref_id: `v${i}`, actor: 'אביאם', created_at: new Date(Date.now() - i * 3.6e6).toISOString(), seen_by: [],
    }));
    await page.route(`${SB_ORIGIN}/rest/v1/inventory_alerts*`, r => r.fulfill({ json: many }));
    await page.reload();
    await page.waitForSelector('[data-testid="alerts-bell"]');
    const badge = page.getByTestId('alerts-badge');
    await expect(badge).toHaveText('9+');
    const [b, bb] = [await badge.boundingBox(), await bell.boundingBox()];
    expect(b && bb).toBeTruthy();
    // the badge sits inside its OWN bubble's box, ≤4px overhang — it can never reach a
    // neighbour bubble across the header cluster's 8px gap.
    expect(b!.x).toBeGreaterThanOrEqual(bb!.x - 4 - 0.5);

    await expectRtl(page);
    expectNoConsoleErrors(rec);
  });

  test('Σ (the brand-mark) goes to the role landing', async ({ page }, ti) => {
    await boot(page, ti, { who: 'מתניה', ready: '#sigma-header-actions [aria-label="הגדרות"]' });
    await page.evaluate(() => (window as any).showPage('calendar'));
    await page.locator('.brand-mark').click();
    await expect(page.locator('#dev-view')).toBeVisible();
  });
});

test.describe('GearSheet (U2)', () => {
  test('identity, role and rows — no absolute status dot on the chip itself', async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { ready: '#sigma-header-actions [aria-label="הגדרות"]' });
    const gear = page.locator('#sigma-header-actions').getByRole('button', { name: 'הגדרות' });
    await gear.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('עידן');
    await expect(sheet).toContainText('ניהול מוצר');
    for (const row of ['הגדרות', 'רעיון או באג', 'האזור האישי', 'החלפת משתמש']) {
      await expect(sheet.getByRole('button', { name: row })).toBeVisible();
    }
    expectNoConsoleErrors(rec);
  });
});

test.describe('bell (U4)', () => {
  test('freshness line in the sheet', async ({ page }, ti) => {
    await boot(page, ti, { ready: '[data-testid="alerts-bell"]' });
    await page.evaluate(() => {
      (window as any).__sigmaLastUpdated = new Date().toISOString();
      window.dispatchEvent(new CustomEvent('sigma-last-updated', { detail: (window as any).__sigmaLastUpdated }));
    });
    await page.getByTestId('alerts-bell').click();
    await expect(page.getByRole('dialog')).toContainText(/עודכן היום \d\d:\d\d/);
  });

  test('מתניה has a bell with an empty state', async ({ page }, ti) => {
    await boot(page, ti, { who: 'מתניה', ready: '[data-testid="alerts-bell"]' });
    await page.getByTestId('alerts-bell').click();
    await expect(page.getByRole('dialog')).toContainText('עוד לא נשלחו התראות.');
  });
});

test.describe('PageBar (U3)', () => {
  // useCurrentPage (lib/currentPage.ts) only re-reads window._currentPage on a real click or
  // hashchange — a plain page.evaluate(showPage(...)) never fires either, so a genuine click
  // follows every programmatic page change here.
  const gotoPage = (page: import('@playwright/test').Page, id: string) =>
    page.evaluate(p => { (window as any).showPage(p); document.body.click(); }, id);

  test('inventory: title + the primary bubble, no back chevron', async ({ page }, ti) => {
    await boot(page, ti, { ready: '#sigma-page-bar h1' });
    await gotoPage(page, 'inventory');
    const bar = page.locator('#sigma-page-bar');
    await expect(bar.locator('h1')).toHaveText('מלאי');
    await expect(bar.getByRole('button', { name: 'חזרה' })).toHaveCount(0);
  });

  test('burns (level 2): back chevron present', async ({ page }, ti) => {
    await boot(page, ti, { ready: '#sigma-page-bar h1' });
    await gotoPage(page, 'burns');
    const bar = page.locator('#sigma-page-bar');
    await expect(bar.getByRole('button', { name: 'חזרה' })).toBeVisible();
  });
});

test.describe('Desktop ⋯ עוד (S-9/S-10)', () => {
  test('opens on desktop, next to the gear bubble', async ({ page }, ti) => {
    test.skip(String(ti.project.metadata && (ti.project.metadata as any).viewport).indexOf('mobile') === 0, 'desktop only');
    await boot(page, ti, { ready: '#sigma-header-actions [aria-label="הגדרות"]' });
    const trigger = page.locator('#sigma-header-actions').getByRole('button', { name: 'עוד' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('desktop nav (U6)', () => {
  test('no legacy page-nav, no floating visit FAB on desktop', async ({ page }, ti) => {
    test.skip(String(ti.project.metadata && (ti.project.metadata as any).viewport).indexOf('mobile') === 0, 'desktop only');
    await boot(page, ti, { ready: '#sigma-desktop-nav nav' });
    await expect(page.locator('.page-nav')).toHaveCount(0);
    await expect(page.locator('#visitFab')).toHaveCount(0);
  });

  test('the top-tab row carries the same tabs as the phone bar, plus ביקור', async ({ page }, ti) => {
    test.skip(String(ti.project.metadata && (ti.project.metadata as any).viewport).indexOf('mobile') === 0, 'desktop only');
    await boot(page, ti, { ready: '#sigma-desktop-nav nav' });
    const nav = page.locator('#sigma-desktop-nav nav[aria-label="ניווט ראשי"]');
    for (const label of ['קיבוצים', 'יומן', 'מלאי']) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.locator('#sigma-desktop-nav').getByRole('button', { name: 'תיעוד ביקור' })).toBeVisible();
  });
});

test.describe('OfflineBanner (S-14)', () => {
  test('shows on the first render when navigator.onLine is already false', async ({ page }, ti) => {
    // Forcing navigator.onLine BEFORE any app script runs (an init script, not
    // context.setOffline — that blocks the app's own network fetches too, including the
    // navigation to index.html itself) reproduces "a phone that opens the app with no
    // signal" (Review Focus 4): useOnline must read false on its very first render, not
    // only after a later `offline` event.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true });
    });
    await boot(page, ti, { ready: '#sigma-offline' });
    await expect(page.locator('#sigma-offline')).toContainText('אין חיבור');
  });

  test('renders nothing while online', async ({ page }, ti) => {
    await boot(page, ti, { ready: '#sigma-nav' });
    await expect(page.locator('#sigma-offline')).toBeEmpty();
  });
});
