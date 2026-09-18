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

  let _sbMintInflight = null;
  function sbBridge() {
    if (_sbMintInflight) return _sbMintInflight;
    _sbMintInflight = _sbBridgeMint().finally(function () { _sbMintInflight = null; });
    return _sbMintInflight;
  }
  window._sbBridge = sbBridge;
  async function _sbBridgeMint() {
    try {
      var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
      if (!tok) return false;
      var ac = new AbortController(); var tt = setTimeout(function () { ac.abort(); }, 15000);   // a hung ems-auth fn must not stall login
      var r = await fetch(SB_URL + '/functions/v1/ems-auth', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emsToken: tok }),
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

  (function setupEmsLoginGate() {
    if (typeof LOGIN_FLAG === 'undefined' || !LOGIN_FLAG) return;
    const gate = document.getElementById('emsLoginGate');
    const show = () => { if (gate) gate.style.display = 'flex'; };
    const hide = () => { if (gate) gate.style.display = 'none'; };
    if (typeof isAuthed === 'function' ? !isAuthed() : true) {
      show();
    } else if (typeof getEmsToken === 'function' && getEmsToken()) {
      // A returning session (spec §7m G2): mint the pass, then run the two things that used to
      // fire only from the retired EMS page — the queued-writes flush + cache sync, and the
      // session-cap timer that ends a stale session through the one expiry funnel.
      sbBridge().then(function () {
        try { if (typeof emsOnConnected === 'function') emsOnConnected(false); } catch (e) {}
        try { if (typeof scheduleEmsExpiry === 'function') scheduleEmsExpiry(); } catch (e) {}
        if (typeof refreshData === 'function') refreshData();
      });
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

    async function resolveIdentity(email) {
      try {
        const users = await getEmsUsers();
        const me = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
        if (me) return (me.firstName || '').trim();
      } catch (e) { console.warn('[gate] EMS user lookup failed (need admin role?)', e); }
      return '';
    }
    async function onAuthed(email) {
      const person = await resolveIdentity(email);
      const name = person || email;            // fall back to email if no profile match
      localStorage.setItem(USER_KEY, name);
      localStorage.setItem(ROLE_KEY, name === 'עידן' ? 'idan' : 'team');
      localStorage.setItem(AUTH_KEY, 'ok');
      if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');   // → React islands (bridge)
      if (typeof updateUserBadge === 'function') updateUserBadge();
      hide();
      try { await sbBridge(); } catch (e) {}   // get the Supabase pass before loading data
      try { if (typeof emsOnConnected === 'function') await emsOnConnected(true); } catch (e) {}   // flush queued writes + sync BEFORE the refresh
      // persist the page to return to, then hard-refresh so the connected state (bubble/data/pass) fully updates
      try {
        var _rp = window._emsReturnPage || ''; window._emsReturnPage = ''; window._emsReloginActive = false;
        if (_rp && _rp !== 'ems') sessionStorage.setItem('ems_return_page_v1', _rp);
        window._sigmaExpiryAt = 0;   // a fresh session may raise a fresh expiry
      } catch (e) {}
      if (!person) console.warn('[gate] signed in but no EMS profile matched email "' + email + '" — using email as display name');
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
        else if (wrapped.status >= 500) { err.textContent = '⏳ המערכת בעליית גרסה — נא לנסות שוב בעוד מספר דקות'; }
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
      if (!temp) { err.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; document.getElementById('gateOtpBox').style.display = 'none'; return; }
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
        } else if (wrapped.status >= 500) { err.textContent = '⏳ המערכת בעליית גרסה — נא לנסות שוב בעוד מספר דקות'; }
        else {
          const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
          err.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'קוד שגוי או שפג תוקפו');
        }
      } catch (e) { err.textContent = 'שגיאת חיבור: ' + e.message; }
    };
    window.gateResendOtp = async function () {
      const url = (typeof getEmsUrl === 'function') ? getEmsUrl() : 'https://api.sigmatec-ems.com';
      const err = document.getElementById('gateError'); const temp = window._gateTemp;
      if (!temp) { err.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; return; }
      try { await emsProxyCall(url, '/v1/auth/resend-otp', 'POST', temp, {}); if (typeof emsToast === 'function') emsToast('📧 קוד חדש נשלח לאימייל'); }
      catch (e) { err.textContent = 'שגיאה בשליחת קוד: ' + e.message; }
    };
    // ---- view-only entry (no EMS account): reports + reading only, every write blocked (isViewer) ----
    const VIEWER_PIN = '0540';   // change here to rotate the viewer access code (same as the legacy team PIN, per עידן)
    window.gateViewerToggle = function () {
      const box = document.getElementById('gateViewerBox');
      if (!box) return;
      box.style.display = box.style.display === 'none' ? '' : 'none';
      if (box.style.display !== 'none') setTimeout(function () { document.getElementById('gateViewerPin').focus(); }, 50);
    };
    window.gateViewerLogin = function () {
      const err = document.getElementById('gateError');
      const pin = (document.getElementById('gateViewerPin').value || '').trim();
      if (pin !== VIEWER_PIN) { err.textContent = 'קוד צפייה שגוי'; return; }
      localStorage.setItem(USER_KEY, 'צפייה');
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
      localStorage.removeItem(USER_KEY); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(ROLE_KEY);
      if (typeof sigmaEmit === 'function') sigmaEmit('user-changed');   // → React islands (bridge)
      location.reload();
    };
  })();
