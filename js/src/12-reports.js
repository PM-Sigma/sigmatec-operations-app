  // ===== team contacts =====
  // Contact map: name → { email, phone }. Phones in international format (972...).
  // The "משימות באחריותי" report that used to live here retired with the משימות page
  // (spec §7m R4) — its שתף is the calendar's רשימה view now. This map did NOT move with it:
  // js/src/10-activity.js shares the daily-activity report from the same numbers, and the
  // list view reaches them through `sigma.contactPhone()`. One map, two readers, no copy.
  const CONTACTS = {
    'עידן':    { email: 'pm@sigmatec-energy.com', phone: '972544649833' },
    'עמיחי':   { email: '',                       phone: '972524234370' },
    'אביאם':   { email: '',                       phone: '972505599535' },
    'ניתאי':   { email: '',                       phone: '972528119081' },
    'אבצן':    { email: '',                       phone: '972547854565' },
    'מתניה':   { email: '',                       phone: '972526928649' },
    'אליה':    { email: '',                       phone: '' }
  };

  /** One person's WhatsApp number, or '' — what the שתף action on the list view sends to. */
  function contactPhone(person) {
    var c = CONTACTS[person];
    return (c && c.phone) || '';
  }
  window.contactPhone = contactPhone;

  // Region order — north to south
  const REGION_ORDER = [
    'גליל וגולן',
    'העמקים',
    'מישור החוף והשרון',
    'שפלה ומרכז',
    'יהודה ושומרון',
    'דרום, עוטף עזה והנגב'
  ];

  // ===========================================================
  // EMS INTEGRATION
  // ===========================================================
  // The session constants and the four token helpers used to live here. They now live in
  // js/src/00-consts.js, because `refreshData()` runs at EVAL TIME in js/src/11-search-login.js
  // — one file earlier — and reaches them through the hoisted global `getEmsToken`. See
  // test-concat-order.mjs and task-33 FAIL-2.

  // Proactively log out exactly at the 60-min cap while the user sits on the page.
  let _emsExpiryTimer = null;
  function scheduleEmsExpiry() {
    if (_emsExpiryTimer) clearTimeout(_emsExpiryTimer);
    const at = parseInt(localStorage.getItem(EMS_TOKEN_AT_KEY) || '0', 10);
    if (!at) return;
    const left = EMS_MAX_SESSION_MS - (Date.now() - at);
    _emsExpiryTimer = setTimeout(() => {
      clearEmsSession();
      // Through the one funnel (spec §7n), so the cap and a 401 look identical to the user.
      if (typeof window.sigmaSessionExpired === 'function') window.sigmaSessionExpired('ems-max-session');
      else if (typeof emsRequireLogin === 'function') emsRequireLogin();
    }, Math.max(0, left));
  }

  // Connection dropped (a 401 on an EMS call, or the session cap) → tell the user + route to re-login.
  // Remembers the current page so a successful sign-in returns there (else home).
  function emsRequireLogin() {
    if (window._certViewMode) return;   // public cert-view link (?cert=) — a recipient must never see the EMS login
    if (window._emsReloginActive || document.getElementById('emsReloginModal')) return;
    window._emsReloginActive = true;
    window._emsReturnPage = (window._currentPage && window._currentPage !== 'ems') ? window._currentPage : '';
    try { if (typeof updateEmsBubble === 'function') updateEmsBubble(); } catch (e) {}
    // Spec §7n: ONE re-login surface for the whole app. The sheet (app/src/components/
    // ReLoginSheet.tsx) is it; the modal below is what a page without the React bundle gets.
    if (typeof window.sigmaOpenReLogin === 'function') {
      try { window.sigmaOpenReLogin(); return; } catch (e) { console.warn('[ems] re-login sheet failed', e); }
    }
    const wrap = document.createElement('div');
    wrap.id = 'emsReloginModal';
    wrap.className = 'modal-backdrop open';   // shared modal system → inherits animation + mobile sizing
    wrap.style.zIndex = '2147483000';
    wrap.innerHTML = '<div class="modal" style="max-width:360px;text-align:center;">' +
      '<div style="font-size:34px;">🔑</div>' +
      '<h3 style="margin:8px 0 6px;color:#b91c1c;">נדרשת התחברות מחדש</h3>' +
      '<div style="font-size:14px;color:#475569;margin-bottom:16px;line-height:1.6;">יש להתחבר מחדש כדי להמשיך. לאחר ההתחברות תוחזר לדף שבו היית.</div>' +
      '<button id="emsReloginBtn" type="button" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:11px 22px;font-weight:800;font-size:14px;cursor:pointer;width:100%;">🔑 התחבר מחדש</button>' +
      '</div>';
    document.body.appendChild(wrap);
    document.getElementById('emsReloginBtn').onclick = function () {
      wrap.remove();
      // Keeps the page + scroll and opens the gate (js/src/00-bridge.js). The old fallback
      // jumped to showPage('ems'); that page is retired by the redesign (spec §7m G3), so the
      // sign-in is the only destination.
      if (typeof window.sigmaBeginReLogin === 'function') window.sigmaBeginReLogin();
      else { var gate = document.getElementById('emsLoginGate'); if (gate) gate.style.display = 'flex'; }
    };
  }
  window.emsRequireLogin = emsRequireLogin;

  // ניתוק EMS — a Ctrl+K action since the EMS page retired (§7m R2, ruling 3). There is no
  // page to re-render afterwards: the reload lands on the sign-in gate, which is the front door.
  function emsDisconnect() {
    if (!confirm('לנתק מה-EMS?')) return;
    clearEmsSession();
    if (_emsExpiryTimer) clearTimeout(_emsExpiryTimer);
    try { location.reload(); } catch (e) { /* no window */ }
  }
  window.emsDisconnect = emsDisconnect;

  // All EMS calls are relayed through the Apps Script proxy (type='ems') to
  // bypass browser CORS — the dashboard never talks to the EMS host directly.
  // Proxy returns { status, body } (or { error }).
  async function emsProxyCall(base, path, method, token, payload) {
    // 20s abort: a stalled Apps Script must not hang login/actions forever. A non-JSON reply
    // (quota/HTML error page) returns {error} per the documented contract instead of throwing
    // "Unexpected token '<'" at the user.
    const ac = new AbortController(); const tt = setTimeout(() => ac.abort(), 20000);
    try {
      const res = await fetch(SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'ems', base, path, method, token, payload }),
        signal: ac.signal
      });
      return await res.json().catch(() => ({ error: 'לא הצלחנו להביא את הנתונים. נסה שוב' }));
    } catch (e) {
      return { error: e.name === 'AbortError' ? 'זה לוקח יותר מדי זמן. נסה שוב בעוד רגע' : e.message };
    } finally { clearTimeout(tt); }
  }

  async function emsApi(path, options = {}) {
    const wrapped = await emsProxyCall(
      getEmsUrl(),
      '/v1' + path,
      options.method || 'GET',
      getEmsToken(),
      options.body ? JSON.parse(options.body) : null
    );
    if (wrapped.error) throw new Error(wrapped.error);
    if (wrapped.status === 401) {
      clearEmsSession();
      // ONE debounced expiry for the whole app (spec §7n): ten cards refreshing at once
      // raise one sheet, not ten. The funnel owns the surface — this call never opens a page.
      if (typeof window.sigmaSessionExpired === 'function') window.sigmaSessionExpired('ems-401');
      else if (typeof emsRequireLogin === 'function') emsRequireLogin();
      throw new Error('פג תוקף החיבור. התחבר מחדש');
    }
    // Surface real API errors (422/403/500…) instead of silently returning an
    // error body that callers mistake for "empty".
    if (wrapped.status && wrapped.status >= 400) {
      const b = wrapped.body || {};
      const msg = Array.isArray(b.message) ? b.message.join(', ') : (b.message || (typeof b === 'string' ? b.slice(0, 160) : JSON.stringify(b).slice(0, 160)));
      throw new Error('(' + wrapped.status + ') ' + msg);
    }
    return wrapped.body;
  }

