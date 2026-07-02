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
          window._sbToken = d.token; window._sbTokenExp = Date.now() + 55 * 60 * 1000;
          // self-verify: the pass must actually pass RLS, else drop it → stay on anon (safe during staging)
          try {
            var t = await fetch(SB_URL + '/rest/v1/tasks?select=name&limit=1', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + window._sbToken } });
            if (!t.ok) { console.warn('[bridge] pass rejected (' + t.status + ') — staying on anon'); window._sbToken = null; window._sbTokenExp = 0; }
            else {
              console.log('%c🔒 Supabase pass active (authenticated)', 'color:#15803d;font-weight:700');
              // proactive re-mint before expiry → writes never silently fail post-lockdown (while the EMS session lives)
              try { clearTimeout(window._sbRefreshTimer); } catch (e) {}
              window._sbRefreshTimer = setTimeout(function () { if (window._sbBridge) window._sbBridge(); }, 50 * 60 * 1000);
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
      sbBridge().then(function () { if (typeof refreshData === 'function') refreshData(); });   // returning session → refresh the DB pass
      restoreReturnPage();                                                                      // land back where we were before a re-login
    } else {
      // signed in before but the EMS connection is gone → lead them straight to re-login on open
      setTimeout(function () { if (typeof emsRequireLogin === 'function') emsRequireLogin(); }, 1000);
    }
    function restoreReturnPage() {
      setTimeout(function () {
        try {
          var rp = sessionStorage.getItem('ems_return_page_v1');
          if (rp) { sessionStorage.removeItem('ems_return_page_v1'); if (typeof showPage === 'function' && rp !== 'ems') showPage(rp); }
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
      if (typeof updateUserBadge === 'function') updateUserBadge();
      hide();
      try { await sbBridge(); } catch (e) {}   // get the Supabase pass before loading data
      try { if (typeof emsOnConnected === 'function') await emsOnConnected(true); } catch (e) {}   // flush queued writes + sync BEFORE the refresh
      // persist the page to return to, then hard-refresh so the connected state (bubble/data/pass) fully updates
      try {
        var _rp = window._emsReturnPage || ''; window._emsReturnPage = ''; window._emsReloginActive = false;
        if (_rp && _rp !== 'ems') sessionStorage.setItem('ems_return_page_v1', _rp);
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
    window.gateLogout = function () {
      try { localStorage.removeItem(EMS_TOKEN_KEY); localStorage.removeItem(EMS_TOKEN_AT_KEY); } catch (e) {}
      localStorage.removeItem(USER_KEY); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(ROLE_KEY);
      location.reload();
    };
  })();
