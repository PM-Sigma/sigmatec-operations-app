  // ===== "המשימות שלי" (Phase 3) — merge EMS (assignee/owner) + status "- name" lines =====
  function openKibbutzByName(name) {
    const sel = (window.CSS && CSS.escape) ? CSS.escape(name) : name.replace(/"/g, '\\"');
    const card = document.querySelector('.kibbutz[data-name="' + sel + '"]');
    if (card) openEditModal(card);
  }
  // ===== Company calendar (visits + attendance/vacations + scheduled EMS tasks + events) =====
  window.calViewYear  = new Date().getFullYear();
  window.calViewMonth = new Date().getMonth();
  function changeCalMonth(delta) {
    window.calViewMonth += delta;
    if (window.calViewMonth > 11) { window.calViewMonth = 0; window.calViewYear++; }
    if (window.calViewMonth < 0)  { window.calViewMonth = 11; window.calViewYear--; }
    renderCompanyCalendar();
  }
  function calEsc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;'); }
  // One-click "add to MY calendar": a Google-Calendar create-event URL from any event.
  function calAddLink(d, title, details) {
    const start = new Date(d);
    if (isNaN(start.getTime())) return '#';
    const end = new Date(start.getTime() + 60 * 60000);
    const fmt = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(title || 'אירוע')
      + '&dates=' + fmt(start) + '/' + fmt(end)
      + '&details=' + encodeURIComponent(details || 'מתוך מערכת ניהול סיגמטק');
  }
  // Build { 'Y-M-D': [{icon,text,cls}] } from all data sources.
  function collectCalendarEvents() {
    const ev = {};
    const push = (d, o) => { if (isNaN(d.getTime())) return; const k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); (ev[k] = ev[k] || []).push(o); };
    (typeof loadAllVisitsCombined === 'function' ? loadAllVisitsCombined() : []).forEach(v => {
      if (!v.date) return;
      push(new Date(v.date), { icon: '📍', text: (v.visitor || '') + ' · ' + (v.kibbutz || '') + (v.workday ? ' (יום עבודה)' : ''), cls: 'cal-visit' });
    });
    // ponytail: per request — the calendar shows ONLY visits (attendance/EMS/events removed).
    return ev;
  }
  function renderCompanyCalendar() {
    const year = window.calViewYear, month = window.calViewMonth;
    const heMonths = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const lbl = document.getElementById('calMonthLabel'); if (lbl) lbl.textContent = heMonths[month] + ' ' + year;
    const grid = document.getElementById('calGrid'); if (!grid) return;
    const ev = collectCalendarEvents();
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const t = new Date(); const todayK = t.getFullYear() + '-' + t.getMonth() + '-' + t.getDate();
    let html = ['א','ב','ג','ד','ה','ו','ש'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) html += '<div class="cal-cell cal-empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const k = year + '-' + month + '-' + day;
      const items = ev[k] || [];
      let cell = `<div class="cal-cell${k === todayK ? ' cal-today' : ''}" onclick="calDayDetail(${year},${month},${day})"><div class="cal-daynum">${day}</div>`;
      items.slice(0, 3).forEach(it => { cell += `<div class="cal-chip ${it.cls}">${it.icon} ${calEsc(it.text)}</div>`; });
      if (items.length > 3) cell += `<div class="cal-more">+${items.length - 3} נוספים</div>`;
      cell += '</div>';
      html += cell;
    }
    grid.innerHTML = html;
    const panel = document.getElementById('calDayPanel'); if (panel) panel.innerHTML = '';
    renderCalendarAgenda();
  }
  // Upcoming agenda — events from today up to +31 days, ascending (like Google's Schedule view).
  // Surfaces what's "about to happen": future visits + open EMS tasks by due date + calendar events.
  function renderCalendarAgenda() {
    const box = document.getElementById('calAgenda'); if (!box) return;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(end.getDate() + 31);
    const items = [];
    const within = d => !isNaN(d.getTime()) && d >= now && d <= end;
    (typeof loadAllVisitsCombined === 'function' ? loadAllVisitsCombined() : []).forEach(v => {
      if (!v.date) return; const d = new Date(v.date);
      if (within(d)) items.push({ d: d, icon: '📍', text: (v.visitor || '') + ' · ' + (v.kibbutz || ''), cls: 'cal-visit' });
    });
    const emsTasks = (typeof emsCacheData === 'function' ? (emsCacheData().tasks || []) : []);
    emsTasks.forEach(t => {
      if (!t.expectedCompletionDate) return;
      if (typeof EMS_CLOSED !== 'undefined' && EMS_CLOSED.indexOf(t.status) !== -1) return;
      const d = new Date(t.expectedCompletionDate);
      if (within(d)) items.push({ d: d, icon: '📋', text: (t.title || '') + (t.site && t.site.name ? ' · ' + t.site.name : ''), cls: 'cal-ems' });
    });
    const cal = (window.SHEET_DATA && window.SHEET_DATA.calendar) || {};
    Object.entries(cal).forEach(([kib, list]) => (list || []).forEach(e => {
      if (!e || !e.start) return; const d = new Date(e.start);
      if (within(d)) items.push({ d: d, icon: '📅', text: (e.type || 'אירוע') + ' · ' + kib, cls: 'cal-event' });
    }));
    items.sort((a, b) => a.d - b.d);
    let html = '<div class="cal-agenda-head">📋 לוח זמנים — מהקרוב לחודש קדימה</div>';
    if (!items.length) { box.innerHTML = html + '<div style="color:#94a3b8;font-size:13px;padding:6px;">אין אירועים קרובים ב-31 הימים הבאים</div>'; return; }
    let lastK = '';
    items.forEach(it => {
      const k = it.d.getFullYear() + '-' + it.d.getMonth() + '-' + it.d.getDate();
      if (k !== lastK) { lastK = k; html += '<div class="cal-agenda-day">' + it.d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' }) + '</div>'; }
      html += '<div class="cal-agenda-row"><span class="cal-chip ' + it.cls + '" style="display:inline-block;">' + it.icon + ' ' + calEsc(it.text) + '</span>'
        + '<a href="' + calAddLink(it.d, it.icon + ' ' + it.text, '') + '" target="_blank" rel="noopener" title="הוסף ליומן האישי שלי" style="margin-right:8px;font-size:12px;text-decoration:none;color:var(--primary);white-space:nowrap;">📅 ליומן שלי</a></div>';
    });
    box.innerHTML = html;
  }

  function calDayDetail(y, m, d) {
    const items = (collectCalendarEvents()[y + '-' + m + '-' + d]) || [];
    const panel = document.getElementById('calDayPanel'); if (!panel) return;
    const dateStr = new Date(y, m, d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    panel.innerHTML = '<div class="cal-panel"><strong>' + dateStr + '</strong>' +
      (items.length ? items.map(it => `<div style="margin-top:6px;"><span class="cal-chip ${it.cls}" style="display:inline-block;">${it.icon} ${calEsc(it.text)}</span> <a href="${calAddLink(new Date(y,m,d,9,0), it.icon+' '+it.text, '')}" target="_blank" rel="noopener" style="font-size:12px;text-decoration:none;color:var(--primary);white-space:nowrap;">📅 ליומן שלי</a></div>`).join('')
                    : '<br><span style="color:#94a3b8;">אין אירועים ביום זה</span>') + '</div>';
  }

  function renderMyTasks() {
    const box = document.getElementById('myTasksList');
    if (!box) return;
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    if (!me) { box.innerHTML = '<div style="color:#94a3b8;font-style:italic;">לא מזוהה משתמש מחובר.</div>'; return; }
    const sheetTasks = (window.SHEET_DATA && window.SHEET_DATA.tasks) || [];
    const taskByKib = {}; sheetTasks.forEach(t => { if (t.name) taskByKib[t.name] = t; });
    const siteToKib = {};
    Object.keys(KIBBUTZ_SITE_MAP).forEach(k => (KIBBUTZ_SITE_MAP[k] || []).forEach(id => { if (!siteToKib[id]) siteToKib[id] = k; }));
    const groups = {};
    const g = k => (groups[k] = groups[k] || { ems: [], lines: [] });
    // 1) EMS open tasks: assigned to me OR in a kibbutz I'm responsible for (owners / "- me")
    ((typeof emsCacheData === 'function' ? emsCacheData().tasks : []) || []).forEach(t => {
      if (EMS_CLOSED.indexOf(t.status) !== -1) return;
      const kib = (t.site && siteToKib[t.site.id]) || (t.site && t.site.name) || '—';
      const assignedToMe = t.assignee && emsUserName(t.assignee).indexOf(me) !== -1;
      const sheetT = taskByKib[kib];
      if (assignedToMe || (sheetT && isOwnerOf(sheetT, me))) g(kib).ems.push(t);
    });
    // 2) status / expectedTask lines ending with "- me"
    sheetTasks.forEach(t => {
      const lines = linesForPerson(t.status, me).concat(linesForPerson(t.expectedTask, me));
      const seen = {};
      lines.forEach(l => { if (!seen[l]) { seen[l] = 1; g(t.name).lines.push(l); } });
    });
    const kibs = Object.keys(groups).filter(k => groups[k].ems.length || groups[k].lines.length).sort((a, b) => a.localeCompare(b, 'he'));
    if (!kibs.length) { box.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:24px 0;text-align:center;">אין משימות פתוחות עבורך 🎉</div>'; return; }
    let html = '';
    kibs.forEach(k => {
      const grp = groups[k], kEsc = k.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      html += '<div style="background:white;border:1px solid var(--border);border-right:3px solid var(--accent);border-radius:10px;padding:10px 12px;margin-bottom:10px;">';
      html += '<div style="font-weight:700;color:var(--primary);margin-bottom:6px;cursor:pointer;" onclick="openKibbutzByName(\'' + kEsc + '\')">🏘️ ' + emsEsc(k) + '</div>';
      grp.ems.forEach(t => {
        const overdue = t.expectedCompletionDate && new Date(t.expectedCompletionDate) < new Date();
        html += '<div class="card-ems-task status-' + t.status + (overdue ? ' overdue' : '') + '" onclick="openKibbutzEmsTask(\'' + t.id + '\')" style="cursor:pointer;">' +
          '<span class="t-dot" style="background:' + (EMS_PRIORITY_DOT[t.priority] || '#94a3b8') + '"></span>' +
          '<span class="t-title">' + (overdue ? '⏰ ' : '') + 'EMS · ' + emsEsc(t.title) + (t.linkCount ? ' 🔗' + t.linkCount : '') + '</span>' +
          '<span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span></div>';
      });
      grp.lines.forEach(l => {
        html += '<div style="font-size:13px;color:#334155;padding:5px 8px;background:#f8fafc;border:1px solid #e8eef5;border-radius:7px;margin:3px 0;cursor:pointer;" onclick="openKibbutzByName(\'' + kEsc + '\')">📝 ' + emsEsc(l) + '</div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
  }

  // ---- After a visit summary is saved: push it to the kibbutz's open EMS task(s) ----
  function buildVisitSummaryText(kibbutz, visit) {
    const d = visit.date ? new Date(visit.date).toLocaleDateString('he-IL') : '';
    let s = '📋 סיכום ביקור — ' + kibbutz + '\n';
    s += '📅 ' + d + ' · ⏱️ ' + (visit.duration || '?') + ' שעות · 👤 ' + (visit.visitor || '') + '\n';
    if (visit.contact) s += '🤝 איש קשר מלווה: ' + visit.contact + '\n';
    if (visit.products && visit.products.length) s += '📦 מוצרים: ' + visit.products.map(p => (p.qty > 1 ? p.name + ' ×' + p.qty : p.name)).join(', ') + '\n';
    if (visit.productsOther) s += '📦 מוצרים נוספים: ' + visit.productsOther + '\n';
    if (visit.returnedItems && visit.returnedItems.length) s += '↩️ הוחזר (תקול): ' + visit.returnedItems.map(r => r.name + ' ×' + r.qty).join(', ') + '\n';
    if (visit.summary) s += '\n' + visit.summary;
    return s;
  }

  // ---- Phase 2: EMS update folded INTO the visit form (replaces the post-save popup) ----
  window._visitEmsTasks = [];
  // Populate the in-form EMS block when the visit form opens for a kibbutz.
  function prepVisitEmsBlock(kibbutz) {
    const block = document.getElementById('visitEmsBlock');
    const newBlock = document.getElementById('visitEmsNewBlock');
    if (!block) return;
    block.style.display = 'none'; if (newBlock) newBlock.style.display = 'none';
    window._visitEmsTasks = (typeof emsCacheTasksForKibbutz === 'function') ? emsCacheTasksForKibbutz(kibbutz) : [];
    const tasks = window._visitEmsTasks;
    if (tasks.length) {
      document.getElementById('visitEmsTaskPick').innerHTML = tasks.length > 1
        ? tasks.map((t, i) => '<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:3px 0;cursor:pointer;"><input type="radio" name="visitEmsTask" value="' + t.id + '" ' + (i === 0 ? 'checked' : '') + ' onchange="onVisitEmsTaskChange()"><span style="flex:1;">' + emsEsc(t.title) + '</span><span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span></label>').join('')
        : '<div style="font-weight:700;font-size:13px;">' + emsEsc(tasks[0].title) + '</div><input type="radio" name="visitEmsTask" value="' + tasks[0].id + '" checked style="display:none;">';
      const sel = document.getElementById('visitEmsStatus');
      sel.innerHTML = Object.keys(EMS_STATUS).map(s => '<option value="' + s + '">' + EMS_STATUS[s] + '</option>').join('');
      sel.value = tasks[0].status;   // default = current status
      const head = document.getElementById('visitEmsHead');   // clear message about which task is being updated
      if (head) head.textContent = tasks.length > 1 ? '🔗 בחר את משימת ה-EMS לעדכון מהביקור:' : '🔗 הביקור יעדכן את משימת ה-EMS: «' + tasks[0].title + '»';
      const note = document.getElementById('visitEmsConnNote');
      if (note) note.textContent = isEmsConnected() ? '' : ' (לא מחובר — יישלח בהתחברות הבאה)';
      block.style.display = '';
    } else if (newBlock && typeof canUseEms === 'function' && canUseEms()) {
      newBlock.style.display = '';   // no open task → offer to create one
    }
  }
  function onVisitEmsTaskChange() {
    const picked = document.querySelector('input[name="visitEmsTask"]:checked');
    const t = (window._visitEmsTasks || []).find(x => x.id === (picked && picked.value));
    if (t) document.getElementById('visitEmsStatus').value = t.status;
  }
  function createEmsTaskFromVisit() {
    if (typeof createEmsTaskForKibbutz === 'function') createEmsTaskForKibbutz();
  }
  // Read the in-form EMS intent at save time. null = no block; false = validation failed
  // (status is MANDATORY when a task exists); object = {taskId,status,curStatus}.
  function readVisitEmsIntent() {
    const block = document.getElementById('visitEmsBlock');
    if (!block || block.style.display === 'none') return null;
    const tasks = window._visitEmsTasks || [];
    const picked = document.querySelector('input[name="visitEmsTask"]:checked');
    const taskId = picked ? picked.value : (tasks.length === 1 ? tasks[0].id : null);
    if (!taskId) { alert('נא לבחור משימת EMS לעדכון'); return false; }
    const status = (document.getElementById('visitEmsStatus') || {}).value;
    if (!status) { alert('נא לבחור סטטוס למשימת EMS (חובה)'); return false; }
    const cur = tasks.find(t => t.id === taskId);
    return { taskId: taskId, status: status, curStatus: cur ? cur.status : null };
  }
  // Push the visit summary as a comment (+ status if changed) to the chosen EMS task.
  async function pushVisitToEms(kibbutz, visit, intent) {
    if (!intent) return;
    let queued = false, errored = '';
    try {
      const r1 = await emsWriteOrQueue({ kind: 'comment', taskId: intent.taskId, message: buildVisitSummaryText(kibbutz, visit), meta: { kibbutz: kibbutz } });
      if (r1 && r1.error) errored = r1.error;
      let r2 = { sent: true };
      if (intent.status && intent.status !== intent.curStatus) r2 = await emsWriteOrQueue({ kind: 'status', taskId: intent.taskId, status: intent.status, meta: { kibbutz: kibbutz } });
      if (r2 && r2.error) errored = r2.error;
      queued = (r1 && r1.queued) || (r2 && r2.queued);
    } catch (e) { console.warn('EMS visit push failed', e); errored = e.message; }
    emsToast(errored ? ('⚠️ שגיאת EMS: ' + errored) : (queued ? '🕒 הסיכום יישלח ל-EMS בהתחברות הבאה' : '✅ הסיכום נשלח ל-EMS + הסטטוס עודכן'));
    if (!errored && isEmsConnected()) { try { await emsSyncCache(); } catch (e) {} }
  }

  // ponytail: dead post-save EMS popup removed — superseded by the in-form visit→EMS block.

  async function emsDoLogin() {
    const url   = (document.getElementById('emsUrlInput').value.trim() || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
    const email = document.getElementById('emsEmailInput').value.trim();
    const pass  = document.getElementById('emsPasswordInput').value;
    const errEl = document.getElementById('emsLoginError');
    if (!email || !pass) { errEl.textContent = 'נא למלא אימייל וסיסמה'; return; }
    errEl.textContent = '⏳ מתחבר...';
    try {
      const wrapped = await emsProxyCall(url, '/v1/auth/login/password', 'POST', null, { login: email, password: pass });
      if (wrapped.error) { errEl.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
      const data = wrapped.body || {};
      // 2FA: password validated but EMS emailed a one-time code and returned a TEMPORARY token.
      // That temp token is NOT usable for tasks — we must verify-otp to get the STANDARD token.
      if (data.accessToken && data.type === '2FA') {
        window._emsTempToken = data.accessToken;
        window._emsLoginUrl = url;
        errEl.textContent = '';
        document.getElementById('emsOtpBox').style.display = '';
        const otp = document.getElementById('emsOtpInput'); otp.value = ''; setTimeout(() => otp.focus(), 50);
        return;
      }
      if (data.accessToken) {
        localStorage.setItem(EMS_URL_KEY, url);
        localStorage.setItem(EMS_TOKEN_KEY, data.accessToken);
        localStorage.setItem(EMS_TOKEN_AT_KEY, String(Date.now()));  // start the 60-min session clock
        scheduleEmsExpiry();
        _emsSites = null;
        _emsSyncedThisSession = false;
        document.getElementById('emsOtpBox').style.display = 'none';
        renderEmsPage();
        emsOnConnected(true);   // flush queued writes + refresh shared cache snapshot
      } else {
        // Diagnostic: show the real HTTP status + server message so we can tell
        // a wrong API URL (404 / HTML) from a genuine auth error (401/422).
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        // surface the per-field validation reason (422 hides it inside data.errors[])
        const fieldErrs = Array.isArray(data.errors) ? data.errors.map(er => (er.field ? er.field + ': ' : '') + (er.message || '')).filter(Boolean).join(' · ') : '';
        const bodyPeek = typeof wrapped.body === 'string' ? wrapped.body.slice(0, 120) : '';
        const detail = fieldErrs || msg || bodyPeek || 'שם משתמש או סיסמה שגויים';
        errEl.textContent = '(' + (wrapped.status || '?') + ') ' + detail + (wrapped.status === 422 ? ' — בדוק אימייל/סיסמה של EMS' : '');
      }
    } catch (e) {
      errEl.textContent = 'שגיאת חיבור: ' + e.message;
    }
  }

  // 2FA step 2 — exchange the emailed OTP (Bearer = temp token) for a usable STANDARD token.
  async function emsVerifyOtp() {
    const errEl = document.getElementById('emsLoginError');
    const code = (document.getElementById('emsOtpInput').value || '').trim();
    const temp = window._emsTempToken;
    const url  = window._emsLoginUrl || (document.getElementById('emsUrlInput').value.trim() || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
    if (!temp) { errEl.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; document.getElementById('emsOtpBox').style.display = 'none'; return; }
    if (!code) { errEl.textContent = 'נא להזין את הקוד מהאימייל'; return; }
    errEl.textContent = '⏳ מאמת קוד...';
    try {
      const wrapped = await emsProxyCall(url, '/v1/auth/verify-otp', 'POST', temp, { code: code });
      if (wrapped.error) { errEl.textContent = 'שגיאת חיבור: ' + wrapped.error; return; }
      const data = wrapped.body || {};
      if (data.accessToken) {
        localStorage.setItem(EMS_URL_KEY, url);
        localStorage.setItem(EMS_TOKEN_KEY, data.accessToken);   // the STANDARD token
        localStorage.setItem(EMS_TOKEN_AT_KEY, String(Date.now()));
        window._emsTempToken = null;
        scheduleEmsExpiry();
        _emsSites = null; _emsSyncedThisSession = false;
        errEl.textContent = '';
        document.getElementById('emsOtpBox').style.display = 'none';
        renderEmsPage();
        emsOnConnected(true);
      } else {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        errEl.textContent = '(' + (wrapped.status || '?') + ') ' + (msg || 'קוד שגוי או שפג תוקפו');
      }
    } catch (e) { errEl.textContent = 'שגיאת חיבור: ' + e.message; }
  }
  // Re-send the OTP email (Bearer = temp token).
  async function emsResendOtp() {
    const errEl = document.getElementById('emsLoginError');
    const temp = window._emsTempToken;
    const url  = window._emsLoginUrl || (document.getElementById('emsUrlInput').value.trim() || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
    if (!temp) { errEl.textContent = 'פג תוקף שלב האימות — התחבר מחדש'; document.getElementById('emsOtpBox').style.display = 'none'; return; }
    try {
      await emsProxyCall(url, '/v1/auth/resend-otp', 'POST', temp, {});
      emsToast('📧 קוד חדש נשלח לאימייל');
    } catch (e) { errEl.textContent = 'שגיאה בשליחת קוד: ' + e.message; }
  }

  // Sites cache
  // ---- caches + helpers ----
  let _emsSites = null, _emsUsers = null;
  async function getEmsSites() {
    if (_emsSites) return _emsSites;
    const res = await emsApi('/sites');
    _emsSites = Array.isArray(res) ? res : (res.data || []);
    return _emsSites;
  }
  // Normalize a Hebrew site/kibbutz name for matching (collapse whitespace, trim).
  function emsNormName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  // Best-effort map a kibbutz name → EMS site id. Returns '' if no confident match.
  async function emsSiteIdForKibbutz(name) {
    const target = emsNormName(name);
    if (!target) return '';
    const sites = await getEmsSites();
    // exact (normalized) match first, then containment either way ("קיבוץ X" vs "X")
    let hit = sites.find(s => emsNormName(s.name) === target);
    if (!hit) hit = sites.find(s => { const n = emsNormName(s.name); return n && (n.indexOf(target) !== -1 || target.indexOf(n) !== -1); });
    return hit ? hit.id : '';
  }
  // Admin-role users — eligible task assignees. May 403 if the token role is low → empty list.
  async function getEmsUsers() {
    if (_emsUsers) return _emsUsers;
    const res = await emsApi('/users?roles=admin&statuses=active&take=200&sortBy=firstName&sortOrder=ASC');
    _emsUsers = res.data || (Array.isArray(res) ? res : []);
    return _emsUsers;
  }
  function emsUserName(u) {
    if (!u) return '—';
    const n = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
    return n || u.email || u.id;
  }
  function emsEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function emsToast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
  // Decode the JWT payload (id, role, type) — used to explain site-scoping.
  function emsTokenRole() {
    const tok = getEmsToken();
    if (!tok || tok.split('.').length < 2) return '';
    try { return (JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) || {}).role || ''; }
    catch (e) { return ''; }
  }
  // Populate the site filter dropdown (lets you scope to a specific site).
  async function emsPopulateSiteFilter() {
    const sel = document.getElementById('emsFilterSite');
    if (!sel || sel.dataset.loaded) return;
    try {
      const sites = await getEmsSites();
      sel.innerHTML = '<option value="">כל האתרים</option>' +
        sites.map(s => `<option value="${s.id}">${emsEsc(s.name)}</option>`).join('');
      sel.dataset.loaded = '1';
    } catch (e) { /* leave default */ }
  }

  // Tasks state (page-based pagination — the API uses page/take, not skip)
  let _emsPage = 1, _emsTasksTotal = 0, _emsSearchTimer = null;
  function debounceEmsSearch() {
    clearTimeout(_emsSearchTimer);
    _emsSearchTimer = setTimeout(() => { _emsPage = 1; loadEmsTasks(); }, 400);
  }

  async function loadEmsTasks(append = false) {
    if (!isEmsConnected()) return;
    if (!append) _emsPage = 1;
    const status   = document.getElementById('emsFilterStatus')?.value || '';
    const priority = document.getElementById('emsFilterPriority')?.value || '';
    const search   = document.getElementById('emsSearch')?.value.trim() || '';
    const myOnly   = document.getElementById('emsMyTasksOnly')?.checked;
    const overdue  = document.getElementById('emsOverdueOnly')?.checked;
    const site     = document.getElementById('emsFilterSite')?.value || '';
    // NOTE: only whitelisted params — the API uses forbidNonWhitelisted, so an
    // unknown param (e.g. sortOrder) 422s the whole call.
    const params   = new URLSearchParams({ page: _emsPage, take: 50 });
    if (status)   params.set('status', status);
    if (priority) params.set('priority', priority);
    if (search)   params.set('search', search);
    if (myOnly)   params.set('myTasksOnly', 'true');
    if (overdue)  params.set('overdueOnly', 'true');
    if (site)     params.set('siteId', site);
    const listEl = document.getElementById('emsTasksList');
    if (!append) listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;">⏳ טוען משימות...</div>';
    try {
      const reqPath = '/employee-tasks?' + params.toString();
      const res   = await emsApi(reqPath);
      const tasks = res.data || (Array.isArray(res) ? res : []);
      _emsTasksTotal = (res.meta && (res.meta.total != null ? res.meta.total : res.meta.count)) != null
        ? (res.meta.total != null ? res.meta.total : res.meta.count) : tasks.length;
      if (!append) listEl.innerHTML = '';
      if (!tasks.length && !append) {
        const role = emsTokenRole() || '?';
        listEl.innerHTML =
          '<div style="padding:24px;text-align:center;color:#94a3b8;">אין משימות תואמות' +
          '<div style="margin-top:10px;font-size:11px;color:#64748b;">role: <b>' + role + '</b> · total: ' + _emsTasksTotal + '</div></div>';
      } else {
        tasks.forEach(t => listEl.insertAdjacentHTML('beforeend', renderEmsTaskCard(t)));
      }
      renderEmsLoadMore();
    } catch (e) {
      listEl.innerHTML = '<div style="padding:20px;color:#dc2626;">שגיאה בטעינה: ' + emsEsc(e.message) + '</div>';
    }
  }

  // Exact EMS enum values (lowercase, from the backend)
  const EMS_STATUS = {
    new:'🆕 חדשה', in_progress:'🔄 בטיפול', waiting_for_client:'⏳ ממתין ללקוח', on_hold:'⏸️ מוקפא',
    done:'✅ בוצע', rejected:'🚫 נדחה', not_relevant:'➖ לא רלוונטי', cancelled:'❌ בוטל'
  };
  const EMS_PRIORITY = { low:'🔵 נמוכה', normal:'🟡 רגילה', high:'🟠 גבוהה', urgent:'🔴 דחופה' };
  const EMS_TYPE     = { supplying_meters:'📦 אספקת מונים', fixing_fault:'🔧 תיקון תקלה', other:'📌 אחר' };
  const EMS_CLOSED   = ['done', 'rejected', 'not_relevant', 'cancelled'];
  function emsStatusLabel(s) { return EMS_STATUS[s] || s; }

  function renderEmsTaskCard(t) {
    const site     = t.site && t.site.name ? t.site.name : '—';
    const assignee = emsUserName(t.assignee);
    const due      = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toLocaleDateString('he-IL') : '';
    const overdue  = due && EMS_CLOSED.indexOf(t.status) === -1 && new Date(t.expectedCompletionDate) < new Date();
    return `
    <div class="ems-task-card priority-${t.priority} status-${t.status}" onclick="openEmsTask('${t.id}')" style="cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div style="font-weight:700;font-size:14px;color:var(--primary);flex:1;">${emsEsc(t.title)}</div>
        <div style="white-space:nowrap;">
          <span class="ems-badge status-${t.status}">${emsStatusLabel(t.status)}</span>
          <span class="ems-badge priority-${t.priority}">${EMS_PRIORITY[t.priority] || t.priority}</span>
        </div>
      </div>
      <div style="display:flex;gap:14px;font-size:12px;color:#64748b;flex-wrap:wrap;">
        <span>🏢 ${emsEsc(site)}</span>
        <span>${EMS_TYPE[t.type] || t.type}</span>
        <span>👤 ${emsEsc(assignee)}</span>
        ${due ? `<span style="color:${overdue ? '#dc2626' : 'inherit'}">${overdue ? '⚠️ פגר — ' : '📅 '}${due}</span>` : ''}
      </div>
    </div>`;
  }

  function renderEmsLoadMore() {
    const wrap = document.getElementById('emsLoadMoreWrap');
    if (!wrap) return;
    if (_emsPage * 50 < _emsTasksTotal) {
      wrap.innerHTML = `<button class="btn btn-secondary" onclick="_emsPage++; loadEmsTasks(true)">טען עוד</button>`;
    } else {
      wrap.innerHTML = _emsTasksTotal > 0
        ? `<div style="font-size:12px;color:#94a3b8;margin-top:8px;">סה"כ ${_emsTasksTotal} משימות</div>` : '';
    }
  }

  let _emsEditingId = null;
  function closeEmsModal() { document.getElementById('emsTaskModal').classList.remove('open'); }

  // Populate the site + assignee dropdowns (assignee may be empty if /users 403s)
  async function emsFillSiteAndAssignee(siteId, assigneeId) {
    const siteSel = document.getElementById('emsTaskSite');
    const asgSel  = document.getElementById('emsTaskAssignee');
    siteSel.innerHTML = '<option value="">⏳ טוען...</option>';
    asgSel.innerHTML  = '<option value="">⏳ טוען...</option>';
    const [sites, users] = await Promise.all([
      getEmsSites().catch(() => []),
      getEmsUsers().catch(() => [])
    ]);
    siteSel.innerHTML = '<option value="">-- בחר אתר --</option>' +
      sites.map(s => `<option value="${s.id}" ${s.id === siteId ? 'selected' : ''}>${emsEsc(s.name)}</option>`).join('');
    asgSel.innerHTML = '<option value="">-- ללא --</option>' +
      users.map(u => `<option value="${u.id}" ${u.id === assigneeId ? 'selected' : ''}>${emsEsc(emsUserName(u))}</option>`).join('');
  }

  async function emsCreateTaskModal(prefilledSiteId) {
    if (!isEmsConnected()) { alert('נא להתחבר ל-EMS תחילה'); return; }
    _emsEditingId = null;
    document.getElementById('emsTaskModalTitle').textContent = '📋 משימה חדשה ב-EMS';
    document.getElementById('emsTaskSaveBtn').textContent    = '💾 צור משימה';
    document.getElementById('emsTaskTitle').value    = '';
    document.getElementById('emsTaskDesc').value     = '';
    document.getElementById('emsTaskType').value     = 'supplying_meters';
    document.getElementById('emsTaskPriority').value = 'normal';
    document.getElementById('emsTaskDueDate').value  = '';
    document.getElementById('emsTaskStatusWrap').style.display = 'none';
    document.getElementById('emsTaskModal').classList.add('open');
    await emsFillSiteAndAssignee(prefilledSiteId || '', '');
  }

  // Open the EMS create-task modal from a kibbutz card, pre-selecting the matching site.
  // Update-tab EMS section (below status): show the open EMS task(s) to act on, or a
  // "create new" button. Both lead to the EMS login when not connected.
  function prepModalEmsSection(name) {
    const box = document.getElementById('modalEmsSection');
    if (!box) return;
    if (!(typeof canUseEms === 'function' && canUseEms())) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    const ids = (typeof kibbutzSiteIds === 'function') ? kibbutzSiteIds(name) : [];
    const tasks = ids.length ? emsCacheTasksForKibbutz(name) : [];
    // Full-width button when there's NO open task; small side bubble when a task exists.
    const newBtnFull = '<button type="button" onclick="createEmsTaskForKibbutz()" style="width:100%;margin-top:6px;background:#eff6ff;color:#1d4ed8;border:1px dashed #93c5fd;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;">➕ פתח משימה חדשה ב-EMS</button>';
    const newBubble = '<button type="button" onclick="createEmsTaskForKibbutz()" style="background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;border-radius:14px;padding:4px 11px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap;">➕ משימה חדשה</button>';
    if (tasks.length) {
      let h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">' +
              '<div style="font-size:13px;font-weight:800;color:#1e3a8a;">📋 משימת EMS פתוחה — לחץ לעדכון/תגובה:</div>' + newBubble + '</div>';
      tasks.forEach(t => { h += '<div class="card-ems-task status-' + t.status + '" onclick="emsModalTaskClick(\'' + t.id + '\')" style="cursor:pointer;margin:4px 0;"><span class="t-dot" style="background:' + (EMS_PRIORITY_DOT[t.priority] || '#94a3b8') + '"></span><span class="t-title">' + emsEsc(t.title) + '</span><span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span></div>'; });
      box.innerHTML = h;
    } else {
      box.innerHTML = newBtnFull;
    }
  }
  function emsModalTaskClick(id) {
    if (!isEmsConnected()) { closeModal({ target: { id: 'modalBackdrop' } }); showPage('ems'); emsToast('🔌 התחבר ל-EMS לעדכון המשימה'); return; }
    openEmsTask(id);   // full live detail + comments + status change
  }

  async function createEmsTaskForKibbutz() {
    const name = currentKibbutz;
    if (!isEmsConnected()) {   // not connected → send to the EMS login panel
      closeModal({ target: { id: 'modalBackdrop' } });
      showPage('ems');
      emsToast('🔌 התחבר ל-EMS כדי לפתוח משימה');
      return;
    }
    // ponytail: do NOT close the kibbutz modal — the EMS task modal (z-index 1160) stacks
    // on top of it (1000), so any unsaved card edits survive while creating the EMS task.
    let siteId = '';
    try { siteId = await emsSiteIdForKibbutz(name); } catch (e) { /* fall back to manual pick */ }
    await emsCreateTaskModal(siteId);
    if (!siteId) emsToast('⚠️ לא נמצא אתר EMS תואם ל"' + name + '" — בחר אתר ידנית');
  }

  async function emsEditTask(id) {
    const t = window._emsCurrentTask;
    if (!t || t.id !== id) return;
    document.getElementById('emsDetailModal').classList.remove('open');
    _emsEditingId = id;
    document.getElementById('emsTaskModalTitle').textContent = '✏️ עריכת משימה';
    document.getElementById('emsTaskSaveBtn').textContent    = '💾 שמור שינויים';
    document.getElementById('emsTaskTitle').value    = t.title || '';
    document.getElementById('emsTaskDesc').value     = t.description || '';
    document.getElementById('emsTaskType').value     = t.type || 'other';
    document.getElementById('emsTaskPriority').value = t.priority || 'normal';
    document.getElementById('emsTaskStatusWrap').style.display = '';
    document.getElementById('emsTaskStatus').value   = t.status || 'new';
    document.getElementById('emsTaskDueDate').value  = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toISOString().slice(0, 10) : '';
    document.getElementById('emsTaskModal').classList.add('open');
    await emsFillSiteAndAssignee(t.siteId || (t.site && t.site.id) || '', t.assigneeUserId || (t.assignee && t.assignee.id) || '');
  }

  // After any EMS write (create / edit / status change): re-pull the shared cache so the
  // kibbutz cards (which read the cache, not EMS live) reflect the change immediately.
  async function emsAfterWrite() {
    try { await emsSyncCache(); } catch (e) { console.warn('emsAfterWrite sync failed', e); }
    if (typeof applyCardEmsWidgets === 'function') applyCardEmsWidgets();
    if (typeof reorderCards === 'function') reorderCards();
    // If the kibbutz modal is still open (task created from a card), refresh its EMS section.
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop && backdrop.classList.contains('open') && currentKibbutz && typeof prepModalEmsSection === 'function') {
      prepModalEmsSection(currentKibbutz);
    }
  }

  async function saveEmsTask(btn) {
    const title  = document.getElementById('emsTaskTitle').value.trim();
    const siteId = document.getElementById('emsTaskSite').value;
    if (!title)  { alert('נא להזין כותרת'); return; }
    if (!siteId) { alert('נא לבחור אתר'); return; }
    setBtnLoading(btn, true);
    try {
      const body = {
        title,
        type:     document.getElementById('emsTaskType').value,
        priority: document.getElementById('emsTaskPriority').value,
        siteId
      };
      const desc     = document.getElementById('emsTaskDesc').value.trim();
      const due      = document.getElementById('emsTaskDueDate').value;
      const assignee = document.getElementById('emsTaskAssignee').value;
      if (desc)     body.description = desc;
      if (assignee) body.assigneeUserId = assignee;
      if (due)      body.expectedCompletionDate = new Date(due + 'T12:00:00').toISOString();
      let res;
      if (_emsEditingId) {
        body.status = document.getElementById('emsTaskStatus').value;
        res = await emsApi('/employee-tasks/' + _emsEditingId, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        res = await emsApi('/employee-tasks', { method: 'POST', body: JSON.stringify(body) });
      }
      if (res && res.id) {
        closeEmsModal();
        emsToast(_emsEditingId ? '✅ המשימה עודכנה' : '✅ המשימה נוצרה ב-EMS');
        if (document.getElementById('ems-view').style.display !== 'none') loadEmsTasks();
        emsAfterWrite();   // show the new/updated task on the kibbutz card immediately
      } else {
        alert('שגיאה: ' + (Array.isArray(res.message) ? res.message.join(', ') : (res.message || JSON.stringify(res))));
      }
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ---- Task detail (status change + comments + calendar) ----
  async function openEmsTask(id) {
    const modal = document.getElementById('emsDetailModal');
    document.getElementById('emsDetailContent').innerHTML = '⏳ טוען...';
    modal.classList.add('open');
    try {
      const t = await emsApi('/employee-tasks/' + id);
      renderEmsDetail(t);
      loadEmsComments(id);
    } catch (e) {
      document.getElementById('emsDetailContent').innerHTML = '<div style="color:#dc2626;padding:10px;">שגיאה: ' + e.message + '</div>';
    }
  }

  function emsCalendarLink(t) {
    const start = new Date(t.expectedCompletionDate);
    const end   = new Date(start.getTime() + 30 * 60000);
    const fmt   = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent('EMS: ' + (t.title || ''))
      + '&dates=' + fmt(start) + '/' + fmt(end)
      + '&details=' + encodeURIComponent('משימת EMS' + (t.site && t.site.name ? ' · ' + t.site.name : '') + ' · ' + (t.id || ''));
  }

  // Linked entities on an EMS task (e.g. meters). API may use camelCase or snake_case; ids may be a JSON string.
  function emsLinkIds(t){ var x = t && (t.linkedEntityIds || t.linked_entity_ids); if(!x) return []; if(typeof x==='string'){ try{ x=JSON.parse(x); }catch(e){ x=x.replace(/[\[\]"]/g,'').split(',').map(function(s){return s.trim();}).filter(Boolean); } } return Array.isArray(x)?x:[]; }
  function emsLinkLabel(type){ var m={meter:'מונים', site:'אתרים', consumer:'צרכנים', device:'מכשירים'}; return m[type] || type || 'ישויות'; }

  function renderEmsDetail(t) {
    window._emsCurrentTask = t;
    const site = t.site && t.site.name ? t.site.name : '—';
    const due  = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toLocaleDateString('he-IL') : '—';
    const statusOpts = Object.keys(EMS_STATUS).map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${EMS_STATUS[s]}</option>`).join('');
    const cal = t.expectedCompletionDate
      ? `<a href="${emsCalendarLink(t)}" target="_blank" rel="noopener" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;text-decoration:none;">📅 הוסף ליומן</a>` : '';
    document.getElementById('emsDetailContent').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <h3 style="margin:0;flex:1;color:var(--primary);">${emsEsc(t.title)}</h3>
        <button onclick="document.getElementById('emsDetailModal').classList.remove('open')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
        <span class="ems-badge priority-${t.priority}">${EMS_PRIORITY[t.priority] || t.priority}</span>
        <span class="ems-badge">${EMS_TYPE[t.type] || t.type}</span>
      </div>
      ${t.description ? `<div style="font-size:13px;color:#334155;background:#f8fafc;padding:8px 10px;border-radius:6px;margin:8px 0;white-space:pre-wrap;">${emsEsc(t.description)}</div>` : ''}
      <div style="font-size:13px;color:#475569;line-height:1.9;">🏢 אתר: ${emsEsc(site)}<br>👤 אחראי: ${emsEsc(emsUserName(t.assignee))}<br>📅 יעד: ${due}</div>
      ${(function(){var ids=emsLinkIds(t);return ids.length?'<div style="font-size:13px;color:#1e40af;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;margin:8px 0;">🔗 '+ids.length+' '+emsLinkLabel(t.linkType||t.link_type)+' משויכים למשימה</div>':'';})()}
      <div style="display:flex;gap:8px;align-items:center;margin:12px 0;flex-wrap:wrap;">
        <label style="margin:0;font-size:13px;font-weight:600;">סטטוס:</label>
        <select id="emsDetailStatus" onchange="changeEmsStatus('${t.id}', this.value)" style="flex:1;min-width:120px;">${statusOpts}</select>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="emsEditTask('${t.id}')">✏️ ערוך</button>
        ${cal}
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:10px 0;">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;">💬 תגובות</div>
      <div id="emsComments" style="max-height:30vh;overflow-y:auto;margin-bottom:8px;">⏳ טוען...</div>
      <div style="display:flex;gap:6px;">
        <input type="text" id="emsCommentInput" placeholder="כתוב תגובה..." style="flex:1;" onkeydown="if(event.key==='Enter')addEmsComment('${t.id}')">
        <button class="btn btn-primary" style="padding:8px 14px;" onclick="addEmsComment('${t.id}')">שלח</button>
      </div>`;
  }

  async function changeEmsStatus(id, status) {
    try {
      await emsApi('/employee-tasks/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      emsToast('✅ הסטטוס עודכן');
      if (window._emsCurrentTask && window._emsCurrentTask.id === id) window._emsCurrentTask.status = status;
      if (document.getElementById('ems-view').style.display !== 'none') loadEmsTasks();
      emsAfterWrite();   // reflect the new status on the kibbutz card (was the "can't update" bug)
    } catch (e) { alert('שגיאה: ' + e.message); }
  }

  async function loadEmsComments(id) {
    const el = document.getElementById('emsComments');
    if (!el) return;
    try {
      const res  = await emsApi('/employee-tasks/' + id + '/comments');
      const list = Array.isArray(res) ? res : (res.data || []);
      if (!list.length) { el.innerHTML = '<div style="font-size:12px;color:#94a3b8;font-style:italic;">אין תגובות עדיין</div>'; return; }
      el.innerHTML = list.map(c => {
        const when = c.createdAt ? new Date(c.createdAt).toLocaleString('he-IL') : '';
        return `<div style="background:#f1f5f9;border-radius:8px;padding:6px 10px;margin:4px 0;font-size:13px;"><div style="font-weight:600;color:#1e40af;font-size:11px;margin-bottom:2px;">${emsEsc(emsUserName(c.author))} · ${when}</div>${emsEsc(c.message)}</div>`;
      }).join('');
      el.scrollTop = el.scrollHeight;
    } catch (e) {
      el.innerHTML = '<div style="color:#dc2626;font-size:12px;">שגיאה בטעינת תגובות</div>';
    }
  }

  async function addEmsComment(id) {
    const input = document.getElementById('emsCommentInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    try {
      await emsApi('/employee-tasks/' + id + '/comments', { method: 'POST', body: JSON.stringify({ message: msg }) });
      loadEmsComments(id);
    } catch (e) { alert('שגיאה: ' + e.message); input.value = msg; }
  }

  function renderEmsPage() {
    const connected = isEmsConnected();
    document.getElementById('emsLoginPanel').style.display     = connected ? 'none' : '';
    document.getElementById('emsConnectedPanel').style.display = connected ? '' : 'none';
    if (!connected) {
      const urlEl = document.getElementById('emsUrlInput');
      if (urlEl && !urlEl.value) urlEl.value = getEmsUrl();
      return;
    }
    scheduleEmsExpiry();   // arm the 60-min auto-logout for a returning session
    emsPopulateSiteFilter();
    loadEmsTasks();
    emsOnConnected();      // once per session: flush queue + refresh shared cache
  }
