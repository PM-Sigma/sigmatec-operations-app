// 🔒 internal tasks (Task 26, company-process spec §2 + §8b: no due dates, no reminders).
//
// End to end over the REAL `internal_tasks` store (_helpers.ts): add a row on a kibbutz
// card, see it in "היום שלי", toggle it done, and promote it to an EMS task intent — proving
// the flag flip (`INTERNAL_TASKS_WRITABLE`) really turned into a working write path, not just
// an offered chip.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('internal tasks: add on a card → היום שלי → toggle done → promote to EMS', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  const card = page.locator('.kibbutz[data-name="חוקוק"]');
  await expect(card).toBeVisible();

  // Watch every EMS task the page "creates" — EMS itself is offline in this harness.
  await page.evaluate(() => {
    (window as any).__created = [];
    (window as any).sigma.createTask = (item: any) => {
      (window as any).__created.push(item);
      return Promise.resolve({ sent: true, id: 'T-' + (window as any).__created.length });
    };
  });

  // ── add a 🔒 row on the card
  const input = card.locator('.internal-task-input');
  await expect(input).toBeVisible();
  await input.fill('לבדוק את שער החשמל');
  await input.press('Enter');
  await expect(card.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' })).toBeVisible();
  await shot(page, ti, 'card-row');

  // ── it appears under "היום שלי" (#sigma-pm-today) — owner defaults to whoever added it
  const myToday = page.locator('#sigma-pm-today');
  await expect(myToday.getByText('לבדוק את שער החשמל')).toBeVisible();
  await shot(page, ti, 'my-today');

  // ── ✓ toggles done — the row leaves the open lists on both surfaces
  await card.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' }).locator('button').first().click();
  await expect(card.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' })).toHaveCount(0);
  await expect(myToday.getByText('לבדוק את שער החשמל')).toHaveCount(0);

  // ── a second row, promoted to EMS — the internal row disappears from the open list and an
  // EMS task intent is created with the same title
  await input.fill('להחליף מונה בשער');
  await input.press('Enter');
  const row = card.locator('.internal-task-row', { hasText: 'להחליף מונה בשער' });
  await expect(row).toBeVisible();
  await row.locator('.internal-task-promote').click();
  await expect(card.locator('.internal-task-row', { hasText: 'להחליף מונה בשער' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__created.length)).toBe(1);
  const created = await page.evaluate(() => (window as any).__created[0]);
  expect(created.title).toBe('להחליף מונה בשער');
  expect(created.kibbutz).toBe('חוקוק');

  await expectRtl(page);
  await expectNoConsoleErrors(rec);
});

test('internal tasks: a viewer sees the list but cannot add or act', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  const card = page.locator('.kibbutz[data-name="חוקוק"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.internal-task-input')).toHaveCount(0);
  await expect(card.locator('.internal-task-promote')).toHaveCount(0);
  await expectNoConsoleErrors(rec);
});
