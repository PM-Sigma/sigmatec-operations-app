// 🗓️ יומן — the unified calendar (spec §7f, Task 13).
//
// The RULES are goldens (app/src/lib/calendar.test.ts). What only a real browser can answer
// is here: the island takes the screen over from the legacy grid, the week numbers really
// land on the RIGHT, the EMS layer disappears on a toggle, a day tap opens the day grouped
// by kibbutz, a reorder survives a reload (the harness keeps a real day_plans store), ➕
// searches a kibbutz and offers its tasks with a counted שבץ, and 🌴 opens a range.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, skipKnownMobile360, test } from './_helpers';
import type { Page } from '@playwright/test';

// mobile-360-known.json ratchet (Opus audit round 4 item 3) — see _helpers.ts.
test.beforeEach(({}, testInfo) => skipKnownMobile360(testInfo));

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
  // Round 5 · C-U1: the DayCell grid shows a bare "•N" dot, not the old inline chip list, so
  // `data-loaded` on the grid (Calendar.tsx) is what this now polls instead of `.ucal-chip`.
  await expect(page.locator('[data-testid="cal-grid"][data-loaded="1"]')).toBeVisible({ timeout: 20_000 });
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

// Round 5 · C-U designer fix (25.9): "DayCell at 360 must be ≥44px" — a 2px grid gap on 7
// columns had been eating into the column width the tap-target math assumed. Only meaningful
// at the 360 floor itself (bigger viewports have slack to spare), so it skips elsewhere.
test('calendar r5: a DayCell is ≥44×44 at the 360 width floor', async ({ page }, ti) => {
  test.skip(page.viewportSize()?.width !== 360, '360-floor-only assertion');
  await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  const cell = page.locator('[data-testid="cal-grid"] button[data-min-tap="44"]').first();
  const box = await cell.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('calendar r5: חודש עבודה hides week labels, חודש מלא shows one per week row', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  const toggle = page.getByTestId('cal-work-week');
  await expect(toggle).toHaveText('חודש מלא');
  // א–ה is the default (G1) — no week labels either, until חודש מלא asks for them.
  await expect(page.getByTestId('cal-weeklabel')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveText('חודש עבודה');
  const rows = await page.locator('[data-testid="cal-grid"] [data-week-row]').count();
  expect(rows).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId('cal-weeklabel')).toHaveCount(rows);
  // A word for a screen reader, never a bare digit.
  await expect(page.getByTestId('cal-weeklabel').first()).toHaveAttribute('aria-label', /^שבוע \d+$/);

  // "On the right" is a measurement, not a class name: the label sits further right than the
  // first day cell of its own row (RTL: first in the DOM reads as rightmost).
  const labelBox = (await page.getByTestId('cal-weeklabel').first().boundingBox())!;
  const firstDay = (await page.locator('.ucal-cell').first().boundingBox())!;
  expect(labelBox.x, 'the week label sits to the right of the days').toBeGreaterThan(firstDay.x);

  expectNoConsoleErrors(rec);
});

test('calendar: the week view is what a phone gets, and it remembers the choice', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  await page.locator('[data-view="week"]').click();
  await expect(page.getByTestId('cal-label')).toHaveText(/שבוע \d+/);
  // FIVE day cells, no week label (round 2 · G1 + round 5 · C6): א–ה is the week a
  // technician plans, and the week VIEW already says "שבוע N" in its own title.
  await expect(page.locator('.ucal-cell')).toHaveCount(5);
  await expect(page.getByTestId('cal-weeklabel')).toHaveCount(0);

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
  await expect(toggle).toHaveText('חודש עבודה');
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

  // The site filter is built from the tasks themselves (was `emsPopulateSiteFilter`), and
  // round 5 · C-U4 moved the three selects off the page body into a "סינון" sheet.
  await page.getByTestId('cal-list-filter-open').click();
  const sheet = page.getByTestId('cal-list-filter-sheet');
  await expect(sheet.getByTestId('cal-list-status')).toBeVisible();
  await expect(sheet.getByTestId('cal-list-priority')).toBeVisible();
  expect(await sheet.getByTestId('cal-list-site').locator('option').count()).toBeGreaterThan(1);

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

test('calendar: a day he never reported is RED on the grid, with a legend (F-4 · G)', async ({ page }, ti) => {
  // Pin the clock to a WEEKDAY (Tuesday): the test's own "expected" computation excludes
  // today/Fri/Sat, so if the real today ever landed on Friday/Saturday the default
  // חודש עבודה view hides that cell entirely and `.ucal-cell[data-date=today]` is never
  // found — a test bug, not a product bug (a real 2026-09-25 run caught this).
  await page.clock.install({ time: new Date(2026, 8, 22, 9, 0, 0) });
  // אביאם, because the sandbox gives him a month with days in it — the office/wfh fixture
  // rows plus whatever his visits add. The gaps are whatever is left.
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);

  // What the month SHOULD be shouting about, asked of the SAME snapshot the screen reads:
  // past Sun–Thu, no attendance row, not a holiday nobody had to work, never today or after.
  const expected = await page.evaluate(() => {
    const w = window as any;
    const p = (v: number) => String(v).padStart(2, '0');
    const ymd = (d: Date) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    const now = new Date();
    const today = ymd(now);
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const rows = (w.sigma?.attRows?.('אביאם', y, m) || []) as any[];
    const filed = new Set(rows.map(r => String(r.date || '').slice(0, 10)));
    const off = new Set(((w.MOCK_HOLIDAYS || []) as any[]).filter(h => !h.required).map(h => h.date));
    const gaps: string[] = [];
    for (let d = 1; d <= 31; d++) {
      const x = new Date(y, m - 1, d);
      if (x.getMonth() !== m - 1) break;
      const key = ymd(x);
      if (key >= today) continue;                      // never today, never the future
      if (x.getDay() === 5 || x.getDay() === 6) continue;   // never Fri/Sat
      if (off.has(key) || filed.has(key)) continue;
      gaps.push(key);
    }
    return { gaps, today, holidays: Array.from(off), filed: Array.from(filed) };
  });

  const marked = page.locator('[data-testid="cal-grid"] .ucal-cell[data-missing="1"]');
  if (!expected.gaps.length) {
    // Early in a month there can genuinely be nothing behind him — then nothing is red.
    await expect(marked).toHaveCount(0);
    expectNoConsoleErrors(rec);
    return;
  }

  // Every gap is red, and NOTHING else is — today, the future, Fri/Sat, the holidays and
  // the days he did file all stay clean.
  await expect.poll(async () => (await marked.evaluateAll(els => els.map(e => e.getAttribute('data-date') || ''))).sort().join(','),
    { timeout: 20_000 }).toBe(expected.gaps.slice().sort().join(','));
  await expect(page.locator(`.ucal-cell[data-date="${expected.today}"]`)).not.toHaveAttribute('data-missing', '1');

  // The marker is a real red dot on the DayCell itself (design system: dot + danger-ink
  // number, never a red border) — round 5 · C5, the legend always shows and red joins it for
  // a filer.
  await expect(page.locator(`.ucal-cell[data-date="${expected.gaps[0]}"]`)).toHaveAttribute('data-state', 'missing');
  await expect(page.getByTestId('cal-legend').locator('[data-legend="missing"]')).toBeVisible();

  await shot(page, ti, 'missing-days');
  expectNoConsoleErrors(rec);
});

// ───────────────────────────── round 5 · C-U1: whose calendar, the legend ─────────────────

test('calendar r5: no red for עידן; the legend always shows purple and green', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await expect(page.locator('[data-testid="cal-grid"] [data-state="missing"]')).toHaveCount(0);
  await expect(page.getByTestId('cal-legend').locator('[data-legend]')).toHaveText(['חג', 'ערב חג', 'דווחה נוכחות']);
  expectNoConsoleErrors(rec);
});

test('calendar r5: עידן switches to אביאם and sees the missing-day legend', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.getByTestId('cal-person').getByRole('radio', { name: 'אביאם' }).click();
  await expect(page.getByTestId('cal-legend').locator('[data-legend="missing"]')).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('calendar r5: a field person has no person picker', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await openCalendar(page);
  await expect(page.getByTestId('cal-person')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

// ───────────────────────────── round 5 · C-U2: kibbutz blocks ─────────────────────────────

/** The day after the sandbox's two-kibbutz fixture — task-cal-1 (גבת) is already overdue there. */
async function calNextDay(page: Page): Promise<string> {
  return page.evaluate(d => {
    const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1);
    const p = (v: number) => String(v).padStart(2, '0');
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }, await calDay(page));
}

test('calendar r5 · C1: picking a block plans the stop and dates the ticked task', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const next = await calNextDay(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), next);

  const block = dayBody(page).locator('[data-block="גבת"]');
  await expect(block).toBeVisible();
  await block.locator('[data-block-task="ems:task-cal-1"]').check();
  const written = page.waitForResponse(r => r.url().includes('/rest/v1/day_plans') && r.request().method() !== 'GET');
  await block.locator('[data-block-pick="גבת"]').click();
  await written;
  await expect(page.getByText(/גבת נוסף ל-.* · משימה אחת נקבעה ל-/)).toBeVisible();
  await expect(dayBody(page).locator('[data-stop="גבת"]')).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('calendar r5 · C2: עידן plans אביאם’s day, and it lands on אביאם’s route, not his own', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.getByTestId('cal-person').getByRole('radio', { name: 'אביאם' }).click();
  const day = await calDay(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);

  const written = page.waitForResponse(r => r.url().includes('/rest/v1/day_plans') && r.request().method() !== 'GET');
  await dayBody(page).locator('[data-block-pick="דגניה"]').click();
  await written;
  // Placed on the route (not just a candidate stop under 📥) — any kibbutz with an open EMS
  // task that day shows as an unplaced `[data-stop]` row regardless of whose calendar is
  // open, so "on the route" means a header other than "unplaced".
  await expect(dayBody(page).locator('[data-stop="דגניה"]:not([data-header="unplaced"])')).toBeVisible();

  // The mobile day sheet must close before the person switcher underneath it is reachable.
  await page.keyboard.press('Escape');
  await page.getByTestId('cal-person').getByRole('radio', { name: 'עידן' }).click();
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);
  await expect(dayBody(page).locator('[data-stop="דגניה"]:not([data-header="unplaced"])')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('calendar r5 · C1: a block already on the route with nothing new ticked has no add button', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const day = await calDay(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);

  const written = page.waitForResponse(r => r.url().includes('/rest/v1/day_plans') && r.request().method() !== 'GET');
  await dayBody(page).locator('[data-place="גבת"]').click();
  await written;
  // Designer round 2 (26.9): "הוספה ליום" on a stop already in today's route was a
  // contradiction — once placed with nothing new ticked, the block shows "במסלול" and NO
  // add button at all (not merely disabled).
  const block = dayBody(page).locator('[data-block="גבת"]');
  await expect(block.locator('.ucal-badge')).toHaveText('במסלול');
  await expect(block.locator('[data-block-pick="גבת"]')).toHaveCount(0);
  // The mock's own task at גבת is already dated onThisDay (disabled, pre-checked) — there is
  // nothing left to tick here, which is exactly why the button has nothing to do either.
  await expect(block.locator('[data-block-task="ems:task-cal-1"]')).toBeDisabled();

  expectNoConsoleErrors(rec);
});

// ───────────────────────────── round 5 · C-U4: רשימה filters in a sheet ───────────────────

test('calendar r5 · C4: רשימה has one filter bubble; the selects live in a sheet', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openCalendar(page);
  await page.locator('[data-view="list"]').click();
  await expect(page.getByTestId('cal-list')).toBeVisible();
  // No native <select> sits in the page body any more — only inside the sheet.
  await expect(page.locator('[data-testid="cal-list"] > .ucal-filters select')).toHaveCount(0);

  await page.getByTestId('cal-list-filter-open').click();
  const sheet = page.getByTestId('cal-list-filter-sheet');
  await expect(sheet.getByTestId('cal-list-status')).toBeVisible();
  await expect(sheet.getByTestId('cal-list-priority')).toBeVisible();
  await expect(sheet.getByTestId('cal-list-site')).toBeVisible();

  expectNoConsoleErrors(rec);
});

// ───────────────────────────── round 5 · C-U3: visit read view + event detail sheet ────────

test('calendar r5 · C3: a visit opens a read view with edit and cert, and no pins under it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openCalendar(page);
  const visitDay = await page.evaluate(() => String(((window as any).SHEET_DATA.visits || []).find((v: any) => v.visitor === 'אביאם').date).slice(0, 10));
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), visitDay);
  await expect(dayBody(page).locator('[data-layer="visit"]')).toHaveCount(0);
  await dayBody(page).locator('[data-visit-row="vis-אביאם"]').click();
  const sheet = page.getByTestId('cal-visit-sheet');
  await expect(sheet).toContainText('חוקוק');
  await expect(sheet).toContainText('ביקור לדוגמה');
  await expect(sheet.getByTestId('cal-visit-edit')).toBeVisible();
  await expect(sheet.getByTestId('cal-visit-cert')).toBeVisible();
  await sheet.getByTestId('cal-visit-edit').click();
  await expect(page.getByTestId('visit-chapters')).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('calendar r5 · C4: an office event opens one detail sheet', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  const day = await calDay(page);
  await page.evaluate(d => {
    (window as any).calFetchEvents = async () => [{
      id: 'ev-r5', title: 'ישיבת צוות', start: d + 'T09:00:00', end: d + 'T10:00:00', location: 'משרד',
      description: 'סדר יום<br>מונים &amp; בקרים', attendees: [{ name: 'אביאם' }, { name: 'ניתאי', declined: true }],
      organizer: { name: 'עמיחי' }, hangoutLink: null,
    }];
  }, day);
  await openCalendar(page);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay?.(d), day);
  await dayBody(page).locator('[data-event-row="ev-r5"]').click();
  const sheet = page.getByTestId('cal-event-sheet');
  await expect(sheet).toContainText('ישיבת צוות');
  await expect(sheet).toContainText('09:00–10:00');
  await expect(sheet).toContainText('מונים & בקרים');
  await expect(sheet).toContainText('עמיחי, אביאם');
  await expect(sheet).not.toContainText('ניתאי');
  await expect(sheet).not.toContainText('<br>');

  expectNoConsoleErrors(rec);
});
