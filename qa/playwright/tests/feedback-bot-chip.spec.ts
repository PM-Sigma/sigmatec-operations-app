// 🤖 bug bot (spec 2026-10-08): the inbox shows the bot's status chip on the row, and the note +
// branch link in the detail. Evidence at 360 light + dark.
import { boot, expect, shot, test } from './_helpers';

const ID = '3f2b6c1e-9d4a-4e8b-8a57-0c1d2e3f4a5b';
const ROWS = [
  {
    id: ID, author: 'ניתאי', kind: 'bug', text: 'האפליקציה קורסת כשפותחים סיכום ביקור אחרי הוספת מוצר', audio_path: null,
    status: 'new', github_issue: null, created_at: '2026-10-08T08:00:00Z',
    bot_state: 'needs_approval', bot_note: 'סיבה: רשימה ריקה לא מטופלת. תיקון: בדיקת ערך ריק. למה לא עלה לבד: gate: test-all.',
    bot_branch: 'bugbot-3f2b6c1e', bot_at: '2026-10-08T08:20:00Z',
  },
  {
    id: 'f2', author: 'אביאם', kind: 'bug', text: 'כפתור לא מגיב', audio_path: null, status: 'new', github_issue: null,
    created_at: '2026-10-08T07:00:00Z', bot_state: 'merged', bot_note: 'סיבה: x. תיקון: y.', bot_branch: null, bot_at: '2026-10-08T07:30:00Z',
  },
];

test('feedback inbox: bot chip on the row, note + branch link in the detail, deep link by id', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן' });
  await page.route(/\/rest\/v1\/feedback(\?|$)/, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(ROWS),
  }));
  await page.locator('#sigma-nav').getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('button', { name: /תיבה נכנסת/ }).click();
  const inbox = page.getByTestId('feedback-inbox');
  await expect(inbox.getByText('🟡 דורש אישור')).toBeVisible();
  await expect(inbox.getByText('✅ תוקן ועלה')).toBeVisible();
  await shot(page, ti, 'list');

  await inbox.getByText('ניתאי').first().click();
  const box = page.getByTestId('feedback-inbox-bot');
  await expect(box).toContainText('בדיקת ערך ריק');
  await expect(box.locator('a')).toHaveAttribute('href', /\/tree\/bugbot-3f2b6c1e$/);
  await shot(page, ti, 'detail');
});
