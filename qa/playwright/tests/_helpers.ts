// Shared harness for every spec (QA gate 3).
//
// `boot()` is the only way a spec opens the app. It does four things, in this order:
//   1. installs the request interceptors (Supabase → local fixtures, everything external
//      blocked) so the run is hermetic and offline and can never write to production;
//   2. seeds localStorage the way js/src/11-search-login.js + 15-login-gate.js would after a
//      PIN login (user · role · auth) plus the `theme` key index.html reads before first
//      paint — so a spec never has to click through the login modal;
//   3. navigates to `index.html?login=0&sb=0` (mock data, no EMS gate) and waits for the
//      island that owns the screen;
//   4. starts collecting console errors, which `expectNoConsoleErrors()` asserts at the end
//      of every test.
//
// `shot()` writes to qa/playwright/shots/<spec>/<viewport>-<theme>.png — the layout the plan
// specifies — using the project metadata rather than the project name, so renaming a project
// cannot silently change the folder layout.
import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { FIXTURES } from './_fixtures';

export const SB_ORIGIN = 'https://wwqfcajnxinaxmobrgol.supabase.co';

export type Who = 'עידן' | 'עמיחי' | 'אביאם' | 'ניתאי' | 'מתניה' | 'צפייה';

/** The three roles js/src/11-search-login.js stores: 'idan' | 'team' | 'viewer'. */
function roleFor(who: Who): 'idan' | 'team' | 'viewer' {
  if (who === 'צפייה') return 'viewer';
  return who === 'עידן' ? 'idan' : 'team';
}

// ───────────────────────────── network ─────────────────────────────

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * PostgREST answers a `.single()` / `.maybeSingle()` request with ONE object (not an array)
 * when the client asks for `application/vnd.pgrst.object+json`. Getting this wrong makes
 * supabase-js throw "Cannot coerce the result to a single JSON object", which a spec would
 * see as a mystery console error rather than as a fixture bug.
 */
function shape(rows: Array<Record<string, unknown>>, accept: string | undefined) {
  if (accept && accept.includes('pgrst.object')) return rows[0] ?? null;
  return rows;
}

function tableOf(url: string): string {
  const m = /\/rest\/v1\/([^?/]+)/.exec(url);
  return m ? m[1] : '';
}

/**
 * Everything the page may talk to. Reads are served from _fixtures.ts; every WRITE is 401,
 * which is the real state of a mock-mode session (no EMS pass → RLS would refuse it) and is
 * what makes the islands show their login hint instead of pretending a save happened.
 */
export async function installRoutes(page: Page, opts: { checkins?: boolean } = {}): Promise<void> {
  /**
   * 🗺️ day_plans — the ONE table in this harness that is a real store rather than a fixture.
   * The calendar's route (spec §7f) is only meaningful if a reorder STICKS: the spec drags a
   * stop, reloads the panel and asserts the new order came back. Keyed (person, date), the
   * way the table's primary key is.
   */
  const dayPlans = new Map<string, Record<string, unknown>>();
  /**
   * ▶ מצב ישיבה (Task 24) — three more real stores, for the same reason day_plans is one:
   * the presenter screen is only meaningful if what it writes COMES BACK. The spec opens the
   * screen, walks it, types a line and adds a bullet, then asserts the rows exist and that the
   * card behind the overlay has the new bullet on it.
   */
  const meetingSessions: Array<Record<string, unknown>> = [];
  const meetingEvents: Array<Record<string, unknown>> = [];
  const liveNotes: Array<Record<string, unknown>> = [];
  // Google Fonts: blocked so the suite runs with no network at all. The app declares a full
  // font stack, so the fallback face renders and layout assertions still hold.
  await page.route('**://fonts.googleapis.com/**', r => r.abort());
  await page.route('**://fonts.gstatic.com/**', r => r.abort());
  // The legacy Apps Script endpoint. `?sb=0` routes the legacy bundle to its in-page mock, so
  // nothing should reach this; the route is here so a regression fails loudly as an aborted
  // request instead of quietly hitting the real Sheet.
  await page.route('**://script.google.com/**', r => r.abort());
  await page.route('**://script.googleusercontent.com/**', r => r.abort());

  await page.route(SB_ORIGIN + '/**', async route => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const accept = req.headers()['accept'];

    // Edge functions (ems-auth, push-send, …) — never called in mock mode; refuse clearly.
    if (url.includes('/functions/v1/')) return route.fulfill(json({ error: 'offline (qa)' }, 401));

    if (method === 'OPTIONS') return route.fulfill({ status: 204, body: '' });

    // `usage_report` is an RPC (POST), and it is the ONLY way into usage_events — the table has
    // no client select policy. Served from the fixtures so 📈 שימוש renders a real report.
    if (url.includes('/rest/v1/rpc/usage_report')) return route.fulfill(json(FIXTURES.usage));

    /**
     * `import_meeting_notes(jsonb)` — the one transactional merge behind both 📥 ייבוא and
     * 📝 ישיבה → סיכום (Task 25). It is applied to the live-note store for real (replace that
     * (date, kind), then insert), so a spec can press בצע and then assert that the bullets
     * came back and that the card behind the sheet has them.
     */
    if (url.includes('/rest/v1/rpc/import_meeting_notes')) {
      let body: any = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
      const p = body?.p || {};
      for (let i = liveNotes.length - 1; i >= 0; i--) {
        if (liveNotes[i].meeting_date === p.meeting_date && liveNotes[i].meeting_kind === p.meeting_kind) {
          liveNotes.splice(i, 1);
        }
      }
      const rows = (p.rows || []).map((r: any, i: number) => ({
        id: 'kmn-rev-' + (liveNotes.length + i + 1),
        kibbutz: r.kibbutz, meeting_date: p.meeting_date, meeting_kind: p.meeting_kind,
        seq: r.seq, text: r.text, owners: r.owners || [], ems_task_id: null, done_at: null,
      }));
      liveNotes.push(...rows);
      return route.fulfill(json({ inserted: rows.length, updated: 0, deleted: 0, flagged: 0 }));
    }

    if (method !== 'GET') {
      // usage_events is fire-and-forget telemetry (lib/track.ts); 401-ing it would print a
      // console error on every page that tracks a mount. Accept and drop it.
      if (tableOf(url) === 'usage_events') return route.fulfill(json([], 201));
      // day_plans accepts the upsert and REMEMBERS it (see the store above).
      if (tableOf(url) === 'day_plans') {
        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows) dayPlans.set(String(r.person) + '|' + String(r.date), r);
        return route.fulfill(json(shape(rows, accept), 201));
      }
      // The meeting tables accept their writes and remember them (see the stores above).
      if (tableOf(url) === 'meeting_sessions') {
        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
        const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: 'ms-' + (meetingSessions.length + i + 1), ...r }));
        if (method === 'PATCH') {
          // …the only PATCH the screen makes is `ended_at` on the way out.
          const last = meetingSessions[meetingSessions.length - 1];
          if (last) Object.assign(last, rows[0]);
          return route.fulfill(json(shape([last || rows[0]], accept)));
        }
        meetingSessions.push(...rows);
        return route.fulfill(json(shape(rows, accept), 201));
      }
      if (tableOf(url) === 'meeting_events') {
        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
        const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: 'me-' + (meetingEvents.length + i + 1), ...r }));
        meetingEvents.push(...rows);
        return route.fulfill(json(shape(rows, accept), 201));
      }
      // …and the ems_task_id link the review PATCHes onto a bullet it just wrote.
      if (tableOf(url) === 'kibbutz_meeting_notes' && method === 'PATCH') {
        const q = new URL(url).searchParams;
        const id = decodeURIComponent((q.get('id') || '').replace(/^eq\./, ''));
        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
        const hit = liveNotes.find(n => n.id === id);
        if (hit) Object.assign(hit, body);
        return route.fulfill(json(shape(hit ? [hit] : [], accept)));
      }
      if (tableOf(url) === 'kibbutz_meeting_notes' && method === 'POST') {
        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
        const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: 'kmn-live-' + (liveNotes.length + i + 1), ...r }));
        liveNotes.push(...rows);
        return route.fulfill(json(shape(rows, accept), 201));
      }
      return route.fulfill(json({ message: 'new row violates row-level security policy', code: '42501' }, 401));
    }

    switch (tableOf(url)) {
      case 'kibbutzim': return route.fulfill(json(shape(FIXTURES.kibbutzim, accept)));
      // The review reads back the rows of ONE (date, kind) to link its tasks, so the
      // PostgREST filters have to be honoured here — without them it would link a task onto
      // a fixture bullet that happens to share a (kibbutz, seq).
      case 'kibbutz_meeting_notes': {
        const q = new URL(url).searchParams;
        const eq = (k: string) => {
          const v = q.get(k);
          return v ? decodeURIComponent(v.replace(/^eq\./, '')) : '';
        };
        const date = eq('meeting_date');
        const kind = eq('meeting_kind');
        let rows = [...FIXTURES.notes, ...liveNotes];
        if (date) rows = rows.filter(r => String(r.meeting_date) === date);
        if (kind) rows = rows.filter(r => String(r.meeting_kind) === kind);
        return route.fulfill(json(shape(rows, accept)));
      }
      case 'meeting_sessions': return route.fulfill(json(shape(meetingSessions, accept)));
      case 'meeting_events': return route.fulfill(json(shape(meetingEvents, accept)));
      case 'usage_events': return route.fulfill(json(shape(FIXTURES.usage, accept)));
      // No stored per-user settings → the islands use DEFAULT_SETTINGS, which is the state a
      // first-run device is in and the one the specs assert against.
      case 'user_settings': return route.fulfill(json(shape([], accept)));
      // Field arrivals: empty unless the spec asked for one, so the "היום" strip and its
      // nudge only appear on the screen that is about them (qa/playwright/tests/field.spec.ts).
      case 'field_checkins': return route.fulfill(json(shape(opts.checkins ? FIXTURES.checkins() : [], accept)));
      case 'feedback': return route.fulfill(json(shape([], accept)));
      // 🔥 צריבות (Task 23) — the temporary project's two tables. Reads are fixtures;
      // a ✅ נצרב is a PATCH, which the write branch above 401s like every other write.
      case 'meter_burns': return route.fulfill(json(shape(FIXTURES.burns, accept)));
      case 'generators': return route.fulfill(json(shape(FIXTURES.generators, accept)));
      // The saved route comes back for exactly the (person, date) the island asked for —
      // PostgREST filters look like `person=eq.<name>&date=eq.<day>`.
      case 'day_plans': {
        const q = new URL(url).searchParams;
        const person = (q.get('person') || '').replace(/^eq\./, '');
        const date = (q.get('date') || '').replace(/^eq\./, '');
        const hit = dayPlans.get(decodeURIComponent(person) + '|' + decodeURIComponent(date));
        return route.fulfill(json(shape(hit ? [hit] : [], accept)));
      }
      // No absence fixture: 🌴 is entered in the spec, and the write 401s like every other
      // one — what the spec asserts there is the sheet, not a round trip.
      case 'calendar_absences': return route.fulfill(json(shape([], accept)));
      default: return route.fulfill(json(shape([], accept)));
    }
  });
}

// ───────────────────────────── console errors ─────────────────────────────

/**
 * Console noise that is a property of the HARNESS, not of the app: requests this harness
 * deliberately aborts or 401s. Anything else is a real console error and fails the spec.
 */
const IGNORED_CONSOLE = [
  /fonts\.(googleapis|gstatic)\.com/i,
  /script\.google(usercontent)?\.com/i,
  /net::ERR_FAILED/i,
  /ERR_ABORTED/i,
  // The 401 the write routes return on purpose (the islands report it in the UI as the
  // "יש להתחבר ל-EMS כדי לשמור" hint, which is what the specs assert).
  /row-level security/i,
  /Failed to load resource/i,
  // manifest / icons are not served differently under http-server on some Windows setups
  /manifest\.webmanifest/i,
  /favicon/i,
];

export interface Recorder { errors: string[]; failedRequests: string[] }

export function watchConsole(page: Page): Recorder {
  const rec: Recorder = { errors: [], failedRequests: [] };
  // Not asserted on (the harness aborts fonts on purpose) — kept so a boot timeout can say
  // WHICH asset never arrived instead of only "the island did not mount".
  page.on('requestfailed', r => {
    const u = r.url();
    if (IGNORED_CONSOLE.some(re => re.test(u))) return;
    rec.failedRequests.push(r.failure()?.errorText + ' ' + u);
  });
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some(re => re.test(text))) return;
    rec.errors.push('console: ' + text);
  });
  page.on('pageerror', err => {
    const text = String(err?.message || err);
    if (IGNORED_CONSOLE.some(re => re.test(text))) return;
    rec.errors.push('pageerror: ' + text);
  });
  return rec;
}

// ───────────────────────────── boot ─────────────────────────────

export interface BootOptions {
  /** Who is logged in. Default: עידן (the role that sees the most surfaces). */
  who?: Who;
  /** Extra query string, appended after `login=0&sb=0`. */
  query?: string;
  /** Extra localStorage entries, written before any page script runs. */
  storage?: Record<string, string>;
  /** Wait for this selector after load instead of the card home. */
  ready?: string;
  /** Serve today's field check-in fixture (spec §5.1) instead of an empty list. */
  checkins?: boolean;
  /**
   * Let the arrival sheet open by itself. It is latched off for every other spec the way the
   * push and attendance prompts are — a full-screen sheet on an unrelated screen is harness
   * noise, not the app misbehaving.
   */
  fieldPrompt?: boolean;
}

export interface Booted { rec: Recorder; theme: 'light' | 'dark'; viewport: string }

export async function boot(page: Page, testInfo: TestInfo, opts: BootOptions = {}): Promise<Booted> {
  const who = opts.who ?? 'עידן';
  const theme = (testInfo.project.metadata as any).theme as 'light' | 'dark';
  const viewport = (testInfo.project.metadata as any).viewport as string;

  const rec = watchConsole(page);
  await installRoutes(page, { checkins: opts.checkins });

  const seed: Record<string, string> = {
    dashboard_user_v1: who,
    dashboard_role_v1: roleFor(who),
    dashboard_auth_v4: 'ok',
    // index.html resolves the theme from this key BEFORE first paint, so a dark project is
    // dark from the very first frame instead of flashing light.
    theme,
    ...(opts.storage || {}),
  };
  if (opts.fieldPrompt) (seed as any).__fieldPrompt = true;
  await page.addInitScript(entries => {
    try {
      // `__`-prefixed entries are harness FLAGS (see `__fieldPrompt`), not storage keys.
      for (const [k, v] of Object.entries(entries as Record<string, string>)) {
        if (!k.startsWith('__')) localStorage.setItem(k, v);
      }
    } catch { /* private mode */ }
    // js/src/22-push.js opens a full-screen "אפשרו התראות" modal 2.5 s after load for every
    // non-viewer whose Notification.permission is not 'granted' — which is every headless
    // browser. It covers the whole page, so nothing is clickable and nothing is `visible`.
    // This is its own once-per-session latch; setting it suppresses the prompt without
    // granting a permission the specs are not about (push has its own legacy runner,
    // test-push.mjs).
    (window as any)._pushPromptShown = true;
    // Same story for js/src/02-init-attendance.js: אביאם / ניתאי get a full-screen
    // "חסר תיעוד!" reminder once per session, which also covers the page. Its own latch.
    (window as any)._attReminderShown = true;
    // Same story again for the arrival sheet (spec §5.1): אביאם / ניתאי are asked where they
    // arrived once per session, which covers the screen. Its own latch, cleared by
    // `boot({ fieldPrompt: true })`.
    if (!(entries as any).__fieldPrompt) (window as any)._fieldPromptShown = true;
  }, seed);

  const q = 'login=0&sb=0' + (opts.query ? '&' + opts.query : '');
  await page.goto('/index.html?' + q, { waitUntil: 'domcontentloaded' });

  // The islands are lazy chunks; waiting on the nav root means "ui/sigma.js booted".
  await expect(page.locator('#sigma-nav')).toBeAttached();
  if (opts.ready !== '') {
    const sel = opts.ready || '#sigma-home .kibbutz';
    try {
      await page.waitForSelector(sel, { timeout: 30_000 });
    } catch (e) {
      throw new Error(
        'boot: "' + sel + '" never appeared.\n'
        + 'failed requests:\n  ' + (rec.failedRequests.join('\n  ') || '(none)') + '\n'
        + 'console errors:\n  ' + (rec.errors.join('\n  ') || '(none)') + '\n'
        + 'original: ' + String((e as Error)?.message).slice(0, 400),
      );
    }
  }

  return { rec, theme, viewport };
}

/** The theme actually landed on the document (not just in storage). */
export async function expectTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** RTL is a release gate (spec §6): the document and every island root declare it. */
export async function expectRtl(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // Island ROOTS only (`islands.tsx mount()` stamps both attributes). `.sigma-root` is also
  // on the Sheet/Dialog portal wrappers and on the toaster, which carry no `dir` of their own
  // and do not need one — they inherit it from `<html dir="rtl">`.
  const roots = page.locator('.sigma-root[data-sigma-mounted="1"]');
  const n = await roots.count();
  expect(n, 'no island roots mounted').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await expect(roots.nth(i)).toHaveAttribute('dir', 'rtl');
  }
}

export function expectNoConsoleErrors(rec: Recorder): void {
  expect(rec.errors, 'console errors:\n' + rec.errors.join('\n')).toEqual([]);
}

/**
 * qa/playwright/shots/<spec>/<viewport>-<theme>.png — one screenshot per spec per project.
 * `suffix` adds a second shot of the same screen (e.g. a sheet open) as
 * `<viewport>-<theme>-<suffix>.png`.
 */
export async function shot(page: Page, testInfo: TestInfo, suffix = ''): Promise<void> {
  const spec = testInfo.file.replace(/\\/g, '/').split('/').pop()!.replace(/\.spec\.ts$/, '');
  const theme = (testInfo.project.metadata as any).theme as string;
  const viewport = (testInfo.project.metadata as any).viewport as string;
  const file = resolve(
    testInfo.config.rootDir, '..', 'shots', spec,
    viewport + '-' + theme + (suffix ? '-' + suffix : '') + '.png',
  );
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
}

export const test = base;
export { expect };
