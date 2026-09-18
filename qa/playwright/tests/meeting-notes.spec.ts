// MeetingNotes on the card (spec §7c + §7k #7).
// Covers: the latest bullets render with the meeting date chip, the "עוד N" disclosure opens
// the full latest meeting, and "היסטוריה (N)" collapses the older meetings behind one tap.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

test('meeting notes: latest bullets, עוד disclosure, היסטוריה collapse', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // חוקוק has four meetings in the fixtures: three bullets on the newest, one each before.
  const notes = page.locator('#sigma-home .kibbutz[data-name="חוקוק"] .card-notes');
  await expect(notes).toBeVisible();

  // ── collapsed card view: CARD_BULLETS (2) bullets + the 🗓 date chip of the newest meeting
  await expect(notes.getByText('להשלים החלפת מונה ראשי במחלבה')).toBeVisible();
  await expect(notes.getByText('לתאם מול הגזבר את החתימה על ההסכם')).toBeVisible();
  await expect(notes.getByText('לבדוק זרימת נתונים מהבקר החדש')).toHaveCount(0);
  await expect(notes.locator('.card-notes-more')).toContainText('עוד');

  await shot(page, ti);

  // ── "עוד 1" expands to the whole latest meeting (and the disclosure is gone)
  await notes.locator('.card-notes-more').click();
  await expect(notes.getByText('לבדוק זרימת נתונים מהבקר החדש')).toBeVisible();
  await expect(notes.locator('.card-notes-more')).toHaveCount(0);

  // ── the older meetings are behind "היסטוריה (3)", closed by default
  const history = notes.locator('.card-notes-history');
  const historyToggle = history.getByRole('button', { name: /היסטוריה/ });
  await expect(history).toBeVisible();
  await expect(historyToggle).toContainText('היסטוריה (3)');
  await expect(notes.getByText('הוזמנו 12 מונים מהמחסן')).toHaveCount(0);

  await historyToggle.click();
  await expect(notes.getByText('הוזמנו 12 מונים מהמחסן')).toBeVisible();
  await expect(notes.getByText('פגישת היכרות עם מנהל המשק')).toBeVisible();
  await shot(page, ti, 'history-open');

  // closing it puts them away again — the card returns to its two lines
  await historyToggle.click();
  await expect(notes.getByText('הוזמנו 12 מונים מהמחסן')).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('meeting notes: a card with one meeting has no היסטוריה, an empty one says so', async ({ page }, ti) => {
  const { rec } = await boot(page, ti);

  // גבת has exactly one meeting with one bullet → no "עוד", no "היסטוריה"
  const gvat = page.locator('#sigma-home .kibbutz[data-name="גבת"] .card-notes');
  await expect(gvat.getByText('להוציא הצעת מחיר')).toBeVisible();
  await expect(gvat.locator('.card-notes-more')).toHaveCount(0);
  await expect(gvat.locator('.card-notes-history')).toHaveCount(0);

  // דגניה has none → the empty line, so the card never reflows when notes land
  const dganya = page.locator('#sigma-home .kibbutz[data-name="דגניה"] .card-notes');
  await expect(dganya.locator('.card-notes-empty')).toHaveText('אין סיכום ישיבה עדיין');

  expectNoConsoleErrors(rec);
});
