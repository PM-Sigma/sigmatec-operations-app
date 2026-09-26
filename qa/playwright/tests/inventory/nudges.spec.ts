// L1d (part 2): the two floating order nudges characterized on the OLD screen — F20.
// bootInv suppresses both by default (they are not what any other L1 spec is about); this file
// is the one place that turns them back on (`nudges: true`).
//
// U7 replaced the legacy #amichaiApprovalModal/#orderNotifModal DOM with the React
// InventoryNudges island (app/src/islands/InventoryNudges.tsx) — testids `nudge-amichai`/
// `nudge-approved` instead of those ids; same rules (amichaiPending/freshApprovedOrders).
import { test, expect } from '../_helpers';
import { bootInv, driverFor } from './_inv-driver';

const d = driverFor();

test('F20 עמיחי sees the >10-item approval reminder, listing 11 פריטים', async ({ page }, ti) => {
  await bootInv(page, ti, 'עמיחי', d, { nudges: true });
  const sheet = page.getByTestId('nudge-amichai');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('11 פריטים');
});

test('F20b אביאם, with everything but ord-3 already seen, gets "הזמנה חדשה אושרה"', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d, {
    nudges: true,
    storage: { orders_notif_seen_אביאם: JSON.stringify(['ord-1', 'ord-2', 'ord-old']) },
  });
  const sheet = page.getByTestId('nudge-approved');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('הזמנה חדשה אושרה');
});

test('F20c with no seed at all, the first run shows nothing and seeds the set', async ({ page }, ti) => {
  await bootInv(page, ti, 'אביאם', d, { nudges: true });
  expect(await page.getByTestId('nudge-approved').count()).toBe(0);
  const seeded = await page.evaluate(() => localStorage.getItem('orders_notif_seen_אביאם'));
  expect(seeded).not.toBeNull();
  expect(JSON.parse(seeded!).length).toBeGreaterThan(0);
});
