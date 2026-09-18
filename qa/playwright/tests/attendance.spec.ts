// 📅 נוכחות + 🕎 חגים (spec §7e, Task 12).
//
// The rules themselves are goldens (app/src/lib/attendance.test.ts). What only a real browser
// can answer is here: the island takes the screen over from the legacy table, the month grid
// renders with the holiday cells the sandbox seeds, one tap files today, the day sheet opens
// on a chip and says a holiday is optional rather than missing, and a field worker sees his
// own month while whoever may look at everyone gets the person toggle.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';
import type { Page } from '@playwright/test';

/**
 * Open the attendance page the way every nav entry does, and wait for the island.
 * `showPage` is RETRIED: the legacy bundle defines it a beat after the island chunk lands,
 * and a call that arrives first is silently dropped — the page then stays on the cards with
 * a perfectly rendered (but hidden) grid behind it.
 */
async function openAttendance(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('attendance');
    const el = document.getElementById('attendance-view');
    return !!el && el.style.display !== 'none';
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForSelector('[data-testid="att-grid"]', { state: 'visible', timeout: 20_000 });
}

/** The sandbox anchors its fixture to the first <weekday> of the current month. */
async function firstDow(page: Page, dow: number): Promise<string> {
  return page.evaluate(n => {
    const d = new Date();
    const x = new Date(d.getFullYear(), d.getMonth(), 1);
    while (x.getDay() !== n) x.setDate(x.getDate() + 1);
    const p = (v: number) => String(v).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }, dow);
}

test('attendance: the island owns the screen and the legacy table steps aside', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  // The legacy summary/table are still in the DOM — 📄 PDF and 📗 Excel read what they leave
  // behind — but they are no longer what the person looks at.
  await expect(page.locator('#attendanceLegacy')).toBeHidden();
  await expect(page.locator('#attendanceTable')).toBeAttached();

  await expect(page.getByRole('heading', { name: /נוכחות/ })).toBeVisible();
  await expect(page.getByTestId('att-today')).toBeVisible();
  await expect(page.getByTestId('att-kpi-field')).toBeVisible();
  await expect(page.getByTestId('att-kpi-office')).toBeVisible();
  await expect(page.getByTestId('att-kpi-missing')).toBeVisible();
  await expect(page.getByTestId('att-missing')).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'month');
  expectNoConsoleErrors(rec);
});

test('attendance: 🕎 holidays are violet, never missing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  const holiday = await firstDow(page, 1);      // the sandbox's חג
  const closure = await firstDow(page, 4);      // …and its סגירת חברה

  await expect(page.locator(`[data-date="${holiday}"]`)).toHaveAttribute('data-state', 'holiday');
  await expect(page.locator(`[data-date="${closure}"]`)).toHaveAttribute('data-state', 'holiday');
  // …and neither of them is ever offered as a day to complete.
  await expect(page.locator(`[data-missing="${holiday}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-missing="${closure}"]`)).toHaveCount(0);

  // Opening one says it is optional — an invitation, not a reprimand.
  await page.locator(`[data-date="${holiday}"]`).click();
  await expect(page.getByTestId('att-holiday-note').first()).toContainText('הזנה אופציונלית');
  await shot(page, ti, 'holiday');
  expectNoConsoleErrors(rec);
});

test('attendance: the mock month is on the grid (a visit day and an office day)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  await expect(page.locator(`[data-date="${await firstDow(page, 0)}"]`)).toHaveAttribute('data-state', 'office');
  await expect(page.locator(`[data-date="${await firstDow(page, 2)}"]`)).toHaveAttribute('data-state', 'office');
  await expect(page.locator(`[data-date="${await firstDow(page, 3)}"]`)).toHaveAttribute('data-state', 'field');

  expectNoConsoleErrors(rec);
});

test('attendance: the month switcher moves, and the label follows', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await openAttendance(page);

  const label = page.getByTestId('att-month');
  const before = await label.textContent();
  await page.getByRole('button', { name: 'חודש קודם' }).click();
  await expect(label).not.toHaveText(before || '');
  await page.getByRole('button', { name: 'חודש הבא' }).click();
  await expect(label).toHaveText(before || '');

  expectNoConsoleErrors(rec);
});

test('attendance: a day sheet opens from the grid with the day types one tap away', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);

  // A day with nothing on it — the first Wednesday holds the mock visit, so take the grid's
  // first cell that is still empty.
  const empty = page.locator('[data-date][data-state="missing"], [data-date][data-state="future"]').first();
  await empty.click();

  // Phone → the bottom sheet; wide → the side panel. Only one of the two is ever on screen
  // (the panel is `hidden lg:block`), so ask for whichever is visible rather than for the
  // first in DOM order.
  const editor = page.locator('[data-testid="att-sheet"]:visible, [data-testid="att-panel"]:visible').first();
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-daytype="field"]').first()).toBeVisible();
  await expect(editor.locator('[data-daytype="office"]').first()).toBeVisible();

  await shot(page, ti, 'day');
  expectNoConsoleErrors(rec);
});

test('attendance: whoever may look at everyone gets the person toggle', async ({ page }, ti) => {
  // The gate is `canSeeAttendance()` (js/src/11-search-login.js): the two field workers,
  // עמיחי and the viewer. The TOGGLE is the narrower `isIdan() || isViewer()` — this branch
  // keeps עידן out of the page entirely (Task 4), so the viewer is who exercises it.
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await openAttendance(page);
  await expect(page.locator('[data-person]').first()).toBeVisible();
  await expect(page.locator('[data-person="אביאם"]')).toBeVisible();
  await expect(page.locator('[data-person="ניתאי"]')).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('attendance: the field worker sees only his own month', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await openAttendance(page);
  await expect(page.locator('[data-person]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /נוכחות — ניתאי/ })).toBeVisible();
  expectNoConsoleErrors(rec);
});
