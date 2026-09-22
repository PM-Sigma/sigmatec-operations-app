// ⏱️ ▶/■ שעות per kibbutz (Task 29, spec §6 + the §8b ruling).
// What only a real browser can answer: the control is on the card for עידן and not for a
// technician, a running timer SURVIVES A RELOAD (the elapsed time comes from storage, not
// from a counter in memory), and the stop sheet's round trip really writes a row — attendees
// and live tags included. The rules themselves are goldens (app/src/lib/clockify.test.ts +
// WorkTimer.test.tsx).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

const card = (page: any, name: string) => page.locator('#sigma-home .kibbutz[data-name="' + name + '"]');

/** The rows the harness stored, read back through the page (the routes are page-scoped). */
async function savedSessions(page: any): Promise<any[]> {
  return await page.evaluate(async (origin: string) => {
    const r = await fetch(origin + '/rest/v1/work_sessions?select=*', { headers: { apikey: 'anon' } });
    return await r.json();
  }, SB_ORIGIN);
}

test('עידן: ▶ → reload → still running → ■ → attendee + 2 tags → a row is written', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  const start = card(page, 'חוקוק').getByTestId('work-timer-start');
  await expect(start).toBeVisible({ timeout: 15_000 });
  await start.click();
  await expect(card(page, 'חוקוק').getByTestId('work-timer-stop')).toBeVisible();
  await shot(page, ti, 'running');

  // THE reload: the timer is derived from `started_at` in storage, so it comes back running.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  const stop = card(page, 'חוקוק').getByTestId('work-timer-stop');
  await expect(stop).toBeVisible({ timeout: 15_000 });
  await expect(card(page, 'חוקוק').getByTestId('work-timer-elapsed')).toHaveText(/\d\d:\d\d/);

  // 22.9 (E1): a tap on the running clock opens ITS sheet first (pause · retime · people · tags);
  // "סגור שעות" hands over to the stop sheet.
  await stop.click();
  const edit = page.getByTestId('work-timer-edit');
  await expect(edit).toBeVisible({ timeout: 15_000 });
  await expect(edit.getByTestId('work-timer-edit-elapsed')).toHaveText(/\d\d:\d\d/);
  await edit.getByTestId('work-timer-pause').click();          // ⏸ freezes the clock…
  await expect(edit.getByText('מושהה')).toBeVisible();
  await edit.getByTestId('work-timer-pause').click();          // …and ▶ resumes it
  await edit.getByTestId('work-timer-finish').click();
  const sheet = page.getByTestId('work-timer-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByTestId('attendee-גפן')).toBeVisible();
  await expect(sheet.getByTestId('tag-הדרכה על המערכת')).toBeVisible();
  await expect(sheet.getByTestId('work-timer-billable')).not.toBeChecked();   // default OFF

  await sheet.getByTestId('attendee-גפן').click();
  await sheet.getByTestId('tag-הדרכה על המערכת').click();
  await sheet.getByTestId('tag-טיפול בתקלות').click();
  await expectRtl(page);
  await shot(page, ti, 'stop-sheet');

  await sheet.getByTestId('work-timer-confirm').click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  const rows = await savedSessions(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].person).toBe('עידן');
  expect(rows[0].kibbutz).toBe('חוקוק');
  expect(rows[0].attendees).toEqual(['גפן']);
  expect(rows[0].tags).toEqual(['הדרכה על המערכת', 'טיפול בתקלות']);
  expect(rows[0].billable).toBe(false);
  expect(rows[0].clockify_id).toBe('clk-qa-1');
  expect(rows[0].description).toBe('חוקוק — הדרכה על המערכת, טיפול בתקלות');

  // the card is back to ▶ — the session is closed
  await expect(card(page, 'חוקוק').getByTestId('work-timer-start')).toBeVisible();
  await shot(page, ti, 'after-save');
  expectNoConsoleErrors(rec);
});

test('a technician never gets ▶', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await expect(card(page, 'חוקוק')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('work-timer-start')).toHaveCount(0);
  await expect(page.getByTestId('work-timer-stop')).toHaveCount(0);
  await shot(page, ti, 'hidden-for-field');
  expectNoConsoleErrors(rec);
});
