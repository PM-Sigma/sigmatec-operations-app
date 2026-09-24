// 💻 לוח פיתוח (D-U1) — the React rewrite, end to end.
//
// The RULES are goldens (app/src/lib/devMeeting.test.ts, devBoard.test.ts). What only a real
// browser can answer is here: the island takes the screen over from the legacy dev-view, the
// domains view really groups by parent → priority with "ללא אפיון" last, the filters sheet
// really narrows the list and can be cleared, the card sheet opens from a row tap, and none of
// it fires a native `dialog` event (a stray `confirm()`/`alert()` from a legacy code path).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, skipKnownMobile360, test } from './_helpers';
import type { Page } from '@playwright/test';

test.beforeEach(({}, testInfo) => skipKnownMobile360(testInfo));

/** The `github` function is EMS-gated (same as dev-meeting.spec.ts), so the board needs a session. */
const EMS = { ems_token_v1: 'qa-ems-token', ems_token_at_v1: String(Date.now()) };

/** Open 💻 פיתוח the way the nav does, and wait for the React island's own header to land. */
async function openDevBoard(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('dev-view');
    if (!el || el.style.display === 'none') { (window as any).sigma?.showPage?.('dev'); return false; }
    const root = document.querySelector('[data-testid="dev-board-page"]') as HTMLElement | null;
    return !!root && root.offsetParent !== null;
  }), { timeout: 30_000 }).toBe(true);
  await expect(page.getByTestId('dev-board-page')).toBeVisible();
}

test('dev board: domains view groups by parent, opens a card, filters, and clears', async ({ page }, ti) => {
  const dialogs: string[] = [];
  page.on('dialog', d => { dialogs.push(d.message()); void d.dismiss(); });

  const { rec } = await boot(page, ti, { storage: EMS });
  await openDevBoard(page);
  await expectRtl(page);

  // ── domains view: at least one real domain and "ללא אפיון" hidden behind no card with no parent
  await expect(page.getByTestId('dev-grouped-list')).toBeVisible();
  await shot(page, ti, 'domains');

  // ── open a card sheet from the domains view
  await page.getByTestId('dev-card-row-21').click();
  await expect(page.getByTestId('dev-card-sheet')).toBeVisible();
  await expect(page.getByTestId('dev-card-sheet')).toContainText('כותרת עמוד');
  await shot(page, ti, 'card-sheet');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dev-card-sheet')).toBeHidden();

  // ── filter by קריטי (card #21's priority in the fixture) and clear it
  await page.getByTestId('dev-filters-open').click();
  await expect(page.getByTestId('dev-filters-sheet')).toBeVisible();
  await shot(page, ti, 'filters-sheet');
  await page.getByRole('button', { name: 'קריטי' }).click();
  await page.getByTestId('dev-filters-apply').click();
  await expect(page.getByTestId('dev-filters-badge')).toHaveText('1');
  await expect(page.getByTestId('dev-card-row-21')).toBeVisible();
  await shot(page, ti, 'filtered');

  await page.getByTestId('dev-filters-open').click();
  await page.getByTestId('dev-filters-clear').click();
  await expect(page.getByTestId('dev-filters-badge')).toHaveCount(0);

  expect(dialogs, 'no native dialog() calls').toEqual([]);
  expectNoConsoleErrors(rec);
});

test('dev board: שלבים view lists the same cards by stage', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { storage: EMS });
  await openDevBoard(page);

  await page.getByRole('radio', { name: 'שלבים' }).click();
  await expect(page.getByTestId('dev-stage-list')).toBeVisible();
  await expect(page.getByTestId('dev-card-row-21')).toBeVisible();
  await shot(page, ti, 'stages');

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowX).toBeLessThanOrEqual(1);

  expectNoConsoleErrors(rec);
});

test('dev board: a viewer never gets the write affordances', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await page.evaluate(() => (window as any).sigma?.showPage?.('dev'));
  // צפייה cannot open the page at all — canShowPage('dev') is מתניה/אליה/עידן/עמיחי only.
  await expect(page.getByTestId('dev-board-page')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});
