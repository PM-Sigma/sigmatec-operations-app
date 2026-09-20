// boot-console.spec.ts — the gate that did not exist when 2.01 shipped (task-33 FAIL-2).
//
// Every other spec boots with `?sb=0`: the legacy bundle serves itself from its in-page mock
// and never walks the Supabase router at all. That is precisely the path the live crash was
// on. `refreshData()` runs at EVAL TIME in js/src/11-search-login.js, one file before the
// `const EMS_TOKEN_AT_KEY` it reached through the hoisted global `getEmsToken`, so the real
// bundle threw `Cannot access 'EMS_TOKEN_AT_KEY' before initialization` on every cold load —
// and the `catch` in js/src/01-data.js swallowed it and fell back to Apps Script. No test
// failed. Nothing was red. The live header just quietly read `📅 עודכן: 22.6.2026` and
// `לקוחות פוטנציאליים: הכל 0` for two days.
//
// So this spec is deliberately narrow and deliberately harsh:
//   · it cold-loads the REAL concatenated js/app.js (never the modules, never a mock bundle),
//   · once in mock mode and once with the Supabase router LIVE (`sb=1`), the boot path the
//     live site is actually on, with every REST call stubbed by _helpers' routes,
//   · in all four projects (390 and 1440, light and dark — the config's matrix),
//   · and it fails on ANY console error or unhandled rejection, not on a named one. A TDZ in
//     some other file would look nothing like this one; the assertion has to be "zero".
//
// The freshness assertion is the other half. Zero console errors would still pass if the read
// silently returned nothing, so the spec also reads the header date and requires TODAY — the
// exact symptom a human saw on the live site before anyone found the stack trace.
import { expect, test, installRoutes, shot, watchConsole, SB_ORIGIN } from './_helpers';

/** The header renders `📅 עודכן: D.M.YYYY · HH:MM` through `toLocaleDateString('he-IL')`. */
function todayHe(): string {
  return new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

for (const mode of ['mock', 'supabase'] as const) {
  test('cold boot is silent — ' + mode, async ({ page }, testInfo) => {
    const rec = watchConsole(page);
    await installRoutes(page);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('dashboard_user_v1', 'עידן');
        localStorage.setItem('dashboard_role_v1', 'idan');
        localStorage.setItem('dashboard_auth_v4', 'ok');
      } catch { /* private mode */ }
      // The same once-per-session latches boot() sets: a full-screen prompt is harness noise,
      // and this spec is about the console, not about what is on top of the page.
      (window as any)._pushPromptShown = true;
      (window as any)._attReminderShown = true;
      (window as any)._fieldPromptShown = true;
    });

    // `sb=1` is not a flag the app reads — `USE_SUPABASE` is on unless `sb=0` is present
    // (js/src/01-data.js). Passing it explicitly is how this file states which path it means.
    const q = mode === 'mock' ? 'login=0&sb=0' : 'login=0&sb=1';
    await page.goto('/index.html?' + q, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sigma-nav')).toBeAttached();
    await page.waitForSelector('#sigma-home .kibbutz', { timeout: 30_000 });
    // The crash was inside an async `catch`, one microtask after the snapshot read was fired.
    // Let the boot's own network settle so a late rejection lands before the assertion.
    await page.waitForLoadState('networkidle').catch(() => { /* islands may keep a socket */ });
    await page.waitForTimeout(1500);

    // ── the gate ──
    expect(rec.errors, 'cold boot (' + mode + ') console errors:\n' + rec.errors.join('\n')).toEqual([]);

    // ── and the symptom that was visible to a human ──
    // A swallowed TDZ is silent by construction, so "no console errors" alone would have
    // passed once the `catch` was reached. What a person actually saw was a header frozen at
    // `📅 עודכן: 22.6.2026` and `לקוחות פוטנציאליים: הכל 0` — a snapshot that never arrived.
    // So the spec asserts the snapshot itself.
    const snap = await page.evaluate(() => {
      const d = (window as any).SHEET_DATA;
      return d ? { updatedAt: String(d.updatedAt || ''), tasks: (d.tasks || []).length, potentials: (d.potentials || []).length } : null;
    });
    expect(snap, 'window.SHEET_DATA was never populated — the boot read failed').not.toBeNull();
    expect(snap!.tasks, 'the snapshot carries no kibbutzim').toBeGreaterThan(0);
    // (potentials is not asserted: the harness fixtures carry none, so a count here would
    // test _fixtures.ts rather than the boot path. `tasks` is what the card home renders.)
    if (mode === 'supabase') {
      // readSnapshot() stamps `updatedAt: nowISO()` (js/src/01-data.js). A fall-back to Apps
      // Script would carry the mock's own timestamp instead, so "today" IS the freshness gate.
      const shown = new Date(snap!.updatedAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      expect(shown, 'the snapshot is stale — the Supabase read fell back').toBe(todayHe());
    }
    // The header itself rendered a real date, not the "טוען…" placeholder.
    const header = (await page.locator('#lastUpdated').innerText()).trim();
    expect(header, 'the header never rendered a date').toMatch(/📅 עודכן: \d{1,2}\.\d{1,2}\.\d{4}/);

    await shot(page, testInfo, mode);
  });
}
