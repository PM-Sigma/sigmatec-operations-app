// Task 16, spec §7i — 📝 יומן היום end to end: paste a day that names three kibbutzim, press
// נתח, get three editable cards, fix one of them, press שמור הכל, and see three visits saved
// plus the EMS comment for the matched task.
//
// What is real here and what is stubbed, and why:
//   · REAL — the island: the parse request it builds, the cards it renders, the picker it opens
//     for a kibbutz it could not resolve, the ✕ on a task chip, the save loop and its order.
//   · MOCKED — `parse-daylog` (an AI call; the harness is offline by design) and the two bridge
//     writes `saveVisitFromData` / `emsAddComment`. Those two are LEGACY functions, and what
//     they do — the delivery-cert gate, the stock movement, the queue-when-offline comment —
//     is pinned by test-daylog.mjs against the real source. Here we assert the island calls
//     them, once per card, with the right payload: the seam between the two halves.
import { boot, expect, expectNoConsoleErrors, expectRtl, shot, test, SB_ORIGIN } from './_helpers';

const DAY_TEXT =
  'היום הייתי בדפנה והחלפתי מונה ראשי בלול, נשאר לחבר בקר. ' +
  'אחר כך חוקוק — בדקתי תקשורת בבקר, הכל תקין. ' +
  'ואז מקום שלישי שלא זוהה. צריך להזמין עוד כבלים.';

/** The answer the AI would have given — a resolvable kibbutz, one to pick, one task match. */
const PARSED = {
  visits: [
    {
      kibbutz: 'דפנה',
      summary: 'החלפתי מונה ראשי בלול',
      open_items: 'נשאר לחבר בקר',
      items: [{ product: 'Partner Sim', qty: 2 }],
      task_matches: [{ task_id: 'T1', text: 'החלפתי מונה ראשי בלול' }],
    },
    { kibbutz: 'חוקוק', summary: 'בדקתי תקשורת בבקר, הכל תקין', open_items: '', items: [] },
    { kibbutz: 'מקום שלא קיים', summary: 'ביקור שלישי', open_items: '', items: [] },
  ],
  unmatched: ['צריך להזמין עוד כבלים'],
  provider: 'gemini:qa',
};

/** Grounding lists + the two bridge writes, recorded into `window.__daylog`. */
async function stubBridge(page: any) {
  await page.evaluate(() => {
    const s = (window as any).sigma;
    (window as any).__daylog = { visits: [] as any[], comments: [] as any[] };
    s.emsToken = () => 'qa-fake-ems-token';
    s.kibbutzNames = () => ['דפנה', 'חוקוק', 'כפר עזה', 'שדה אליהו'];
    s.productNames = () => ['Partner Sim', 'Satec EM133', 'בקר 485'];
    s.emsCacheData = () => ({ tasks: [{ id: 'T1', title: 'החלפת מונה ראשי', status: 'open', site: { name: 'דפנה' } }] });
    s.saveVisitFromData = (v: any) => {
      (window as any).__daylog.visits.push(v);
      return Promise.resolve({ ok: true, id: 'v_' + (window as any).__daylog.visits.length });
    };
    s.emsAddComment = (taskId: string, text: string) => {
      (window as any).__daylog.comments.push({ taskId, text });
      return Promise.resolve({ ok: true });
    };
  });
}

async function mockParse(page: any) {
  await page.route(SB_ORIGIN + '/functions/v1/parse-daylog', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARSED) }));
}

const openSheet = async (page: any) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-daylog')));
  await expect(page.getByTestId('daylog-sheet')).toBeVisible();
};

test('day log: three kibbutzim → three cards → fix one → שמור הכל saves three visits + one EMS comment', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockParse(page);
  await stubBridge(page);
  await openSheet(page);
  await expectRtl(page);

  // The grounding lists actually travel with the request — an AI given the wrong catalog
  // invents the difference, so this is asserted, not assumed.
  const [req] = await Promise.all([
    page.waitForRequest(SB_ORIGIN + '/functions/v1/parse-daylog'),
    (async () => {
      await page.getByTestId('daylog-text').fill(DAY_TEXT);
      await page.getByTestId('daylog-analyse').click();
    })(),
  ]);
  const sent = req.postDataJSON() as any;
  expect(sent.text).toContain('דפנה');
  expect(sent.kibbutzim).toContain('חוקוק');
  expect(sent.products).toContain('Partner Sim');
  expect(sent.tasks?.[0]?.id).toBe('T1');

  const cards = page.getByTestId('daylog-card');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('daylog-unmatched')).toContainText('כבלים');
  await shot(page, ti, 'cards');

  // Card 3 did not resolve — it opens a picker rather than a guessed name.
  const picker = page.getByTestId('daylog-kibbutz-pick');
  await expect(picker).toHaveCount(1);
  await picker.selectOption('כפר עזה');

  // And the person edits what the AI wrote for card 2.
  await cards.nth(1).getByTestId('daylog-summary').fill('בדקתי תקשורת — תקין');

  await page.getByTestId('daylog-save-all').click();

  await expect.poll(async () => await page.evaluate(() => (window as any).__daylog.visits.length)).toBe(3);
  const saved = await page.evaluate(() => (window as any).__daylog);
  expect(saved.visits.map((v: any) => v.kibbutz)).toEqual(['דפנה', 'חוקוק', 'כפר עזה']);
  expect(saved.visits.map((v: any) => v.visitor)).toEqual(['אביאם', 'אביאם', 'אביאם']);
  expect(saved.visits.map((v: any) => v.date)).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
  expect(saved.visits[0].products).toEqual([{ name: 'Partner Sim', qty: 2 }]);
  expect(saved.visits[1].summary).toBe('בדקתי תקשורת — תקין');

  // One comment, on the one matched task, in עידן's wording.
  expect(saved.comments).toHaveLength(1);
  expect(saved.comments[0].taskId).toBe('T1');
  expect(saved.comments[0].text).toBe('עדכון מאביאם על המשימה: החלפתי מונה ראשי בלול');

  expectNoConsoleErrors(rec);
});

test('day log: removing a task chip means no comment is posted for it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'ניתאי' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockParse(page);
  await stubBridge(page);
  await openSheet(page);

  await page.getByTestId('daylog-text').fill(DAY_TEXT);
  await page.getByTestId('daylog-analyse').click();
  await expect(page.getByTestId('daylog-card')).toHaveCount(3);

  const chip = page.getByTestId('daylog-task-chip');
  await expect(chip).toHaveCount(1);
  await chip.getByRole('button').click();
  await expect(chip).toHaveCount(0);
  await shot(page, ti, 'chip-removed');

  // Drop the card that needs a pick, so the save loop finishes on the two ready ones.
  await page.getByTestId('daylog-card').nth(2).getByTestId('daylog-drop').click();
  await page.getByTestId('daylog-save-all').click();

  await expect.poll(async () => await page.evaluate(() => (window as any).__daylog.visits.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).__daylog.comments.length)).toBe(0);

  expectNoConsoleErrors(rec);
});

test('day log: a card whose kibbutz is still unknown is refused, and says so on the card', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockParse(page);
  await stubBridge(page);
  await openSheet(page);

  await page.getByTestId('daylog-text').fill(DAY_TEXT);
  await page.getByTestId('daylog-analyse').click();
  await expect(page.getByTestId('daylog-card')).toHaveCount(3);

  await page.getByTestId('daylog-save-all').click();

  await expect(page.getByTestId('daylog-card-error')).toContainText('בחר קיבוץ');
  expect(await page.evaluate(() => (window as any).__daylog.visits.length)).toBe(2);
  await shot(page, ti, 'needs-kibbutz');

  expectNoConsoleErrors(rec);
});
