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
  // `attached`, not visible: since 22.9 (A7) a reload RESUMES the last page, so after the
  // reload below the cards are rendered under a hidden #kibbutz-view while the calendar shows.
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
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
  // שבוע / חודש / רשימה — all three live since Task 14.
  await expect(page.locator('[data-view="week"]')).toBeVisible();
  await expect(page.locator('[data-view="month"]')).toBeVisible();
  await expect(page.locator('[data-view="list"]')).toBeEnabled();

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
  // FIVE day cells and one week number (round 2 · G1): א–ה is the week a technician plans,
  // and only a full month ever paints Fri/Sat.
  await expect(page.locator('.ucal-cell')).toHaveCount(5);
  await expect(page.getByTestId('cal-weekno')).toHaveCount(1);

  await shot(page, ti, 'week');

  // Remembered per device (spec §7f).
  expect(await page.evaluate(() => localStorage.getItem('cal_view_v1'))).toBe('week');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openCalendar(page);
  await expect(page.locator('[data-view="week"]')).toHaveAttribute('aria-pressed', 'true');

  expectNoConsoleErrors(rec);
});

test('calendar: א–ה is the default month, and one button gives the full one back (G1)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  // Five columns, and the toggle offers the OTHER state — never the one already on screen.
  const grid = page.getByTestId('cal-grid');
  await expect(grid).toHaveAttribute('data-cols', '5');
  await expect(page.locator('.ucal-dow')).toHaveCount(5);
  const toggle = page.getByTestId('cal-work-week');
  await expect(toggle).toHaveText('חודש מלא');

  await toggle.click();
  await expect(grid).toHaveAttribute('data-cols', '7');
  await expect(page.locator('.ucal-dow')).toHaveCount(7);
  await expect(toggle).toHaveText('שבוע עבודה');
  expect(await page.evaluate(() => localStorage.getItem('cal_work_week_v1'))).toBe('0');

  await toggle.click();
  await expect(grid).toHaveAttribute('data-cols', '5');

  // …and the ➕ that used to sit in every cell is gone from the grid entirely.
  await expect(page.locator('.ucal-add')).toHaveCount(0);

  await shot(page, ti, 'work-week');
  expectNoConsoleErrors(rec);
});

test('calendar: the three views are separate, selectable targets (G5)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);

  const picker = page.locator('.ucal-switch');
  await expect(picker).toHaveClass(/ucal-switch-split/);
  // חודש · שבוע · רשימה, in that order, each one a real box of its own.
  const boxes = await Promise.all(['month', 'week', 'list']
    .map(v => picker.locator(`[data-view="${v}"]`).boundingBox()));
  for (const b of boxes) expect(b!.width).toBeGreaterThan(40);
  // In RTL the first one sits furthest right; no two of them overlap.
  expect(boxes[0]!.x).toBeGreaterThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeGreaterThan(boxes[2]!.x);
  expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[0]!.x + 1);

  for (const v of ['week', 'list', 'month']) {
    await picker.locator(`[data-view="${v}"]`).click();
    await expect(picker.locator(`[data-view="${v}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  expectNoConsoleErrors(rec);
});

test('calendar: a past day shows what was filed, and offers nothing to plan (G3)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  // A day that is over and is certainly on the month now on screen: the 1st. (On the 1st
  // itself there is no such day in this month, and the test says so by skipping.)
  const past = await page.evaluate(() => {
    const d = new Date();
    if (d.getDate() === 1) return '';
    const p = (v: number) => String(v).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-01';
  });
  if (!past) { expectNoConsoleErrors(rec); return; }
  const cell = page.locator(`[data-day="${past}"]`);
  if (!(await cell.count())) { expectNoConsoleErrors(rec); return; }   // a weekend is not painted

  await cell.click();
  const body = dayBody(page);
  await expect(body).toBeVisible();
  await expect(body).toHaveAttribute('data-when', 'past');
  // Read-only: no route, no ➕, no בריפינג, nothing to drag.
  await expect(body.locator('[data-place]')).toHaveCount(0);
  await expect(body.getByTestId('cal-place-search')).toHaveCount(0);
  await expect(body.getByTestId('cal-day-add')).toHaveCount(0);
  await expect(body.locator('[data-brief]')).toHaveCount(0);

  await shot(page, ti, 'past-day');
  expectNoConsoleErrors(rec);
});

test('calendar: a future day takes a kibbutz by SEARCH into its route (G4)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const day = await calDay(page);
  await page.locator(`[data-day="${day}"]`).click();
  const body = dayBody(page);
  await expect(body).toBeVisible();
  await expect(body).toHaveAttribute('data-when', 'future');

  const written = () => page.waitForResponse(
    r => r.url().includes('/rest/v1/day_plans') && r.request().method() !== 'GET',
    { timeout: 15_000 },
  );

  await body.getByTestId('cal-place-input').fill('חוקוק');
  const saved = written();
  await body.locator('[data-place-hit="חוקוק"]').click();
  await saved;
  // …and it is a STOP, although EMS has nothing due there that day.
  await expect(body.locator('[data-stop="חוקוק"]')).toBeVisible();

  await shot(page, ti, 'place-search');
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

  // Round 2 · G1: the ➕ left the grid — a day is opened, and added to from inside.
  await page.locator(`[data-day="${target}"]`).click();
  await dayBody(page).getByTestId('cal-day-add').click();
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

  await page.locator(`[data-day="${day}"]`).click();
  await dayBody(page).getByTestId('cal-day-add').click();
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

// ───────────────────────────── רשימה (Task 14, spec §7g) ─────────────────────────────

test('calendar: רשימה is my open work by kibbutz, overdue first, with the row actions', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);

  await page.locator('[data-view="list"]').click();
  const list = page.getByTestId('cal-list');
  await expect(list).toBeVisible();
  // The grid steps aside — one view at a time.
  await expect(page.getByTestId('cal-grid')).toHaveCount(0);
  // עידן sees everyone, so "כולל של אחרים" starts ON and the whole open cache is grouped here
  // — the same thing the two grids already show him.
  await expect(page.getByTestId('cal-list-others')).toHaveAttribute('aria-pressed', 'true');
  const groups = page.locator('[data-group]');
  expect(await groups.count(), 'the sandbox cache has open tasks at several kibbutzim').toBeGreaterThan(1);
  // The oldest debt is the first group (js/src/01-data.js: דגניה is 2 days late).
  await expect(groups.first().getByTestId('cal-list-late')).toBeVisible();

  // Every row carries the three actions the spec names.
  const row = page.locator('.ucal-ltask').first();
  await expect(row.locator('[data-schedule]')).toBeVisible();
  await expect(row.locator('[data-done]')).toBeVisible();
  await expect(groups.first().locator('[data-brief]')).toBeVisible();

  // Remembered per device, like the other two views.
  expect(await page.evaluate(() => localStorage.getItem('cal_view_v1'))).toBe('list');

  await expectRtl(page);
  await shot(page, ti, 'list');
  expectNoConsoleErrors(rec);
});

test('calendar: the list carries the retired EMS page filters, and they narrow it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.locator('[data-view="list"]').click();
  await expect(page.getByTestId('cal-list')).toBeVisible();

  const before = await page.locator('.ucal-ltask').count();
  expect(before).toBeGreaterThan(1);

  // ⏰ באיחור keeps only what is late — strictly fewer rows, and every one of them flagged.
  await page.getByTestId('cal-list-overdue').click();
  await expect.poll(() => page.locator('.ucal-ltask').count()).toBeLessThan(before);
  expect(await page.locator('.ucal-ltask:not(.ucal-ltask-late)').count()).toBe(0);
  await page.getByTestId('cal-list-overdue').click();

  // A search that matches nothing says so, and offers the way back.
  await page.getByTestId('cal-list-search').fill('זzzםםם');
  await expect(page.getByTestId('cal-list-empty')).toBeVisible();
  await page.getByTestId('cal-list-clear').click();
  await expect.poll(() => page.locator('.ucal-ltask').count()).toBe(before);

  // The site filter is built from the tasks themselves (was `emsPopulateSiteFilter`).
  expect(await page.getByTestId('cal-list-site').locator('option').count()).toBeGreaterThan(1);

  expectNoConsoleErrors(rec);
});

test('calendar: the ⋯ menu carries the two launchers the משימות page used to hold', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.locator('[data-view="list"]').click();
  await expect(page.getByTestId('cal-list')).toBeVisible();

  await page.getByTestId('cal-list-more').locator('summary').click();
  for (const id of ['cal-list-copy', 'cal-list-wa', 'cal-list-visits', 'cal-list-activity']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // 📊 פעילות היום really opens its modal — the launcher moved, the feature did not.
  await page.getByTestId('cal-list-activity').click();
  await expect(page.locator('#activityModal')).toHaveClass(/open/);

  expectNoConsoleErrors(rec);
});

test('calendar: 📅 שבץ from a row opens the SAME scheduler, with the task and a day to pick', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.locator('[data-view="list"]').click();
  await expect(page.getByTestId('cal-list')).toBeVisible();

  await page.locator('.ucal-ltask [data-schedule]').first().click();
  const sheet = page.getByTestId('cal-schedule');
  await expect(sheet).toBeVisible();
  // Opened from a row there is no day yet, so the day is asked for; the task is already ticked.
  await expect(page.getByTestId('cal-schedule-date')).toBeVisible();
  await expect(page.getByTestId('cal-task-list').locator('input:checked')).toHaveCount(1);
  await expect(page.getByTestId('cal-schedule-go')).toBeEnabled();

  await shot(page, ti, 'list-schedule');
  expectNoConsoleErrors(rec);
});

test('calendar: רשימה for a field user is HIS work — no "כולל של אחרים"', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await openCalendar(page);
  await page.locator('[data-view="list"]').click();
  await expect(page.getByTestId('cal-list')).toBeVisible();

  // The admin-only filter is not offered to him at all.
  await expect(page.getByTestId('cal-list-others')).toHaveCount(0);
  // Whatever he sees is assigned to him (the sandbox gives ניתאי one task).
  const rows = page.locator('.ucal-ltask');
  if (await rows.count()) await expect(rows.first()).toContainText('ניתאי');

  expectNoConsoleErrors(rec);
});
