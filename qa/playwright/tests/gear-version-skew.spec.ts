// 8.10 live crash — "Minified React error #321 (Invalid hook call)" on gear open. Root cause:
// a deploy landed mid-session, so the LAZY chunk fetched at gear-open came from the NEW build and
// imported `sigma.js?v=<new>` — a second copy of the whole bundle (React included) — while the
// tree around it ran on the old copy; its first hook hit a null dispatcher. The legacy guard now
// recognises that signature, reloads ONCE (sessionStorage flag, no loop) instead of showing a
// bug card, and the reloaded page (a coherent deploy) opens the gear normally.
import { boot, expect, test } from './_helpers';

const READY = '#sigma-header-actions [aria-label="העדפות משתמש"]';

test('gear after a mid-session deploy: one self-reload, then it opens (no crash card, no loop)', async ({ page }, ti) => {
  await boot(page, ti, { who: 'עידן', ready: READY });
  const stamp = (await page.evaluate(() => (document.querySelector('script[src*="ui/sigma.js"]') as HTMLScriptElement).src)).match(/v=([^&]+)/)![1];

  let skewed = true;
  let navigations = 0;
  page.on('load', () => { navigations++; skewed = false;  // the reload lands on a coherent deploy
 });
  // While `skewed`, the "server" is a newer deploy: lazy chunks import sigma.js?v=NEWER.
  await page.route('**/ui/sigma-*.js*', async r => {
    const resp = await r.fetch();
    const body = await resp.text();
    await r.fulfill({ response: resp, body: skewed ? body.split('v=' + stamp).join('v=NEWER') : body });
  });
  await page.route('**/ui/sigma.js?v=NEWER', r => r.continue({ url: r.request().url().replace('NEWER', stamp) }));

  const reloaded = page.waitForEvent('load');
  await page.locator('#sigma-header-actions').getByRole('button', { name: 'העדפות משתמש' }).click();
  await reloaded;

  await page.locator('#sigma-header-actions').getByRole('button', { name: 'העדפות משתמש' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('gear-open-gaps')).toBeVisible();
  await expect(page.getByTestId('crash-card')).toHaveCount(0);
  await expect(page.getByTestId('island-crashed')).toHaveCount(0);
  expect(navigations).toBe(1);          // exactly one self-reload
});
