// עידן (8.10): "I got a bug report and can't see what was written". The inbox must be reachable
// from ⋯ עוד as עידן and show the FULL text of a bug (not the 1-line preview).
import { boot, expect, test } from './_helpers';

const LONG = 'כשאני לוחץ על שמירת ביקור אחרי שהוספתי מוצר שני, המסך קופא והכמות מתאפסת. ' +
  'קורה רק ברשת חלשה, ורק בפעם השנייה ביום. צירפתי צילום מסך בוואטסאפ ובקשתי מעידן להסתכל.';

test('feedback inbox: עידן opens ⋯ → the inbox → reads the full bug text', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.route(/\/rest\/v1\/feedback(\?|$)/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{
      id: 'f1', author: 'ניתאי', kind: 'bug', text: LONG, audio_path: null,
      status: 'new', github_issue: null, created_at: '2026-10-07T08:00:00Z',
    }]),
  }));

  await page.locator('button[aria-label="עוד"]:visible').first().click();
  const entry = page.getByRole('button', { name: /תיבה נכנסת/ });
  await expect(entry).toBeVisible();
  await entry.click();

  const inbox = page.getByTestId('feedback-inbox');
  await expect(inbox).toBeVisible();
  await inbox.getByText('ניתאי').first().click();
  await expect(page.getByTestId('feedback-inbox-detail')).toContainText(LONG);
});

// Wave 0.1 (Fable audit 28.10): אביאם's 18.10 idea never reached עידן. Ideas AND bugs from every
// user must be in the inbox, each with a visible kind chip, and the unread (חדש) count must show.
test('feedback inbox: an idea from אביאם is listed beside bugs, with a kind chip and the unread count', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.route(/\/rest\/v1\/feedback(\?|$)/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([
      { id: 'i1', author: 'אביאם', kind: 'idea', text: 'אפשר להכניס ליומן את המשימות ששובצו לתאריך קדימה?', audio_path: null,
        status: 'new', github_issue: null, created_at: '2026-10-18T13:42:10Z' },
      { id: 'b1', author: 'עידן', kind: 'bug', text: 'הדף לא עבד', audio_path: null,
        status: 'done', github_issue: null, created_at: '2026-10-08T09:28:22Z' },
      { id: 'b2', author: 'ניתאי', kind: 'bug', text: 'הזנת כמות בכתיבה', audio_path: null,
        status: 'done', github_issue: null, created_at: '2026-10-07T19:05:38Z' },
    ]),
  }));

  await page.locator('button[aria-label="עוד"]:visible').first().click();
  await page.getByRole('button', { name: /תיבה נכנסת/ }).click();

  const inbox = page.getByTestId('feedback-inbox');
  await expect(inbox).toBeVisible();
  const idea = inbox.getByRole('button').filter({ hasText: 'אביאם' });
  await expect(idea).toHaveCount(1);
  await expect(idea).toContainText('רעיון');
  await expect(idea).toContainText('יומן');
  await expect(inbox.getByRole('button').filter({ hasText: 'באג או שיפור' })).toHaveCount(2);
  // the unread chip carries its count (חדש · 1)
  await expect(inbox.getByRole('button', { name: 'חדש 1', exact: true })).toBeVisible();
});
