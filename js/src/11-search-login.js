  // ====== Global Search ======
  function closeGlobalSearch() {
    const box = document.getElementById('globalSearchResults');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('.filter-bar')) closeGlobalSearch();
  });
  function doGlobalSearch(query) {
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    const q = (query || '').trim();
    if (q.length < 2) { closeGlobalSearch(); return; }
    const ql = q.toLowerCase();
    const data = window.SHEET_DATA || {};
    const tasks = data.tasks || [];
    const requirements = (data.requirements || []).concat(
      JSON.parse(localStorage.getItem('local_requirements_v1') || '[]'));
    const orders = (data.orders || []).filter(o => o.status !== 'deleted');
    const visits = data.visits || [];
    const products = data.products || [];

    const matchText = (s, q) => (s || '').toString().toLowerCase().includes(q);
    const sections = [];

    // 🏘 Kibbutzim
    const kibMatches = tasks.filter(t => matchText(t.name, ql) || matchText(t.status, ql) || matchText(t.expectedTask, ql)).slice(0, 6);
    if (kibMatches.length) sections.push({ title: '🏘 קיבוצים', items: kibMatches.map(t => ({
      icon: '🏘', title: t.name, meta: (t.region || '') + (t.status ? ' · ' + (t.status||'').slice(0,40) : ''),
      onClick: `goToKibbutz('${(t.name||'').replace(/'/g, "\\'")}')`
    })) });

    // 📋 Requirements
    const reqMatches = requirements.filter(r =>
      matchText(r.kibbutz, ql) || matchText(r.contactName, ql) || matchText(r.notes, ql) ||
      (r.items || []).some(i => matchText(i.name, ql))
    ).slice(0, 6);
    if (reqMatches.length) sections.push({ title: '📋 דרישות', items: reqMatches.map(r => ({
      icon: '📋', title: r.kibbutz + (r.contactName ? ' · ' + r.contactName : ''),
      meta: (r.items || []).map(i => `${i.name} ×${i.qty}`).join(', ').slice(0, 80),
      onClick: `goToInventoryTab('requirements')`
    })) });

    // 🧾 Orders
    const ordMatches = orders.filter(o =>
      matchText(o.supplier, ql) || matchText(o.notes, ql) || matchText(o.status, ql) ||
      (o.items || []).some(i => matchText(i.name, ql))
    ).slice(0, 6);
    if (ordMatches.length) sections.push({ title: '🧾 הזמנות', items: ordMatches.map(o => ({
      icon: '🧾', title: (o.supplier || 'ספק לא ידוע') + ' · ' + (o.status || ''),
      meta: (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ').slice(0, 80),
      onClick: `goToInventoryTab('orders'); setTimeout(()=>invEditOrder('${o.id}'), 300)`
    })) });

    // 📝 Visits
    const visitMatches = visits.filter(v =>
      matchText(v.kibbutz, ql) || matchText(v.visitor, ql) || matchText(v.summary, ql) ||
      matchText(v.contact, ql) || (v.products || []).some(p => matchText(p.name || p, ql))
    ).slice(0, 6);
    if (visitMatches.length) sections.push({ title: '📝 ביקורים', items: visitMatches.map(v => ({
      icon: '📝', title: v.kibbutz + ' · ' + (v.visitor || ''),
      meta: (v.date ? new Date(v.date).toLocaleDateString('he-IL') + ' · ' : '') + (v.summary || '').slice(0, 80),
      onClick: `goToKibbutz('${(v.kibbutz||'').replace(/'/g, "\\'")}')`
    })) });

    // 📦 Products
    const prodMatches = products.filter(p => matchText(p.name, ql) || matchText(p.category, ql)).slice(0, 6);
    if (prodMatches.length) sections.push({ title: '📦 פריטים', items: prodMatches.map(p => ({
      icon: '📦', title: p.name, meta: p.category || '',
      onClick: `goToInventoryTab('products')`
    })) });

    if (sections.length === 0) {
      box.innerHTML = '<div class="gs-empty">לא נמצאו תוצאות עבור "' + q.replace(/</g,'&lt;') + '"</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = sections.map(sec => `
      <div class="gs-section">
        <div class="gs-section-title">${sec.title} (${sec.items.length})</div>
        ${sec.items.map(it => `
          <div class="gs-result" onclick="closeGlobalSearch(); ${it.onClick}">
            <span class="gs-icon">${it.icon}</span>
            <div class="gs-text">
              <div class="gs-title">${(it.title||'').replace(/</g,'&lt;')}</div>
              <div class="gs-meta">${(it.meta||'').replace(/</g,'&lt;')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
    box.style.display = 'block';
  }

  function goToKibbutz(name) {
    // Ensure on kibbutz page first
    if (typeof showPage === 'function') showPage('kibbutz');
    setTimeout(() => {
      const card = document.querySelector(`.kibbutz[data-name="${name}"]`);
      if (!card) return;
      // Expand parent section if collapsed
      const section = card.closest('.section');
      if (section) {
        const body = section.querySelector('.section-body');
        if (body && body.classList.contains('collapsed')) body.classList.remove('collapsed');
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '3px solid #f59e0b';
      setTimeout(() => card.style.outline = '', 2000);
    }, 100);
  }
  function goToInventoryTab(tab) {
    if (typeof showPage === 'function') showPage('inventory');
    setTimeout(() => { if (typeof invShowTab === 'function') invShowTab(tab); }, 150);
  }

  // ====== Soft Login (per-device localStorage) ======
  const USER_KEY = 'dashboard_user_v1';
  const ROLE_KEY = 'dashboard_role_v1';   // 'idan' (elevated, PIN 4556) | 'team' (PIN 0540)
  function getCurrentUser() { return localStorage.getItem(USER_KEY) || ''; }
  function getRole()        { return localStorage.getItem(ROLE_KEY) || ''; }
  // Trustworthy elevated check — only a device that entered Idan's PIN is 'idan'.
  function isIdan()         { return getRole() === 'idan' && getCurrentUser() === 'עידן'; }
  // Who may use the EMS tab (view tasks + act: status/comment/edit/create, visit→EMS).
  // Each connects with their OWN EMS account; tab is gated by name. עידן also has the
  // Idan-only powers (approvals/attendance) — those stay on isIdan(), not this list.
  const EMS_USERS = ['עידן', 'ניתאי', 'אביאם', 'עמיחי', 'מתניה'];
  function canUseEms()      { return EMS_USERS.indexOf(getCurrentUser()) !== -1; }
  // Flow: pick name (loginModal) → enter PIN (authGate). PIN: עידן=4556, all others=0540.
  let _pendingUser = '';
  function setLoggedInUser(name) {
    _pendingUser = name;
    document.getElementById('loginModal').classList.remove('open');
    const sub = document.getElementById('authGateSub');
    if (sub) sub.textContent = 'שלום ' + name + ' — הזן קוד גישה';
    const title = document.getElementById('authGateTitle');
    if (title) title.textContent = '🔑 קוד גישה';
    document.getElementById('authError').textContent = '';
    document.getElementById('authGate').style.display = 'flex';
    const input = document.getElementById('authCode');
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
  function backToNamePicker() {
    _pendingUser = '';
    document.getElementById('authGate').style.display = 'none';
    document.getElementById('authError').textContent = '';
    applyLoginRoleOptions();
    document.getElementById('loginModal').classList.add('open');
  }
  function updateUserBadge() {
    applyNavVisibility();
    const badge = document.getElementById('userBadge');
    if (!badge) return;
    const user = getCurrentUser();
    badge.textContent = user ? `👤 ${user}` : '👤 לא מחובר';
    document.body.classList.toggle('user-idan', isIdan());
  }
  // Aviam's attendance report is private — only Aviam (and Idan, who sees all) may open it.
  const ATT_PEOPLE = ['אביאם', 'ניתאי'];   // each has their OWN private monthly attendance report
  function canSeeAttendance() { return isIdan() || ATT_PEOPLE.indexOf(getCurrentUser()) !== -1; }
  // Whose attendance the report shows / a save writes: the field user themself; for עידן a toggle.
  function attPerson() { const u = getCurrentUser(); return ATT_PEOPLE.indexOf(u) !== -1 ? u : (window._attPerson || 'אביאם'); }
  function setAttPerson(p) { window._attPerson = p; renderAttendanceReport(); }
  function applyNavVisibility() {
    const att = document.getElementById('navAttendance');
    if (att) att.style.display = canSeeAttendance() ? '' : 'none';
    const ems = document.getElementById('navEms');   // EMS tasks — עידן/ניתאי/אביאם
    if (ems) ems.style.display = canUseEms() ? '' : 'none';
  }
  // עידן is always shown in the picker; clicking it is PIN-gated (see setLoggedInUser).
  function applyLoginRoleOptions() {
    const idanBtn = document.getElementById('loginBtnIdan');
    if (idanBtn) idanBtn.style.display = '';
  }
  function changeUser() {
    if (confirm('להחליף משתמש? (השם הנוכחי יוסר מהמכשיר)')) {
      localStorage.removeItem(USER_KEY);
      updateUserBadge();
      applyLoginRoleOptions();
      document.getElementById('loginModal').classList.add('open');
    }
  }
  // ====== Password gate (per-PIN: 4556=עידן elevated, 0540=team) ======
  const AUTH_KEY = 'dashboard_auth_v3';   // bumped from v2 → forces re-auth under the new PIN scheme
  const IDAN_PIN = '4556';
  const TEAM_PIN = '0540';
  function isAuthed() { return localStorage.getItem(AUTH_KEY) === 'ok' && !!getCurrentUser(); }
  function checkAuthCode() {
    const input = document.getElementById('authCode');
    const code = input.value;
    const name = _pendingUser;
    if (!name) { backToNamePicker(); return; }          // safety: no name chosen → back to picker
    const expected = (name === 'עידן') ? IDAN_PIN : TEAM_PIN;
    if (code === expected) {
      localStorage.setItem(USER_KEY, name);
      localStorage.setItem(ROLE_KEY, (name === 'עידן') ? 'idan' : 'team');
      localStorage.setItem(AUTH_KEY, 'ok');
      _pendingUser = '';
      document.getElementById('authGate').style.display = 'none';
      updateUserBadge();
      const t = document.getElementById('toast');
      t.textContent = 'שלום ' + name + ' 👋' + (name === 'עידן' ? ' (הרשאת מנהל)' : '');
      t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000);
    } else {
      document.getElementById('authError').textContent = 'קוד שגוי — נסה שוב';
      input.value = '';
      input.focus();
    }
  }
  // Entry point. ?login=1 → real EMS login gate (js/src/15-login-gate.js). Otherwise the
  // legacy name-picker + PIN (kept as default so the live app can never lock anyone out).
  const LOGIN_FLAG = location.search.indexOf('login=1') !== -1;
  if (!LOGIN_FLAG && !isAuthed()) {
    applyLoginRoleOptions();
    document.getElementById('loginModal').classList.add('open');
  }
  applyLoginRoleOptions();
  updateUserBadge();
  updateMeetingBadge();
  if (isMeetingMode()) document.body.classList.add('meeting-mode');

  // Compute the counts/percentages from the static cards on first paint, so the numbers
  // are correct immediately instead of showing stale hardcoded HTML until the fetch lands.
  updateStatsFromCards();
  refreshData();
  // Smart polling: only when tab is visible. Pauses when user switches tabs/minimizes.
  let _pollHandle = null;
  function startPolling() {
    if (_pollHandle) return;
    _pollHandle = setInterval(refreshData, 15000);
  }
  function stopPolling() {
    if (_pollHandle) { clearInterval(_pollHandle); _pollHandle = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else { refreshData(); startPolling(); }
  });
  if (!document.hidden) startPolling();

  // Re-render inventory on viewport resize (mobile ↔ desktop layout swap)
  let _invResizeTimer = null;
  let _wasMobile = window.innerWidth < 768;
  window.addEventListener('resize', () => {
    clearTimeout(_invResizeTimer);
    _invResizeTimer = setTimeout(() => {
      const isMobile = window.innerWidth < 768;
      if (isMobile === _wasMobile) return; // no crossing the breakpoint
      _wasMobile = isMobile;
      const invView = document.getElementById('inventory-view');
      if (invView && invView.style.display !== 'none' && typeof renderInventory === 'function') {
        renderInventory();
      }
    }, 250);
  });

