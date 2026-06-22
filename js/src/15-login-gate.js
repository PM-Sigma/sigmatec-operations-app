  // ═══════════════════════════════════════════════════════════════════════════
  // EMS LOGIN GATE — real sign-in with EMS credentials (flag: ?login=1).
  // Default OFF (the name+PIN entry still works → zero lockout risk). Test via
  // ?login=1; once verified for everyone, make it the default. Identity is resolved
  // from the EMS profile (typed email → matching EMS user's firstName → app person),
  // so all per-person features (attendance, "my tasks", admin powers) work as before.
  // Reuses the proven EMS auth (emsProxyCall + the 2FA/verify-otp flow) — the existing
  // EMS-tab login is left untouched.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setupEmsLoginGate() {
    if (typeof LOGIN_FLAG === 'undefined' || !LOGIN_FLAG) return;
    const gate = document.getElementById('emsLoginGate');
    const show = () => { if (gate) gate.style.display = 'flex'; };
    const hide = () => { if (gate) gate.style.display = 'none'; };
    if (typeof isAuthed === 'function' ? !isAuthed() : true) show();

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
      try { if (typeof emsOnConnected === 'function') emsOnConnected(true); } catch (e) {}
      try { if (typeof refreshData === 'function') refreshData(); } catch (e) {}
      if (!person) console.warn('[gate] signed in but no EMS profile matched email "' + email + '" — using email as display name');
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
      err.textContent = '⏳ מתחבר...';
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
      err.textContent = '⏳ מאמת קוד...';
      try {
        const wrapped = await emsProxyCall(url, '/v1/auth/verify-otp', 'POST', temp, { code: code });
        if (wrapped.error) { err.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
        const data = wrapped.body || {};
        if (data.accessToken) {
          storeToken(url, data.accessToken); window._gateTemp = null; err.textContent = '';
          document.getElementById('gateOtpBox').style.display = 'none';
          await onAuthed(window._gateEmail || (document.getElementById('gateEmail').value || '').trim());
        } else {
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
