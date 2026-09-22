// The field day (Task 5, spec §5 + §7k 1/4/11). What is checked here is what only a real
// browser can answer: the sheet opens for the right person, picking a kibbutz MORPHS it into
// the briefing in place (one sheet, not two screens), 📍 lands in the visit form with the
// kibbutz already chosen, "לא בקיבוץ היום" goes away for the day, and the "היום" strip shows
// the two-hour nudge. The rules themselves are goldens (app/src/lib/field.test.ts).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

test('arrival: the sheet asks a field worker where he arrived', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });

  const sheet = page.locator('[data-mode="arrival"]');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('לאיזה קיבוץ הגעת?')).toBeVisible();
  await expect(page.locator('[data-kibbutz]').first()).toBeVisible();

  await expectRtl(page);
  await shot(page, ti, 'arrival');
  expectNoConsoleErrors(rec);
});

test('arrival: nobody else is interrupted', async ({ page }, ti) => {
  // עידן is `pm` in landing.ts — the arrival flow is not his, latch or no latch.
  const { rec } = await boot(page, ti, { who: 'עידן', fieldPrompt: true });
  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  await expect(page.locator('[data-mode="arrival"]')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

test('arrival → briefing: the same sheet morphs, and 📍 opens the summary prefilled', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();

  // ONE sheet (§7k #1): the panel is the same element, its mode changed.
  const brief = page.locator('[data-mode="briefing"]');
  await expect(brief).toBeVisible();
  await expect(page.locator('[data-mode="arrival"]')).toHaveCount(0);
  await expect(page.getByText('הגעת ל־')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'חוקוק', exact: true })).toBeVisible();
  await shot(page, ti, 'briefing');

  // 📍 סיכום ביקור → the §7p chapters sheet, on חוקוק, scrolling, with מה עשיתי at the top.
  // The briefing is gone: one surface hands over to the next, it does not stack on top of it.
  await page.getByTestId('brief-visit').click();
  const chapters = page.getByTestId('visit-chapters');
  await expect(chapters).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('vc-chapter-1')).toBeVisible();
  await expect(chapters).toContainText('חוקוק');
  await expect(page.locator('[data-mode="briefing"]')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('arrival: "לא בקיבוץ היום" closes it for the day', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'לא בקיבוץ היום' }).click();
  await expect(page.locator('[data-mode="arrival"]')).toHaveCount(0);

  const stored = await page.evaluate(() => localStorage.getItem('field_no_visit_v1'));
  expect(stored).toBeTruthy();
  expectNoConsoleErrors(rec);
});

test('היום: the strip shows today’s stop and the 2 h nudge', async ({ page }, ti) => {
  // A check-in from two and a half hours ago, no visit filed → the banner is due (§7k #4).
  const { rec } = await boot(page, ti, { who: 'אביאם', checkins: true });

  const strip = page.getByTestId('today-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('חוקוק');

  const nudge = page.getByTestId('today-nudge');
  await expect(nudge).toBeVisible();
  await expect(nudge).toContainText('עוד לא סיכמת את הביקור');

  await shot(page, ti, 'today');
  await expectRtl(page);
  expectNoConsoleErrors(rec);
});

test('היום: the strip is not there for anyone but the field team', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן', checkins: true });
  await expect(page.locator('#sigma-home .kibbutz').first()).toBeVisible();
  await expect(page.getByTestId('today-strip')).toHaveCount(0);
  expectNoConsoleErrors(rec);
});

// ───────────── round 2 · package G — the briefing ─────────────

test('briefing: 🔥 צריבות is a collapsed category with a line that counts (G6)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await expect(page.locator('[data-mode="briefing"]')).toBeVisible();

  const burns = page.getByTestId('brief-burns');
  if (!(await burns.count())) { expectNoConsoleErrors(rec); return; }   // no pending meters here

  // Shut, and saying what it holds — the meter rows are NOT in the flat list.
  await expect(page.getByTestId('brief-burns-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('brief-burns-summary')).toContainText(/צריבה|נצרב/);
  await expect(burns.locator('[data-leave-item]')).toHaveCount(0);

  await page.getByTestId('brief-burns-toggle').click();
  await expect(page.getByTestId('brief-burns-toggle')).toHaveAttribute('aria-expanded', 'true');
  expect(await burns.locator('[data-leave-item]').count()).toBeGreaterThan(0);

  await shot(page, ti, 'briefing-burns');
  expectNoConsoleErrors(rec);
});

test('היום: the day’s briefing is a row of its own, above the stops (G6)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', checkins: true });

  const row = page.getByTestId('today-brief-row');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('הבריפינג של היום');

  await row.click();
  await expect(page.locator('[data-mode="briefing"]')).toBeVisible();

  expectNoConsoleErrors(rec);
});
