// 🔒 internal tasks (Task 26, reshaped 22.9 — עידן's phone QA round, D3).
//
// End to end over the REAL `internal_tasks` store (_helpers.ts): the ➕ bubble on the card opens
// the form (title · owner · due date · priority · kind); the row shows READ-ONLY on the card and
// with its actions inside the kibbutz card (the modal panel); "היום שלי" lists it; ✓ closes it;
// ⬆ promotes it to an EMS task intent.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('internal tasks: ➕ on the card → form → read-only row on the card → actions in the modal → היום שלי → done → promote', async ({ page }, ti) => {
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

  // ── the card offers exactly two task actions, and no input of its own
  await expect(card.locator('.internal-task-input')).toHaveCount(0);
  await expect(card.getByTestId('add-ems-task')).toBeVisible();
  await card.getByTestId('add-internal-task').click();
  const sheet = page.getByTestId('internal-task-sheet');
  await expect(sheet).toBeVisible();
  await sheet.locator('#itTitle').fill('לבדוק את שער החשמל');
  // the owner defaults to whoever adds; pick ניתאי and a due date
  await sheet.getByRole('radio', { name: 'ניתאי' }).click();
  await sheet.locator('#itDue').fill('2026-10-01');
  await sheet.getByRole('radio', { name: '🟠 גבוהה' }).click();
  await shot(page, ti, 'form');
  await sheet.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(sheet).toHaveCount(0);

  // ── the card shows the row read-only: title, the owner's dot, the due date — no buttons
  const cardRow = card.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' });
  await expect(cardRow).toBeVisible();
  await expect(cardRow).toContainText('ניתאי');
  await expect(cardRow).toContainText('1.10');
  await expect(cardRow.locator('button')).toHaveCount(0);
  await shot(page, ti, 'card-row');

  // ── it belongs to its OWNER (ניתאי), so it is not in עידן's "המשימות שלי" (round 4,
  // Package X: the floating strip is gone; the sheet is what lists a person's own work).
  await expect(page.locator('.my-tasks-strip')).toHaveCount(0);
  await page.getByTestId('header-my-tasks').click();
  const mine = page.getByTestId('my-tasks');
  await expect(mine).toBeVisible();
  await expect(mine.getByText('לבדוק את שער החשמל')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(mine).toHaveCount(0);

  // ── inside the kibbutz card: the panel with the actions
  await card.locator('.kibbutz-name').click();
  const panel = page.getByTestId('internal-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const row = panel.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('🟠 גבוהה');
  // ✓ closes it — the row leaves the open lists on both surfaces
  await row.getByRole('button', { name: 'סמן כטופל' }).click();
  await expect(panel.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' })).toHaveCount(0);
  await expect(card.locator('.internal-task-row', { hasText: 'לבדוק את שער החשמל' })).toHaveCount(0);

  // ── a second row from the panel's own ➕, promoted to EMS: the internal row disappears and
  // an EMS task intent is created with the same title
  await panel.getByRole('button', { name: '➕ משימה פנימית' }).click();
  await expect(page.getByTestId('internal-task-sheet')).toBeVisible();
  await page.getByTestId('internal-task-sheet').locator('#itTitle').fill('להחליף מונה בשער');
  await page.getByTestId('internal-task-sheet').getByRole('button', { name: 'הוסף משימה' }).click();
  const row2 = panel.locator('.internal-task-row', { hasText: 'להחליף מונה בשער' });
  await expect(row2).toBeVisible();
  await row2.locator('.internal-task-promote').click();
  await expect(panel.locator('.internal-task-row', { hasText: 'להחליף מונה בשער' })).toHaveCount(0);
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
  await expect(card.getByTestId('add-internal-task')).toHaveCount(0);
  await expect(card.getByTestId('add-ems-task')).toHaveCount(0);
  await expect(card.locator('.internal-task-input')).toHaveCount(0);
  await expect(card.locator('.internal-task-promote')).toHaveCount(0);
  await expectNoConsoleErrors(rec);
});
