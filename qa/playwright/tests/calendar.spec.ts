// 🗓️ יומן — the unified calendar (spec §7f, Task 13).
//
// The RULES are goldens (app/src/lib/calendar.test.ts). What only a real browser can answer
// is here: the island takes the screen over from the legacy grid, the week numbers really
// land on the RIGHT, the EMS layer disappears on a toggle, a day tap opens the day grouped
// by kibbutz, a reorder survives a reload (the harness keeps a real day_plans store), ➕
// searches a kibbutz and offers its tasks with a counted שבץ, and 🌴 opens a range.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';
import type { Page } from '@playwright/test';

/**
 * Open the calendar the way every nav entry does, and wait for the island. `showPage` is
 * RETRIED for the same reason attendance.spec.ts retries it: the legacy bundle defines it a
 * beat after the island chunk lands, and a call that arrives first is silently dropped.
 */
async function openCalendar(page: Page): Promise<void> {
  // Let boot FINISH first. The first-screen-per-role pass (§7l) runs at the very end of
  // boot and navigates; a showPage that arrives before it is undone a moment later. After a
  // reload (which skips `boot()`'s own wait) this is the difference between green and flaky.
  await page.waitForSelector('#sigma-home .kibbutz', { timeout: 30_000 });
  // The poll keeps CALLING showPage until the grid is on screen, rather than calling it
  // once and then waiting: the first-screen-per-role pass (§7l) runs late in boot and can
  // navigate away from underneath a single early call.
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('calendar-view');
    if (!el || el.style.display === 'none') { (window as any).sigma?.showPage?.('calendar'); return false; }
    const grid = document.querySelector('[data-testid="cal-grid"]') as HTMLElement | null;
    return !!grid && grid.offsetParent !== null;
  }), { timeout: 30_000 }).toBe(true);
  // …and wait for the layers to have LANDED. The legacy EMS cache and the visits arrive
  // asynchronously, so a grid that is on screen is not yet a grid with a day in it — a day
  // tapped before they land opens an empty day, which is a true rendering of a false state.
  await expect(page.locator('.ucal-chip').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * The day body that is actually ON SCREEN. Desktop renders it in the panel beside the grid
 * and the phone in the bottom sheet; BOTH roots exist in the DOM at 1440 px and at 390 px,
 * and only one of them is visible. Scoping every day assertion to the visible one is what
 * lets the same test read both layouts.
 */
function dayBody(page: Page) {
  return page.locator('[data-testid="cal-day"]:visible');
}

/** The day the sandbox hangs its two-kibbutz fixture on (js/src/01-data.js). */
async function calDay(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).MOCK_CAL_DAY as string);
}

test('calendar: the island owns the screen and the legacy grid steps aside', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);

  // The legacy markup is still in the DOM — the agenda builders and the bridge functions
  // live behind it — but it is no longer what the person looks at.
  await expect(page.locator('#calendarLegacy')).toBeHidden();
  await expect(page.locator('#calGrid')).toBeAttached();

  await expect(page.getByRole('heading', { name: /יומן/ })).toBeVisible();
  await expect(page.getByTestId('cal-label')).toBeVisible();
  // שבוע / חודש, with the רשימה slot reserved for Task 14 and disabled until then.
  await expect(page.locator('[data-view="week"]')).toBeVisible();
  await expect(page.locator('[data-view="month"]')).toBeVisible();
  await expect(page.locator('[data-view="list"]')).toBeDisabled();

  await expectRtl(page);
  await shot(page, ti, 'month');
  expectNoConsoleErrors(rec);
});

test('calendar: the week numbers are a column on the RIGHT', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);

  const cells = page.getByTestId('cal-weekno');
  expect(await cells.count(), 'one week number per row').toBeGreaterThanOrEqual(5);

  // "On the right" is a measurement, not a class name: the week cell of a row must start
  // further right than the first day cell of that same row.
  const weekBox = (await cells.nth(1).boundingBox())!;
  const firstDay = (await page.locator('.ucal-cell').first().boundingBox())!;
  expect(weekBox.x, 'the week column sits to the right of the days').toBeGreaterThan(firstDay.x);
  // …and it is narrow and muted, not a day column.
  expect(weekBox.width).toBeLessThan(firstDay.width);

  expectNoConsoleErrors(rec);
});

test('calendar: the week view is what a phone gets, and it remembers the choice', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  await page.locator('[data-view="week"]').click();
  await expect(page.getByTestId('cal-label')).toHaveText(/שבוע \d+/);
  // Seven day cells and one week number — a week, not a month.
  await expect(page.locator('.ucal-cell')).toHaveCount(7);
  await expect(page.getByTestId('cal-weekno')).toHaveCount(1);

  await shot(page, ti, 'week');

  // Remembered per device (spec §7f).
  expect(await page.evaluate(() => localStorage.getItem('cal_view_v1'))).toBe('week');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openCalendar(page);
  await expect(page.locator('[data-view="week"]')).toHaveAttribute('aria-pressed', 'true');

  expectNoConsoleErrors(rec);
});

test('calendar: "הסתר משימות EMS" hides that layer and nothing else', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  const emsChips = page.locator('.ucal-chip[data-layer="ems"]');
  expect(await emsChips.count(), 'the sandbox has EMS tasks with due dates').toBeGreaterThan(0);

  await page.getByTestId('cal-hide-ems').click();
  await expect(emsChips).toHaveCount(0);
  // The grid itself is still there — only one layer went away.
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cal_hide_ems_v1'))).toBe('1');

  await page.getByTestId('cal-hide-ems').click();
  expect(await emsChips.count()).toBeGreaterThan(0);

  expectNoConsoleErrors(rec);
});

test('calendar: tapping a day opens it grouped by kibbutz, with the route headers', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const day = await calDay(page);

  await page.locator(`[data-day="${day}"]`).click();

  const body = dayBody(page);
  await expect(body).toBeVisible();
  // Two kibbutzim, each its own stop, each with 📍 בריפינג.
  await expect(body.locator('[data-stop="גבת"]')).toBeVisible();
  await expect(body.locator('[data-stop="דגניה"]')).toBeVisible();
  await expect(body.locator('[data-brief="גבת"]')).toBeVisible();
  // …and the headers are derived, never typed.
  const headers = await body.getByTestId('cal-route-header').allInnerTexts();
  expect(headers.join(' ')).toMatch(/לא משובץ|תחילת יום/);

  await shot(page, ti, 'day');
  expectNoConsoleErrors(rec);
});

test('calendar: a reorder is saved and comes back after a reload', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const day = await calDay(page);
  await page.locator(`[data-day="${day}"]`).click();
  await expect(dayBody(page)).toBeVisible();

  // Every change is optimistic on screen and written behind it; the write is what a reload
  // reads back, so each step waits for the row to actually land before the next one.
  const written = () => page.waitForResponse(
    r => r.url().includes('/rest/v1/day_plans') && r.request().method() !== 'GET',
    { timeout: 15_000 },
  );

  // Nothing is in the route yet, so both stops sit under 📥 — placing one is a tap.
  let saved = written();
  await dayBody(page).locator('[data-place="גבת"]').click();
  await saved;
  await expect(dayBody(page).locator('[data-stop="גבת"][data-header="first"]')).toBeVisible();

  saved = written();
  await dayBody(page).locator('[data-place="דגניה"]').click();
  await saved;
  await expect(dayBody(page).locator('[data-stop="דגניה"][data-header="last"]')).toBeVisible();

  // ↓ on the first stop — the same code path the drag takes.
  saved = written();
  await dayBody(page).locator('[data-down="גבת"]').click();
  await saved;
  await expect(dayBody(page).locator('[data-stop="דגניה"][data-header="first"]')).toBeVisible();
  await expect(dayBody(page).locator('[data-stop="גבת"][data-header="last"]')).toBeVisible();

  // …and it STICKS: the harness keeps a real day_plans store, so a reload re-reads the row.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openCalendar(page);
  await page.locator(`[data-day="${day}"]`).click();
  await expect(dayBody(page).locator('[data-stop="דגניה"][data-header="first"]')).toBeVisible();
  await expect(dayBody(page).locator('[data-stop="גבת"][data-header="last"]')).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('calendar: ➕ → search a kibbutz → select tasks → the שבץ counts them', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  const day = await calDay(page);
  // A day with nothing on it, so the two tasks really are being MOVED there.
  const target = await page.evaluate(d => {
    const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1);
    const p = (v: number) => String(v).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }, day);

  await page.locator(`[data-add="${target}"]`).click();
  await page.getByTestId('cal-add-schedule').click();
  await expect(page.getByTestId('cal-schedule')).toBeVisible();

  await page.getByTestId('cal-kib-search').fill('גבת');
  await page.locator('[data-kib="גבת"]').click();
  await expect(page.getByTestId('cal-task-list')).toBeVisible();

  const boxes = page.locator('[data-task] input[type="checkbox"]');
  const n = await boxes.count();
  expect(n, 'גבת has open tasks in the sandbox').toBeGreaterThanOrEqual(2);
  await boxes.nth(0).check();
  await boxes.nth(1).check();

  // The plan is counted BEFORE anything is written — the button says exactly what it will do.
  await expect(page.getByTestId('cal-schedule-go')).toHaveText(/שבץ 2 משימות/);
  await expect(page.getByTestId('cal-schedule-go')).toBeEnabled();

  await shot(page, ti, 'schedule');
  expectNoConsoleErrors(rec);
});

test('calendar: 🌴 a range is entered from the same ➕', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  const day = await calDay(page);

  await page.locator(`[data-add="${day}"]`).click();
  await page.getByTestId('cal-add-absence').click();
  await expect(page.getByTestId('cal-absence')).toBeVisible();

  // The day tapped is both ends of the range until he widens it.
  await expect(page.getByTestId('cal-abs-from')).toHaveValue(day);
  await expect(page.getByTestId('cal-abs-to')).toHaveValue(day);
  // 🪖 is one tap away, and עידן may file for anyone.
  await page.locator('[data-kind="reserve"]').click();
  await expect(page.locator('[data-kind="reserve"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cal-abs-person')).toBeEnabled();
  await expect(page.getByTestId('cal-abs-save')).toBeEnabled();

  // A backwards range cannot be saved at all.
  await page.getByTestId('cal-abs-to').fill('2020-01-01');
  await expect(page.getByTestId('cal-abs-save')).toBeDisabled();

  await shot(page, ti, 'absence');
  expectNoConsoleErrors(rec);
});

test('calendar: the viewer reads it and cannot change it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await openCalendar(page);
  const day = await calDay(page);

  await expect(page.getByTestId('cal-grid')).toBeVisible();
  // No ➕ anywhere, and no reorder controls once a day is open.
  await expect(page.locator('.ucal-add')).toHaveCount(0);
  await page.locator(`[data-day="${day}"]`).click();
  await expect(dayBody(page)).toBeVisible();
  await expect(page.locator('.ucal-arrow')).toHaveCount(0);
  await expect(page.locator('[data-place]')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});
