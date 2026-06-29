  // ========================================
  // Edit modal logic
  // ========================================

  function switchTab(tabName) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabName));
  }

  // ===========================================================
  // INVENTORY MANAGEMENT
  // ===========================================================
  const INV_LOCATIONS = ['עמיחי', 'אביאם', 'ניתאי', 'משרד'];
  const STOCK_HOLDERS = ['עמיחי', 'אביאם', 'ניתאי']; // אנשים שמחזיקים מלאי אישי (משרד הוא ברירת מחדל ליתר)
  const DEFECTIVE_LOCATION = 'תקול';                  // defective bucket — returns land here, not back in available stock
  const NON_KIBBUTZ_LOCATIONS = INV_LOCATIONS.concat([DEFECTIVE_LOCATION]); // excluded from the "stock at kibbutzim" matrix
  const ORDER_STATUSES = {
    pending_approval: { label: '🟣 ממתינה לאישור',     color: '#7c3aed' },
    pending:    { label: '🔴 ממתין להזמנה',          color: '#dc2626' },
    in_transit: { label: '🔵 בדרך',                   color: '#2563eb' },
    stuck:      { label: '🟠 תקוע',                   color: '#f97316' },
    at_port:    { label: '🟡 בנמל',                   color: '#eab308' },
    arrived:    { label: '🌸 הגיעה (טרם חולקה)',     color: '#f9a8d4' },
    delivered:  { label: '🟢 סופקה וחולקה',           color: '#10b981' },
    supplied:   { label: '🟢 סופק ללקוח',             color: '#059669' }
  };

  function showPage(page) {
    if (page === 'attendance' && !canSeeAttendance()) page = 'kibbutz'; // private to Aviam/Idan
    if (page === 'ems' && !canUseEms()) page = 'kibbutz';               // EMS tasks — עידן/ניתאי/אביאם
    if (page === 'staff' && typeof canManageStaff === 'function' && !canManageStaff()) page = 'kibbutz'; // עידן + עמיחי only
    if (page === 'inventory' && getCurrentUser() === 'מתניה') page = 'kibbutz'; // מתניה doesn't handle inventory
    if (page === 'dev' && !(typeof canSeeDevTasks === 'function' && canSeeDevTasks())) page = 'kibbutz'; // עידן + עמיחי only
    window._currentPage = page;   // remembered so a forced EMS re-login can return here afterwards
    document.getElementById('kibbutz-view').style.display    = page === 'kibbutz'    ? '' : 'none';
    document.getElementById('inventory-view').style.display  = page === 'inventory'  ? '' : 'none';
    document.getElementById('attendance-view').style.display = page === 'attendance' ? '' : 'none';
    document.getElementById('ems-view').style.display        = page === 'ems'        ? '' : 'none';
    document.getElementById('my-tasks-view').style.display   = page === 'mytasks'    ? '' : 'none';
    document.getElementById('calendar-view').style.display   = page === 'calendar'   ? '' : 'none';
    var _sv = document.getElementById('staff-view'); if (_sv) _sv.style.display = page === 'staff' ? '' : 'none';
    var _dv = document.getElementById('dev-view'); if (_dv) _dv.style.display = page === 'dev' ? '' : 'none';
    document.querySelectorAll('.page-nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    if (page === 'inventory')  renderInventory();
    if (page === 'attendance') renderAttendanceReport();
    if (page === 'ems')        renderEmsPage();
    if (page === 'mytasks')    renderMyTasks();
    if (page === 'calendar')   renderCompanyCalendar();
    if (page === 'staff' && typeof renderStaff === 'function') renderStaff();
    if (page === 'dev' && typeof renderDevTasks === 'function') renderDevTasks();
    const fab = document.getElementById('visitFab');
    if (fab) {
      const meF = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
      const isField = (typeof ATT_PEOPLE !== 'undefined' && ATT_PEOPLE.indexOf(meF) !== -1);
      fab.style.display = (page === 'kibbutz' && isField) ? '' : 'none';   // field staff (אביאם/ניתאי) only — office users don't log visits
      fab.textContent = '📋 תיעוד נוכחות';
    }
  }

  // ===== Attendance missing-days reminder (אביאם / ניתאי) =====
  // Workdays (Sun–Thu) in the last 31 calendar days, floored at 2026-05-31 (tracking start),
  // up to yesterday, with NO visit AND NO attendance entry for the person → animated popup
  // next time THEY open the app. Pops for אביאם and ניתאי, each for their own missing days.
  const ATT_REMINDER_FLOOR = new Date(2026, 4, 31);   // 31.05.2026 inclusive
  function personMissingDays(person) {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const logged = new Set();
    (window.SHEET_DATA?.visits || []).filter(v => v.visitor === person)
      .forEach(v => { if (v.date) logged.add(ymd(new Date(v.date))); });
    (window.SHEET_DATA?.attendance || []).filter(a => a.person === person)
      .forEach(a => { if (a.date) logged.add(ymd(new Date(a.date))); });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const floor = new Date(ATT_REMINDER_FLOOR); floor.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - 31);   // last 31 days
    if (start < floor) start.setTime(floor.getTime());                    // never before tracking start
    const missing = [];
    for (const d = new Date(start); d < today; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();               // 0=Sun … 5=Fri, 6=Sat
      if (dow === 5 || dow === 6) continue; // Israeli weekend
      if (!logged.has(ymd(d))) missing.push(new Date(d));
    }
    return missing.sort((a, b) => a - b);
  }
  function maybeShowAttendanceReminder() {
    const me = getCurrentUser();
    if (ATT_PEOPLE.indexOf(me) === -1) return;   // only אביאם / ניתאי
    if (window._attReminderShown) return;        // once per session
    const missing = personMissingDays(me);
    if (!missing.length) return;
    const head = document.getElementById('aviamReminderHead');
    if (head) head.textContent = me + ', חסר תיעוד!';
    document.getElementById('aviamReminderList').innerHTML = missing
      .map(d => d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }))
      .join('<br>');
    document.getElementById('aviamReminderModal').classList.add('open');
    window._attReminderShown = true;
  }

  // ===== Quick attendance/visit FAB =====
  // אביאם/ניתאי get the full attendance flow: date → day type → (field only) kibbutz.
  // Everyone else gets the plain "pick a kibbutz → visit form".
  function openVisitQuick() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    const isAtt = ATT_PEOPLE.indexOf(me) !== -1;
    const sel = document.getElementById('visitQuickKibbutz');
    const names = Array.from(document.querySelectorAll('.kibbutz'))
      .map(c => c.dataset.name).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'));
    const last = localStorage.getItem('last_visit_kibbutz') || '';
    sel.innerHTML = '<option value="">-- בחר קיבוץ --</option>' +
      names.map(n => `<option value="${n}" ${n === last ? 'selected' : ''}>${n}</option>`).join('');
    const dateEl = document.getElementById('vqDate'); if (dateEl) dateEl.value = todayYmd();
    document.getElementById('vqTitle').textContent = isAtt ? '📋 תיעוד נוכחות' : '📍 תיעוד ביקור מהיר';
    document.getElementById('vqSub').textContent = isAtt
      ? 'בחר תאריך וסוג יום. ביום שטח גם תבחר קיבוץ ויפתח טופס ביקור.'
      : 'בחר קיבוץ ונפתח לך ישר את טופס הביקור.';
    document.getElementById('vqDayTypes').style.display = isAtt ? '' : 'none';
    window._vqType = 'field';
    vqSetType('field');
    document.getElementById('visitQuickModal').classList.add('open');
  }
  // Make the "תיעוד ביקור" FAB free-draggable; position persisted per device. A small move threshold keeps
  // a tap = open the form, a drag = reposition. ponytail: native pointer events, no library.
  function initVisitFabDrag() {
    var fab = document.getElementById('visitFab');
    if (!fab || fab._dragInit) return; fab._dragInit = true;
    fab.style.touchAction = 'none';                          // don't scroll the page while dragging on touch
    var KEY = 'visit_fab_pos_v1';
    function place(x, y) {
      var r = fab.getBoundingClientRect(), w = r.width || 150, h = r.height || 50, m = 6;
      x = Math.max(m, Math.min(x, window.innerWidth - w - m));
      y = Math.max(m, Math.min(y, window.innerHeight - h - m));
      fab.style.setProperty('left', x + 'px', 'important');  // beat the mobile `#visitFab{left:16px!important}`
      fab.style.setProperty('top', y + 'px', 'important');
      fab.style.setProperty('bottom', 'auto', 'important');
    }
    try { var p = JSON.parse(localStorage.getItem(KEY) || 'null'); if (p && isFinite(p.x) && isFinite(p.y)) place(p.x, p.y); } catch (e) {}
    var down = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    fab.addEventListener('pointerdown', function (e) {
      down = true; moved = false; sx = e.clientX; sy = e.clientY;
      var r = fab.getBoundingClientRect(); ox = r.left; oy = r.top;
      try { fab.setPointerCapture(e.pointerId); } catch (e2) {}
    });
    fab.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return; // below threshold → still a tap
      moved = true; place(ox + dx, oy + dy);
    });
    function end(e) {
      if (!down) return; down = false;
      if (moved) { var r = fab.getBoundingClientRect(); try { localStorage.setItem(KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (e2) {} }
      try { fab.releasePointerCapture(e.pointerId); } catch (e2) {}
    }
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
    // open on a real tap only; a drag sets moved=true → suppress (covers mouse click + keyboard Enter)
    fab.removeAttribute('onclick');
    fab.addEventListener('click', function () { if (!moved) openVisitQuick(); moved = false; });
    window.addEventListener('resize', function () { var r = fab.getBoundingClientRect(); place(r.left, r.top); });   // keep on-screen after rotate/resize
  }
  if (document.readyState !== 'loading') initVisitFabDrag();
  else document.addEventListener('DOMContentLoaded', initVisitFabDrag);

  function vqSetType(type) {
    window._vqType = type;
    document.querySelectorAll('.vq-dt').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    document.getElementById('vqOtherWrap').style.display = (type === 'other') ? '' : 'none';
    document.getElementById('vqKibbutzWrap').style.display = (type === 'field') ? '' : 'none';   // kibbutz only for field days
  }
  function visitQuickGo() {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    const isAtt = ATT_PEOPLE.indexOf(me) !== -1;
    const type = isAtt ? (window._vqType || 'field') : 'field';
    const dateVal = document.getElementById('vqDate').value;
    if (!dateVal) { alert('נא לבחור תאריך'); return; }
    const isoDate = new Date(dateVal + 'T12:00:00').toISOString();

    // אביאם/ניתאי, non-field day → save attendance directly (no kibbutz needed)
    if (isAtt && type !== 'field') {
      const note = (type === 'other') ? (document.getElementById('vqOther').value || '').trim() : '';
      if (type === 'other' && !note) { alert('נא לפרט מה היה ביום (אחר)'); return; }
      fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'attendance', person: me, dayType: type, note, date: isoDate }) })
        .then(r => r.json()).then(res => {
          if (res && res.ok) {
            if (window.SHEET_DATA) {
              window.SHEET_DATA.attendance = window.SHEET_DATA.attendance || [];
              window.SHEET_DATA.attendance.push({ id: res.id, person: me, dayType: type, note, date: isoDate });
            }
            const t = document.getElementById('toast');
            t.textContent = '✅ ' + ATT_LABELS[type] + (note ? ' (' + note + ')' : '') + ' נשמר';
            t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
            const av = document.getElementById('attendance-view');
            if (av && av.style.display !== 'none') renderAttendanceReport();
          } else { alert('שגיאה בשמירה'); }
        }).catch(() => alert('שגיאה בשמירה'));
      document.getElementById('visitQuickModal').classList.remove('open');
      return;
    }

    // Field day (or non-attendance user) → open the visit form for the chosen kibbutz
    const name = document.getElementById('visitQuickKibbutz').value;
    if (!name) { alert('נא לבחור קיבוץ'); return; }
    const card = document.querySelector('.kibbutz[data-name="' + name + '"]');
    if (!card) { alert('קיבוץ לא נמצא'); return; }
    document.getElementById('visitQuickModal').classList.remove('open');
    openEditModal(card);
    switchTab('visit');
    const visitorSel = document.getElementById('visitor');
    if (visitorSel && me) { visitorSel.value = me; if (typeof onVisitorChange === 'function') onVisitorChange(me); }
    if (isAtt && typeof setAviamDayType === 'function') setAviamDayType('field');
    const vd = document.getElementById('visitDate'); if (vd) vd.value = dateVal;
  }

  function invShowTab(tab) {
    document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.invTab === tab));
    document.querySelectorAll('.inv-section').forEach(s => s.classList.toggle('active', s.id === 'inv-section-' + tab));
    renderInventory();
  }

  function renderInventory() {
    invRenderOrders();
    invRenderStock();
    invRenderKibbutzInventory();
    invRenderReturns();
    invRenderProducts();
    if (typeof renderLowStockAlert === 'function') renderLowStockAlert();
  }

