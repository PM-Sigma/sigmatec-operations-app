// Task 6b, spec §7i — the "fast + refine" voice flow: the self-hosted Whisper server answers
// the fast pass immediately (with a job_id), keeps refining in the background, and the client
// polls `job_id` while the field is open. If the refined text lands while the field is still
// UNTOUCHED, it replaces the fast text silently with a small "עודכן" chip + undo; the point of
// this spec is that the swap actually happens end-to-end and the undo actually restores the
// fast text — runs across all 4 projects (desktop/mobile × light/dark) via the harness matrix.
//
// The harness runs fully offline (qa/playwright/tests/_helpers.ts installRoutes 401s every
// Edge Function and write), so this spec mocks the storage upload and the `transcribe`
// function itself, and fakes the recorder + microphone the way the existing mic-denied test
// does (no real audio device in a headless run). It also stubs `sigma.emsToken()` — the real
// EMS gate is a separate concern (session-gate.spec.ts); this spec is about the refine merge.
import { boot, expect, expectNoConsoleErrors, shot, test, SB_ORIGIN } from './_helpers';

const FAST_TEXT = 'טקסט מהיר מהמיקרופון';
const REFINED_TEXT = 'טקסט מדויק יותר אחרי תיקון';

/** Fake MediaRecorder + a mic that "just works" — the sheet only needs SOME audio to upload. */
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

/** Storage upload (fixed path) always succeeds; the transcribe function answers fast, then
 * refined, keyed off whether the body carries a `job_id` (the poll leg) or not (the first call). */
async function mockTranscribeChain(page: any) {
  await page.route(SB_ORIGIN + '/storage/v1/object/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'feedback-audio/x.webm' }) }));

  await page.route(SB_ORIGIN + '/functions/v1/transcribe', route => {
    const body = route.request().postDataJSON() as any;
    if (body?.job_id) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ text: REFINED_TEXT, status: 'done', refined: true }),
      });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        text: FAST_TEXT, engine: 'self', ms: 300, refined: false,
        job_id: 'job-1', refine_eta_seconds: 5,       // → poll deadline 15s, plenty for a 2s-backoff test
      }),
    });
  });
}

const openSheetAndRecord = async (page: any) => {
  await page.evaluate(() => { (window as any).sigma.emsToken = () => 'qa-fake-ems-token'; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();

  await page.getByRole('button', { name: 'הקלט' }).click();
  await expect(page.getByText('מקליט…')).toBeVisible();
  // The 600ms-minimum-length guard (feedback.ts) — recording shorter than this is dropped
  // silently ("ההקלטה קצרה מדי"), so the test must record a bit longer than that.
  await page.waitForTimeout(750);
  await page.getByRole('button', { name: 'עצור הקלטה' }).click();
};

test('feedback voice refine: the fast transcript is replaced with the "עודכן" chip, and undo restores it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubRecorder(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockTranscribeChain(page);

  await openSheetAndRecord(page);

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await expect(box).toHaveValue(FAST_TEXT, { timeout: 10_000 });

  // The refine poll lands (back-off 2s → 5s) and swaps the text in silently, with the chip.
  await expect(page.getByText('עודכן', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(box).toHaveValue(REFINED_TEXT);
  await shot(page, ti, 'refined');

  await page.getByRole('button', { name: '↩ בטל' }).click();
  await expect(box).toHaveValue(FAST_TEXT);
  await expect(page.getByText('עודכן', { exact: true })).toBeHidden();

  expectNoConsoleErrors(rec);
});

test('feedback voice refine: an edit before the refine lands is never overwritten', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubRecorder(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockTranscribeChain(page);

  await openSheetAndRecord(page);

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await expect(box).toHaveValue(FAST_TEXT, { timeout: 10_000 });

  // The user types over the fast transcript before the refine job answers.
  const edited = 'שיניתי את זה בעצמי';
  await box.fill(edited);

  // Give the poll loop the time it would have taken to land, then assert it discarded quietly:
  // no chip, and the hand-edit stands untouched (spec §7i: never mutate behind the user).
  await page.waitForTimeout(4000);
  await expect(page.getByText('עודכן', { exact: true })).toBeHidden();
  await expect(box).toHaveValue(edited);

  expectNoConsoleErrors(rec);
});

// ── עידן's ruling 20.9 — when transcription is simply not available ──────────────────────
//
// The home Whisper server is a SERVICE: the app does not probe it and does not explain it.
// The only contract is `transcribe`'s reply, and a 502 means both legs are gone (the self
// server unreachable AND the Groq fallback failed). What the person must get is one plain
// line, the recording KEPT, a ↻ that re-sends that same recording — and whatever they had
// already typed, untouched.
test('feedback voice: a 502 from transcribe keeps the recording, says so, and ↻ re-sends it', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubRecorder(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');

  await page.route(SB_ORIGIN + '/storage/v1/object/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'feedback-audio/x.webm' }) }));

  // Down for the first attempt, back for the retry — so the ↻ is tested as a real re-send,
  // not as a button that merely re-renders.
  let attempts = 0;
  await page.route(SB_ORIGIN + '/functions/v1/transcribe', route => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 502, contentType: 'application/json',
        body: JSON.stringify({ error: 'self server unreachable; groq fallback failed' }),
      });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: FAST_TEXT, engine: 'groq', ms: 400, refined: true }),
    });
  });

  await page.evaluate(() => { (window as any).sigma.emsToken = () => 'qa-fake-ems-token'; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();

  // Something typed BEFORE the recording — the failure must not touch it.
  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await box.fill('כתבתי את זה ביד');

  await page.getByRole('button', { name: 'הקלט' }).click();
  await expect(page.getByText('מקליט…')).toBeVisible();
  await page.waitForTimeout(750);
  await page.getByRole('button', { name: 'עצור הקלטה' }).click();

  // ── the line, and the recording still held
  const strip = page.getByTestId('transcribe-retry');
  await expect(strip).toBeVisible({ timeout: 10_000 });
  await expect(strip).toContainText('התמלול לא זמין כרגע. נסה שוב מאוחר יותר');
  await expect(strip).toContainText('ההקלטה נשמרה');
  await expect(box, 'the typed text was lost on a transcription failure').toHaveValue('כתבתי את זה ביד');
  await shot(page, ti, 'transcribe-unavailable');

  // ── ↻ re-sends the SAME recording, and the text is appended to what was typed
  await page.getByTestId('transcribe-retry-btn').click();
  await expect(strip).toBeHidden({ timeout: 10_000 });
  await expect(box).toHaveValue('כתבתי את זה ביד ' + FAST_TEXT);
  expect(attempts, 'the ↻ did not actually re-send the recording').toBe(2);

  expectNoConsoleErrors(rec);
});

test('feedback voice: a failing refine poll stops quietly and the fast text stands', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubRecorder(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');

  await page.route(SB_ORIGIN + '/storage/v1/object/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'feedback-audio/x.webm' }) }));
  await page.route(SB_ORIGIN + '/functions/v1/transcribe', route => {
    const body = route.request().postDataJSON() as any;
    // The fast pass lands; every poll after it 502s — the self server went away mid-job.
    if (body?.job_id) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'gone' }) });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: FAST_TEXT, engine: 'self', ms: 300, refined: false, job_id: 'job-1', refine_eta_seconds: 2 }),
    });
  });

  await openSheetAndRecord(page);

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await expect(box).toHaveValue(FAST_TEXT, { timeout: 10_000 });

  // The poll retries in the background and then gives up. Nothing may be said about it: no
  // error toast, no retry strip (there is no recording to re-send — the fast text is here),
  // and the fast transcript must still be in the box.
  await page.waitForTimeout(9_000);
  await expect(page.getByTestId('transcribe-retry')).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await expect(box).toHaveValue(FAST_TEXT);
  await expect(page.getByTestId('feedback-refining')).toBeHidden();

  expectNoConsoleErrors(rec);
});
