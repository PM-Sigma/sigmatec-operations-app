// The voice LADDER's own choice, end to end (round: עידן's real Android S24 test — saying one
// sentence produced a pile of growing prefixes, traced to Web Speech being picked over the
// recorder on a device that has both). speechLadder (app/src/lib/feedback.ts) now defaults to
// RECORD whenever MediaRecorder exists, live only when it is missing or ?speech=live forces it.
// This spec is the one place that proves that choice from the OUTSIDE — the visible UI, not the
// pure function — on a browser harness that has BOTH MediaRecorder and SpeechRecognition
// available at once (feedback.spec.ts / feedback-refine.spec.ts only ever exercise one leg,
// by deleting the other).
//
// Both legs are faked (no real mic/audio device in headless Chromium): the fake MediaRecorder
// is the same shape feedback-refine.spec.ts uses; the fake SpeechRecognition answers a single
// final result shortly after `start()`, matching the shape speech.ts's `startLive` expects
// (`resultIndex` + `results` — see parseRecognitionEvent).
import { boot, expect, expectNoConsoleErrors, shot, test, SB_ORIGIN } from './_helpers';

const FAST_TEXT = 'טקסט מהיר מהמיקרופון';
const LIVE_TEXT = 'טקסט שזוהה בקול חי';

/** Installs BOTH legs — unlike feedback.spec.ts / feedback-refine.spec.ts, neither is deleted,
 * so whichever one actually starts is entirely the ladder's decision, not the harness's. */
async function stubBothLegs(page: any) {
  await page.addInitScript(() => {
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
        (window as any).__recordStarted = true;
        setTimeout(() => this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) }), 30);
      }
      stop() {
        this.state = 'inactive';
        setTimeout(() => this.onstop?.(), 30);
      }
    }
    (FakeRecorder as any).isTypeSupported = () => true;
    (window as any).MediaRecorder = FakeRecorder;

    class FakeSpeechRecognition {
      lang = ''; continuous = false; interimResults = false;
      onresult: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as any).__liveStarted = true;
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: (window as any).__liveText || 'טקסט שזוהה בקול חי' } }],
          });
        }, 30);
      }
      stop() {
        (window as any).__liveStopped = true;
        setTimeout(() => this.onend?.(), 10);
      }
    }
    (window as any).SpeechRecognition = FakeSpeechRecognition;
    (window as any).webkitSpeechRecognition = FakeSpeechRecognition;
  });
}

/** Storage upload + transcribe function, for the RECORD leg only — the live leg never touches
 * either (its text lands straight from the browser event, spec §7 Part F). */
async function mockUploadAndTranscribe(page: any) {
  await page.route(SB_ORIGIN + '/storage/v1/object/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'feedback-audio/x.webm' }) }));
  await page.route(SB_ORIGIN + '/functions/v1/transcribe', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ text: FAST_TEXT, engine: 'self', ms: 300, refined: true }),
    }));
}

const openSheet = async (page: any) => {
  await page.evaluate(() => { (window as any).sigma.emsToken = () => 'qa-fake-ems-token'; });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sigma-open-feedback')));
  await expect(page.getByRole('heading', { name: '📣 תיבת רעיונות ובאגים' })).toBeVisible();
};

test('voice ladder: RECORD is the default even though Web Speech also exists — a recording timer, never live text', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם' });
  await stubBothLegs(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  await mockUploadAndTranscribe(page);

  await openSheet(page);
  await page.getByRole('button', { name: 'הקלט' }).click();

  // The recorder leg's own tell: the mm:ss timer, only ever rendered for phase 'recording'
  // (Feedback.tsx) — 'listening' (the live phase) never shows it.
  await expect(page.getByText('מקליט…', { exact: true })).toBeVisible();
  await expect(page.locator('bdi', { hasText: /^\d:\d\d$/ })).toBeVisible();
  // …and never the live phase's own label.
  await expect(page.getByText('מקליט ומתמלל…', { exact: true })).toHaveCount(0);

  await expect.poll(() => page.evaluate(() => (window as any).__recordStarted)).toBe(true);
  expect(await page.evaluate(() => (window as any).__liveStarted)).toBeUndefined();

  // 600ms-minimum-length guard (feedback.ts) before stopping — same margin feedback-refine.spec.ts uses.
  await page.waitForTimeout(750);
  await page.getByRole('button', { name: 'עצור הקלטה' }).click();

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await expect(box).toHaveValue(FAST_TEXT, { timeout: 10_000 });
  await shot(page, ti, 'record-default');

  expectNoConsoleErrors(rec);
});

test('voice ladder: ?speech=live switches to the live path — live text, never a recording timer', async ({ page }, ti) => {
  const { rec } = await boot(page, ti, { who: 'אביאם', query: 'speech=live' });
  await stubBothLegs(page);
  await page.evaluate(() => { (window as any).__liveText = 'טקסט שזוהה בקול חי'; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sigma-home .kibbutz');
  // No storage/transcribe route installed on purpose — the live leg must never call either.
  let uploadCalled = false;
  await page.route(SB_ORIGIN + '/storage/v1/object/**', route => { uploadCalled = true; return route.abort(); });

  await openSheet(page);
  await page.getByRole('button', { name: 'הקלט' }).click();

  await expect(page.getByText('מקליט ומתמלל…', { exact: true })).toBeVisible();
  // The recording timer is 'recording'-phase-only — the live phase never shows it.
  await expect(page.locator('bdi', { hasText: /^\d:\d\d$/ })).toHaveCount(0);

  await expect.poll(() => page.evaluate(() => (window as any).__liveStarted)).toBe(true);
  expect(await page.evaluate(() => (window as any).__recordStarted)).toBeUndefined();

  const box = page.getByPlaceholder('מה קרה / מה היה עוזר לך?');
  await expect(box).toHaveValue(LIVE_TEXT, { timeout: 10_000 });

  await page.getByRole('button', { name: 'עצור הקלטה' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__liveStopped)).toBe(true);
  await shot(page, ti, 'speech-live-override');

  expect(uploadCalled).toBe(false);
  expectNoConsoleErrors(rec);
});
