// EmsTasks on the card (spec §4 + §7k #2 + §7k #6).
// Covers: the widget renders the open tasks of that kibbutz from the shared cache, the phone
// clamps a long description to two lines with a per-task "עוד" toggle, and the desktop never
// clamps. The tasks come from the LEGACY mock cache (js/src/01-data.js, `?sb=0`) — the same
// snapshot production serves from `ems_cache`.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

test('ems tasks: open tasks render per card, closed ones do not', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // יגור: task-1 (in_progress) + task-4 (waiting_for_client) are open; nothing else is on it.
  const yagur = page.locator('#sigma-home .kibbutz[data-name="יגור"] .card-ems-tasks');
  await expect(yagur).toBeVisible();
  await expect(yagur.locator('.card-ems-head')).toContainText('📋 משימות EMS');
  await expect(yagur.locator('.card-ems-head .badge').first()).toContainText('2 פתוחות');
  await expect(yagur.getByText('תקלת תקשורת בבקר')).toBeVisible();
  await expect(yagur.getByText('ממתין לאישור לקוח')).toBeVisible();

  // חוקוק's only mock task is `done` → the widget is not rendered at all on that card.
  await expect(page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .card-ems-tasks')).toHaveCount(0);
  await expect(page.locator('#sigma-home .kibbutz[data-name="חוקוק"]')).not.toContainText('התקנה הושלמה');

  // ⚠️ N ללא אחראי is for the people who can assign — עידן is an admin, and both open יגור
  // tasks have an assignee or none, so the badge reflects the real count rather than a guess.
  const orphans = yagur.locator('.badge-orphans');
  await expect(orphans).toContainText('ללא אחראי');

  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('ems tasks: the phone clamps long descriptions behind עוד, the desktop does not', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);

  const row = page.locator('#sigma-home .kibbutz[data-name="יגור"] .card-ems-tasks .t-desc').first();
  await expect(row).toBeVisible();
  const more = page.locator('#sigma-home .kibbutz[data-name="יגור"] .card-ems-tasks')
    .getByRole('button', { name: 'עוד', exact: true }).first();

  if (viewport === 'mobile-390') {
    // clamped to two lines, with the per-task disclosure (§7k #2)
    await expect(row).toHaveClass(/line-clamp-2/);
    await expect(more).toBeVisible();
    await more.click();
    await expect(row).not.toHaveClass(/line-clamp-2/);
    // …and it toggles back, labelled "פחות"
    const less = page.locator('#sigma-home .kibbutz[data-name="יגור"] .card-ems-tasks')
      .getByRole('button', { name: 'פחות', exact: true }).first();
    await expect(less).toBeVisible();
    await less.click();
    await expect(row).toHaveClass(/line-clamp-2/);
    await shot(page, ti, 'clamped');
  } else {
    // §7k #2: the desktop card never clamps, so there is nothing to disclose
    await expect(row).not.toHaveClass(/line-clamp-2/);
    await expect(more).toHaveCount(0);
  }

  expectNoConsoleErrors(rec);
});
