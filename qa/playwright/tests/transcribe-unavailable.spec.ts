// עידן 20.9 — the home Whisper server is a SERVICE, and the app never explains it. When
// `transcribe` cannot answer (the self server unreachable AND the Groq fallback silent, i.e. a
// 502 or a timeout), the person gets ONE Hebrew line and a ↻ that re-sends the SAME recording:
//
//   · the line is "התמלול לא זמין כרגע — נסה שוב מאוחר יותר" — no toast, because a toast
//     disappears and with it the only sign that the speech still exists;
//   · whatever was TYPED is never touched — not on failure, not on retry;
//   · the held recording survives until a transcription succeeds or the person discards it.
//
// Both voice islands answer the same way, so both are covered here: the feedback sheet and the
// day log. The transcribe function is mocked per-test (502 first, 200 on the retry) the same
// way feedback-refine.spec.ts mocks the happy chain.
import { boot, expect, expectNoConsoleErrors, shot, test, SB_ORIGIN } from './_helpers';

const TYPED = 'כתבתי את זה ביד לפני שהקלטתי';
const LANDED = 'הטקסט שהגיע בניסיון השני';
const UNAVAILABLE = 'התמלול לא זמין כרגע — נסה שוב מאוחר יותר';

/** Fake MediaRecorder + a mic that "just works" — the islands only need SOME audio to upload. */
async function stubRecorder(page: any) {
  await page.addInitScript(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) },
    });
    class FakeRecorder {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_stream: unknown, _opts?: unknown) {}
      start(_timeslice?: number) {
        this.state = 'recording';
        setTimeout(() => this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) }), 30);
      }
      stop() {
        this.state = 'inactive';
        setTimeout(() => this.onstop?.(), 30);
      }
    }
    (FakeRecorder as any).isTypeSupported = () => true;
    (window as any).MediaRecorder = FakeRecorder;
  });
}

/**
 * The storage upload always succeeds — the recording reaches the bucket; it is the transcription
 * that is unavailable. `transcribe` answers 502 until `window.__whisperUp` is set, then 200, so a
 * single route serves both the failure and the retry-that-lands. Returns nothing: the test flips
 * the flag in the page.
 */
async function mockTranscribeDown(page: any) {
  await page.route(SB_ORIGIN + '/storage/v1/object/**', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'feedback-audio/x.webm' }) }));

  await page.route(SB_ORIGIN + '/functions/v1/transcribe', async (route: any) => {
    const up = await page.evaluate(() => (window as any).__whisperUp === true).catch(() => false);
    if (!up) {
      // Exactly what the edge function returns when the self server is unreachable and the Groq
      // fallback did not answer either.
      return route.fulfill({
        status: 502, contentType: 'application/json',
        body: JSON.stringify({ error: 'transcription unavailable' }),
      });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: LANDED, engine: 'self', ms: 300, refined: true }),
    });
  });
}

const record = async (page: any, micName: string, stopName: string) => {
  await page.getByRole('button', { name: micName }).click();
  // feedback.ts drops anything under 600 ms silently, so record a little longer than that.
  await page.waitForTimeout(750);
  await page.getByRole('button', { name: stopName }).click();
};

test('transcribe unavailable (feedback): one line + ↻, typed text kept, retry lands', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubRecorder(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockTranscribeDown(page);

  await page.evaluate(() => { (window as any).sigma.emsToken = () => 'qa-fake-ems-token'; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await box.fill(TYPED);

  await record(page, 'הקלט', 'עצור הקלטה');

  // The strip, not a toast — and it says the one line.
  const strip = page.getByTestId('transcribe-retry');
  await expect(strip).toBeVisible({ timeout: 10_000 });
  await expect(strip).toContainText(UNAVAILABLE);
  await expect(page.getByTestId('transcribe-retry-btn')).toBeVisible();
  // Nothing was added to the field, and nothing was taken from it.
  await expect(box).toHaveValue(TYPED);
  await shot(page, ti, 'unavailable');

  // The same recording is still held: ↻ re-sends it, and this time the server answers.
  await page.evaluate(() => { (window as any).__whisperUp = true; });
  await page.getByTestId('transcribe-retry-btn').click();

  await expect(box).toHaveValue(TYPED + ' ' + LANDED, { timeout: 10_000 });
  await expect(strip).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('transcribe unavailable (day log): the recording is held until it lands or is discarded', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubRecorder(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockTranscribeDown(page);

  await page.evaluate(() => { (window as any).sigma.emsToken = () => 'qa-fake-ems-token'; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-daylog')));
  await expect(page.getByTestId('daylog-sheet')).toBeVisible();

  const box = page.getByTestId('daylog-text');
  await box.fill(TYPED);

  await record(page, 'דבר', 'עצור הקלטה');

  const strip = page.getByTestId('transcribe-retry');
  await expect(strip).toBeVisible({ timeout: 10_000 });
  await expect(strip).toContainText(UNAVAILABLE);
  await expect(box).toHaveValue(TYPED);

  // A retry while the server is still down leaves everything exactly as it was — the strip
  // stays, the recording stays, the typed text stays.
  await page.getByTestId('transcribe-retry-btn').click();
  await expect(strip).toBeVisible();
  await expect(box).toHaveValue(TYPED);

  // Only an explicit discard drops the recording.
  await page.getByTestId('transcribe-discard').click();
  await expect(strip).toBeHidden();
  await expect(box).toHaveValue(TYPED);

  expectNoConsoleErrors(rec);
});
