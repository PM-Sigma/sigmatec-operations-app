// נוכחות — "what happened that day" (עידן 11.10). The text itself is a golden
// (app/src/lib/attDayDetails.test.ts); here: tapping a past field day shows the visit summary,
// above any edit controls, on the phone sheet and the desktop panel, and the viewer reads it only.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';
import type { Page } from '@playwright/test';

const SUMMARY = 'הוחלף מונה בלוח 3 ונבדקה תקשורת';

async function openAttendance(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    (window as any).sigma?.showPage?.('attendance');
    const el = document.getElementById('attendance-view');
    return !!el && el.style.display !== 'none';
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForSelector('[data-testid="att-grid"]', { state: 'visible', timeout: 20_000 });
}

/** The sandbox's visit day (first Wednesday — mockVisits), plus one more visit of אביאם that day. */
async function seedVisit(page: Page): Promise<string> {
  return page.evaluate(summary => {
    const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth(), 1);
    while (x.getDay() !== 3) x.setDate(x.getDate() + 1);
    const p = (v: number) => String(v).padStart(2, '0');
    const ymd = x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
    (window as any).SHEET_DATA.visits.push({ id: 'vis-dd', visitor: 'אביאם', kibbutz: 'דפנה', duration: 2, reason: 'תקלה',
      summary, openItems: 'להחליף ממסר', products: [{ name: 'מונה PM135', qty: 1 }], date: new Date(ymd + 'T14:00:00').toISOString() });
    return ymd;
  }, SUMMARY);
}

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const scope = (page: Page) => page.getByTestId(wide(page) ? 'att-panel' : 'att-sheet');
// Optional extra copies for a reviewer (outside the repo): DAY_DETAILS_SHOTS=<dir>/
const SCRATCH = process.env.DAY_DETAILS_SHOTS || '';

test('attendance day details: a past field day shows the visit summary', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await openAttendance(page);
  const day = await seedVisit(page);
  // The sandbox's own visit day can sit in the future early in a month; the feature is about past days.
  test.skip(day >= await page.evaluate(() => new Date().toISOString().slice(0, 10)), 'visit day not yet past this month');
  await page.locator(`[data-date="${day}"]`).click();
  const box = scope(page).getByTestId('att-day-details');
  await expect(box).toBeVisible();
  await expect(box).toContainText('מסיכום ביקור');
  await expect(box).toContainText(SUMMARY);
  await expect(box).toContainText('ביקור לדוגמה');      // the sandbox's own visit, same day → a list
  await expect(box.getByTestId('att-day-visit')).toHaveCount(2);
  await shot(page, ti, 'field-day');
  if (SCRATCH && ti.project.name === 'mobile-360-light') await page.screenshot({ path: SCRATCH + 'attendance-day-details-phone-360.png' });
  if (SCRATCH && ti.project.name === 'desktop-1440-light') await page.screenshot({ path: SCRATCH + 'attendance-day-details-desktop-1440.png' });
  expectNoConsoleErrors(rec);
});

test('attendance day details: the viewer reads the selected person, read-only', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });
  await openAttendance(page);
  await page.locator('[data-person="אביאם"]').click();
  const day = await seedVisit(page);
  test.skip(day >= await page.evaluate(() => new Date().toISOString().slice(0, 10)), 'visit day not yet past this month');
  await page.locator(`[data-date="${day}"]`).click();
  await expect(scope(page).getByTestId('att-day-details')).toContainText(SUMMARY);
  await expect(scope(page).getByTestId('att-readonly')).toBeVisible();
  await expect(scope(page).getByTestId('att-save')).toHaveCount(0);
  await shot(page, ti, 'viewer');
  expectNoConsoleErrors(rec);
});
