  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION CONSTANTS — concatenated FIRST, and that is the whole point.
  //
  // build.mjs concatenates js/src/*.js into one shared top-level scope. A `function`
  // declaration there hoists fully AND becomes a property of `window`, so `getEmsToken` is
  // callable from the very first statement of the bundle. A `const` does not: it is hoisted
  // into the TEMPORAL DEAD ZONE and only becomes readable when its own line runs.
  //
  // These constants used to sit beside their helpers in js/src/12-reports.js, and that cost
  // production a day of silently stale data (task-33 FAIL-2): `refreshData()` runs at eval
  // time in js/src/11-search-login.js — file 11, one file too early — and the chain
  // readSnapshot → sbGet → sbEnsure → window.sbEnsurePass → mintBody → getEmsToken →
  // emsSessionExpired threw `Cannot access 'EMS_TOKEN_AT_KEY' before initialization`. The
  // catch in 01-data.js swallowed it and fell back to Apps Script, so the app showed a
  // three-month-old snapshot with no visible error.
  //
  // The rule this file exists to keep: anything reachable from boot lives in file 00.
  // test-concat-order.mjs enforces it; do not move these back.
  // ═══════════════════════════════════════════════════════════════════════════
  // ===========================================================
  // EMS INTEGRATION
  // ===========================================================
  const EMS_URL_KEY      = 'ems_url_v1';
  const EMS_TOKEN_KEY    = 'ems_token_v1';
  const EMS_TOKEN_AT_KEY = 'ems_token_at_v1';
  const EMS_MAX_SESSION_MS = 12 * 60 * 60 * 1000;   // keep the connection alive through a workday (was 60m). A real EMS-token expiry is caught on the next call (401) → re-login modal.

  function getEmsUrl()      { return (localStorage.getItem(EMS_URL_KEY) || 'https://api.sigmatec-ems.com').replace(/\/$/, ''); }
  // Session expires after 60 min (or sooner if the JWT 401s — handled in emsApi).
  function emsSessionExpired() {
    const at = parseInt(localStorage.getItem(EMS_TOKEN_AT_KEY) || '0', 10);
    return !at || (Date.now() - at) > EMS_MAX_SESSION_MS;
  }
  function clearEmsSession() {
    localStorage.removeItem(EMS_TOKEN_KEY);
    localStorage.removeItem(EMS_TOKEN_AT_KEY);
  }
  function getEmsToken() {
    if (emsSessionExpired()) { clearEmsSession(); return ''; }
    return localStorage.getItem(EMS_TOKEN_KEY) || '';
  }
  function isEmsConnected() { return !!getEmsToken(); }

  // ── hoisted out of later files (test-concat-order.mjs) ──────────────────────────────────
  // Each of these is read, at boot, by a function an EARLIER file calls at eval time — the
  // same shape as the EMS_TOKEN_AT_KEY crash above, just one that had not fired yet. The
  // comment left at the original site says where each one went.
  // from 11-search-login.js
  const USER_KEY = 'dashboard_user_v1';
  // from 13-ems.js
  const EMS_CACHE_VER = 2;
  let _emsStaleCacheChecked = false;
  const EMS_BG_MIN_MS = 15 * 60 * 1000;         // one background sync per 15 minutes (עידן 22.9) — the only refresh there is
  const EMS_BG_KEY = 'ems_bg_sync_at_v1';
  let _emsBgInFlight = null;
  let _emsBgInstalled = false;
  // from 20-delivery-cert.js
  let _certReissueOf = null;
  let _certRows = [];   // last fetched list (reprint works off this cache)

  // ── Upgrade freeze (round 5, Phase 0) — closes the app to everyone but the allow-list while
  // the rewrite runs. Lifting the freeze is one commit: flip UPGRADE_FREEZE to false.
  const UPGRADE_FREEZE = true;
  const UPGRADE_ALLOW = ['עידן', 'עמיחי'];
  // Pure decision, no DOM/localStorage (golden: test-upgrade-freeze.mjs). The exemptions
  // (cert link, mock mode) win over everything, then the viewer PIN is always frozen, then
  // the allow-list decides everyone else.
  function upgradeFreezeDecision(name, isViewer, isCertView, isMock, allowList) {
    if (isCertView || isMock) return false;
    if (isViewer) return true;
    return (allowList || []).indexOf(name) === -1;
  }
  window.upgradeFreezeDecision = upgradeFreezeDecision;

  // 🔥 צריבות kill switch (round 5 G-L4 — moved from js/src/24-meter-burns.js, which owned it
  // until the page was still a stand-alone file). `false` hides every surface — the chip, the
  // modal section, the briefing rows, the strip and the full table — while the data stays in
  // `meter_burns` for the report. app/src/lib/burns.ts `burnsProjectActive()` reads the same
  // global. Read here, early (file 00), so canShowPage('burns') in 00-bridge.js sees it
  // regardless of load order.
  window.BURNS_PROJECT_ACTIVE = true;

  // ── Round 5 package V: the inventory breakpoint + the edit lock ─────────────────────────
  // 2.29 Phase 1: 159 movements archived to archive.movements_pre_breakpoint, replaced by 81
  // opening_balance rows, at this instant. INVENTORY_BREAKPOINT_AT is kept for reference /
  // future reporting; the equipment-edit delta itself no longer branches on it (Opus audit:
  // the archive's movements go PERSONAL BAG → kibbutz, never from חברה, so a diff against it
  // nets 0 and double-posts the new quantity — priorSnap.products, the visit's own filed row,
  // already matches the archive exactly and is used unconditionally, archived or not).
  const INVENTORY_BREAKPOINT_AT = '2026-09-23T14:05:47.625Z';
  window.INVENTORY_BREAKPOINT_AT = INVENTORY_BREAKPOINT_AT;

  // Grill round 5 (binding, 23.9 evening), superseding the original "equipment locked before the
  // breakpoint" rule: everything dated August 2026 or earlier is read-only everywhere; a record
  // locks on the 10th of the month after it. Mirrors app/src/lib/editLock.ts editableUntil/isLocked
  // exactly (test-visit-edit-lock-sql.mjs L12 style equality check pins the two against each other)
  // and the DB trigger in db/visit_edit_lock_trigger.sql. Asia/Jerusalem, same as the SQL (Opus
  // audit: a UTC "today" is wrong for hours after local midnight, e.g. 00:00-03:00 Israel time
  // when UTC is still on the previous day during standard time, or the same day during DST).
  const ROUND5_LOCK_FLOOR = '2026-09-01';
  function israelYmd(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);   // en-CA = yyyy-mm-dd
  }
  // A bare yyyy-mm-dd is already a calendar day (a test's explicit "today", or a stored date) —
  // used as is. An ISO instant or a Date is converted through Asia/Jerusalem, so "today" never
  // lands on the wrong side of midnight for the hours UTC and Israel disagree on.
  function toIsraelDay(input) {
    if (input instanceof Date) return israelYmd(input);
    var s = String(input || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    return isNaN(d) ? s.slice(0, 10) : israelYmd(d);
  }
  function visitEditableUntil(dateStr) {
    var ymd = String(dateStr || '').slice(0, 10);
    var y = parseInt(ymd.slice(0, 4), 10), m = parseInt(ymd.slice(5, 7), 10);
    var ny = m >= 12 ? y + 1 : y, nm = m >= 12 ? 1 : m + 1;
    return ny + '-' + String(nm).padStart(2, '0') + '-10';
  }
  function visitEditLocked(dateStr, todayInput) {
    var d = String(dateStr || '').slice(0, 10);
    var today = todayInput ? toIsraelDay(todayInput) : israelYmd(new Date());
    if (d < ROUND5_LOCK_FLOOR) return true;
    return today > visitEditableUntil(d);
  }
  window.visitEditableUntil = visitEditableUntil;
  window.visitEditLocked = visitEditLocked;

