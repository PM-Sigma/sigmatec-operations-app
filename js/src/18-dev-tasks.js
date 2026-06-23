  // ===========================================================
  // DEV TASKS (פיתוח) — read-only view of the GitHub tickets (Sigmatec-Energy/tasks),
  // for עידן + עמיחי only. Live via the `github` Edge Function (EMS-gated).
  // Navigation: topic chips (jump+open) · collapsible topic groups (<details>) · search ·
  // "בפיתוח עכשיו" (open tickets by most-recent activity). View first; editing later.
  // ===========================================================
  function canSeeDevTasks() { return (typeof canManageStaff === 'function') && canManageStaff(); }
  window._devState = 'open';

  function devPriorityRank(p) {
    p = (p || '').trim();
    if (/גבוה|דחוף|critical|high|urgent/i.test(p)) return { r: 0, label: 'גבוהה', color: '#dc2626', bg: '#fee2e2' };
    if (/בינוני|medium|normal/i.test(p))           return { r: 1, label: 'בינונית', color: '#b45309', bg: '#fef3c7' };
    if (/נמוך|low/i.test(p))                        return { r: 2, label: 'נמוכה', color: '#475569', bg: '#f1f5f9' };
    return { r: 3, label: p || '—', color: '#64748b', bg: '#f8fafc' };
  }
  function devEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function devFetchTasks(state) {
    var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
    if (!tok) throw new Error('יש להתחבר ל-EMS כדי לראות משימות פיתוח');
    var r = await fetch(SB_URL + '/functions/v1/github', {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, state: state || 'open' })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ('github ' + r.status));
    return d.tasks || [];
  }

  // tickets carry no labels — the title encodes "נושא | תת-נושא | תיאור"
  function devParseT(title) {
    var parts = String(title || '').split(/\s*\|\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length >= 3) return { topic: parts[0], sub: parts[1], desc: parts.slice(2).join(' · ') };
    if (parts.length === 2) return { topic: parts[0], sub: '', desc: parts[1] };
    return { topic: 'אחר', sub: '', desc: parts[0] || String(title || '') };
  }

  function devTaskLine(t) {
    var pr = t.priority ? devPriorityRank(t.priority) : null;
    var closed = t.state === 'closed' ? '<span style="font-size:11px;color:#065f46;background:#d1fae5;border-radius:6px;padding:1px 6px;white-space:nowrap;">✅</span>' : '';
    var s = devEsc((t._p.topic + ' ' + t._p.sub + ' ' + t._p.desc + ' #' + t.number + ' ' + (t.assignee || '')).toLowerCase());
    return '<div class="dev-row" data-s="' + s + '" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #f1f5f9;font-size:13px;">' +
      (pr ? '<span style="font-size:11px;font-weight:700;color:' + pr.color + ';background:' + pr.bg + ';border-radius:6px;padding:1px 7px;white-space:nowrap;">' + pr.label + '</span>' : '') +
      '<a href="' + devEsc(t.url) + '" target="_blank" rel="noopener" style="flex:1;color:#1e293b;text-decoration:none;">' + devEsc(t._p.desc) + ' <span style="color:#94a3b8;">#' + t.number + '</span></a>' +
      (t.assignee ? '<span style="font-size:11px;color:#64748b;white-space:nowrap;">👤 ' + devEsc(t.assignee) + '</span>' : '') +
      closed +
      '</div>';
  }

  async function renderDevTasks() {
    var el = document.getElementById('devTasksContent');
    if (!el) return;
    if (!canSeeDevTasks()) { el.innerHTML = '<div style="color:#991b1b;">אין הרשאה לעמוד זה.</div>'; return; }
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#64748b;">⏳ טוען משימות מ-GitHub…</div>';
    var tasks;
    try { tasks = await devFetchTasks(window._devState); }
    catch (e) {
      el.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;color:#991b1b;">⚠️ ' + devEsc(e.message) + '</div>';
      return;
    }

    tasks.forEach(function (t) { t._p = devParseT(t.title); });
    var groups = {};
    tasks.forEach(function (t) {
      var g = (groups[t._p.topic] = groups[t._p.topic] || { n: 0, subs: {} });
      g.n++;
      var key = t._p.sub || '·';
      (g.subs[key] = g.subs[key] || []).push(t);
    });
    var topicNames = Object.keys(groups).sort(function (a, b) { return groups[b].n - groups[a].n; });

    // toolbar: counts + search + open/all + refresh
    var active = function (s) { return window._devState === s ? 'style="background:#1e40af;color:#fff;border-color:#1e40af;"' : ''; };
    var head = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px;">' +
      '<strong>' + tasks.length + ' משימות</strong>' +
      '<span style="color:#64748b;">· ' + topicNames.length + ' נושאים</span>' +
      '<span style="flex:1;"></span>' +
      '<input id="devSearch" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" style="padding:5px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;min-width:150px;">' +
      '<button class="inv-btn small" onclick="devSetState(\'open\')" ' + active('open') + '>פתוחות</button>' +
      '<button class="inv-btn small" onclick="devSetState(\'all\')" ' + active('all') + '>הכל</button>' +
      '<button class="inv-btn small" onclick="renderDevTasks()">🔄 רענן</button>' +
      '</div>';

    // topic chips — click to jump + open that topic
    var chips = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      topicNames.map(function (topic, i) {
        return '<button class="inv-btn small" onclick="devJump(' + i + ')" style="font-size:12px;">📂 ' +
          devEsc(topic) + ' <span style="color:#94a3b8;">' + groups[topic].n + '</span></button>';
      }).join('') + '</div>';

    // "בפיתוח עכשיו" — open tickets, freshest activity first (updatedAt; falls back to feed order)
    var recent = tasks.filter(function (t) { return t.state !== 'closed'; })
      .slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); })
      .slice(0, 6);
    var ipBox = recent.length ? '<div class="card" style="margin-bottom:14px;border-right:3px solid #1e40af;">' +
      '<h3 style="margin:0 0 4px;">🔨 בפיתוח עכשיו <span style="font-size:12px;color:#64748b;font-weight:400;">· פעילות אחרונה</span></h3>' +
      recent.map(devTaskLine).join('') + '</div>' : '';

    // collapsible topic groups (native <details>); first one open for immediate content
    var body = topicNames.map(function (topic, i) {
      var g = groups[topic];
      var subNames = Object.keys(g.subs).sort(function (a, b) { return g.subs[b].length - g.subs[a].length; });
      var inner = subNames.map(function (sub) {
        var label = sub === '·' ? '' : '<div style="font-size:12px;font-weight:700;color:#475569;margin:8px 0 2px;">↳ ' + devEsc(sub) + '</div>';
        return label + g.subs[sub].map(devTaskLine).join('');
      }).join('');
      return '<details id="dtopic-' + i + '" class="dev-topic" style="margin-bottom:10px;"' + (i === 0 ? ' open' : '') + '>' +
        '<summary style="cursor:pointer;font-weight:700;font-size:15px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">📂 ' +
        devEsc(topic) + ' <span style="font-size:12px;color:#64748b;font-weight:400;">(' + g.n + ')</span></summary>' +
        '<div style="padding:4px 12px 2px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' + inner + '</div>' +
        '</details>';
    }).join('');

    el.innerHTML = head + chips + ipBox + (tasks.length ? body : '<div style="padding:24px;text-align:center;color:#64748b;">אין משימות להצגה.</div>');
  }

  // jump to a topic from a chip: open it + scroll into view
  window.devJump = function (i) {
    var d = document.getElementById('dtopic-' + i);
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // live filter: hide non-matching rows, hide/expand topics accordingly
  window.devFilter = function (q) {
    q = (q || '').trim().toLowerCase();
    document.querySelectorAll('#devTasksContent .dev-row').forEach(function (r) {
      var hit = !q || (r.getAttribute('data-s') || '').indexOf(q) !== -1;
      r.style.display = hit ? '' : 'none';
    });
    document.querySelectorAll('#devTasksContent .dev-topic').forEach(function (d) {
      var any = Array.prototype.some.call(d.querySelectorAll('.dev-row'), function (r) { return r.style.display !== 'none'; });
      d.style.display = any ? '' : 'none';
      if (q) d.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; renderDevTasks(); };
  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
