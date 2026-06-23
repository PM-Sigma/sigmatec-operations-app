  // ===========================================================
  // DEV TASKS (פיתוח) — read-only view of the GitHub tickets (Sigmatec-Energy/tasks),
  // for עידן + עמיחי only. Live via the `github` Edge Function (EMS-gated).
  //
  // DESIGN: centered column (.dev-wrap, max-width ~880px) — fixes the "smeared
  // edge-to-edge" look. 3-level hierarchy that reads at a glance via nested RAILS:
  //   📂 Topic  = native <details>; its body carries the strong accent rail (right, RTL).
  //   ↳ Sub-topic = bold header that OWNS its tasks via its OWN lighter rail, indented in.
  //   Task rows = flex-START (NOT space-between): RTL description starts hard at the right,
  //               muted meta (👤assignee, ✅, #ref ↗) flows inline immediately after it —
  //               the ticket number NEVER floats to the far edge.
  // #num = small grey GitHub REFERENCE (#123 ↗), obviously an id, not a priority.
  // Priority = OPTIONAL slot: rendered ONLY if a ticket actually sets one (0/100 today).
  // Keeps: topic jump chips · live search · open/all · "בפיתוח עכשיו" recent box.
  // ===========================================================
  function canSeeDevTasks() { return (typeof canManageStaff === 'function') && canManageStaff(); }
  window._devState = 'open';

  // priority is OPTIONAL — only called when t.priority is actually set, so no empty "—" chip.
  function devPriorityRank(p) {
    p = (p || '').trim();
    if (/גבוה|דחוף|critical|high|urgent/i.test(p)) return { label: 'גבוהה', cls: 'high' };
    if (/בינוני|medium|normal/i.test(p))           return { label: 'בינונית', cls: 'med' };
    if (/נמוך|low/i.test(p))                        return { label: 'נמוכה', cls: 'low' };
    return { label: p, cls: 'low' };
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

  // One compact task row, rendered as a link to the GitHub issue.
  // flex-START layout: description first (RTL → starts at the right), then muted meta
  // inline immediately after it. #ref is wrapped in <bdi dir="ltr"> so "#123 ↗" never
  // reorders against the surrounding Hebrew. Priority slot only present if t.priority set.
  function devTaskLine(t) {
    var pr = t.priority ? devPriorityRank(t.priority) : null;
    var closed = t.state === 'closed';
    var s = devEsc((t._p.topic + ' ' + t._p.sub + ' ' + t._p.desc + ' #' + t.number + ' ' + (t.assignee || '')).toLowerCase());
    return '<a class="dev-row" data-s="' + s + '" href="' + devEsc(t.url) + '" target="_blank" rel="noopener">' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        '<span class="dev-desc"><bdi>' + devEsc(t._p.desc) + '</bdi></span>' +
        '<span class="dev-meta">' +
          (t.assignee ? '<span class="dev-assignee" title="אחראי">👤&nbsp;<bdi>' + devEsc(t.assignee) + '</bdi></span>' : '') +
          (closed ? '<span class="dev-done" title="נסגר">✅</span>' : '') +
          '<span class="dev-ref" title="מספר טיקט ב-GitHub"><bdi dir="ltr">#' + devEsc(String(t.number)) + '</bdi> ↗</span>' +
        '</span>' +
      '</a>';
  }

  // A sub-topic block: bold ↳ header that OWNS its task rows via its own lighter rail.
  function devSubBlock(g, sub) {
    var rows = g.subs[sub].map(devTaskLine).join('');
    if (sub === '·') return '<div class="dev-sub dev-sub-bare">' + rows + '</div>';
    return '<div class="dev-sub">' +
      '<div class="dev-sub-head">' +
        '<span class="dev-sub-mark" aria-hidden="true">↳</span>' +
        '<span class="dev-sub-name"><bdi>' + devEsc(sub) + '</bdi></span>' +
        '<span class="dev-sub-n">' + g.subs[sub].length + '</span>' +
      '</div>' +
      '<div class="dev-sub-tasks">' + rows + '</div>' +
      '</div>';
  }

  async function renderDevTasks() {
    var el = document.getElementById('devTasksContent');
    if (!el) return;
    if (!canSeeDevTasks()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }
    el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען משימות מ-GitHub…</div></div>';
    var tasks;
    try { tasks = await devFetchTasks(window._devState); }
    catch (e) {
      el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ ' + devEsc(e.message) + '</div></div>';
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
    var active = function (s) { return window._devState === s ? ' active' : ''; };
    var head = '<div class="dev-toolbar">' +
      '<div class="dev-counts"><strong>' + tasks.length + '</strong> משימות' +
        '<span class="dev-counts-sub">· ' + topicNames.length + ' נושאים</span></div>' +
      '<input id="devSearch" class="dev-search" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" inputmode="search">' +
      '<div class="dev-state-btns">' +
        '<button class="inv-btn small' + active('open') + '" onclick="devSetState(\'open\')">פתוחות</button>' +
        '<button class="inv-btn small' + active('all') + '" onclick="devSetState(\'all\')">הכל</button>' +
        '<button class="inv-btn small" onclick="renderDevTasks()">🔄 רענן</button>' +
      '</div>' +
    '</div>';

    // topic "jump" chips — click to open that topic + scroll to it
    var chips = '<div class="dev-chips">' +
      topicNames.map(function (topic, i) {
        return '<button class="dev-chip" onclick="devJump(' + i + ')">📂 <bdi>' +
          devEsc(topic) + '</bdi><span class="dev-chip-n">' + groups[topic].n + '</span></button>';
      }).join('') + '</div>';

    // "בפיתוח עכשיו" — open tickets, freshest activity first
    var recent = tasks.filter(function (t) { return t.state !== 'closed'; })
      .slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); })
      .slice(0, 6);
    var ipBox = recent.length ? '<div class="card dev-now">' +
      '<h3 class="dev-now-head">🔨 בפיתוח עכשיו <span class="dev-now-sub">· פעילות אחרונה</span></h3>' +
      '<div class="dev-now-list">' + recent.map(devTaskLine).join('') + '</div></div>' : '';

    // collapsible topic groups (native <details>); first one open for immediate content.
    var body = topicNames.map(function (topic, i) {
      var g = groups[topic];
      var subNames = Object.keys(g.subs).sort(function (a, b) { return g.subs[b].length - g.subs[a].length; });
      var inner = subNames.map(function (sub) { return devSubBlock(g, sub); }).join('');
      return '<details id="dtopic-' + i + '" class="dev-topic"' + (i === 0 ? ' open' : '') + '>' +
        '<summary class="dev-topic-sum">' +
          '<span class="dev-topic-ico" aria-hidden="true">📂</span>' +
          '<span class="dev-topic-name"><bdi>' + devEsc(topic) + '</bdi></span>' +
          '<span class="dev-topic-n">' + g.n + '</span>' +
          '<span class="dev-topic-caret" aria-hidden="true">⌄</span>' +
        '</summary>' +
        '<div class="dev-topic-body">' + inner + '</div>' +
      '</details>';
    }).join('');

    el.innerHTML = '<div class="dev-wrap">' + head + chips + ipBox +
      (tasks.length ? body : '<div class="dev-empty">אין משימות להצגה.</div>') + '</div>';
  }

  // jump to a topic from a chip: open it + scroll into view
  window.devJump = function (i) {
    var d = document.getElementById('dtopic-' + i);
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // live filter: hide non-matching rows, then collapse empty sub-blocks + topics
  window.devFilter = function (q) {
    q = (q || '').trim().toLowerCase();
    document.querySelectorAll('#devTasksContent .dev-row').forEach(function (r) {
      var hit = !q || (r.getAttribute('data-s') || '').indexOf(q) !== -1;
      r.style.display = hit ? '' : 'none';
    });
    // collapse sub-topic blocks that have no visible rows (no dangling header)
    document.querySelectorAll('#devTasksContent .dev-sub').forEach(function (sb) {
      var any = Array.prototype.some.call(sb.querySelectorAll('.dev-row'), function (r) { return r.style.display !== 'none'; });
      sb.style.display = any ? '' : 'none';
    });
    // collapse topics with no visible rows; auto-open matching ones while searching
    document.querySelectorAll('#devTasksContent .dev-topic').forEach(function (d) {
      var any = Array.prototype.some.call(d.querySelectorAll('.dev-row'), function (r) { return r.style.display !== 'none'; });
      d.style.display = any ? '' : 'none';
      if (q) d.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; renderDevTasks(); };
  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
