// מצב הקיבוץ — the DRAFT health strip (Task 28, company-process spec §5 + ruling §8b).
// What only a real browser can answer: the strip reaches the kibbutz modal through the legacy
// `data-kibbutz` stamp, it carries the טיוטה marker, it is absent for a technician, and with
// no source behind it every dot reads אין נתונים instead of painting the kibbutz red.
// The rules themselves are goldens (app/src/lib/health.test.ts + HealthStrip.test.tsx).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test } from './_helpers';

const openCard = async (page: any, name: string) => {
  await page.locator('#sigma-home .kibbutz[data-name="' + name + '"] .kibbutz-name').click();
};

test('card modal: עידן gets the strip, marked טיוטה', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await openCard(page, 'חוקוק');
  const strip = page.getByTestId('health-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('health-draft-badge')).toHaveText('טיוטה');
  await expect(strip).toContainText('מצב הקיבוץ');

  // four signals, each with its own line behind it
  for (const key of ['finance', 'energy', 'alerts', 'recurring']) {
    await expect(page.getByTestId('health-dot-' + key)).toBeVisible();
  }
  await expect(page.getByTestId('health-dot-energy')).toHaveAttribute('title', /מאזן אנרגיה/);

  await expectRtl(page);
  await shot(page, ti, 'modal-strip');
  expectNoConsoleErrors(rec);
});

test('nothing behind the signals yet → אין נתונים, and no band at all', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  await openCard(page, 'חוקוק');
  const strip = page.getByTestId('health-strip');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toHaveAttribute('data-band', 'none');
  await expect(strip).toContainText('אין נתונים');
  for (const key of ['finance', 'energy', 'alerts', 'recurring']) {
    await expect(page.getByTestId('health-dot-' + key)).toHaveAttribute('data-band', 'none');
  }

  await shot(page, ti, 'no-data');
  expectNoConsoleErrors(rec);
});

test('a technician never sees the strip', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openCard(page, 'חוקוק');
  // the modal itself is open — the meetings island inside it renders for everyone
  await expect(page.locator('#modalBackdrop.open')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('health-strip')).toHaveCount(0);

  await shot(page, ti, 'hidden-for-field');
  expectNoConsoleErrors(rec);
});
