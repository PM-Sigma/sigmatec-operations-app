// The visit summary in chapters (spec §7p, Task 32).
//
// What only a real browser can answer: that **שמור וסגור** really saves WITHOUT submitting —
// no visit, no movement, no certificate — that re-opening the kibbutz comes back to the
// chapter he left with the "טיוטה מ-HH:MM" chip on it, that **שלח** in chapter 5 creates
// exactly ONE visit however many times it is pressed, that chapter 4 only exists when there
// is something to hand over, and that a stray backdrop tap on a half-typed summary asks
// instead of throwing it away. The rules themselves are goldens (app/src/lib/visitDraft.test.ts).
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, type Recorder } from './_helpers';

const DRAFT_KEY = 'visitDrafts_v2';
const VISITS_KEY = 'kibbutzVisits_v1';

/**
 * Every POST the app makes to the Apps Script endpoint, recorded IN THE PAGE.
 *
 * It has to be in the page: `?sb=0` mock mode wraps `window.fetch` and answers SHEET_API
 * itself (js/src/01-data.js), so those requests never reach the network and a Playwright
 * route would never see them. Wrapping fetch from the outside puts the recorder in front of
 * the mock, which is what makes "exactly one visit, movements once" an assertion about real
 * calls rather than about the UI's own optimism.
 */
async function recordSheet(page: any): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__qaPosted) return;
    w.__qaPosted = [];
    const real = w.fetch.bind(w);
    w.fetch = function (url: any, opts: any) {
      try {
        if (typeof url === 'string' && url.indexOf('https://script.google.com/') === 0 && opts && opts.body) {
          w.__qaPosted.push(JSON.parse(opts.body));
        }
      } catch { /* not ours to parse */ }
      return real(url, opts);
    };
  });
}

/** What it recorded, optionally of one `type` only. */
const posted = (page: any, type?: string) => page.evaluate((t: string) => {
  const all = ((window as any).__qaPosted || []) as any[];
  return t ? all.filter(p => p && p.type === t) : all;
}, type || '') as Promise<any[]>;

/** The field path into the summary: the briefing's 📍, which is where §5 puts it. */
async function openChapters(page: any, kibbutz: string) {
  await page.evaluate((k: string) => (window as any).sigmaField?.openBriefing?.(k), kibbutz);
  await expect(page.locator('[data-mode="briefing"]')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('brief-visit').click();
  await expect(page.getByTestId('visit-chapters')).toBeVisible({ timeout: 10_000 });
}

const draftRows = (page: any) => page.evaluate((k: string) => {
  try { return Object.values(JSON.parse(localStorage.getItem(k) || '{}')); } catch { return []; }
}, DRAFT_KEY) as Promise<any[]>;

const localVisits = (page: any) => page.evaluate((k: string) => {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
}, VISITS_KEY) as Promise<any[]>;

test('chapters: שמור וסגור saves the draft and submits nothing', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();

  const sheet = page.getByTestId('visit-chapters');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet).toHaveAttribute('data-chapter', '1');
  await expect(page.getByTestId('vc-step-1')).toHaveAttribute('data-current', '1');
  // 🚚 is not part of this visit — nothing is open to hand over (§7p).
  await expect(page.getByTestId('vc-step-4')).toHaveCount(0);

  await expectRtl(page);
  await shot(page, ti, 'chapter-1');

  await page.getByTestId('vc-summary').fill('הוחלף המונה הראשי במחלבה ונבדקה תקשורת');
  await page.getByTestId('vc-next').click();
  await expect(sheet).toHaveAttribute('data-chapter', '2');

  await page.getByTestId('vc-save-close').click();
  await expect(sheet).toBeHidden();

  // ── the draft is there, with the chapter on it …
  await expect.poll(() => draftRows(page), { timeout: 10_000 }).not.toHaveLength(0);
  const rows = await draftRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].kibbutz).toBe('חוקוק');
  expect(rows[0].person).toBe('אביאם');
  expect(rows[0].payload.summary).toContain('הוחלף המונה הראשי');
  expect(rows[0].payload.chapter).toBe(2);

  // … and NOTHING was submitted: no visit row, no request of any kind to the sheet.
  expect(await localVisits(page)).toHaveLength(0);
  expect(await posted(page, 'visit')).toHaveLength(0);
  expect(await posted(page, 'movement')).toHaveLength(0);
  expect(await posted(page, 'deliveryCert')).toHaveLength(0);

  expectNoConsoleErrors(rec);
});

test('chapters: re-opening comes back to the chapter he left, with the טיוטה chip', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();
  await page.getByTestId('vc-summary').fill('בדקתי תקשורת בשלושה מונים');
  await page.getByTestId('vc-next').click();
  await page.getByTestId('vc-open-items').fill('חסר בקר לחלקה הדרומית');
  await page.getByTestId('vc-save-close').click();
  await expect(page.getByTestId('visit-chapters')).toBeHidden();
  await expect.poll(() => draftRows(page), { timeout: 10_000 }).not.toHaveLength(0);

  // ── back in, from the kibbutz itself
  await openChapters(page, 'חוקוק');
  await expect(page.getByTestId('visit-chapters')).toHaveAttribute('data-chapter', '2');
  await expect(page.getByTestId('vc-draft-chip')).toContainText('טיוטה מ-');
  await expect(page.getByTestId('vc-open-items')).toHaveValue('חסר בקר לחלקה הדרומית');
  // chapter 1 is walked past, not lost
  await page.getByTestId('vc-step-1').click();
  await expect(page.getByTestId('vc-summary')).toHaveValue('בדקתי תקשורת בשלושה מונים');

  await shot(page, ti, 'resumed');
  expectNoConsoleErrors(rec);
});

test('chapters: שלח in chapter 5 files exactly one visit, however often it is pressed', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();

  const sheet = page.getByTestId('visit-chapters');
  await page.getByTestId('vc-summary').fill('הוחלף מונה ונבדקה תקשורת');
  await page.getByTestId('vc-next').click();                       // 2
  await page.getByTestId('vc-next').click();                       // 3
  await page.getByTestId('vc-next').click();                       // 5 — 4 does not apply
  await expect(sheet).toHaveAttribute('data-chapter', '5');

  // The hours are the form's own rule, and the sheet says so before the round trip.
  await expect(page.getByTestId('vc-blocked')).toContainText('כמה זמן היית שם?');
  await expect(page.getByTestId('vc-send')).toBeDisabled();
  await page.getByTestId('vc-hours-2').click();
  await expect(page.getByTestId('vc-send')).toBeEnabled();
  await shot(page, ti, 'chapter-5');

  // Pressed twice, as a thumb on a phone does.
  await page.getByTestId('vc-send').dblclick();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  const visits = await posted(page, 'visit');
  expect(visits, 'exactly one visit was filed').toHaveLength(1);
  expect(visits[0].kibbutz).toBe('חוקוק');
  expect(visits[0].visitor).toBe('אביאם');
  expect(visits[0].summary).toContain('הוחלף מונה');
  expect(visits[0].duration).toBe(2);
  // Nothing was handed over, so there are no movements and no certificate.
  expect(await posted(page, 'movement')).toHaveLength(0);
  // The draft is gone once the visit exists — a leftover beside a filed visit is noise.
  await expect.poll(() => draftRows(page), { timeout: 10_000 }).toHaveLength(0);

  expectNoConsoleErrors(rec);
});

test('chapters: 🚚 appears only once something is handed over, and then it gates שלח', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);

  // The mock sheet ships no movements, so the ONE pool is empty by design. Seed one, the
  // same shape computeStock() reads — fixture data, not a UI stub.
  await page.evaluate(() => {
    const w = window as any;
    w.SHEET_DATA.movements = [{ product: 'מונה Landis+Gyr E360PP', quantity: 5, fromLocation: '', toLocation: 'חברה' }];
  });

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();

  const sheet = page.getByTestId('visit-chapters');
  await page.getByTestId('vc-summary').fill('הבאתי מונה חדש והתקנתי');
  await expect(page.getByTestId('vc-step-4')).toHaveCount(0);      // nothing to deliver yet

  await page.getByTestId('vc-step-3').click();
  await expect(sheet).toHaveAttribute('data-chapter', '3');
  await page.getByLabel('כמות — מונה Landis+Gyr E360PP').fill('1');

  // Now it is part of this visit — and it stands between him and שלח (§5 cert rule).
  await expect(page.getByTestId('vc-step-4')).toBeVisible();
  await page.getByTestId('vc-step-5').click();
  await expect(page.getByTestId('vc-blocked')).toContainText('תעודת משלוח');
  await expect(page.getByTestId('vc-send')).toBeDisabled();

  await page.getByTestId('vc-step-4').click();
  await expect(page.getByTestId('vc-cert')).toBeVisible();
  await shot(page, ti, 'cert-chapter');

  expectNoConsoleErrors(rec as Recorder);
});

test('chapters: a backdrop tap on a half-typed summary asks instead of losing it (§7p)', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', fieldPrompt: true });
  await recordSheet(page);

  await expect(page.locator('[data-mode="arrival"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-kibbutz="חוקוק"]').click();
  await page.getByTestId('brief-visit').click();
  await page.getByTestId('vc-summary').fill('התחלתי לכתוב ואז קראו לי');

  // The backdrop is Radix's overlay, outside the sheet — the tap §7p is about.
  await page.mouse.click(5, 5);
  await expect(page.getByTestId('unsaved-guard')).toBeVisible();
  await expect(page.getByTestId('visit-chapters')).toBeVisible();

  // "להמשיך לערוך" leaves him exactly where he was, with his words.
  await page.getByTestId('unsaved-keep').click();
  await expect(page.getByTestId('unsaved-guard')).toHaveCount(0);
  await expect(page.getByTestId('vc-summary')).toHaveValue('התחלתי לכתוב ואז קראו לי');

  // "לשמור" is שמור וסגור: the draft is kept, nothing is filed.
  await page.mouse.click(5, 5);
  await page.getByTestId('unsaved-save').click();
  await expect(page.getByTestId('visit-chapters')).toBeHidden();
  await expect.poll(() => draftRows(page), { timeout: 10_000 }).toHaveLength(1);
  expect(await localVisits(page)).toHaveLength(0);

  expectNoConsoleErrors(rec);
});
