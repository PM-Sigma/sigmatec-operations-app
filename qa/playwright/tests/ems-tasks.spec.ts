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

test('ems tasks: the home card is a summary — no description on it at either size (22.9, D3)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  const widget = page.locator('#sigma-home .kibbutz[data-name="יגור"] .card-ems-tasks');
  await expect(widget).toBeVisible();
  // the row carries the title, the status, who and when — the description is read inside the card
  await expect(widget.locator('.t-desc')).toHaveCount(0);
  await expect(widget.getByRole('button', { name: 'עוד', exact: true })).toHaveCount(0);
  await expect(widget.locator('.card-ems-task').first()).toBeVisible();
  await shot(page, ti, 'compact');

  expectNoConsoleErrors(rec);
});


test('ems tasks: inside the card the row is the whole story (22.9, D4)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // Open יגור's card — the modal's EMS section is the LEGACY renderer (prepModalEmsSection).
  await page.locator('#sigma-home .kibbutz[data-name="יגור"] .kibbutz-name').click();
  await expect(page.locator('#modalBackdrop')).toHaveClass(/open/);

  const row = page.locator('#modalEmsSection .modal-ems-task').first();
  await expect(row).toBeVisible();
  await expect(row.locator('.t-title')).toContainText('תקלת תקשורת בבקר');
  // the FULL description is read here, not on the card
  await expect(row.locator('.t-desc')).toBeVisible();
  // 👤 who and 📅 when
  await expect(row.locator('.t-meta')).toContainText('👤');
  // the two small bubbles at the bottom: priority and type
  const bubbles = row.locator('.t-bubbles .ems-badge');
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.first()).toContainText(/נמוכה|רגילה|גבוהה|דחופה/);
  await expect(bubbles.nth(1)).toContainText(/אספקת מונים|תיקון תקלה|אחר/);

  await shot(page, ti, 'inside-card');
  expectNoConsoleErrors(rec);
});
