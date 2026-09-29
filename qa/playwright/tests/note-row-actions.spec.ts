// Row actions on a meeting bullet (⋯ menu): delete (confirm + 5 s undo), move to another
// kibbutz, open an internal task, convert to an EMS task. Runs in every project; the phone
// widths (360 / 412, light + dark) are the ones that matter for the sheets.
import type { Page } from '@playwright/test';
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

const section = (page: Page) => page.locator('[data-section="meetings"]');
const rowOf = (page: Page, text: string) => section(page).locator('.note-bullet', { hasText: text });

async function openModal(page: Page, name: string) {
  await page.evaluate(n => (window as any).sigma.openKibbutzModal(n), name);
  await expect(section(page)).toBeVisible();
}
async function openMenu(page: Page, text: string) {
  const row = rowOf(page, text);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'עוד פעולות לבולט' }).click();
  // the menu is portalled to <body> (Q7-A 2), so it is no longer inside the row
  const menu = page.getByTestId('note-row-menu');
  await expect(menu).toBeVisible();
  return menu;
}

test('note row: delete asks first, persists, and undo brings it back', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openModal(page, 'חוקוק');
  const text = 'לבדוק זרימת נתונים מהבקר החדש';

  const row = await openMenu(page, text);
  await shot(page, ti, 'menu');
  await row.getByRole('button', { name: 'מחיקת שורה' }).click();
  const sheet = page.getByRole('dialog').filter({ hasText: 'למחוק את השורה?' });
  await expect(sheet).toBeVisible();
  await shot(page, ti, 'confirm');
  await sheet.getByRole('button', { name: 'מחיקת שורה' }).click();
  await expect(rowOf(page, text)).toHaveCount(0);

  const toast = page.locator('[data-sonner-toast]', { hasText: 'השורה נמחקה' });
  await expect(toast).toBeVisible();
  await shot(page, ti, 'undo-toast');
  await toast.getByRole('button', { name: 'ביטול' }).click();
  await expect(rowOf(page, text)).toHaveCount(1);
  expectNoConsoleErrors(rec);
});

test('note row: move to another kibbutz shows it there', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openModal(page, 'חוקוק');
  const text = 'לתאם מול הגזבר את החתימה על ההסכם';

  const row = await openMenu(page, text);
  await row.getByRole('button', { name: 'העברה לקיבוץ אחר' }).click();
  const picker = page.getByTestId('note-move-sheet');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: 'חוקוק', exact: true })).toHaveCount(0);
  await picker.getByLabel('חיפוש קיבוץ').fill('שדה');
  await shot(page, ti, 'picker');
  await picker.getByRole('button', { name: 'שדה אליהו' }).click();
  await expect(rowOf(page, text)).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast]', { hasText: 'הועברה לשדה אליהו' })).toBeVisible();

  await page.keyboard.press('Escape');
  await openModal(page, 'שדה אליהו');
  await expect(rowOf(page, text)).toHaveCount(1);
  expectNoConsoleErrors(rec);
});

test('note row: open an internal task prefilled, and the row shows the link', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await openModal(page, 'חוקוק');
  const text = 'להשלים החלפת מונה ראשי במחלבה';

  const row = await openMenu(page, text);
  await row.getByRole('button', { name: 'פתיחת משימה', exact: true }).click();
  const sheet = page.getByTestId('internal-task-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('#itTitle')).toHaveValue(/להשלים החלפת מונה ראשי/);
  await shot(page, ti, 'internal-sheet');
  await sheet.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(rowOf(page, text).getByRole('button', { name: 'משימה פנימית מקושרת' })).toBeVisible();
  await shot(page, ti, 'internal-linked');
  expectNoConsoleErrors(rec);
});

test('note row: convert to an EMS task prefilled, and the row links to it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  await page.evaluate(() => {
    (window as any).__created = [];
    (window as any).sigma.createTask = (item: any) => {
      (window as any).__created.push(item);
      return Promise.resolve({ sent: true, id: 'T-77' });
    };
  });
  await openModal(page, 'חוקוק');
  const text = 'הוזמנו 12 מונים מהמחסן';
  // n4 is in the history block of the card, but the modal tab lists every meeting.
  const row = await openMenu(page, text);
  await row.getByRole('button', { name: 'הסבה למשימת EMS' }).click();
  await expect(rowOf(page, text).getByRole('button', { name: 'פתח את המשימה ב-EMS' })).toBeVisible();
  const created = await page.evaluate(() => (window as any).__created);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ kibbutz: 'חוקוק', title: text });
  expectNoConsoleErrors(rec);
});

test('note row: a viewer gets no row actions', async ({ page }, ti) => {
  await boot(page, ti, { who: 'צפייה' });
  await openModal(page, 'חוקוק');
  await expect(rowOf(page, 'לבדוק זרימת נתונים מהבקר החדש')).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'עוד פעולות לבולט' })).toHaveCount(0);
});

// Q7-A 2: the LAST row's ⋯ menu did not open (clipped / off the bottom edge). Real-size check:
// the card's last bullet is scrolled to the very bottom of the viewport, the menu must open
// and every item must be fully inside the viewport and actually hittable (not clipped by an
// ancestor's overflow) — on the home card AND in the modal tab, at 360/412 both themes.
test('note row: the LAST row ⋯ menu opens at the bottom edge and stays hittable', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'עידן' });
  const check = async (scope: ReturnType<Page['locator']>, tag: string) => {
    const last = scope.locator('.note-bullet').last();
    await last.scrollIntoViewIfNeeded();
    await last.evaluate(el => {
      // push the row to the bottom edge of the viewport (scroll ancestors + window)
      const r = el.getBoundingClientRect();
      let p: HTMLElement | null = el.parentElement;
      const delta = r.bottom - (window.innerHeight - 4);
      while (p) { if (p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) { p.scrollTop += delta; break; } p = p.parentElement; }
      window.scrollBy(0, delta);
    });
    await last.getByRole('button', { name: 'עוד פעולות לבולט' }).click();
    const menu = page.getByTestId('note-row-menu');
    await expect(menu).toBeVisible();
    const bad = await menu.evaluate(m => {
      const vw = window.innerWidth, vh = window.innerHeight, out: string[] = [];
      const mr = m.getBoundingClientRect();
      if (mr.top < 0 || mr.bottom > vh || mr.left < 0 || mr.right > vw) out.push('menu outside viewport ' + JSON.stringify(mr));
      for (const b of Array.from(m.querySelectorAll('button'))) {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !b.contains(hit)) out.push('not hittable: ' + b.textContent + ' ← ' + (hit ? hit.tagName + '.' + String(hit.className).slice(0, 60) : 'null') + ' @' + Math.round(r.left) + ',' + Math.round(r.top));
      }
      return out;
    });
    expect(bad, tag + ': ' + bad.join('; ')).toEqual([]);
    await shot(page, ti, tag);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  };
  await check(page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .card-notes'), 'last-row-card');
  await openModal(page, 'חוקוק');
  await check(section(page), 'last-row-modal');
  expectNoConsoleErrors(rec);
});

test('note row: no per-row ➕ — every action lives in the ⋯ menu (Q7-A 4)', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await openModal(page, 'חוקוק');
  await expect(section(page).getByRole('button', { name: 'פתח משימה ב-EMS' })).toHaveCount(0);
  const row = await openMenu(page, 'להשלים החלפת מונה ראשי במחלבה');
  await expect(row.getByRole('button', { name: 'הסבה למשימת EMS' })).toBeVisible();
});
