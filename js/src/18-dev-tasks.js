  // ===========================================================
  // DEV TASKS (פיתוח) — read-only view of the GitHub tickets (Sigmatec-Energy/tasks),
  // for עידן + עמיחי only. Live via the `github` Edge Function (EMS-gated).
  //
  // TREE (native <details>, 3 levels):
  //   📂 Topic  →  אב Parent (sub-topic; click = show/hide children)  →  בן Task (click = show detail)
  // Parent grouping: key = sub (3-part "T|S|D") OR desc (2-part "T|S"). A group containing any 3-part
  // ticket renders as a collapsible אב; a 2-part-only group renders as a leaf task. Parents/leaves are
  // sorted A→Z (Hebrew) so near-identical names cluster (e.g. "ייצוא אקסל" next to "ייצוא לאקסל").
  // GitHub = explicit icon button (does NOT toggle the row / is not the default action).
  // Detail = state/assignee/priority/dates + body (body needs the github fn redeploy to appear).
  // ===========================================================
  function canSeeDevTasks() { return (typeof canManageStaff === 'function') && canManageStaff(); }
  window._devState = 'open';

  var DEV_GH = '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

  function devPriorityRank(p) {
    p = (p || '').trim();
    if (/קריטי|דחוף|critical|urgent/i.test(p))      return { label: 'קריטי', cls: 'high' };
    if (/גבוה|high/i.test(p))                       return { label: 'גבוהה', cls: 'high' };
    if (/בינוני|medium|normal/i.test(p))           return { label: 'בינונית', cls: 'med' };
    if (/נמוך|low/i.test(p))                        return { label: 'נמוכה', cls: 'low' };
    return { label: p, cls: 'low' };
  }
  // Priority is shown if the ticket sets one — from the body "## עדיפות" (t.priority) OR a GitHub
  // LABEL whose name contains a priority keyword. No labels exist yet (0/100); the moment one is
  // added (e.g. "דחוף" / "בינוני" / "נמוך"), the chip appears — no function redeploy needed.
  function devPriority(t) {
    if (t.priority) return devPriorityRank(t.priority);
    var labs = t.labels || [];
    for (var i = 0; i < labs.length; i++) {
      var L = String(labs[i]);
      if (/קריטי|דחוף|critical|urgent/i.test(L)) return { label: 'קריטי', cls: 'high' };
      if (/גבוה|high|🔴/i.test(L)) return { label: 'גבוהה', cls: 'high' };
      if (/בינוני|medium|normal|🟡/i.test(L)) return { label: 'בינונית', cls: 'med' };
      if (/נמוך|low|🟢/i.test(L)) return { label: 'נמוכה', cls: 'low' };
    }
    return null;
  }
  // status badge from the Projects-v2 Status field (Backlog / In Progress / Done / בעבודה …)
  function devStatus(t) {
    var s = String(t.status || '').trim();
    if (!s) return null;
    var cls = 'todo';
    if (/progress|בעבודה|doing|פיתוח|active|wip|בתהליך/i.test(s)) cls = 'prog';
    else if (/done|בוצע|הושלם|complete|closed|נסגר/i.test(s)) cls = 'done';
    else if (/review|בדיקה|qa/i.test(s)) cls = 'review';
    return { label: s, cls: cls };
  }
  function devInProgress(t) { return t.state !== 'closed' && /progress|בעבודה|doing|פיתוח|active|wip|בתהליך/i.test(String(t.status || '')); }
  function devEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function devFmtDate(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d.getTime())) return ''; return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }

  // One color per topic, reused across the hero load-bar, the legend, and each topic's spine —
  // so a slice of the bar, its legend chip, and its section in the tree all read as the same color.
  var DEV_TOPIC_COLORS = ['#2f6fed', '#0e9aa7', '#7c5cdb', '#c87f0a', '#d6456f', '#0e9f6e', '#0891b2', '#ea7317'];
  var DEV_CHILDREN = {};  // issueNumber → [child tasks], rebuilt each render from t.parent (GitHub sub-issues)

  // Hero band — the page's focal element: live KPIs + a "load by topic" bar that doubles as the jump nav.
  function devHero(tasks, topics, topicNames, colors) {
    var openCount = tasks.filter(function (t) { return t.state !== 'closed'; }).length;
    var inProg = tasks.filter(devInProgress).length;
    var wk = new Date().getTime() - 7 * 864e5;
    var weekCount = tasks.filter(function (t) { var u = t.updatedAt ? new Date(t.updatedAt).getTime() : 0; return u >= wk; }).length;
    var total = tasks.length || 1;

    var tiles = [
      { n: openCount, l: 'משימות פתוחות', k: '#0e9aa7' },
      { n: inProg, l: 'בפיתוח עכשיו', k: '#7c5cdb' },
      { n: weekCount, l: 'עודכנו השבוע', k: '#2f6fed' },
      { n: topicNames.length, l: 'נושאים פעילים', k: '#c87f0a' }
    ];
    var kpis = tiles.map(function (t) {
      return '<div class="dev-kpi" style="--k:' + t.k + '"><div class="dev-kpi-num">' + t.n + '</div><div class="dev-kpi-lbl">' + t.l + '</div></div>';
    }).join('');

    // "עומס לפי עדיפות" — count open tickets per priority tier (critical/high/medium/low).
    // devPriority() resolves the tier from the Projects-v2 Priority field (or a label fallback).
    var PRIO_TIERS = [
      { label: 'קריטי',   k: '#d64545' },
      { label: 'גבוהה',   k: '#ea7317' },
      { label: 'בינונית', k: '#c87f0a' },
      { label: 'נמוכה',   k: '#94a3b8' }
    ];
    var prioCounts = { 'קריטי': 0, 'גבוהה': 0, 'בינונית': 0, 'נמוכה': 0 };
    tasks.forEach(function (t) { var pr = devPriority(t); if (pr && prioCounts.hasOwnProperty(pr.label)) prioCounts[pr.label]++; });
    var prioRow = '<div class="dev-loadbar-cap" style="margin-top:14px;">עומס לפי עדיפות</div>' +
      '<div class="dev-kpis">' + PRIO_TIERS.map(function (p) {
        return '<div class="dev-kpi" style="--k:' + p.k + '"><div class="dev-kpi-num">' + prioCounts[p.label] + '</div><div class="dev-kpi-lbl">' + p.label + '</div></div>';
      }).join('') + '</div>';

    var bar = topicNames.map(function (tp, i) {
      return '<span style="width:' + (topics[tp].n / total * 100).toFixed(2) + '%;background:' + colors[i] + '" title="' + devEsc(tp) + ' · ' + topics[tp].n + '"></span>';
    }).join('');
    var legend = topicNames.map(function (tp, i) {
      return '<button class="dev-leg" onclick="devJump(' + i + ')"><span class="dev-leg-dot" style="background:' + colors[i] + '"></span><bdi>' + devEsc(tp) + '</bdi><span class="dev-leg-n">' + topics[tp].n + '</span></button>';
    }).join('');

    return '<div class="dev-hero">' +
      '<div class="dev-hero-top">' +
        '<div><div class="dev-hero-title">💻 לוח פיתוח</div>' +
        '<div class="dev-hero-sub">טיקטים חיים מ-GitHub · מתעדכן אוטומטית מהפרויקט</div></div>' +
        '<button class="dev-hero-refresh" onclick="renderDevTasks()" title="רענן" aria-label="רענן">🔄</button>' +
      '</div>' +
      '<div class="dev-kpis">' + kpis + '</div>' +
      prioRow +
      (topicNames.length ? '<div class="dev-loadbar-cap">עומס לפי נושא</div>' +
        '<div class="dev-loadbar">' + bar + '</div>' +
        '<div class="dev-legend">' + legend + '</div>' : '') +
    '</div>';
  }

  async function devFetchTasks(state) {
    var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
    if (!tok) throw new Error('יש להתחבר ל-EMS כדי לראות משימות פיתוח');
    // client-side timeout so a cold/slow function never hangs the page on an endless spinner
    var ac = new AbortController();
    var to = setTimeout(function () { ac.abort(); }, 20000);
    var r;
    try {
      r = await fetch(SB_URL + '/functions/v1/github', {
        method: 'POST', signal: ac.signal,
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, state: state || 'open' })
      });
    } catch (e) {
      throw new Error(ac.signal.aborted ? 'השרת מתעורר (cold start) — נסה שוב בעוד רגע' : ('תקלת רשת: ' + (e && e.message || e)));
    } finally { clearTimeout(to); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ('github ' + r.status));
    return d.tasks || [];
  }

  // title encodes "נושא | תת-נושא | תיאור"
  function devParseT(title) {
    var parts = String(title || '').split(/\s*\|\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length >= 3) return { topic: parts[0], sub: parts[1], desc: parts.slice(2).join(' · ') };
    if (parts.length === 2) return { topic: parts[0], sub: '', desc: parts[1] };
    return { topic: 'אחר', sub: '', desc: parts[0] || String(title || '') };
  }

  // open the GitHub issue WITHOUT toggling the <details> (explicit button, not the default row action)
  window.devGitOpen = function (e, el) { e.preventDefault(); e.stopPropagation(); window.open(el.href, '_blank', 'noopener'); };

  // shared detail panel (state/assignee/priority/dates/body + GitHub link)
  function devDetailPanel(t) {
    var pr = devPriority(t);
    var closed = t.state === 'closed';
    var created = devFmtDate(t.createdAt), updated = devFmtDate(t.updatedAt);
    return '<div class="dev-detail">' +
      '<div class="dev-detail-row">' +
        '<span class="dev-st ' + (closed ? 'dev-st-closed' : 'dev-st-open') + '">' + (closed ? '✅ סגור' : '🟢 פתוח') + '</span>' +
        '<span class="dev-detail-num"><bdi dir="ltr">#' + devEsc(String(t.number)) + '</bdi></span>' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        (t.assignee ? '<span class="dev-assignee">👤 <bdi>' + devEsc(t.assignee) + '</bdi></span>' : '') +
        (created ? '<span class="dev-detail-date">📅 ' + created + (updated && updated !== created ? ' · עודכן ' + updated : '') + '</span>' : '') +
      '</div>' +
      (t.body ? '<div class="dev-detail-body">' + devEsc(t.body) + '</div>' : '<div class="dev-detail-empty">— אין תיאור זמין —</div>') +
      '<a class="dev-detail-link" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">פתח ב-GitHub ↗</a>' +
    '</div>';
  }

  // summary row, shared by the flat highlight list and the tree nodes
  function devNodeSummary(label, t, kids) {
    var pr = devPriority(t), st = devStatus(t), closed = t.state === 'closed';
    return '<summary class="dev-task-sum">' +
      '<span class="dev-caret" aria-hidden="true">▸</span>' +
      '<span class="dev-task-desc">' + devEsc(label) + '</span>' +
      (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
      (st ? '<span class="dev-status dev-status-' + st.cls + '">' + devEsc(st.label) + '</span>' : '') +
      (kids && kids.length ? '<span class="dev-subn" title="תת-משימות">' + kids.length + '</span>' : '') +
      (closed ? '<span class="dev-done" title="סגור">✅</span>' : '') +
      '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח את הכרטיס ב-GitHub">' + DEV_GH + '</a>' +
    '</summary>';
  }

  // flat node (used by the "בפיתוח עכשיו" highlight list) — summary + detail, no children
  function devTaskNode(t) {
    var s = devEsc((t.title + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase());
    return '<details class="dev-task" data-s="' + s + '">' + devNodeSummary(t._p.desc, t, null) + devDetailPanel(t) + '</details>';
  }

  // label: drop the (redundant) section topic when the title starts with it — so same-topic nodes
  // read cleanly while CROSS-topic children keep their full path (e.g. a מונים child under התראות).
  function devNodeLabel(t, isRoot, groupTopic) {
    var title = String(t.title || '');
    if (groupTopic && title.indexOf(groupTopic + ' | ') === 0) title = title.slice((groupTopic + ' | ').length);
    return title.replace(/\s*\|\s*/g, ' › ');
  }

  // recursive tree node — renders the issue + its GitHub sub-issues nested, to any depth.
  function devNode(t, isRoot, groupTopic, depth) {
    var kids = depth < 6 ? (DEV_CHILDREN[t.number] || []) : [];
    var s = devEsc((t.title + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase());
    var childrenHtml = kids.length ? '<div class="dev-children">' + kids.map(function (k) { return devNode(k, false, groupTopic, depth + 1); }).join('') + '</div>' : '';
    return '<details class="dev-task' + (kids.length ? ' dev-haskids' : '') + '" data-s="' + s + '">' +
      devNodeSummary(devNodeLabel(t, isRoot, groupTopic), t, kids) + devDetailPanel(t) + childrenHtml +
    '</details>';
  }

  async function renderDevTasks() {
    var el = document.getElementById('devTasksContent');
    if (!el) return;
    if (!canSeeDevTasks()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }
    el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען משימות מ-GitHub…</div></div>';
    var tasks;
    try { tasks = await devFetchTasks(window._devState); }
    catch (e) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ ' + devEsc(e.message) + ' <button class="inv-btn small" style="margin-right:8px;" onclick="renderDevTasks()">🔄 נסה שוב</button></div></div>'; return; }

    tasks.forEach(function (t) { t._p = devParseT(t.title); });

    // Build the GitHub sub-issue hierarchy. A task is a ROOT when it has no parent, or its parent
    // isn't in the fetched set (e.g. a closed parent while viewing "open") → orphans still surface.
    var byNum = {}; tasks.forEach(function (t) { byNum[t.number] = t; });
    DEV_CHILDREN = {};
    var roots = [];
    tasks.forEach(function (t) {
      if (t.parent && byNum[t.parent]) (DEV_CHILDREN[t.parent] = DEV_CHILDREN[t.parent] || []).push(t);
      else roots.push(t);
    });
    var subtreeSize = function (t, depth) {
      var n = 1; if (depth >= 6) return n;
      (DEV_CHILDREN[t.number] || []).forEach(function (c) { n += subtreeSize(c, depth + 1); });
      return n;
    };
    // group ROOTS by topic; topic count = total tasks across its subtrees (matches what nests inside it)
    var topics = {};
    roots.forEach(function (t) {
      var tp = (topics[t._p.topic] = topics[t._p.topic] || { n: 0, roots: [] });
      tp.roots.push(t); tp.n += subtreeSize(t, 0);
    });
    var topicNames = Object.keys(topics).sort(function (a, b) { return topics[b].n - topics[a].n; });

    var colors = topicNames.map(function (_, i) { return DEV_TOPIC_COLORS[i % DEV_TOPIC_COLORS.length]; });

    var active = function (s) { return window._devState === s ? ' active' : ''; };
    var head = '<div class="dev-toolbar">' +
      '<input id="devSearch" class="dev-search" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" inputmode="search">' +
      '<div class="dev-state-btns">' +
        '<button class="inv-btn small' + active('open') + '" onclick="devSetState(\'open\')">פתוחות</button>' +
        '<button class="inv-btn small' + active('all') + '" onclick="devSetState(\'all\')">הכל</button>' +
      '</div></div>';

    // "בפיתוח עכשיו" — prefer real Status=In-Progress (Projects field); fall back to recent activity
    var inProg = tasks.filter(devInProgress);
    var recent, ipSub;
    if (inProg.length) { recent = inProg.slice(0, 12); ipSub = '· לפי סטטוס'; }
    else { recent = tasks.filter(function (t) { return t.state !== 'closed'; }).slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 6); ipSub = '· פעילות אחרונה'; }
    var ipBox = recent.length ? '<div class="card dev-now"><h3 class="dev-now-head">🔨 בפיתוח עכשיו <span class="dev-now-sub">' + ipSub + '</span></h3>' +
      '<div class="dev-now-list">' + recent.map(devTaskNode).join('') + '</div></div>' : '';

    var body = topicNames.map(function (topic, i) {
      var tp = topics[topic];
      var inner = tp.roots.map(function (r) { return devNode(r, true, topic, 0); }).join('');
      return '<details id="dtopic-' + i + '" class="dev-topic" style="--tc:' + colors[i] + '"' + (i === 0 ? ' open' : '') + '>' +
        '<summary class="dev-topic-sum"><span class="dev-topic-ico" aria-hidden="true">📂</span>' +
        '<span class="dev-topic-name"><bdi>' + devEsc(topic) + '</bdi></span>' +
        '<span class="dev-topic-n">' + tp.n + '</span><span class="dev-topic-caret" aria-hidden="true">⌄</span></summary>' +
        '<div class="dev-topic-body">' + inner + '</div></details>';
    }).join('');

    el.innerHTML = '<div class="dev-wrap">' + devHero(tasks, topics, topicNames, colors) + head + ipBox + (tasks.length ? body : '<div class="dev-empty">אין משימות להצגה.</div>') + '</div>';
  }

  window.devJump = function (i) { var d = document.getElementById('dtopic-' + i); if (!d) return; d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // live filter over the nested tree: a node shows if IT matches or any descendant matches; the
  // path to a match auto-expands so deep sub-tasks are reachable from the search.
  window.devFilter = function (q) {
    q = (q || '').trim().toLowerCase();
    var nodes = document.querySelectorAll('#devTasksContent .dev-task');
    nodes.forEach(function (n) { n._m = (!q || (n.getAttribute('data-s') || '').indexOf(q) !== -1); });
    nodes.forEach(function (n) {
      var show = n._m || (q && Array.prototype.some.call(n.querySelectorAll('.dev-task'), function (d) { return d._m; }));
      n.style.display = show ? '' : 'none';
      if (q && show) n.open = true;
    });
    document.querySelectorAll('#devTasksContent .dev-topic').forEach(function (d) {
      var any = Array.prototype.some.call(d.querySelectorAll('.dev-task'), function (t) { return t.style.display !== 'none'; });
      d.style.display = any ? '' : 'none'; if (q) d.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; renderDevTasks(); };
  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
