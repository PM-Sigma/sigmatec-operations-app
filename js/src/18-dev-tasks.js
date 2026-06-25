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
  //
  // FILTERS (toggle): the hero tiles are clickable. A priority/KPI tile filters the WHOLE view to its
  // open tasks; clicking the active tile (or a "reset" tile) clears it. Under a filter the topic tree
  // shows only matching tasks + their ancestor chain (ancestors dimmed as context), each topic's count
  // = matching tasks only, with a "+N בעדיפות אחרת" note for the rest. Links are always kept.
  // ===========================================================
  function canSeeDevTasks() { return (typeof canManageStaff === 'function') && canManageStaff(); }
  window._devState = 'open';
  window._devFilter = null;   // null | {type:'prio',val} | {type:'status'} | {type:'week'}
  window._devQ = '';          // live search query, preserved across re-paints

  var DEV_GH = '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

  function devPriorityRank(p) {
    p = (p || '').trim();
    if (/קריטי|דחוף|critical|urgent/i.test(p))      return { label: 'קריטי', cls: 'crit' };
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
      if (/קריטי|דחוף|critical|urgent/i.test(L)) return { label: 'קריטי', cls: 'crit' };
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

  // ----- FILTER predicates (open tasks only; closed never match a filter) -----
  function devMatchFilter(t, f) {
    if (!f) return true;
    if (t.state === 'closed') return false;
    if (f.type === 'prio')   { var pr = devPriority(t); return !!pr && pr.label === f.val; }
    if (f.type === 'status') return devInProgress(t);
    if (f.type === 'week')   { var u = t.updatedAt ? new Date(t.updatedAt).getTime() : 0; return u >= (new Date().getTime() - 7 * 864e5); }
    return true;
  }
  // a node belongs in a filtered tree if it matches OR any descendant matches (path is preserved)
  function devSubtreeMatch(t, f, depth) {
    if (devMatchFilter(t, f)) return true;
    if (depth >= 6) return false;
    return (DEV_CHILDREN[t.number] || []).some(function (k) { return devSubtreeMatch(k, f, depth + 1); });
  }
  function devCountMatches(t, f, depth) {
    var n = devMatchFilter(t, f) ? 1 : 0;
    if (depth >= 6) return n;
    (DEV_CHILDREN[t.number] || []).forEach(function (k) { n += devCountMatches(k, f, depth + 1); });
    return n;
  }
  function devFilterLabel(f) {
    if (!f) return '';
    if (f.type === 'prio')   return 'עדיפות ' + f.val;
    if (f.type === 'status') return 'בפיתוח עכשיו';
    if (f.type === 'week')   return 'עודכנו השבוע';
    return '';
  }
  function devOtherLabel(f) { return (f && f.type === 'prio') ? 'בעדיפות אחרת' : 'שלא תואמים לסינון'; }

  // One color per topic, reused across the hero load-bar, the legend, and each topic's spine —
  // so a slice of the bar, its legend chip, and its section in the tree all read as the same color.
  var DEV_TOPIC_COLORS = ['#2f6fed', '#0e9aa7', '#7c5cdb', '#c87f0a', '#d6456f', '#0e9f6e', '#0891b2', '#ea7317'];
  var DEV_CHILDREN = {};  // issueNumber → [child tasks], rebuilt each render from t.parent (GitHub sub-issues)

  // Hero band — the page's focal element: live KPIs + a "load by topic" bar that doubles as the jump nav.
  // All tiles are toggle filters; the load bar/legend reflect the active filter (breakdown of THIS tier by topic).
  function devHero(d, f, matchCounts, colorOf) {
    var tasks = d.tasks, topicNames = d.topicNames;
    var openCount = tasks.filter(function (t) { return t.state !== 'closed'; }).length;
    var inProg = tasks.filter(devInProgress).length;
    var wk = new Date().getTime() - 7 * 864e5;
    var weekCount = tasks.filter(function (t) { var u = t.updatedAt ? new Date(t.updatedAt).getTime() : 0; return u >= wk; }).length;

    function kpiBtn(n, l, k, onclick, active) {
      return '<button type="button" class="dev-kpi' + (active ? ' active' : '') + '" style="--k:' + k + '" onclick="' + onclick + '">' +
        '<div class="dev-kpi-num">' + n + '</div><div class="dev-kpi-lbl">' + l + '</div></button>';
    }
    var kpis =
      kpiBtn(openCount, 'משימות פתוחות', '#0e9aa7', 'devSetFilter(null)', false) +
      kpiBtn(inProg, 'בפיתוח עכשיו', '#7c5cdb', "devSetFilter({type:'status'})", !!f && f.type === 'status') +
      kpiBtn(weekCount, 'עודכנו השבוע', '#2f6fed', "devSetFilter({type:'week'})", !!f && f.type === 'week') +
      kpiBtn(topicNames.length, 'נושאים פעילים', '#c87f0a', 'devSetFilter(null)', false);

    // "עומס לפי עדיפות" — open tickets per priority tier (matches what the tier filter yields).
    var PRIO_TIERS = [
      { label: 'קריטי',   k: '#dc2626' },
      { label: 'גבוהה',   k: '#e8590c' },
      { label: 'בינונית', k: '#a16207' },
      { label: 'נמוכה',   k: '#2563eb' }
    ];
    var prioCounts = { 'קריטי': 0, 'גבוהה': 0, 'בינונית': 0, 'נמוכה': 0 };
    tasks.forEach(function (t) { if (t.state === 'closed') return; var pr = devPriority(t); if (pr && prioCounts.hasOwnProperty(pr.label)) prioCounts[pr.label]++; });
    var prioRow = '<div class="dev-loadbar-cap" style="margin-top:14px;">עומס לפי עדיפות</div>' +
      '<div class="dev-kpis">' + PRIO_TIERS.map(function (p) {
        var act = !!f && f.type === 'prio' && f.val === p.label;
        return kpiBtn(prioCounts[p.label], p.label, p.k, "devSetFilter({type:'prio',val:'" + p.label + "'})", act);
      }).join('') + '</div>';

    var total = 0; topicNames.forEach(function (tp) { total += matchCounts[tp]; }); total = total || 1;
    var visTopics = topicNames.filter(function (tp) { return matchCounts[tp] > 0; });
    var bar = visTopics.map(function (tp) {
      return '<span style="width:' + (matchCounts[tp] / total * 100).toFixed(2) + '%;background:' + colorOf[tp] + '" title="' + devEsc(tp) + ' · ' + matchCounts[tp] + '"></span>';
    }).join('');
    var legend = visTopics.map(function (tp) {
      var fi = topicNames.indexOf(tp);
      return '<button class="dev-leg" onclick="devJump(' + fi + ')"><span class="dev-leg-dot" style="background:' + colorOf[tp] + '"></span><bdi>' + devEsc(tp) + '</bdi><span class="dev-leg-n">' + matchCounts[tp] + '</span></button>';
    }).join('');

    return '<div class="dev-hero">' +
      '<div class="dev-hero-top">' +
        '<div><div class="dev-hero-title">💻 לוח פיתוח</div>' +
        '<div class="dev-hero-sub">טיקטים חיים מ-GitHub · מתעדכן אוטומטית מהפרויקט</div></div>' +
        '<button class="dev-hero-refresh" onclick="renderDevTasks(true)" title="רענן עכשיו" aria-label="רענן">🔄</button>' +
      '</div>' +
      '<div class="dev-kpis">' + kpis + '</div>' +
      prioRow +
      (visTopics.length ? '<div class="dev-loadbar-cap">עומס לפי נושא' + (f ? ' · מסונן' : '') + '</div>' +
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
    var pr = devPriority(t);
    return '<details class="dev-task' + (pr ? ' dev-pr-' + pr.cls : '') + '" data-s="' + s + '">' + devNodeSummary(t._p.desc, t, null) + devDetailPanel(t) + '</details>';
  }

  // label: drop the (redundant) section topic when the title starts with it — so same-topic nodes
  // read cleanly while CROSS-topic children keep their full path (e.g. a מונים child under התראות).
  function devNodeLabel(t, isRoot, groupTopic) {
    var title = String(t.title || '');
    if (groupTopic && title.indexOf(groupTopic + ' | ') === 0) title = title.slice((groupTopic + ' | ').length);
    return title.replace(/\s*\|\s*/g, ' › ');
  }

  // recursive tree node — renders the issue + its GitHub sub-issues nested, to any depth.
  // Under a filter (f): subtrees with no match are dropped; matching rows get .dev-match (highlight),
  // ancestor-only rows get .dev-ctx (dimmed context), and the path auto-expands so matches are visible.
  function devNode(t, isRoot, groupTopic, depth, f) {
    if (f && !devSubtreeMatch(t, f, depth)) return '';
    var isMatch = !f || devMatchFilter(t, f);
    var kids = depth < 6 ? (DEV_CHILDREN[t.number] || []) : [];
    var s = devEsc((t.title + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase());
    var childrenHtml = kids.length ? '<div class="dev-children">' + kids.map(function (k) { return devNode(k, false, groupTopic, depth + 1, f); }).join('') + '</div>' : '';
    var pr = devPriority(t);
    var cls = 'dev-task' + (kids.length ? ' dev-haskids' : '') + (pr ? ' dev-pr-' + pr.cls : '') + (f ? (isMatch ? ' dev-match' : ' dev-ctx') : '');
    var openAttr = (f && childrenHtml) ? ' open' : '';
    return '<details class="' + cls + '"' + openAttr + ' data-s="' + s + '">' +
      devNodeSummary(devNodeLabel(t, isRoot, groupTopic), t, kids) + devDetailPanel(t) + childrenHtml +
    '</details>';
  }

  // ---- MOBILE tree: flattened + card-based (≤768px). An epic (parent card) collapses to a thin
  // label + sub-count — its generic title isn't something to tap; leaf tasks become clean,
  // color-coded cards. One tap on a card opens its detail; the GitHub icon opens the issue. ----
  function devMobileCard(t) {
    var pr = devPriority(t), st = devStatus(t), closed = t.state === 'closed';
    var s = devEsc((t.title + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase());
    return '<details class="dev-mtask' + (pr ? ' dev-pr-' + pr.cls : '') + '" data-s="' + s + '">' +
      '<summary class="dev-mtask-sum">' +
        '<div class="dev-mtask-row">' +
          '<span class="dev-mtask-title">' + devEsc(t._p.desc || t.title) + '</span>' +
          '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח ב-GitHub">' + DEV_GH + '</a>' +
        '</div>' +
        '<div class="dev-mtask-meta">' +
          (st ? '<span class="dev-status dev-status-' + st.cls + '">' + devEsc(st.label) + '</span>' : '') +
          (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
          '<span class="dev-mtask-num"><bdi dir="ltr">#' + devEsc(String(t.number)) + '</bdi></span>' +
          (t.assignee ? '<span class="dev-mtask-asg">👤 <bdi>' + devEsc(t.assignee) + '</bdi></span>' : '') +
          (closed ? '<span class="dev-done" title="סגור">✅</span>' : '') +
        '</div>' +
      '</summary>' +
      (t.body ? '<div class="dev-detail-body">' + devEsc(t.body) + '</div>' : '<div class="dev-detail-empty">— אין תיאור זמין —</div>') +
      '<a class="dev-detail-link" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">פתח ב-GitHub ↗</a>' +
    '</details>';
  }
  function devMobileNodes(nodes, f, depth) {
    return nodes.map(function (t) {
      if (f && !devSubtreeMatch(t, f, depth)) return '';
      var kids = depth < 6 ? (DEV_CHILDREN[t.number] || []) : [];
      if (!kids.length) return devMobileCard(t);   // leaf → card
      var pr = devPriority(t);                       // epic → thin label + flattened children
      return '<div class="dev-mepic-wrap' + (depth ? ' dev-mepic-sub' : '') + '">' +
        '<div class="dev-mepic">' +
          '<span class="dev-mepic-name">' + devEsc(devNodeLabel(t, depth === 0, t._p.topic)) + '</span>' +
          (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
          '<span class="dev-mepic-n">' + kids.length + ' תת-משימות</span>' +
          '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח ב-GitHub">' + DEV_GH + '</a>' +
        '</div>' +
        '<div class="dev-mgroup">' + devMobileNodes(kids, f, depth + 1) + '</div>' +
      '</div>';
    }).join('');
  }

  // ---- Offline cache: tickets persist in localStorage so the page paints instantly (even before
  // EMS login) and only re-fetches in the background once connected. Keyed by state (open/all). ----
  var DEV_CACHE_KEY = 'dev_tasks_cache_v1';
  function devLoadCache(state) {
    try { return (JSON.parse(localStorage.getItem(DEV_CACHE_KEY) || '{}')[state]) || null; } catch (e) { return null; }
  }
  function devSaveCache(state, tasks) {
    try {
      var c = {}; try { c = JSON.parse(localStorage.getItem(DEV_CACHE_KEY) || '{}'); } catch (e) {}
      c[state] = { tasks: tasks, at: Date.now() };
      localStorage.setItem(DEV_CACHE_KEY, JSON.stringify(c));
    } catch (e) { /* quota — caching is best-effort, never blocks the page */ }
  }
  function devAgo(ts) {
    if (!ts) return '';
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'הרגע';
    if (m < 60) return 'לפני ' + m + ' ד׳';
    var h = Math.floor(m / 60);
    if (h < 24) return 'לפני ' + h + ' ש׳';
    return 'לפני ' + Math.floor(h / 24) + ' ימים';
  }

  // tasks[] → window._devData (+ DEV_CHILDREN). Shared by the cache paint and the live fetch.
  // A task is a ROOT when it has no parent, or its parent isn't in the set (orphans still surface).
  function devBuild(tasks) {
    tasks.forEach(function (t) { t._p = devParseT(t.title); });
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
    var topics = {};
    roots.forEach(function (t) {
      var tp = (topics[t._p.topic] = topics[t._p.topic] || { n: 0, roots: [] });
      tp.roots.push(t); tp.n += subtreeSize(t, 0);
    });
    var topicNames = Object.keys(topics).sort(function (a, b) { return topics[b].n - topics[a].n; });
    var colors = topicNames.map(function (_, i) { return DEV_TOPIC_COLORS[i % DEV_TOPIC_COLORS.length]; });
    window._devData = { tasks: tasks, topics: topics, topicNames: topicNames, colors: colors };
  }

  // Cache-first, fetch-once-per-connection. The cached tickets paint instantly (works offline / pre-login).
  // The heavy GitHub fetch runs only ONCE per session per state — i.e. on the first dev-page open after a
  // connect (a connect always triggers location.reload(), so a new session == a new connection). Repeated
  // opens within the session just reuse the cache (no fetch = fast). `force` (🔄 button / retry) always fetches.
  async function renderDevTasks(force) {
    var el = document.getElementById('devTasksContent');
    if (!el) return;
    if (!canSeeDevTasks()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }

    var state = window._devState;
    var cached = devLoadCache(state);
    var hasCache = !!(cached && cached.tasks && cached.tasks.length);
    var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
    window._devFetched = window._devFetched || {};   // {open:true, all:true} — fetched this session per state
    var willFetch = !!tok && (force || !window._devFetched[state] || !hasCache);

    if (hasCache) {
      devBuild(cached.tasks);
      window._devCache = { at: cached.at, refreshing: willFetch };
      devPaint();
    } else {
      window._devCache = null;
      el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען משימות מ-GitHub…</div></div>';
    }

    if (!tok) {   // no connection → show the cache (if any), otherwise ask to connect
      if (!hasCache) el.innerHTML = '<div class="dev-wrap"><div class="dev-error">יש להתחבר ל-EMS כדי לטעון משימות פיתוח. <button class="inv-btn small" style="margin-right:8px;" onclick="renderDevTasks(true)">🔄 נסה שוב</button></div></div>';
      return;
    }
    if (!willFetch) return;   // already synced this session → reuse cache, no fetch

    try {
      var tasks = await devFetchTasks(state);
      devSaveCache(state, tasks);
      window._devFetched[state] = true;
      devBuild(tasks);
      window._devCache = { at: Date.now(), refreshing: false };
      devPaint();
    } catch (e) {
      if (hasCache) { window._devCache = { at: cached.at, refreshing: false, error: e.message }; devPaint(); }  // keep the cache, flag the failure
      else el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ ' + devEsc(e.message) + ' <button class="inv-btn small" style="margin-right:8px;" onclick="renderDevTasks(true)">🔄 נסה שוב</button></div></div>';
    }
  }

  // Paint the page from the cached data + current filter — no re-fetch. Called by renderDevTasks
  // and by every filter toggle (devSetFilter), so filtering is instant and offline.
  function devPaint() {
    var el = document.getElementById('devTasksContent');
    if (!el || !window._devData) return;
    var d = window._devData, f = window._devFilter;
    var colorOf = {}; d.topicNames.forEach(function (tp, i) { colorOf[tp] = d.colors[i]; });
    var matchCounts = {};
    d.topicNames.forEach(function (tp) {
      matchCounts[tp] = d.topics[tp].roots.reduce(function (s, r) { return s + devCountMatches(r, f, 0); }, 0);
    });

    var active = function (s) { return window._devState === s ? ' active' : ''; };
    var fchip = f ? '<div class="dev-fchip">מציג: ' + devEsc(devFilterLabel(f)) + ' <button type="button" onclick="devSetFilter(null)" aria-label="נקה סינון">✕</button></div>' : '';
    // cache line: shows it's served from the local store + freshness + (refreshing… / refresh-failed)
    var c = window._devCache, cacheLine = '';
    if (c) cacheLine = '<div class="dev-cacheline">📦 נשמר מקומית · עודכן ' + devEsc(devAgo(c.at)) +
      (c.refreshing ? ' · <span class="dev-refreshing">מרענן…</span>' : '') +
      (c.error ? ' · <span class="dev-refresherr">רענון נכשל</span>' : '') + '</div>';
    var head = '<div class="dev-toolbar">' +
      '<input id="devSearch" class="dev-search" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" inputmode="search">' +
      '<div class="dev-state-btns">' +
        '<button class="inv-btn small' + active('open') + '" onclick="devSetState(\'open\')">פתוחות</button>' +
        '<button class="inv-btn small' + active('all') + '" onclick="devSetState(\'all\')">הכל</button>' +
      '</div></div>' + cacheLine + fchip;

    // "בפיתוח עכשיו" spotlight — hidden while a filter is active (focused view).
    var ipBox = '';
    if (!f) {
      var inProg = d.tasks.filter(devInProgress);
      var recent, ipSub;
      if (inProg.length) { recent = inProg.slice(0, 12); ipSub = '· לפי סטטוס'; }
      else { recent = d.tasks.filter(function (t) { return t.state !== 'closed'; }).slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 6); ipSub = '· פעילות אחרונה'; }
      ipBox = recent.length ? '<div class="card dev-now"><h3 class="dev-now-head">🔨 בפיתוח עכשיו <span class="dev-now-sub">' + ipSub + '</span></h3>' +
        '<div class="dev-now-list">' + recent.map(devTaskNode).join('') + '</div></div>' : '';
    }

    // ponytail: mobile detected once at paint time; the phone PWA is always mobile, desktop always desktop.
    var mobile = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    var visTopics = f ? d.topicNames.filter(function (tp) { return matchCounts[tp] > 0; }) : d.topicNames;
    var body = visTopics.map(function (topic) {
      var fi = d.topicNames.indexOf(topic);   // stable id/color index even when the list is filtered
      var tp = d.topics[topic];
      var inner = mobile
        ? devMobileNodes(tp.roots, f, 0)
        : tp.roots.map(function (r) { return devNode(r, true, topic, 0, f); }).join('');
      var shown = matchCounts[topic], other = tp.n - shown;
      var note = (f && other > 0) ? '<div class="dev-topic-note">+' + other + ' כרטיסים ' + devEsc(devOtherLabel(f)) + '</div>' : '';
      var crit = (mobile && !f) ? tp.roots.reduce(function (s, r) { return s + devCountMatches(r, { type: 'prio', val: 'קריטי' }, 0); }, 0) : 0;
      return '<details id="dtopic-' + fi + '" class="dev-topic" style="--tc:' + colorOf[topic] + '"' + ((fi === 0 || f) ? ' open' : '') + '>' +
        '<summary class="dev-topic-sum"><span class="dev-topic-ico" aria-hidden="true">📂</span>' +
        '<span class="dev-topic-name"><bdi>' + devEsc(topic) + '</bdi></span>' +
        (crit ? '<span class="dev-topic-crit">' + crit + ' קריטי</span>' : '') +
        '<span class="dev-topic-n">' + (f ? shown : tp.n) + '</span><span class="dev-topic-caret" aria-hidden="true">⌄</span></summary>' +
        '<div class="dev-topic-body">' + note + inner + '</div></details>';
    }).join('');

    var bodyHtml = d.tasks.length ? (visTopics.length ? body : '<div class="dev-empty">אין משימות בסינון הזה.</div>') : '<div class="dev-empty">אין משימות להצגה.</div>';
    el.innerHTML = '<div class="dev-wrap">' + devHero(d, f, matchCounts, colorOf) + head + ipBox + bodyHtml + '</div>';

    // restore the live text search across the re-paint
    var sb = document.getElementById('devSearch');
    if (sb && window._devQ) { sb.value = window._devQ; window.devFilter(window._devQ); }
  }

  // toggle a tile filter: same tile (or null) clears, otherwise apply. Repaints from cache (no fetch).
  window.devSetFilter = function (f) {
    var c = window._devFilter;
    var same = !!c && !!f && c.type === f.type && (c.val || '') === (f.val || '');
    window._devFilter = (!f || same) ? null : f;
    devPaint();
  };

  window.devJump = function (i) { var dd = document.getElementById('dtopic-' + i); if (!dd) return; dd.open = true; dd.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // live filter over the nested tree: a node shows if IT matches or any descendant matches; the
  // path to a match auto-expands so deep sub-tasks are reachable from the search.
  window.devFilter = function (q) {
    q = (q || '').trim().toLowerCase();
    window._devQ = q;
    // [data-s] covers both the desktop tree nodes (.dev-task) and the mobile cards (.dev-mtask)
    var nodes = document.querySelectorAll('#devTasksContent [data-s]');
    nodes.forEach(function (n) { n._m = (!q || (n.getAttribute('data-s') || '').indexOf(q) !== -1); });
    nodes.forEach(function (n) {
      var show = n._m || (q && Array.prototype.some.call(n.querySelectorAll('[data-s]'), function (dd) { return dd._m; }));
      n.style.display = show ? '' : 'none';
      if (q && show && 'open' in n) n.open = true;
    });
    // mobile epic groups: visible only if some task inside is visible
    document.querySelectorAll('#devTasksContent .dev-mepic-wrap').forEach(function (w) {
      var any = Array.prototype.some.call(w.querySelectorAll('[data-s]'), function (t) { return t.style.display !== 'none'; });
      w.style.display = any ? '' : 'none';
    });
    document.querySelectorAll('#devTasksContent .dev-topic').forEach(function (dd) {
      var any = Array.prototype.some.call(dd.querySelectorAll('[data-s]'), function (t) { return t.style.display !== 'none'; });
      dd.style.display = any ? '' : 'none'; if (q) dd.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; window._devFilter = null; renderDevTasks(); };
  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
