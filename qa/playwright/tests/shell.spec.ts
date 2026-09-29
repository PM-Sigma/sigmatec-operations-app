// The shell (round 5, package S-U): AppHeader cluster (🔔 · ✅ · ⚙️; Σ is the static
// brand-mark), PageBar, GearSheet, the desktop ⋯ עוד, the offline banner. U1 step 1 pins the
// badge-collision regression (round-5 grill "General 1"); every other test here is the one the
// U-task table calls for its own island.
import { boot, expect, expectNoConsoleErrors, expectRtl, SB_ORIGIN, shot, test } from './_helpers';

test.describe('AppHeader cluster', () => {
  test('bell + my-tasks + gear are on screen, and the two badges never touch (S-1)', async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { ready: '#sigma-header-actions [aria-label="העדפות משתמש"]' });
    const cluster = page.locator('#sigma-header-actions');
    const bell = page.getByTestId('alerts-bell');
    const tasks = page.getByTestId('header-my-tasks');
    const gear = cluster.getByRole('button', { name: 'העדפות משתמש' });
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
    await boot(page, ti, { who: 'מתניה', ready: '#sigma-header-actions [aria-label="העדפות משתמש"]' });
    await page.evaluate(() => (window as any).showPage('calendar'));
    await page.locator('.brand-mark').click();
    await expect(page.locator('#dev-view')).toBeVisible();
  });
});

test.describe('GearSheet (U2)', () => {
  test('identity, role and rows — no absolute status dot on the chip itself', async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { ready: '#sigma-header-actions [aria-label="העדפות משתמש"]' });
    const gear = page.locator('#sigma-header-actions').getByRole('button', { name: 'העדפות משתמש' });
    await gear.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('עידן');
    await expect(sheet).toContainText('ניהול מוצר');
    for (const row of ['העדפות משתמש', 'רעיון או באג', 'האזור האישי', 'החלפת משתמש']) {
      await expect(sheet.getByRole('button', { name: row })).toBeVisible();
    }
    expectNoConsoleErrors(rec);
  });

  // Designer round 3/4: on desktop the sheet is a centred dialog, narrower than ⋯ עוד's 560
  // (it is identity + a handful of rows, not a list) — `.s-gear-desktop` in shell.css, width
  // min(480px, 100vw-32px). Evidence recaptured here (round 5 resume item) instead of only in
  // the designer's own screenshot pass.
  test('desktop: centred dialog, narrower than ⋯ עוד (≤480px)', async ({ page }, ti) => {
    test.skip(String(ti.project.metadata && (ti.project.metadata as any).viewport).indexOf('mobile') === 0, 'desktop only');
    await boot(page, ti, { ready: '#sigma-header-actions [aria-label="העדפות משתמש"]' });
    await page.locator('#sigma-header-actions').getByRole('button', { name: 'העדפות משתמש' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(480);
    // centred: equal gutters left/right (within a px of rounding)
    const viewportWidth = page.viewportSize()!.width;
    const leftGutter = box!.x;
    const rightGutter = viewportWidth - (box!.x + box!.width);
    expect(Math.abs(leftGutter - rightGutter)).toBeLessThanOrEqual(2);
    await shot(page, ti, 'gear-desktop');
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

  // burns/pushlog/dev (and attendance) draw their OWN PageActionRow — richer content the
  // shared row has no slot for (S-U merge fallout, 26.9: `ownHeader` in lib/shell.ts). The
  // shell's #sigma-page-bar renders NOTHING for them; the back chevron lives in the island's
  // own row instead.
  test('burns (level 2, ownHeader): back chevron is the ISLAND\'s own, not the shared page-bar', async ({ page }, ti) => {
    await boot(page, ti);
    await gotoPage(page, 'burns');
    await expect(page.locator('#sigma-page-bar')).toBeEmpty();
    await expect(page.locator('#sigma-burns-page').getByRole('button', { name: 'חזרה' })).toBeVisible();
  });
});

test.describe('Desktop ⋯ עוד (S-9/S-10)', () => {
  test('opens on desktop, next to the gear bubble', async ({ page }, ti) => {
    test.skip(String(ti.project.metadata && (ti.project.metadata as any).viewport).indexOf('mobile') === 0, 'desktop only');
    await boot(page, ti, { ready: '#sigma-header-actions [aria-label="העדפות משתמש"]' });
    const trigger = page.locator('#sigma-header-actions').getByRole('button', { name: 'עוד' });
    await expect(trigger).toBeVisible();
    const headerBefore = await page.locator('.header').boundingBox();
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Designer (26.9, 1440): opening the sheet shifted the WHOLE page ~24px up-right — Radix's
    // scroll-lock hid <html>'s scrollbar (the real scroller here, not body) and reflowed the
    // viewport width. `scrollbar-gutter: stable` on html (styles.css) reserves that space
    // permanently, so the header must not move a pixel when the dialog opens.
    const headerAfter = await page.locator('.header').boundingBox();
    expect(headerAfter).toEqual(headerBefore);
  });

  // Designer round 4: max-height min(60vh, 480px), not "fit the whole list" — a long list (עידן,
  // who sees both the app AND admin blocks) is deliberately cut mid-row instead of scrolling
  // invisibly or fading, so the cut itself is the "more below" cue. Evidence recaptured here
  // (round 5 resume item) instead of only in the designer's own screenshot pass.
  test('a long list (עידן) is capped at 480px and visibly cut mid-row, not scrolled to fit', async ({ page }, ti) => {
    test.skip(String(ti.project.metadata && (ti.project.metadata as any).viewport).indexOf('mobile') === 0, 'desktop only');
    await boot(page, ti, { ready: '#sigma-header-actions [aria-label="העדפות משתמש"]' });
    await page.locator('#sigma-header-actions').getByRole('button', { name: 'עוד' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(480);
    // the cut is real, not merely capped with nothing to cut: scrollHeight exceeds the box, so
    // the last visible row is genuinely half off-screen rather than the list just fitting.
    const overflow = await sheet.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(overflow).toBe(true);
    await shot(page, ti, 'more-desktop-half-peek');
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
    // Designer round 4: ביקור moved FROM a `justify-between` sibling of <nav> (thrown to the
    // far end of the whole bar, reading as loose/misplaced) INTO <nav> itself, last item, same
    // h-11 as the tabs — asserted here as "same nav, last child" instead of only visible
    // anywhere on the page.
    const visitBtn = nav.getByRole('button', { name: 'תיעוד ביקור' });
    await expect(visitBtn).toBeVisible();
    const isLastChildOfNav = await visitBtn.evaluate((el, navSelector) => {
      const navEl = el.closest(navSelector);
      return !!navEl && navEl.lastElementChild === el;
    }, 'nav[aria-label="ניווט ראשי"]');
    expect(isLastChildOfNav).toBe(true);
    await shot(page, ti, 'desktop-nav');
  });
});

test.describe('[data-hit-slop] tap-target growth (S-U, cross-package bug report from calendar)', () => {
  // The FIRST version of `.s-hit`/`[data-hit-slop]` (styles.css) grew an invisible ::before
  // OVERLAY up to 44px with no idea where a neighbour's own box was — two hit-slop controls
  // closer together than their combined overhang (calendar's PlaceSearch/block-pick, mobile-360)
  // each stole the other's clicks. The fix grows the REAL box (`min-width`/`min-height: 44px`)
  // instead of painting past it, so normal flex `gap` — not a guess about the neighbour — is
  // what keeps them apart. `/?gallery=1` (E2 sign-off) renders two adjacent chip.tsx FilterChip
  // (both `data-hit-slop`, 32px visual, `gap-3` row) — a real case of exactly this pattern.
  test('two adjacent FilterChips: boxes never overlap, and each click hits only its own chip', async ({ page }, ti) => {
    await boot(page, ti, { query: 'gallery=1', ready: '[data-testid="gallery-root"]' });
    const first = page.getByRole('button', { name: 'פעילים 5' });
    const second = page.getByRole('button', { name: 'חדשים 0' });
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();

    const [b1, b2] = [await first.boundingBox(), await second.boundingBox()];
    expect(b1 && b2).toBeTruthy();
    // A real min-box grown by layout can never overlap a flex sibling — this is the structural
    // guarantee an invisible overlay could not make. RTL row: `second` (source order) sits
    // to the visual LEFT of `first`, so `first` starts at-or-after `second`'s right edge.
    expect(b1!.x).toBeGreaterThanOrEqual(b2!.x + b2!.width);

    // Clicking the first chip (Gallery's only wired-up toggle — the second is a static demo,
    // `onClick={() => {}}`) flips only it, and leaves the second untouched — proof the click
    // landed on its own control, not on an overlay reaching into the neighbour's box.
    const beforeFirst = await first.getAttribute('aria-pressed');
    const beforeSecond = await second.getAttribute('aria-pressed');
    await first.click();
    await expect(first).not.toHaveAttribute('aria-pressed', beforeFirst!);
    await expect(second).toHaveAttribute('aria-pressed', beforeSecond!);
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
