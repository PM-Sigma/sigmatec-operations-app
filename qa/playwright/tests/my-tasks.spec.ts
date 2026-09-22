// ✅ המשימות שלי (round 4, Package X).
//
// עידן: "המשימות הפנימיות שלי" → המשימות שלי; it carries his EMS work too, it is grouped by
// kibbutz, it opens from the header next to the bell and from ⋯ עוד, it shows up in the
// calendar, and the floating strip is gone from every page.
import type { Page } from '@playwright/test';
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

/** Open the calendar the way calendar.spec.ts does: showPage is RETRIED until the grid lands. */
async function openCalendar(page: Page): Promise<void> {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('calendar-view');
    if (!el || el.style.display === 'none') { (window as any).sigma?.showPage?.('calendar'); return false; }
    const grid = document.querySelector('[data-testid="cal-grid"]') as HTMLElement | null;
    return !!grid && grid.offsetParent !== null;
  }), { timeout: 30_000 }).toBe(true);
}

/** Add one 🔒 row on a card. With no owner picked it lands on whoever adds it. */
async function addInternal(page: Page, kibbutz: string, title: string) {
  const card = page.locator('#sigma-home .kibbutz[data-name="' + kibbutz + '"]');
  await expect(card).toBeVisible();
  await card.getByTestId('add-internal-task').click();
  const sheet = page.getByTestId('internal-task-sheet');
  await expect(sheet).toBeVisible();
  await sheet.locator('#itTitle').fill(title);
  await sheet.locator('#itDue').fill('2026-09-24');
  await sheet.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(sheet).toHaveCount(0);
}

test('my tasks: the header button opens one sheet with the EMS work and the 🔒 work, grouped by kibbutz', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await addInternal(page, 'חוקוק', 'לבדוק את הגנרטור');

  // ── the button lives next to the bell and carries the open count
  const button = page.getByTestId('header-my-tasks');
  await expect(button).toBeVisible();
  await expect(page.getByTestId('header-my-tasks-badge')).toBeVisible();

  await button.click();
  const sheet = page.getByTestId('my-tasks');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('המשימות שלי');
  // no padlock as the NAME of the list — it is a mark on the row, nothing more
  await expect(sheet.getByRole('heading', { name: /משימות פנימיות/ })).toHaveCount(0);

  // ── groups: one block per kibbutz, the 🔒 row inside its own kibbutz's block
  const hukok = sheet.locator('.my-task-group[data-group="חוקוק"]');
  await expect(hukok).toBeVisible();
  await expect(hukok).toContainText('לבדוק את הגנרטור');
  await shot(page, ti, 'sheet');

  // ── the EMS half is here too, under the kibbutz it belongs to
  const groups = sheet.locator('.my-task-group');
  expect(await groups.count()).toBeGreaterThan(0);

  // ── ✓ closes a 🔒 row and it leaves the list
  await hukok.locator('.internal-task-row', { hasText: 'לבדוק את הגנרטור' })
    .getByRole('button', { name: 'סמן כטופל' }).click();
  await expect(sheet.getByText('לבדוק את הגנרטור')).toHaveCount(0);

  await expectRtl(page);
  await expectNoConsoleErrors(rec);
});

test('my tasks: ⋯ עוד opens the same sheet, and the floating strip is gone from every page', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);

  await expect(page.locator('.my-tasks-strip')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/has-my-tasks/);

  // The ⋯ sheet lives in the bottom nav, which is the phone's surface.
  test.skip(viewport !== 'mobile-390', 'the ⋯ sheet is reachable from the phone nav only');
  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  const more = page.getByRole('dialog');
  await expect(more.getByRole('button', { name: 'המשימות שלי', exact: true })).toBeVisible();
  await more.getByRole('button', { name: 'המשימות שלי', exact: true }).click();
  await expect(page.getByTestId('my-tasks')).toBeVisible();

  await expectNoConsoleErrors(rec);
});

test('my tasks: a dated 🔒 row shows in the calendar, in the list and on its due day', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await addInternal(page, 'חוקוק', 'להזמין מונה חלופי');

  await openCalendar(page);

  // רשימה — next to the EMS work, under the kibbutz it belongs to
  await page.locator('[data-view="list"]').click();
  const list = page.getByTestId('cal-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.ucal-ltask-internal', { hasText: 'להזמין מונה חלופי' })).toBeVisible();
  await shot(page, ti, 'calendar-list');

  await expectNoConsoleErrors(rec);
});
