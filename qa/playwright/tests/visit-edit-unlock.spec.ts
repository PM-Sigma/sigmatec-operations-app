// Per-person month unlock of the visit edit lock (db/visit_edit_unlocks.sql, עידן 11.10).
// The rule is a golden (app/src/lib/visitEdit.test.ts U1-U6, test-visit-edit-unlocks-sql.mjs); here:
// a locked September visit of אביאם offers ✏️ (and the legacy save guard lets it through) only while he
// holds an unlock for September.
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';
import type { Page } from '@playwright/test';

const SEPT = '2026-09-22';

async function openSeptVisit(page: Page, unlocked: boolean) {
  await page.waitForSelector('#sigma-home .kibbutz', { state: 'attached', timeout: 30_000 });
  await page.evaluate(({ d, unlocked }) => {
    const v = ((window as any).SHEET_DATA.visits || []).find((x: any) => x.visitor === 'אביאם');
    v.date = new Date(d + 'T09:00:00').toISOString();
    (window as any)._visitUnlocks = unlocked
      ? [{ person: 'אביאם', month: '2026-09-01', until: new Date(Date.now() + 86400000).toISOString() }] : [];
  }, { d: SEPT, unlocked });
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('calendar-view');
    if (!el || el.style.display === 'none') { (window as any).sigma?.showPage?.('calendar'); return false; }
    return typeof (window as any).sigmaCalendarOpenDay === 'function';
  }), { timeout: 20_000 }).toBe(true);
  await page.evaluate(d => (window as any).sigmaCalendarOpenDay(d), SEPT);
  await page.locator('[data-testid="cal-day"]:visible [data-visit-row="vis-אביאם"]').click();
  return page.getByTestId('cal-visit-sheet');
}

test('visit unlock: אביאם can edit a locked September visit while unlocked', async ({ page }, ti) => {
  test.skip(new Date().toISOString().slice(0, 10) <= '2026-10-10', 'September is still open by the ordinary rule');
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  const sheet = await openSeptVisit(page, true);
  await expect(sheet.getByTestId('cal-visit-edit')).toBeVisible();
  expect(await page.evaluate(d => (window as any).visitEditLocked(d, null, 'אביאם'), SEPT)).toBe(false);
  await sheet.getByTestId('cal-visit-edit').click();
  await expect(page.getByTestId('visit-chapters')).toBeVisible();
  expectNoConsoleErrors(rec);
});

test('visit unlock: without an unlock the September visit stays read-only', async ({ page }, ti) => {
  test.skip(new Date().toISOString().slice(0, 10) <= '2026-10-10', 'September is still open by the ordinary rule');
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  const sheet = await openSeptVisit(page, false);
  await expect(sheet).toContainText('חוקוק');
  await expect(sheet.getByTestId('cal-visit-edit')).toHaveCount(0);
  expect(await page.evaluate(d => (window as any).visitEditLocked(d, null, 'אביאם'), SEPT)).toBe(true);
  expectNoConsoleErrors(rec);
});
