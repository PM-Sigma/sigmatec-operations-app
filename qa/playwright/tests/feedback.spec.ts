// 📣 רעיון / באג — the feedback box (spec §7 + §6.5 voice). Two kinds only (עידן's ruling,
// 18.9 — no 'complaint').
// Covers: the sheet opens from the command bar and from ⋯ עוד, the two kinds and the
// anonymous switch, and — the point of this spec — the MIC-REFUSED path: this harness grants
// no permissions, so pressing 🎙 must land on "אין הרשאה למיקרופון — אפשר להקליד" and leave
// the person typing, never on a dead button or a hot recorder.
import { boot, expect, expectNoConsoleErrors, shot, test } from './_helpers';

const openSheet = async (page: any) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();
};

test('feedback: the sheet, its two kinds and the anonymous switch', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openSheet(page);
  await expect(page.getByText('מגיע לעידן ולעמיחי')).toBeVisible();

  for (const label of ['💡 רעיון', '🐞 באג / שיפור']) {
    await expect(page.getByRole('radio', { name: label })).toBeVisible();
  }
  await page.getByRole('radio', { name: '🐞 באג / שיפור' }).click();
  await expect(page.getByRole('radio', { name: '🐞 באג / שיפור' })).toHaveAttribute('data-state', 'on');

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await expect(box).toBeVisible();
  await box.fill('הכרטיסים נטענים לאט ברשת חלשה');

  const anon = page.getByRole('switch', { name: 'שלח אנונימי' });
  await expect(anon).toBeVisible();
  await anon.click();
  await expect(anon).toBeChecked();

  await shot(page, ti);

  // The write is refused in mock mode (no EMS pass → RLS), and it says so instead of
  // pretending it was sent.
  await page.getByRole('button', { name: 'שלח', exact: true }).click();
  await expect(page.getByText(/יש להתחבר ל-EMS כדי לשמור|נכשלה/)).toBeVisible();

  expectNoConsoleErrors(rec);
});

test('feedback: a microphone that cannot record ends in the failed state, still typable', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });

  await openSheet(page);
  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');

  // No permissions are granted anywhere in this suite (playwright.config.ts `permissions: []`)
  // and the headless browser has no audio device, so the voice leg cannot start.
  await page.getByRole('button', { name: 'הקלט' }).click();

  // The inline state says so, with a retry — never a dead button and never a hot recorder.
  await expect(page.getByText('ההקלטה נכשלה', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'נסה שוב' })).toBeVisible();
  await expect(page.getByText('ההקלטה נכשלה — אפשר להקליד')).toBeVisible();   // the toast
  // …and the box is still the way in: typing works and the send button is live
  await expect(box).toBeEditable();
  await box.fill('אין לי מיקרופון, כותב ידנית');
  await expect(page.getByRole('button', { name: 'שלח', exact: true })).toBeEnabled();
  await shot(page, ti, 'mic-failed');

  expectNoConsoleErrors(rec);
});

test('feedback: a REFUSED microphone gets the permission wording', async ({ page }, ti) => {
  // The headless browser has no audio device at all, so getUserMedia rejects with
  // NotSupportedError → the generic 'failed' notice (the test above). A real phone whose
  // owner tapped "block" rejects with NotAllowedError, which speech.ts maps to 'denied' and a
  // different sentence. Web Speech is removed first so the flow takes the RECORDING leg,
  // which is the one that asks for the microphone.
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await page.addInitScript(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })),
      },
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');

  await openSheet(page);
  await page.getByRole('button', { name: 'הקלט' }).click();

  await expect(page.getByText('אין הרשאה למיקרופון — אפשר להקליד')).toBeVisible();
  await expect(page.getByPlaceholder('מה קרה / מה היה עוזר לך?')).toBeEditable();
  await shot(page, ti, 'mic-denied');

  expectNoConsoleErrors(rec);
});

test('feedback: the viewer may send too', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'צפייה' });

  await openSheet(page);
  // §7: all three roles may submit — and the copy says so to a viewer
  await expect(page.getByText('גם בצפייה אפשר לשלוח')).toBeVisible();
  await expect(page.getByPlaceholder('מה קרה / מה היה עוזר לך?')).toBeEditable();

  expectNoConsoleErrors(rec);
});
