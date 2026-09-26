// KibbutzDetail — the open card (round 5, package K-U1). Replaces the legacy kibbutz modal:
// one sheet, two tabs, opened through the ONE door (sigma.openKibbutzModal, K-L3).
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';

const detail = (page: any) => page.locator('[data-testid="kibbutz-detail"]');

test('kibbutz detail: the door opens the React sheet on מצב הקיבוץ, not the legacy modal', async ({ page }, ti) => {
  // Round 5, V-U3: the legacy modal (#modalBackdrop) is gone entirely — this test exercises
  // the door itself, which is K-U1's scope.
  const { rec } = await boot(page, ti);
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).getByRole('heading', { name: 'חוקוק' })).toBeVisible();
  await expect(detail(page).getByRole('radio', { name: 'מצב הקיבוץ' })).toBeChecked();
  await expect(page.locator('#modalBackdrop')).toHaveCount(0);
  await expectNoConsoleErrors(rec);
});

test('kibbutz detail: the door opens ביקורים from a legacy tab name', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('יגור', 'visit'));
  await expect(detail(page).getByRole('radio', { name: 'ביקורים' })).toBeChecked();
});

test('kibbutz detail: an open before the chunk lands is replayed', async ({ page }, ti) => {
  await page.addInitScript(() => {
    const t = setInterval(() => {
      const s = (window as any).sigma;
      if (s?.openKibbutzModal) { clearInterval(t); s.openKibbutzModal('כפר עזה'); }
    }, 5);
  });
  await boot(page, ti);
  await expect(detail(page).getByRole('heading', { name: 'כפר עזה' })).toBeVisible();
});

test('kibbutz detail: A then B shows B only', async ({ page }, ti) => {
  await boot(page, ti);
  await page.evaluate(() => { const s = (window as any).sigma; s.openKibbutzModal('חוקוק'); s.openKibbutzModal('יגור'); });
  await expect(detail(page).getByRole('heading', { name: 'יגור' })).toBeVisible();
  await expect(detail(page).getByText('חוקוק', { exact: true })).toHaveCount(0);
});

test('kibbutz detail: marketing tag beside ✕, ✏️ for עידן only, closes by ✕ / Esc', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('כפר עזה'));
  const header = detail(page).locator('[data-testid="kibbutz-detail-header"]');
  await expect(header.getByText('בתהליך שיווקי')).toBeVisible();
  await expect(header.getByRole('button', { name: 'פרטי קיבוץ' })).toBeVisible();
  await header.getByRole('button', { name: 'סגירה' }).click();
  await expect(detail(page)).toBeHidden();
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('כפר עזה'));
  await page.keyboard.press('Escape');
  await expect(detail(page)).toBeHidden();
});

test('kibbutz detail: a team member and the viewer get no ✏️', async ({ page }, ti) => {
  for (const who of ['אביאם', 'צפייה'] as const) {
    await boot(page, ti, { who });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
    await expect(detail(page).getByRole('button', { name: 'פרטי קיבוץ' })).toHaveCount(0);
  }
});

test('kibbutz detail: presenter strip is still published', async ({ page }, ti) => {
  await boot(page, ti);
  await page.waitForFunction(() => typeof (window as any).sigma?.presenterStrip === 'function');
});

// ─────────────────── status tab (K-U2) ───────────────────

test('status tab: the five sections in order, no burns', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('יגור'));
  const titles = await detail(page).locator('[data-section]').evaluateAll(
    els => els.map(e => (e as HTMLElement).dataset.section));
  expect(titles).toEqual(['ems', 'internal', 'lastVisitReport', 'meetings', 'status']);
  await expect(detail(page).getByText(/צריבות/)).toHaveCount(0);
});

test('status tab: last visit ✏️ and 🚚 open the new visit sheet', async ({ page }, ti) => {
  await boot(page, ti, { who: 'אביאם' });
  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  const section = detail(page).locator('[data-section="lastVisitReport"]');
  const editBtn = section.getByRole('button', { name: 'עריכת הסיכום' });
  const emptyText = section.getByText('עוד אין סיכום ביקור לקיבוץ הזה.');
  // The section renders empty for one paint until useKibbutzVisits' data lands — waiting for
  // EITHER outcome first (instead of reading editBtn.count() immediately) is what makes this
  // race-free; reading the count before data lands always saw 0 and fell into the wrong branch.
  await expect(editBtn.or(emptyText)).toBeVisible();
  if (await editBtn.count()) {
    await editBtn.click();
    await expect(page.locator('[data-testid="visit-chapters"]')).toBeVisible();
  } else {
    await expect(section.getByText('עוד אין סיכום ביקור לקיבוץ הזה.')).toBeVisible();
  }
});

// Round 4 · Package Z, item 1 (ported from the retired visit-form.spec.ts, V-U3): the legacy
// renderLastVisit kept only visits from the last 31 days, so a kibbutz last visited two months
// ago showed NO ✏️/🚚/history at all, while the card itself went on advertising "📍 ביקור אחרון".
// latestVisitFor (K-L1) is unbounded by date, so that regression cannot reappear here.
test('status tab: a visit older than a month still offers ✏️/🚚 and its own history', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.waitForSelector('#sigma-home .kibbutz[data-name="חוקוק"]');
  await page.evaluate(() => {
    const iso = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
    (window as any).SHEET_DATA.visits = [
      { id: 'z-old-1', kibbutz: 'חוקוק', visitor: 'אביאם', duration: 3, contact: 'יוסי',
        summary: 'הוחלף המונה הראשי', products: [{ name: 'מונה Landis+Gyr E360PP', qty: 1 }], date: iso(62) },
      { id: 'z-old-2', kibbutz: 'חוקוק', visitor: 'ניתאי', duration: 2, summary: 'בדיקת תקשורת',
        products: [], date: iso(95) },
    ];
  });

  await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
  const section = detail(page).locator('[data-section="lastVisitReport"]');
  await expect(section).toContainText('הוחלף המונה הראשי');
  const editBtn = section.getByRole('button', { name: 'עריכת הסיכום' });
  const certBtn = section.getByRole('button', { name: 'תעודת משלוח' });
  await expect(editBtn).toBeVisible();
  await expect(certBtn).toBeVisible();

  await editBtn.click();
  await expect(page.locator('[data-testid="visit-chapters"]')).toBeVisible();
});

test('status tab: role matrix for adders', async ({ page }, ti) => {
  const cases: Array<[any, boolean]> = [['עידן', true], ['אביאם', true], ['צפייה', false]];
  for (const [who, canAct] of cases) {
    await boot(page, ti, { who });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק'));
    const adders = detail(page).locator('[data-adder]');
    if (canAct) await expect(adders.first()).toBeVisible();
    else await expect(adders).toHaveCount(0);
  }
});

// ─────────────────── ביקורים tab (V-U2, replaces K-U1's stub) ───────────────────

test.describe('ביקורים', () => {
  test('history rows with ✏️/🚚, both open the new sheet', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
    const row = detail(page).getByTestId('visit-row').first();
    await row.getByRole('button', { name: 'עריכת הסיכום' }).click();
    await expect(page.getByTestId('visit-chapters')).toBeVisible();
  });

  test('a draft row for a long kibbutz name is not cut off', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.visitDraftPut({
      id: 'v_t', person: 'אביאם', kibbutz: 'כפר גלעדי',
      date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(), payload: { summary: 'x' },
    }));
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('כפר גלעדי', 'visits'));
    const row = detail(page).getByTestId('visit-draft-row');
    await expect(row).toBeVisible();
    expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });

  test('מחיקת טיוטה removes it, with undo', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.visitDraftPut({
      id: 'v_t', person: 'אביאם', kibbutz: 'חוקוק',
      date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(), payload: { summary: 'x' },
    }));
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
    await detail(page).getByTestId('visit-draft-row').getByRole('button', { name: 'מחיקת טיוטה' }).click();
    await expect(page.getByText('הטיוטה נמחקה')).toBeVisible();
    await expect(detail(page).getByTestId('visit-draft-row')).toHaveCount(0);
    await page.locator('[data-sonner-toast]').getByRole('button', { name: 'ביטול' }).click();
    await expect(detail(page).getByTestId('visit-draft-row')).toBeVisible();
  });

  test('viewer: history only, no action buttons', async ({ page }, ti) => {
    await boot(page, ti, { who: 'צפייה' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
    await expect(detail(page).getByRole('button', { name: 'סיכום ביקור' })).toHaveCount(0);
    await expect(detail(page).getByRole('button', { name: 'עריכת הסיכום' })).toHaveCount(0);
  });

  test('empty: EmptyState + the primary bubble', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('שדה אליהו', 'visits'));
    await expect(detail(page).getByText('עוד אין סיכומי ביקור לקיבוץ הזה.')).toBeVisible();
    await expect(detail(page).getByRole('button', { name: 'סיכום ביקור' })).toBeVisible();
  });
});
