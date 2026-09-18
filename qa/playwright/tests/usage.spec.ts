// 📈 שימוש — the adoption screen (spec §7j). עידן ONLY.
// Covers: the #usage deep link (what the weekly push opens) renders the report for עידן, and
// does nothing at all for a team member or a viewer — the client gate is the first door, and
// the RPC checks the actor server-side anyway.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

test('usage: עידן gets the report on the #usage deep link', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { query: 'x=1#usage' });

  const dlg = page.getByRole('dialog').filter({ hasText: '📈 שימוש' });
  await expect(dlg.getByRole('heading', { name: /📈 שימוש · 30 ימים אחרונים/ })).toBeVisible();
  // the report itself, not the empty state (the fixtures carry 18 events over 6 days)
  await expect(dlg.getByText('עוד לא נאספו נתוני שימוש', { exact: false })).toHaveCount(0);
  await expect(dlg.getByText('אביאם', { exact: false }).first()).toBeVisible();

  await shot(page, ti);
  expectNoConsoleErrors(rec);
});

test('usage: a team member gets nothing from the same deep link', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', query: 'x=1#usage' });

  await expect(page.getByRole('dialog').filter({ hasText: '📈 שימוש' })).toHaveCount(0);
  // …and no ⋯ row offers it either (roles: ['idan'] + the live `visible` predicate)
  await expect(page.getByRole('button', { name: '📈 שימוש', exact: true })).toHaveCount(0);

  expectNoConsoleErrors(rec);
});

test('usage: the viewer gets nothing from the same deep link', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה', query: 'x=1#usage' });

  await expect(page.getByRole('dialog').filter({ hasText: '📈 שימוש' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '📈 שימוש', exact: true })).toHaveCount(0);

  expectNoConsoleErrors(rec);
});
