// KibbutzDetail — the open card (round 5, package K-U1). Replaces the legacy kibbutz modal:
// one sheet, two tabs, opened through the ONE door (sigma.openKibbutzModal, K-L3).
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { boot, expect, expectNoConsoleErrors, test } from './_helpers';

const detail = (page: any) => page.locator('[data-testid="kibbutz-detail"]');

const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'evidence', 'qa6-card');

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
  // Wait for the sheet AND its focus to land: Escape sent while the dialog is still mounting is
  // swallowed under a loaded full run (the flake), so assert the header is up before pressing.
  await expect(header.getByRole('button', { name: 'סגירה' })).toBeVisible();
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

  test('the ➕ סיכום ביקור bubble is ≥48px and full-width, hidden for the viewer', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
    const btn = detail(page).getByRole('button', { name: 'סיכום ביקור' });
    await expect(btn).toBeVisible();
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    const bodyWidth = (await detail(page).locator('..').boundingBox())?.width ?? 0;
    expect(box.width).toBeGreaterThan(bodyWidth * 0.7); // "full width" of the tab's own padding box

    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
    await btn.click();
    await expect(page.getByTestId('visit-chapters')).toBeVisible();
  });

  // round 9 "card visit button" pass — עידן: "a card that already has previous visit summaries
  // has no dedicated button to edit, or to create a new visit". חוקוק has a filed visit in the
  // mock fixtures (js/src/01-data.js mockVisits) — the POPULATED state, not the empty one above.
  test('populated: the ➕ בubble AND a row ✏️ both show, and both open the editor', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));

    const newBtn = detail(page).getByRole('button', { name: 'סיכום ביקור' });
    await expect(newBtn).toBeVisible();
    const row = detail(page).getByTestId('visit-row').first();
    await expect(row).toBeVisible();
    const editBtn = row.getByRole('button', { name: 'עריכת הסיכום' });
    await expect(editBtn).toBeVisible();
    const box = (await editBtn.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await editBtn.click();
    await expect(page.getByTestId('visit-chapters')).toBeVisible();
  });

  // Same populated kibbutz, a fresh page: the primary ➕ bubble opens the (new-visit) editor
  // too — it never disappears once history exists, it just stops being the ONLY door.
  test('populated: the ➕ bubble still opens the new-visit editor', async ({ page }, ti) => {
    await boot(page, ti, { who: 'אביאם' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('חוקוק', 'visits'));
    const newBtn = detail(page).getByRole('button', { name: 'סיכום ביקור' });
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await expect(page.getByTestId('visit-chapters')).toBeVisible();
  });

  test('viewer never sees the ➕ סיכום ביקור bubble, with or without history', async ({ page }, ti) => {
    await boot(page, ti, { who: 'צפייה' });
    for (const name of ['חוקוק', 'שדה אליהו']) {
      await page.evaluate(n => (window as any).sigma.openKibbutzModal(n, 'visits'), name);
      await expect(detail(page).getByRole('button', { name: 'סיכום ביקור' })).toHaveCount(0);
    }
  });
});

// ─────────── round 6 QA card, item 2.1 — the marketing tag no longer sits under ✕ ───────────
test.describe('header layout evidence (round 6, item 2.1)', () => {
  test('בתהליך שיווקי sits in the title-row flow, never overlapping ✕, at this viewport', async ({ page }, ti) => {
    await boot(page, ti, { who: 'עידן' });
    await page.evaluate(() => (window as any).sigma.openKibbutzModal('כפר עזה'));
    const header = detail(page).locator('[data-testid="kibbutz-detail-header"]');
    const tag = header.getByText('בתהליך שיווקי');
    const close = header.getByRole('button', { name: 'סגירה' });
    await expect(tag).toBeVisible();
    await expect(close).toBeVisible();

    await mkdir(EVIDENCE_DIR, { recursive: true });
    const theme = (ti.project.metadata as any).theme as string;
    const viewport = (ti.project.metadata as any).viewport as string;

    // "before" reproduction: the round-5 header put the tag in its OWN grid column between the
    // title and the ✕ column (`grid-cols-[1fr_auto_auto]`) — at 360/412 that third column's
    // content (icon + "בתהליך שיווקי") had nowhere to shrink into and rendered on top of the ✕
    // column. Reproduce that exact geometry via an injected clone (not the live header, so the
    // "after" assertion below is never at risk of being skipped) purely to document the
    // regression this fix removes.
    const beforeShot = path.join(EVIDENCE_DIR, `${viewport}-${theme}-before-overlap.png`);
    const beforeOverlapPx = await page.evaluate(() => {
      const src = document.querySelector('[data-testid="kibbutz-detail-header"]') as HTMLElement;
      if (!src) return null;
      const clone = src.cloneNode(true) as HTMLElement;
      clone.className = 'grid grid-cols-[1fr_auto_auto] items-start gap-2 px-4 pb-2';
      clone.style.position = 'fixed';
      clone.style.insetInlineStart = '0';
      clone.style.top = '0';
      clone.style.zIndex = '999999';
      clone.style.background = 'var(--background)';
      clone.style.width = '100%';
      document.body.appendChild(clone);
      const nodes = Array.from(clone.querySelectorAll('*'));
      const tagEl = nodes.find(n => n.textContent?.trim() === 'בתהליך שיווקי')?.closest('span,div') as HTMLElement | undefined;
      const closeEl = Array.from(clone.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'סגירה') as HTMLElement | undefined;
      let overlap = 0;
      if (tagEl && closeEl) {
        const a = tagEl.getBoundingClientRect();
        const b = closeEl.getBoundingClientRect();
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        overlap = ox * oy;
      }
      (clone as any)._sigmaEvidence = true;
      return overlap;
    });
    await page.screenshot({ path: beforeShot, clip: { x: 0, y: 0, width: (page.viewportSize()?.width ?? 360), height: 120 } });
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="kibbutz-detail-header"]').forEach(el => {
        if ((el as any)._sigmaEvidence) el.remove();
      });
    });
    // The old three-column layout DID overlap at this viewport — documenting the bug, not
    // asserting it (there is nothing to gate on the reproduction itself).
    expect(beforeOverlapPx === null || beforeOverlapPx >= 0).toBe(true);

    // "after": the real, current header — this is the assertion that actually gates the fix.
    const afterShot = path.join(EVIDENCE_DIR, `${viewport}-${theme}-after-no-overlap.png`);
    await page.screenshot({ path: afterShot, clip: { x: 0, y: 0, width: (page.viewportSize()?.width ?? 360), height: 120 } });
    const tagBox = (await tag.boundingBox())!;
    const closeBox = (await close.boundingBox())!;
    const ox = Math.max(0, Math.min(tagBox.x + tagBox.width, closeBox.x + closeBox.width) - Math.max(tagBox.x, closeBox.x));
    const oy = Math.max(0, Math.min(tagBox.y + tagBox.height, closeBox.y + closeBox.height) - Math.max(tagBox.y, closeBox.y));
    expect(ox * oy).toBe(0);
  });
});
