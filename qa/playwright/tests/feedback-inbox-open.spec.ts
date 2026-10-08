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

  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  const entry = page.getByRole('button', { name: /תיבה נכנסת/ });
  await expect(entry).toBeVisible();
  await entry.click();

  const inbox = page.getByTestId('feedback-inbox');
  await expect(inbox).toBeVisible();
  await inbox.getByText('ניתאי').first().click();
  await expect(page.getByTestId('feedback-inbox-detail')).toContainText(LONG);
});
