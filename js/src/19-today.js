  // ===========================================================
  // TODAY (היום) — morning briefing landing page. Pure client-side: aggregates data
  // already loaded (orders / low-stock / EMS tasks / kibbutz pipeline) into one
  // "what needs me now" screen. Role-aware. No backend, no secrets.
  //
  // Landing logic (landOnStartPage, called once from refreshData): reopen the last
  // page within the same day; on a NEW day, open "היום" as the morning briefing.
  // ===========================================================
  function todayEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function todayGreeting() { var h = new Date().getHours(); return h < 12 ? 'בוקר טוב' : (h < 18 ? 'צהריים טובים' : 'ערב טוב'); }

  // navigate from a today-card row (optionally into an inventory sub-tab)
  window.todayGo = function (page, tab) {
    if (typeof showPage !== 'function') return;
    showPage(page);
    if (tab && typeof invShowTab === 'function') setTimeout(function () { invShowTab(tab); }, 150);
  };

  function renderToday() {
    var el = document.getElementById('todayContent');
    if (!el) return;
    var me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    var dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

    // ---- "דורש טיפול" — approvals I can act on + low stock relevant to me ----
    var actions = [];
    var orders = (window.SHEET_DATA && window.SHEET_DATA.orders) || [];
    var canApprove = (typeof canApproveOrders === 'function') && canApproveOrders();
    var pendingApproval = orders.filter(function (o) { return o.status === 'pending_approval'; });
    if (canApprove && pendingApproval.length) {
      actions.push({ icon: '🟣', text: pendingApproval.length + ' הזמנות ממתינות לאישורך', onclick: "todayGo('inventory')" });
    }
    var ls = (typeof lowStockReport === 'function') ? lowStockReport() : { meters: [], sims: [] };
    if (me === 'אביאם' || me === 'עמיחי') ls.meters.forEach(function (m) {
      actions.push({ icon: '🔴', text: m.label + ': נותרו ' + m.total + ' (קו אדום ' + m.min + ')', onclick: "todayGo('inventory','stock')" });
    });
    ls.sims.forEach(function (s) {
      if (s.person === me || me === 'אביאם') actions.push({ icon: '🔴', text: s.type + ' אצל ' + s.person + ': נותרו ' + s.qty + ' (קו אדום ' + s.min + ')', onclick: "todayGo('inventory','stock')" });
    });

    // ---- "המשימות שלי" — EMS open tasks assigned to me (full list lives on the משימות page) ----
    var emsTasks = (typeof emsCacheData === 'function' ? emsCacheData().tasks : []) || [];
    var closed = (typeof EMS_CLOSED !== 'undefined') ? EMS_CLOSED : [];
    var myEms = emsTasks.filter(function (t) {
      return closed.indexOf(t.status) === -1 && t.assignee && typeof emsUserName === 'function' && emsUserName(t.assignee).indexOf(me) !== -1;
    });

    // ---- "סטטוס הקמה" — kibbutz pipeline counts (from the home grids) ----
    var grid = function (id) { var g = document.getElementById(id); return g ? g.querySelectorAll('.kibbutz').length : 0; };
    var pipe = [
      { n: grid('grid-done'),       l: 'עלו לאוויר',  k: '#0e9f6e' },
      { n: grid('grid-priority'),   l: 'בעדיפות',     k: '#d64545' },
      { n: grid('grid-new_client'), l: 'בהקמה',       k: '#7c5cdb' },
      { n: grid('grid-pending'),    l: 'ממתינים',     k: '#c87f0a' }
    ];

    // ---- build ----
    var hero = '<div class="today-hero"><div class="today-hero-greet">🌅 ' + todayEsc(todayGreeting()) +
      (me ? ', <bdi>' + todayEsc(me) + '</bdi>' : '') + '</div><div class="today-hero-date">' + todayEsc(dateStr) + '</div></div>';

    var actionCard = '<div class="today-card today-card-alert"><div class="today-card-head">🔴 דורש טיפול</div>' +
      (actions.length
        ? '<div class="today-rows">' + actions.map(function (a) {
            return '<button class="today-row" onclick="' + a.onclick + '"><span class="today-row-ico">' + a.icon + '</span><span class="today-row-text">' + todayEsc(a.text) + '</span><span class="today-row-go">‹</span></button>';
          }).join('') + '</div>'
        : '<div class="today-clear">הכול נקי ✨</div>') +
      '</div>';

    var tasksCard = '<div class="today-card"><div class="today-card-head">✅ המשימות שלי</div>' +
      '<button class="today-bignum-row" onclick="todayGo(\'mytasks\')"><span class="today-bignum">' + myEms.length + '</span>' +
      '<span class="today-bignum-lbl">' + (myEms.length ? 'משימות EMS פתוחות עליך · פתח את כל המשימות ‹' : 'אין משימות EMS פתוחות 🎉 · פתח את המשימות ‹') + '</span></button>' +
      (myEms.length ? '<div class="today-rows">' + myEms.slice(0, 4).map(function (t) {
          return '<button class="today-row" onclick="if(typeof openKibbutzEmsTask===\'function\')openKibbutzEmsTask(\'' + todayEsc(String(t.id)) + '\')"><span class="today-row-ico">📋</span><span class="today-row-text">' + todayEsc(t.title) + '</span><span class="today-row-go">‹</span></button>';
        }).join('') + '</div>' : '') +
      '</div>';

    var pipeCard = '<div class="today-card"><div class="today-card-head">🚦 סטטוס הקמה</div>' +
      '<div class="today-pipe">' + pipe.map(function (p) {
        return '<button class="today-stat" style="--k:' + p.k + '" onclick="todayGo(\'kibbutz\')"><span class="today-stat-n">' + p.n + '</span><span class="today-stat-l">' + p.l + '</span></button>';
      }).join('') + '</div></div>';

    el.innerHTML = '<div class="today-wrap">' + hero + actionCard + tasksCard + pipeCard + '</div>';
  }

  // One-time startup landing: same day → reopen last page; new day → "היום" briefing.
  function landOnStartPage() {
    try {
      var today = new Date().toISOString().slice(0, 10);
      var lastDate = localStorage.getItem('last_open_date_v1') || '';
      var lastPage = localStorage.getItem('last_page_v1') || '';
      var target = (lastDate === today && lastPage) ? lastPage : 'today';
      if (typeof showPage === 'function') showPage(target);
    } catch (e) { if (typeof showPage === 'function') showPage('today'); }
  }

  window.renderToday = renderToday;
  window.landOnStartPage = landOnStartPage;
