// Ctrl+K — one input, one list, keyboard first (spec §7k.1, decision #12).
// Covers: the shortcut opens it, typing narrows the merged list, Enter runs the TOP-RANKED
// row (not the first row of the first group — review fix 4), the phone reaches the same bar
// from the card search field, and the bar never offers what the role would refuse.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('command bar: Ctrl+K opens, typing filters, Enter runs the top-ranked row', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.keyboard.press(`${mod}+KeyK`);
  const bar = page.getByRole('dialog').filter({ has: page.getByPlaceholder('חיפוש: קיבוץ · משימה · מסך · פעולה') });
  const input = page.getByPlaceholder('חיפוש: קיבוץ · משימה · מסך · פעולה');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  // With no query the bar already offers the actions and the kibbutzim it built on open.
  await expect(bar.getByRole('option')).not.toHaveCount(0);
  await shot(page, ti, 'open');

  // ── typing narrows to the one kibbutz…
  await input.fill('חוקוק');
  const rows = bar.getByRole('option');
  await expect(rows.first()).toContainText('חוקוק');
  await shot(page, ti, 'query');

  // …and Enter runs THAT row: `sigma.openKibbutzModal('חוקוק')` opens the legacy kibbutz modal.
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);                       // the bar closed itself
  // `#modalBackdrop` is the legacy kibbutz modal openEditModal() opens (js/src/10-activity.js).
  await expect(page.locator('#modalBackdrop')).toHaveClass(/open/);
  await expect(page.locator('#modalSub')).toContainText('חוקוק');

  expectNoConsoleErrors(rec);
});

test('command bar: a page row navigates, an unknown query says so', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await page.keyboard.press(`${mod}+KeyK`);
  const input = page.getByPlaceholder('חיפוש: קיבוץ · משימה · מסך · פעולה');

  // nothing matches → the one empty line, never a blank panel
  await input.fill('זזזזזזז');
  await expect(page.getByText('לא נמצא כלום')).toBeVisible();

  // a page row: מלאי is a page עידן may open
  await input.fill('מלאי');
  await page.keyboard.press('Enter');
  await expect(page.locator('#inventory-view')).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('command bar: the phone opens the same bar from the card search field', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti);
  test.skip(viewport !== 'mobile-390', 'the ⌘ button next to the card search is the phone route');

  // §7k.1: "the phone has no keyboard shortcut, so the same merged list is reachable from
  // this field — one tap, not a second search UI".
  await page.locator('#sigma-home').getByRole('button', { name: 'חיפוש בכל המערכת' }).click();
  await expect(page.getByPlaceholder('חיפוש: קיבוץ · משימה · מסך · פעולה')).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('command bar: the viewer is offered no write actions', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  await page.keyboard.press(`${mod}+KeyK`);
  const bar = page.getByRole('dialog').filter({ has: page.getByPlaceholder('חיפוש: קיבוץ · משימה · מסך · פעולה') });
  await expect(page.getByPlaceholder('חיפוש: קיבוץ · משימה · מסך · פעולה')).toBeVisible();

  // The bar "can never offer something the header or the sheet would refuse" (CommandBar.tsx):
  // 📍 סיכום ביקור / 🚚 תעודת משלוח / ➕ קיבוץ are all behind !isViewer.
  await expect(bar.getByRole('option', { name: /📍 סיכום ביקור/ })).toHaveCount(0);
  await expect(bar.getByRole('option', { name: /🚚 תעודת משלוח/ })).toHaveCount(0);
  await expect(bar.getByRole('option', { name: /➕ קיבוץ/ })).toHaveCount(0);
  // …but ⚙️ הגדרות and 📣 רעיון / באג are everyone's
  await expect(bar.getByRole('option', { name: /⚙️ הגדרות/ })).toBeVisible();
  await expect(bar.getByRole('option', { name: /📣 רעיון \/ באג/ })).toBeVisible();

  await shot(page, ti, 'viewer');
  expectNoConsoleErrors(rec);
});
