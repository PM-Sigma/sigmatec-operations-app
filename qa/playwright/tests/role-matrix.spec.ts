// Role audit (29.9) — the APP half of the role matrix, in the real app (mock mode, ?sb=0&login=0):
// every role × every page gate, the bottom bar, the ⋯ sheet, and the admin-only controls.
// The DATABASE half (RLS + RPC grants, probed live) is in docs/reports/2026-09-29-role-audit.md.
//
// Rules live in js/src/00-bridge.js canShowPage (also lifted by test-can-show-page.mjs); this spec
// asserts what the BROWSER actually renders, so a page that canShowPage allows but the UI never
// offers (or the reverse) shows up here.
import { boot, expect, expectNoConsoleErrors, test, type Who } from './_helpers';
import { bootInv, driverFor } from './inventory/_inv-driver';
import { canOpenGallery } from '../../../app/src/lib/galleryGate';
import type { Page } from '@playwright/test';

const PAGES = ['kibbutz', 'calendar', 'inventory', 'attendance', 'dev', 'pushlog', 'burns', 'hours', 'fieldops', 'emsstats', 'readings'] as const;
type PageId = typeof PAGES[number];
const STAFF: Who[] = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'מתניה', 'אבצן', 'אליה'];
const ALL: Who[] = [...STAFF, 'צפייה'];

// 1 = the page may open. Same numbers as test-can-show-page.mjs (the identity × page golden).
const CAN: Record<Who, number[]> = {
  //          kib cal inv att dev push burn hrs fops ems read
  'עידן':  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  'עמיחי': [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  'אביאם': [1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1],
  'ניתאי': [1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1],
  'מתניה': [1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1],
  'אליה':  [1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1],
  'אבצן':  [1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1],
  'צפייה': [1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], // the viewer reads reports; nothing else
};
const can = (who: Who, p: PageId) => CAN[who][PAGES.indexOf(p)] === 1;

// The phone bottom bar per role (Nav.tsx): the label list, in order.
const BAR: Record<Who, string[]> = {
  'עידן': ['קיבוצים', 'יומן', 'תיעוד ביקור', 'מלאי', 'עוד'],
  'עמיחי': ['קיבוצים', 'יומן', 'תיעוד ביקור', 'מלאי', 'עוד'],
  'אביאם': ['נוכחות', 'יומן', 'תיעוד ביקור', 'קיבוצים', 'עוד'],
  'ניתאי': ['נוכחות', 'יומן', 'תיעוד ביקור', 'קיבוצים', 'עוד'],
  'מתניה': ['קיבוצים', 'יומן', 'תיעוד ביקור', 'עוד'],   // מתניה does not handle inventory
  'אליה': ['קיבוצים', 'יומן', 'תיעוד ביקור', 'מלאי', 'עוד'],
  'אבצן': ['קיבוצים', 'יומן', 'תיעוד ביקור', 'מלאי', 'עוד'],
  'צפייה': ['קיבוצים', 'דוחות', 'עוד'],
};

// ⋯ sheet rows by label → who sees them. The ניהול block (התראות · פיתוח · סטטיסטיקה) is עידן's alone
// in MoreSheet.tsx (`currentUser === 'עידן'`), even where canShowPage lets others open the page: see the
// test.fail finding below.
const SHEET: Record<string, Who[]> = {
  'יומן': STAFF,
  'נוכחות': ['עידן', 'עמיחי', 'אביאם', 'ניתאי'],
  'שעות מול לקוחות': ['עידן', 'עמיחי', 'מתניה'],
  'מלאי': ['אביאם', 'ניתאי'],                     // everyone else has it on the bar (or, מתניה, not at all)
  'פעולות שטח': STAFF,
  'משיכת קריאות משירותי מנייה חיצוניים': STAFF,   // readings page: all staff, never the viewer
  'הודעה לעובד': STAFF,
  'העדפות משתמש': ALL,
  'התראות': ['עידן'],
  'פיתוח': ['עידן'],
  'סטטיסטיקה': ['עידן'],
};

/** Open the phone ⋯ sheet and read its row labels once the lazily registered rows stop arriving. */
async function sheetRows(page: Page): Promise<string[]> {
  await page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]').getByRole('button', { name: 'עוד', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  let prev = '', stable = 0, rows: string[] = [];
  for (let i = 0; i < 40 && stable < 3; i++) {
    rows = await sheet.getByRole('button').evaluateAll(els => els.map(e => (e.textContent || '').trim()));
    const key = rows.join('|');
    stable = key === prev ? stable + 1 : 0;
    prev = key;
    await page.waitForTimeout(250);
  }
  return rows;
}

/** showPage(p) → the page that actually became current (a refused page falls back to קיבוצים). */
const openedPage = (page: Page, p: PageId) => page.evaluate(x => { (window as any).sigma.showPage(x); return (window as any)._currentPage as string; }, p);

for (const who of ALL) {
  test(`role matrix ${who}: page gates, bar and ⋯ sheet`, async ({ page }, ti) => {
    const { rec, viewport } = await boot(page, ti, { who, ready: '' });

    // 1. the ONE gate, evaluated in the live app
    const gate = await page.evaluate(ps => ps.map(p => (window as any).sigma.canShowPage(p) ? 1 : 0), [...PAGES]);
    expect(gate, `canShowPage for ${who}`).toEqual(CAN[who]);
    // the retired pages are refused for everyone
    for (const p of ['ems', 'mytasks', 'staff']) {
      expect(await page.evaluate(x => (window as any).sigma.canShowPage(x), p)).toBe(false);
    }

    // 2. the router agrees with the gate: an allowed page opens, a refused one bounces to קיבוצים,
    //    and the matching view container is the only one displayed (no page opens "half").
    for (const p of PAGES) {
      const now = await openedPage(page, p);
      expect(now, `${who} → showPage('${p}')`).toBe(can(who, p) ? p : 'kibbutz');
      if (p !== 'kibbutz' && p !== 'calendar') {
        const shown = await page.evaluate(x => { const el = document.getElementById(x + '-view'); return !!el && el.style.display !== 'none'; }, p);
        expect(shown, `${who} #${p}-view displayed`).toBe(can(who, p));
      }
    }
    await page.evaluate(() => (window as any).sigma.showPage('kibbutz'));

    if (!viewport.startsWith('mobile')) return; // the bar and the ⋯ sheet are the phone surface

    // 3. bottom bar
    const nav = page.locator('#sigma-nav nav[aria-label="ניווט ראשי"]');
    await expect(nav).toBeVisible();
    const names = await nav.getByRole('button').evaluateAll(els => els.map(el => el.getAttribute('aria-label') || el.textContent || ''));
    expect(names.length, `bar for ${who}: ${names.join(' · ')}`).toBe(BAR[who].length);
    BAR[who].forEach((label, i) => expect(names[i]).toContain(label));

    // 4. ⋯ sheet: each row is there exactly for the roles listed
    const rows = await sheetRows(page);
    for (const [label, whom] of Object.entries(SHEET)) {
      const has = rows.some(r => r === label);
      expect(has, `${who}: "${label}" ${whom.includes(who) ? 'must be' : 'must NOT be'} in ⋯ (rows: ${rows.join(' | ')})`).toBe(whom.includes(who));
    }
    if (who === 'צפייה') {
      // a read-only role is offered no page rows and no write shortcuts at all
      for (const bad of ['יומן', 'מלאי', 'נוכחות', 'הודעה לעובד', 'קיבוץ חדש', 'ייבוא סיכום ישיבה']) expect(rows).not.toContain(bad);
    }
    expect(rec.errors.filter(e => !/favicon/.test(e))).toEqual([]);
  });
}

// ── admin-only controls ─────────────────────────────────────────────────────────────────────────────
for (const who of ALL) {
  test(`role matrix ${who}: "מצב הצוות" (settings) is עידן's alone`, async ({ page }, ti) => {
    const { rec, viewport } = await boot(page, ti, { who, ready: '' });
    test.skip(!viewport.startsWith('mobile'), 'opened from the phone ⋯ sheet');
    await sheetRows(page);
    await page.getByRole('dialog').getByRole('button', { name: 'העדפות משתמש', exact: true }).click();
    // the settings sheet is up once its own "תצוגה" block is (every role has it)
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('heading', { name: 'תצוגה' })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    // עידן-only blocks: the device list and the ניהול block (onboarding template)
    await expect(dlg.getByRole('heading', { name: 'מצב הצוות' })).toHaveCount(who === 'עידן' ? 1 : 0);
    await expect(dlg.getByRole('heading', { name: 'ניהול' })).toHaveCount(who === 'עידן' ? 1 : 0);
    expectNoConsoleErrors(rec);
  });
}

test('role matrix: the component gallery is עידן-only on a real session (mock mode keeps it open for QA)', () => {
  for (const who of ALL) {
    expect(canOpenGallery(who, false), `${who} real session`).toBe(who === 'עידן');
    expect(canOpenGallery(who, true), `${who} mock`).toBe(true);
  }
});

// Dev board: the four roles that may open the page; only עידן/עמיחי/מתניה get the write affordances
// (priority chips, "העברה לשלב"), אליה reads.
const EMS = { ems_token_v1: 'qa-ems-token', ems_token_at_v1: String(Date.now()) };
for (const who of ['עידן', 'עמיחי', 'מתניה', 'אליה'] as Who[]) {
  test(`role matrix ${who}: dev board card sheet ${who === 'אליה' ? 'has no' : 'has the'} write controls`, async ({ page }, ti) => {
    const { rec } = await boot(page, ti, { who, ready: '', storage: EMS });
    await page.evaluate(() => (window as any).sigma.showPage('dev'));
    await expect(page.getByTestId('dev-board-page')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('dev-card-row-21').click();
    const sheet = page.getByTestId('dev-card-sheet');
    await expect(sheet).toBeVisible();
    const writer = who !== 'אליה';
    await expect(page.getByTestId('dev-priority-chips')).toHaveCount(writer ? 1 : 0);
    await expect(sheet.getByText('העברה לשלב')).toHaveCount(writer ? 1 : 0);
    expectNoConsoleErrors(rec);
  });
}

// Inventory: product delete + the display-name field are עידן's; מתניה never reaches the page.
const d = driverFor();
for (const who of ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'אליה'] as Who[]) {
  test(`role matrix ${who}: inventory product sheet — delete and display name are עידן's`, async ({ page }, ti) => {
    await bootInv(page, ti, who, d, { ready: '#sigma-nav' });
    await d.openTab(page, 'products');
    await page.locator('[data-testid^="inv-product-row-"]').first().click();
    await expect(page.getByTestId('ps-save')).toBeVisible();
    expect(await page.getByTestId('ps-display').isDisabled(), `${who}: ps-display disabled`).toBe(who !== 'עידן');
    await page.getByTestId('ps-more').click();
    await expect(page.getByTestId('ps-delete')).toHaveCount(who === 'עידן' ? 1 : 0);
  });
}

// ── the viewer ──────────────────────────────────────────────────────────────────────────────────────
const WRITE_LABEL = /^\+|הוסף|הוספ|חדש\b|שמור|שמירה|מחק|מחיקה|תיעוד ביקור|תעודה חדשה|קיבוץ חדש/;

test('role matrix צפייה: no write button on any page the viewer can open', async ({ page }, ti) => {
  const { rec, viewport } = await boot(page, ti, { who: 'צפייה', ready: '' });
  for (const p of PAGES.filter(x => can('צפייה', x))) {
    await page.evaluate(x => (window as any).sigma.showPage(x), p);
    await page.waitForTimeout(700);
    const labels = await page.locator('button:visible').evaluateAll(els =>
      els.map(e => ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim()));
    // "רעיון או באג" is the viewer's one allowed write (feedback); the 📲 install button is not a data write.
    const bad = labels.filter(l => WRITE_LABEL.test(l) && !/רעיון|באג|התקן/.test(l));
    expect(bad, `viewer on ${p} (${viewport})`).toEqual([]);
  }
  expectNoConsoleErrors(rec);
});

test('role matrix צפייה: the inventory tabs offer no create button', async ({ page }, ti) => {
  await bootInv(page, ti, 'צפייה', d);
  for (const tab of ['orders', 'stock', 'certs', 'kibbutz', 'returns', 'products'] as const) {
    await d.openTab(page, tab);
    const labels = await page.locator('button:visible').evaluateAll(els =>
      els.map(e => ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim()));
    expect(labels.filter(l => WRITE_LABEL.test(l) && !/רעיון|באג|התקן/.test(l)), `viewer on inventory/${tab}`).toEqual([]);
  }
});

// ── FINDINGS (kept as expected-failures: they go green-to-red the day the app is fixed, which is the
//    signal to delete the marker). See docs/reports/2026-09-29-role-audit.md, F8 and F9. ───────────────
test('FINDING F8: the viewer opens the product sheet with Save and ⋯ still offered (DB refuses the write)', async ({ page }, ti) => {
  test.fail(true, 'F8: InventoryProductSheet is not viewer-gated; the write is refused by RLS, the UI still offers it');
  await bootInv(page, ti, 'צפייה', d);
  await d.openTab(page, 'products');
  await page.locator('[data-testid^="inv-product-row-"]').first().click();
  await expect(page.getByTestId('ps-save')).toHaveCount(0);
});

test('FINDING F9: עמיחי may open פיתוח and סטטיסטיקה (canShowPage) but ⋯ never lists them (same for מתניה/אליה on פיתוח)', async ({ page }, ti) => {
  test.fail(true, 'F9: MoreSheet shows the ניהול block only when the user is עידן, so these roles can open the pages by URL/history but the menu never offers them');
  await boot(page, ti, { who: 'עמיחי', ready: '' });
  const rows = await sheetRows(page);
  expect(rows).toContain('פיתוח');
  expect(rows).toContain('סטטיסטיקה');
});
