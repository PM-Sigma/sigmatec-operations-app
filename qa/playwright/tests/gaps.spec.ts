// 📋 הפערים שלי (spec §7h) — the list, its one-button rows, and the 🔔 that only the people
// who may nudge can see.
//
// The fixture is injected by the spec rather than by the shared harness: a gap is by
// definition an OLD day (today is never a gap — the 2 h reminder owns today), and the shared
// check-in fixture is today's. The route override below is registered after `boot()`, so it
// takes precedence over the harness route for `field_checkins`.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

/** Four days ago — inside the three-week window and comfortably not today. */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const KIBBUTZ = 'גבים';

/** One arrival, four days back, with no visit summary behind it → exactly one visit gap. */
async function seedOldCheckin(page: any, person: string) {
  await page.route(SB_ORIGIN + '/rest/v1/field_checkins*', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'gap-fixture-1', person, kibbutz: KIBBUTZ,
        checked_in_at: daysAgo(4) + 'T07:30:00.000Z', dismissed: false, reminded_at: null,
      }]),
    }));
}

const openGaps = async (page: any) => {
  await page.waitForSelector('#sigma-gaps[data-sigma-mounted="1"]', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-gaps')));
  const sheet = page.getByTestId('gaps-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
};

test('gaps: a field worker sees the visit he never summarised, with the button that closes it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await seedOldCheckin(page, 'אביאם');

  const sheet = await openGaps(page);
  await expect(sheet.getByRole('heading', { name: 'הפערים שלי' })).toBeVisible();

  const list = page.getByTestId('gaps-list');
  await expect(list).toBeVisible();
  await expect(list.getByText(new RegExp('היית ב' + KIBBUTZ + '.*ואין סיכום ביקור'))).toBeVisible();
  // One action per row, and it is the one that closes THAT gap.
  await expect(list.getByRole('button', { name: '📍 סיכום ביקור' }).first()).toBeVisible();

  // He is looking at his own list: there is nobody here to nudge.
  await expect(page.getByTestId('gaps-everyone')).toHaveCount(0);
  await expect(page.getByTestId('gap-nudge-אביאם')).toHaveCount(0);

  await expectRtl(page);
  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('gaps: עמיחי sees the list per person, with the 🔔', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עמיחי' });
  await seedOldCheckin(page, 'אביאם');

  const sheet = await openGaps(page);
  await expect(sheet.getByRole('heading', { name: 'פערים פתוחים' })).toBeVisible();

  const everyone = page.getByTestId('gaps-everyone');
  await expect(everyone).toBeVisible();
  for (const person of ['אביאם', 'ניתאי']) {
    await expect(everyone.locator(`[data-person="${person}"]`)).toBeVisible();
  }
  // The nudge is offered only for someone who actually has something sitting open.
  const bell = page.getByTestId('gap-nudge-אביאם');
  await expect(bell).toBeVisible();

  // …and it is a request to the server, which owns the words and the once-a-day cap. The
  // harness has no such endpoint, so what this asserts is that the button acts and the
  // screen stays honest — not that a push went out.
  await bell.click();
  await expect(bell).toBeDisabled();

  await shot(page, ti, 'everyone');
  expectNoConsoleErrors(rec);
});

test('gaps: the viewer sees everyone too, and the row is never someone else’s to close', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await seedOldCheckin(page, 'ניתאי');

  await openGaps(page);
  await expect(page.getByTestId('gaps-everyone')).toBeVisible();
  await expect(page.getByRole('button', { name: '📍 סיכום ביקור' })).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('gaps: the panel is reachable from the personal area', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await seedOldCheckin(page, 'ניתאי');

  await page.waitForSelector('#sigma-settings[data-sigma-mounted="1"]', { state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
  const dlg = page.getByRole('dialog').filter({ hasText: 'הגדרות' });
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('settings-open-gaps').click();

  await expect(page.getByTestId('gaps-sheet')).toBeVisible();
  await expect(page.getByTestId('gaps-list')).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('gaps: the row opens the sheet on a COLD tap, before the deferred chunk has ever mounted (FIX ROUND 1)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await seedOldCheckin(page, 'אביאם');

  // Deliberately the opposite of `openGaps()` above: no wait for
  // `#sigma-gaps[data-sigma-mounted="1"]`. This is the exact race the review flagged —
  // `main.tsx` used to re-dispatch the open event right after the deferred chunk resolved,
  // which could beat the island's own `useEffect` listener into existing and silently drop
  // the tap. The fix reads a pending-open flag synchronously during the island's first
  // render instead, so this must work on the very first tap, cold, every time.
  //
  // The registry's "⋯ עוד" row (`MoreSheet.tsx`) only renders on the phone-width nav
  // (`Nav.tsx`: `md:hidden`) — desktop has no bottom bar in this build. Both entry points
  // dispatch/consume the SAME `sigma-open-gaps` event through the SAME `main.tsx` listener
  // (`Settings.tsx` line ~85 dispatches it raw, exactly like the row's `onSelect`), so the
  // desktop branch below exercises the identical race via the personal area instead.
  const isMobileNav = (page.viewportSize()?.width ?? 1440) < 768;
  if (isMobileNav) {
    // `getByRole('button', { name: 'עוד' })` also matches the legacy per-card "עוד" (t-more)
    // buttons scattered on the home cards; the bottom-nav trigger is the one with this exact
    // aria-label (`MoreSheet.tsx`), so `getByLabel` is what actually disambiguates it.
    await page.getByLabel('עוד', { exact: true }).click();
    await page.getByRole('button', { name: 'פערים' }).click();
  } else {
    await page.waitForSelector('#sigma-settings[data-sigma-mounted="1"]', { state: 'attached' });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-settings')));
    const dlg = page.getByRole('dialog').filter({ hasText: 'הגדרות' });
    await expect(dlg).toBeVisible();
    // No wait for `#sigma-gaps` here either — this click is the cold tap under test.
    await dlg.getByTestId('settings-open-gaps').click();
  }

  const sheet = page.getByTestId('gaps-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'הפערים שלי' })).toBeVisible();
  await expect(page.getByTestId('gaps-list')).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('gaps: nothing on the screen explains the app, or names who else is watching (§7h)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await seedOldCheckin(page, 'אביאם');

  const sheet = await openGaps(page);
  const text = (await sheet.innerText()).replace(/\s+/g, ' ');
  expect(text).not.toMatch(/Supabase|RLS|בדיקה אוטומטית|מחושב|מקושר ל-/);
  expect(text).not.toMatch(/(עמיחי|עידן)[^.]{0,12}(ראה|רואה|יראה)/);
  expectNoConsoleErrors(rec);
});
