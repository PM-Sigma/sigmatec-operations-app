  // ═══════════════════════════════════════════════════════════════════════════
  // EMS LOGIN GATE — real sign-in with EMS credentials (flag: ?login=1).
  // Default OFF (the name+PIN entry still works → zero lockout risk). Test via
  // ?login=1; once verified for everyone, make it the default. Identity is resolved
  // from the EMS profile (typed email → matching EMS user's firstName → app person),
  // so all per-person features (attendance, "my tasks", admin powers) work as before.
  // Reuses the proven EMS auth (emsProxyCall + the 2FA/verify-otp flow) — the existing
  // EMS-tab login is left untouched.
  // ═══════════════════════════════════════════════════════════════════════════
  // EMS→Supabase bridge: trade the EMS token for a short-lived Supabase pass (role=authenticated).
  // Lives OUTSIDE the gate so PIN-mode (?login=0) sessions mint too — without it every Supabase
  // write (incl. emsSyncCache on EMS connect) went out anon → RLS 401. Single-flight: concurrent
  // callers (gate init / emsOnConnected / the write shim) share one in-flight mint.
  // ── the re-mint schedule (spec §7n). Mirrors app/src/lib/remint.ts, where the math is
  //    unit-tested: every 50 min while the pass lives, never later than 10 min before it ends,
  //    and again the moment the tab comes back to the foreground inside that margin.
  var PASS_TTL_MS = 180 * 60 * 1000;
  var REMINT_EVERY_MS = 50 * 60 * 1000;
  var REMINT_MARGIN_MS = 10 * 60 * 1000;
  function remintDelay(exp, now) {
    if (!exp) return 0;
    var untilMargin = exp - REMINT_MARGIN_MS - now;
    if (untilMargin <= 0) return 0;
    return Math.min(REMINT_EVERY_MS, untilMargin);
  }
  window._sigmaRemintDelay = remintDelay;   // the legacy runner (test-session-gate.mjs) reads it
  function scheduleRemint() {
    try { clearTimeout(window._sbRefreshTimer); } catch (e) {}
    var delay = remintDelay(window._sbTokenExp || 0, Date.now());
    window._sbRefreshTimer = setTimeout(function () {
      // Only while the EMS session itself is alive — with no EMS token there is nothing to
      // trade, and the expiry funnel (js/src/00-bridge.js) owns that case.
      if (typeof getEmsToken === 'function' && !getEmsToken()) return;
      if (window._sbBridge) window._sbBridge();
    }, delay);
  }
  // A phone that spent two hours asleep wakes up with a dead pass; re-mint on the way back in
  // rather than letting the first tap discover it.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (typeof getEmsToken === 'function' && !getEmsToken()) return;
    var exp = window._sbTokenExp || 0;
    if (exp - Date.now() <= REMINT_MARGIN_MS && window._sbBridge) window._sbBridge();
    else scheduleRemint();
  });

  // `var`, not `let` (task-35): a `let` here is reachable from boot the same way
  // `EMS_TOKEN_AT_KEY` was (task-33 FAIL-2, see js/src/00-consts.js) — sbGet's `await
  // sbEnsure()` line evaluates `window.sbEnsurePass()` eagerly for EVERY one of the ~13
  // parallel legacy-table reads the very first `refreshData()` fires at eval time
  // (js/src/11-search-login.js), and once an EMS token already sits in localStorage
  // (a returning session, cold-loading this file), that reaches all the way into this
  // function before its own `let` line has run — `Cannot access '_sbMintInflight' before
  // initialization`, one throw per parallel read, silently swallowed by fetchSheetData's
  // catch (→ "offline", not a visible crash, but the mint never happens and every read
  // goes out anon). `var` has no TDZ: it hoists to `undefined` at the top of the script,
  // so an early read is simply falsy and `sbBridge()` mints normally instead of throwing.
  var _sbMintInflight = null;
  function sbBridge() {
    if (_sbMintInflight) return _sbMintInflight;
    _sbMintInflight = _sbBridgeMint().finally(function () { _sbMintInflight = null; });
    return _sbMintInflight;
  }
  window._sbBridge = sbBridge;
  // What this device can trade for a pass right now: an EMS session, or the view-only code the
  // person typed this session (kept in sessionStorage so a silent re-mint needs no re-typing,
  // and gone when the browser closes — the code itself is only ever compared by the function).
  window.VIEWER_CODE_KEY = 'viewer_code_v1';
  function viewerCode() {
    try {
      if ((localStorage.getItem('dashboard_role_v1') || '') !== 'viewer') return '';
      return sessionStorage.getItem(window.VIEWER_CODE_KEY) || '';
    } catch (e) { return ''; }
  }
  function mintBody() {
    var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
    if (tok) return { emsToken: tok };
    var code = viewerCode();
    if (code) return { mode: 'viewer', pin: code };
    return null;
  }
  window._sbMintBody = mintBody;   // the viewer sign-in reuses the same shape

  async function _sbBridgeMint() {
    try {
      var body = mintBody();
      if (!body) return false;
      window._sbPassPending = true;
      var ac = new AbortController(); var tt = setTimeout(function () { ac.abort(); }, 15000);   // a hung ems-auth fn must not stall login
      var r = await fetch(SB_URL + '/functions/v1/ems-auth', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal
      });
      clearTimeout(tt);
      if (r.ok) {
        var d = await r.json().catch(function () { return null; });
        if (d && d.token) {
          // The function mints a 180-min pass (spec §7n: a session must survive a workday
          // stretch). We hold it for 175 min, one safety margin inside the server's own exp,
          // and re-mint every 50 min while the EMS session lives.
          var ttlMs = (d.expiresIn ? d.expiresIn * 1000 : PASS_TTL_MS) - REMINT_MARGIN_MS / 2;
          window._sbToken = d.token; window._sbTokenExp = Date.now() + Math.max(60000, ttlMs);
          // self-verify: the pass must actually pass RLS, else drop it → stay on anon (safe during staging)
          try {
            var t = await fetch(SB_URL + '/rest/v1/tasks?select=name&limit=1', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + window._sbToken } });
            if (!t.ok) { console.warn('[bridge] pass rejected (' + t.status + ') — staying on anon'); window._sbToken = null; window._sbTokenExp = 0; }
            else {
              console.log('%c🔒 Supabase pass active (authenticated)', 'color:#15803d;font-weight:700');
              // The grace stamp: a 401 that was already on the wire when this landed belongs to
              // the cold boot, not to an expiry (js/src/00-bridge.js reads it).
              window._sbPassMintedAt = Date.now();
              // proactive re-mint before expiry → writes never silently fail post-lockdown (while the EMS session lives)
              scheduleRemint();
            }
          } catch (e) { window._sbToken = null; window._sbTokenExp = 0; }
          return !!window._sbToken;
        }
      } else console.warn('[bridge] ems-auth ' + r.status);
    } catch (e) { console.warn('[bridge] failed', e); }
    return false;
  }

  // ── THE one promise every read and write waits on (review fix 1) ───────────────────────
  // `sbGet` used to fire the moment a module asked for data, which on a cold boot raced the
  // async mint: the read went out anon, the authenticated-only tables answered 401, and the
  // person was shown a re-login sheet on a perfectly valid session. Memoized, so a boot that
  // asks eight times mints once, and cheap once the pass is in hand.
  var _ensureInflight = null;
  window._sbPassPending = false;
  function sbEnsurePass() {
    if (window._sbToken && (window._sbTokenExp || 0) > Date.now()) return Promise.resolve(true);
    if (_ensureInflight) return _ensureInflight;
    if (!mintBody()) return Promise.resolve(false);            // nothing to trade — go out anon
    window._sbPassPending = true;
    _ensureInflight = sbBridge()
      .catch(function () { return false; })
      .then(function (ok) { window._sbPassPending = false; _ensureInflight = null; return !!ok; });
    return _ensureInflight;
  }
  window.sbEnsurePass = sbEnsurePass;

  /** One forced re-mint, for the single retry a 401 is allowed before it counts as an expiry. */
  function sbRemintOnce() {
    window._sbToken = null; window._sbTokenExp = 0;
    return sbEnsurePass();
  }
  window.sbRemintOnce = sbRemintOnce;

  // ── Upgrade freeze — the DOM half of upgradeFreezeDecision (js/src/00-consts.js). Reads the
  // just-resolved session and blocks with a full-screen island above every overlay (z-index
  // above the login gate itself). The URL is checked directly, not window._certViewMode: that
  // flag is set by js/src/20-delivery-cert.js, which concatenates AFTER this file, so it isn't
  // set yet the first time this runs at boot. `?freeze=1` forces the check under mock mode
  // (?sb=0), so the Playwright spec can drive it without a real EMS/viewer login.
  function upgradeFrozen() {
    if (typeof UPGRADE_FREEZE === 'undefined' || !UPGRADE_FREEZE) return false;
    const name = (typeof getCurrentUser === 'function') ? getCurrentUser() : '';
    if (!name) return false;   // nothing resolved yet — not our call to make
    const isCertView = /[?&]cert=[0-9a-f-]{36}/i.test(location.search);
    const forceTest = location.search.indexOf('freeze=1') !== -1;
    const isMock = (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) && !forceTest;
    const isViewer = (typeof getRole === 'function') && getRole() === 'viewer';
    return upgradeFreezeDecision(name, isViewer, isCertView, isMock, (typeof UPGRADE_ALLOW !== 'undefined') ? UPGRADE_ALLOW : []);
  }
  window.upgradeFrozen = upgradeFrozen;
  // Logout that works whichever login mode is active — plain PIN mode never defines
  // window.gateLogout (that only happens inside setupEmsLoginGate, below, which is skipped
  // entirely when LOGIN_FLAG is off), so the freeze screen cannot rely on it.
  function upgradeFreezeLogout() {
    try {
      if (typeof LOGIN_FLAG !== 'undefined' && LOGIN_FLAG && typeof gateLogout === 'function') { gateLogout(); return; }
      localStorage.removeItem(USER_KEY); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(ROLE_KEY);
      if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');
      location.reload();
    } catch (e) { location.reload(); }
  }
  function showUpgradeFreeze() {
    let el = document.getElementById('upgradeFreezeGate');
    if (!el) {
      el = document.createElement('div');
      el.id = 'upgradeFreezeGate';
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:linear-gradient(160deg,#0f766e 0%,#15803d 100%);display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;text-align:center;';
      el.innerHTML =
        '<div>' +
          '<div style="font-size:22px;font-weight:800;margin-bottom:10px;">המערכת בשדרוג</div>' +
          '<div style="font-size:15px;opacity:.9;margin-bottom:22px;">נעדכן כשהיא חוזרת.</div>' +
          '<a href="#" id="upgradeFreezeLogout" style="color:#fff;opacity:.85;font-size:13px;text-decoration:underline;">התנתק</a>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector('#upgradeFreezeLogout').onclick = e => { e.preventDefault(); upgradeFreezeLogout(); };
    }
    el.style.display = 'flex';
  }
  window.showUpgradeFreeze = showUpgradeFreeze;

  // Runs before the LOGIN_FLAG gate below: a stored identity can be frozen whether the person
  // is on the EMS flow or the host-gated PIN fallback (`?login=0`, dev/test only — the freeze
  // must not care which login mode is active). `?freeze=1` (honored only under `?sb=0` mock
  // mode — see upgradeFrozen) is the hook qa/playwright/tests/upgrade-freeze.spec.ts drives,
  // since mock mode is otherwise exempt so the rest of the suite is unaffected.
  if (typeof isAuthed === 'function' && isAuthed() && upgradeFrozen()) showUpgradeFreeze();

  (function setupEmsLoginGate() {
    if (typeof LOGIN_FLAG === 'undefined' || !LOGIN_FLAG) return;
    const gate = document.getElementById('emsLoginGate');
    const show = () => { if (gate) gate.style.display = 'flex'; };
    const hide = () => { if (gate) gate.style.display = 'none'; };
    if (typeof isAuthed === 'function' ? !isAuthed() : true) {
      show();
    } else if (upgradeFrozen()) {
      // already shown by the unconditional check above — skip the EMS-flow side effects
      // (pass mint, queued-write flush, re-login nag) rather than duplicate the screen.
    } else if (typeof getEmsToken === 'function' && getEmsToken()) {
      // A returning session (spec §7m G2): mint the pass, then run the two things that used to
      // fire only from the retired EMS page — the queued-writes flush + cache sync, and the
      // session-cap timer that ends a stale session through the one expiry funnel.
      sbEnsurePass().then(function () {
        try { if (typeof emsOnConnected === 'function') emsOnConnected(false); } catch (e) {}
        try { if (typeof scheduleEmsExpiry === 'function') scheduleEmsExpiry(); } catch (e) {}
        if (typeof refreshData === 'function') refreshData();
      });
      reconcileIdentity();                                                                      // self-heal a stale/wrong cached name (e.g. old "PM" → עידן) on plain refresh
      restoreReturnPage();                                                                      // land back where we were before a re-login
    } else if (typeof getRole !== 'function' || getRole() !== 'viewer') {
      // signed in before but the EMS connection is gone → lead them straight to re-login on open
      // (viewer sessions have no EMS account by design — don't nag them with the EMS login)
      setTimeout(function () { if (typeof emsRequireLogin === 'function') emsRequireLogin(); }, 1000);
    }
    function restoreReturnPage() {
      setTimeout(function () {
        try {
          var rp = sessionStorage.getItem('ems_return_page_v1');
          if (rp) { sessionStorage.removeItem('ems_return_page_v1'); if (typeof showPage === 'function' && rp !== 'ems') showPage(rp); }
          // …and the exact place on it (spec §7n: "lands back where he was").
          var sy = parseInt(sessionStorage.getItem('ems_return_scroll_v1') || '0', 10);
          sessionStorage.removeItem('ems_return_scroll_v1');
          if (sy > 0) setTimeout(function () { try { window.scrollTo(0, sy); } catch (e) {} }, 120);
        } catch (e) {}
      }, 600);
    }

    // Known EMS-email → app-person overrides: an EMS account whose profile firstName isn't the app
    // name we use. עידן's real EMS account is pm@sigmatec-energy.com (cf. 12-reports.js), but its EMS
    // firstName resolves to "PM" → he'd land as team role and lose his admin powers. Map it explicitly.
    const EMS_EMAIL_ALIASES = { 'pm@sigmatec-energy.com': 'עידן' };
    const EMS_EMAIL_KEY = 'ems_login_email_v1';   // persisted at login so a plain refresh can re-resolve identity
    async function resolveIdentity(email) {
      const alias = EMS_EMAIL_ALIASES[(email || '').toLowerCase().trim()];
      if (alias) return alias;
      try {
        const users = await getEmsUsers();
        const me = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
        if (me) return (me.firstName || '').trim();
      } catch (e) { console.warn('[gate] EMS user lookup failed (need admin role?)', e); }
      return '';
    }
    // On a returning session (already holding an EMS token) re-resolve the stored email and correct a
    // stale/wrong cached name — e.g. an account that logged in before an alias existed and got stuck as
    // "PM". No-op when the email isn't stored yet (pre-fix sessions → they self-heal after one re-login).
    async function reconcileIdentity() {
      try {
        const email = localStorage.getItem(EMS_EMAIL_KEY) || '';
        if (!email) return;
        const person = await resolveIdentity(email);
        if (person && person !== (typeof getCurrentUser === 'function' ? getCurrentUser() : '')) {
          localStorage.setItem(USER_KEY, person);
          localStorage.setItem(ROLE_KEY, person === 'עידן' ? 'idan' : 'team');
          if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');   // → React islands (bridge)
          if (typeof updateUserBadge === 'function') updateUserBadge();
          if (upgradeFrozen()) { showUpgradeFreeze(); return; }
          if (typeof refreshData === 'function') refreshData();
        }
      } catch (e) { /* leave the cached name as-is */ }
    }
    // §N4 "login gets stuck": onAuthed used to `await` the EMS identity lookup and the whole
    // connect/flush pass with no bound. One hung EMS call (the phone on a weak link, /users
    // 403-retrying) left the gate on screen forever — the sign-in HAD succeeded. Every await
    // below is now time-boxed; the worst case is a reload with a fallback display name.
    function gateBounded(p, ms, fallback) {
      return Promise.race([
        Promise.resolve(p).catch(function () { return fallback; }),
        new Promise(function (res) { setTimeout(function () { res(fallback); }, ms); }),
      ]);
    }
    async function onAuthed(email) {
      const person = await gateBounded(resolveIdentity(email), 10000, '');
      const name = person || email;            // fall back to email if no profile match
      localStorage.setItem(EMS_EMAIL_KEY, (email || '').toLowerCase().trim());   // enables reconcileIdentity on future refreshes
      localStorage.setItem(USER_KEY, name);
      localStorage.setItem(ROLE_KEY, name === 'עידן' ? 'idan' : 'team');
      localStorage.setItem(AUTH_KEY, 'ok');
      if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');   // → React islands (bridge)
      if (typeof updateUserBadge === 'function') updateUserBadge();
      hide();
      if (upgradeFrozen()) { showUpgradeFreeze(); return; }
      try { await gateBounded(sbBridge(), 10000, null); } catch (e) {}   // get the Supabase pass before loading data
      // flush queued writes + sync BEFORE the refresh — bounded, see gateBounded above
      try { if (typeof emsOnConnected === 'function') await gateBounded(emsOnConnected(true), 10000, null); } catch (e) {}
      // persist the page to return to, then hard-refresh so the connected state (bubble/data/pass) fully updates
      try {
        var _rp = window._emsReturnPage || ''; window._emsReturnPage = ''; window._emsReloginActive = false;
        if (_rp && _rp !== 'ems') sessionStorage.setItem('ems_return_page_v1', _rp);
        window._sigmaExpiryAt = 0;   // a fresh session may raise a fresh expiry
      } catch (e) {}
      if (!person) console.warn('[gate] signed in but no EMS profile matched email "' + email + '" — using email as display name');
      // A reload is the clean way to re-init every role-dependent element — EXCEPT while the
      // person is in a form (the visit summary): the draft is saved, but what is on screen and
      // not yet in the draft is not, so there we restore in place (review fix, minors).
      if (window._visitFormOpen) {
        try { sessionStorage.removeItem('ems_return_page_v1'); sessionStorage.removeItem('ems_return_scroll_v1'); } catch (e) {}
        try { if (typeof refreshData === 'function') refreshData(); } catch (e) {}
        try { if (typeof scheduleEmsExpiry === 'function') scheduleEmsExpiry(); } catch (e) {}
        try { if (typeof updateEmsBubble === 'function') updateEmsBubble(); } catch (e) {}
        return;
      }
      try { location.reload(); } catch (e) {}
    }
    function storeToken(url, token) {
      localStorage.setItem(EMS_URL_KEY, url);
      localStorage.setItem(EMS_TOKEN_KEY, token);
      localStorage.setItem(EMS_TOKEN_AT_KEY, String(Date.now()));
      if (typeof scheduleEmsExpiry === 'function') scheduleEmsExpiry();
    }

    window.gateLogin = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const email = (document.getElementById('gateEmail').value || '').trim();
      const pass = document.getElementById('gatePass').value;
      const err = document.getElementById('gateError');
      if (!email || !pass) { err.textContent = 'נא למלא אימייל וסיסמה'; return; }
      err.innerHTML = '<span class="gate-spin"></span> מתחבר...';
      try {
        const wrapped = await emsProxyCall(url, '/v1/auth/login/password', 'POST', null, { login: email, password: pass });
        if (wrapped.error) { err.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
        const data = wrapped.body || {};
        if (data.accessToken && data.type === '2FA') {           // 2FA → emailed OTP
          window._gateTemp = data.accessToken; window._gateEmail = email;
          err.textContent = '';
          document.getElementById('gateOtpBox').style.display = '';
          const o = document.getElementById('gateOtp'); o.value = ''; setTimeout(() => o.focus(), 50);
          return;
        }
        if (data.accessToken) { storeToken(url, data.accessToken); err.textContent = ''; await onAuthed(email); }
        else if (wrapped.status >= 500) { err.textContent = '⏳ המערכת בעליית גרסה. נא לנסות שוב בעוד מספר דקות'; }
        else {
          const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
          err.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'אימייל או סיסמה שגויים');
        }
      } catch (e) { err.textContent = 'שגיאת חיבור: ' + e.message; }
    };
    window.gateVerifyOtp = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const err = document.getElementById('gateError');
      const code = (document.getElementById('gateOtp').value || '').trim();
      const temp = window._gateTemp;
      if (!temp) { err.textContent = 'פג תוקף שלב האימות. התחבר מחדש'; document.getElementById('gateOtpBox').style.display = 'none'; return; }
      if (!code) { err.textContent = 'נא להזין את הקוד מהאימייל'; return; }
      err.innerHTML = '<span class="gate-spin"></span> מאמת קוד...';
      try {
        const wrapped = await emsProxyCall(url, '/v1/auth/verify-otp', 'POST', temp, { code: code });
        if (wrapped.error) { err.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
        const data = wrapped.body || {};
        if (data.accessToken) {
          storeToken(url, data.accessToken); window._gateTemp = null; err.textContent = '';
          document.getElementById('gateOtpBox').style.display = 'none';
          await onAuthed(window._gateEmail || (document.getElementById('gateEmail').value || '').trim());
        } else if (wrapped.status >= 500) { err.textContent = '⏳ המערכת בעליית גרסה. נא לנסות שוב בעוד מספר דקות'; }
        else {
          const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
          err.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'קוד שגוי או שפג תוקפו');
        }
      } catch (e) { err.textContent = 'שגיאת חיבור: ' + e.message; }
    };
    window.gateResendOtp = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const err = document.getElementById('gateError'); const temp = window._gateTemp;
      if (!temp) { err.textContent = 'פג תוקף שלב האימות. התחבר מחדש'; return; }
      try { await emsProxyCall(url, '/v1/auth/resend-otp', 'POST', temp, {}); if (typeof emsToast === 'function') emsToast('📧 קוד חדש נשלח לאימייל'); }
      catch (e) { err.textContent = 'שגיאה בשליחת קוד: ' + e.message; }
    };
    // ---- view-only entry (no EMS account): reports + reading only, every write blocked (isViewer) ----
    // The access code is NOT in this bundle any more (review fix 2): `ems-auth` compares it
    // against its own VIEWER_PIN secret and mints the same bridge pass a signed-in person gets,
    // with the subject "viewer". That is what lets every screen gate on "has a pass" — before
    // this a viewer could not hold one at all, so the locked-down tables read as empty.
    window.gateViewerToggle = function () {
      const box = document.getElementById('gateViewerBox');
      if (!box) return;
      box.style.display = box.style.display === 'none' ? '' : 'none';
      if (box.style.display !== 'none') setTimeout(function () { document.getElementById('gateViewerPin').focus(); }, 50);
    };
    // F12: the כניסה לצפייה button had a text spinner but stayed enabled — a second tap
    // fired a second ems-auth mint. `runOnce` is the pending state and the double-tap guard.
    window.gateViewerLogin = function (btn) {
      return runOnce(btn, 'בודק…', gateViewerLoginRun);
    };
    var gateViewerLoginRun = async function () {
      const err = document.getElementById('gateError');
      const pin = (document.getElementById('gateViewerPin').value || '').trim();
      if (!pin) { err.textContent = 'נא להזין את קוד הצפייה'; return; }
      err.innerHTML = '<span class="gate-spin"></span> בודק...';
      let d = null, status = 0;
      try {
        const r = await fetchWithTimeout(SB_URL + '/functions/v1/ems-auth', {
          method: 'POST',
          headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'viewer', pin: pin })
        }, 20000);
        status = r.status;
        d = await r.json().catch(function () { return null; });
      } catch (e) { err.textContent = 'שגיאת חיבור: ' + e.message; return; }
      if (!d || !d.token) { err.textContent = (d && d.error) || ('(' + status + ') לא ניתן להיכנס כרגע'); return; }
      // The code stays for THIS browser session only, so a silent re-mint needs no re-typing.
      try { sessionStorage.setItem(window.VIEWER_CODE_KEY, pin); } catch (e) {}
      var ttlMs = (d.expiresIn ? d.expiresIn * 1000 : 180 * 60 * 1000) - 5 * 60 * 1000;
      window._sbToken = d.token; window._sbTokenExp = Date.now() + Math.max(60000, ttlMs);
      window._sbPassMintedAt = Date.now();
      localStorage.setItem(USER_KEY, window.VIEWER_NAME);
      localStorage.setItem(ROLE_KEY, 'viewer');
      localStorage.setItem(AUTH_KEY, 'ok');
      if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');   // → React islands (bridge)
      err.textContent = '';
      if (typeof updateUserBadge === 'function') updateUserBadge();
      hide();
      // reload (like the EMS path) so every role-dependent element re-inits: FAB, nav, reminders
      try { location.reload(); } catch (e) {}
    };
    window.gateLogout = function () {
      try { localStorage.removeItem(EMS_TOKEN_KEY); localStorage.removeItem(EMS_TOKEN_AT_KEY); } catch (e) {}
      // Drop the pass and everything that would renew it — a re-mint timer firing after a
      // logout would quietly mint a new pass for a session the person just ended.
      try { clearTimeout(window._sbRefreshTimer); } catch (e) {}
      window._sbRefreshTimer = null;
      window._sbToken = null; window._sbTokenExp = 0; window._sbPassMintedAt = 0;
      try { sessionStorage.removeItem(window.VIEWER_CODE_KEY); } catch (e) {}
      localStorage.removeItem(USER_KEY); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(ROLE_KEY);
      if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');   // → React islands (bridge)
      location.reload();
    };
  })();
