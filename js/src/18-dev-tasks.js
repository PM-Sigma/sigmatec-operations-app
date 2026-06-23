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
    if (/גבוה|דחוף|critical|high|urgent/i.test(p)) return { label: 'גבוהה', cls: 'high' };
    if (/בינוני|medium|normal/i.test(p))           return { label: 'בינונית', cls: 'med' };
    if (/נמוך|low/i.test(p))                        return { label: 'נמוכה', cls: 'low' };
    return { label: p, cls: 'low' };
  }
  function devEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function devFmtDate(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d.getTime())) return ''; return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }

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

  // בן — a task as a collapsible <details>: summary (desc + git button) → detail panel.
  function devTaskNode(t) {
    var pr = t.priority ? devPriorityRank(t.priority) : null;
    var closed = t.state === 'closed';
    var s = devEsc((t._p.topic + ' ' + t._p.sub + ' ' + t._p.desc + ' #' + t.number + ' ' + (t.assignee || '')).toLowerCase());
    var created = devFmtDate(t.createdAt), updated = devFmtDate(t.updatedAt);
    var detail = '<div class="dev-detail">' +
      '<div class="dev-detail-row">' +
        '<span class="dev-st ' + (closed ? 'dev-st-closed' : 'dev-st-open') + '">' + (closed ? '✅ סגור' : '🟢 פתוח') + '</span>' +
        '<span class="dev-detail-num"><bdi dir="ltr">#' + devEsc(String(t.number)) + '</bdi></span>' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        (t.assignee ? '<span class="dev-assignee">👤 <bdi>' + devEsc(t.assignee) + '</bdi></span>' : '') +
        (created ? '<span class="dev-detail-date">📅 ' + created + (updated && updated !== created ? ' · עודכן ' + updated : '') + '</span>' : '') +
      '</div>' +
      (t.body ? '<div class="dev-detail-body">' + devEsc(t.body) + '</div>' : '<div class="dev-detail-empty">— אין תיאור זמין (יופיע אחרי עדכון פונקציית github) —</div>') +
      '<a class="dev-detail-link" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">פתח ב-GitHub ↗</a>' +
    '</div>';
    return '<details class="dev-task" data-s="' + s + '">' +
      '<summary class="dev-task-sum">' +
        '<span class="dev-caret" aria-hidden="true">▸</span>' +
        '<span class="dev-task-desc">' + devEsc(t._p.desc) + '</span>' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        (closed ? '<span class="dev-done" title="סגור">✅</span>' : '') +
        '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח את הכרטיס ב-GitHub">' + DEV_GH + '</a>' +
      '</summary>' + detail +
    '</details>';
  }

  // אב — a parent (sub-topic) as a collapsible <details>: summary (name + count) → children.
  function devParentNode(name, group) {
    return '<details class="dev-parent" data-s="' + devEsc(String(name).toLowerCase()) + '">' +
      '<summary class="dev-parent-sum">' +
        '<span class="dev-caret" aria-hidden="true">▸</span>' +
        '<span class="dev-parent-name"><bdi>' + devEsc(name) + '</bdi></span>' +
        '<span class="dev-parent-n">' + group.length + '</span>' +
      '</summary>' +
      '<div class="dev-parent-body">' + group.map(devTaskNode).join('') + '</div>' +
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
    var topics = {};
    tasks.forEach(function (t) {
      var topic = t._p.topic, P = t._p.sub || t._p.desc;
      var tp = (topics[topic] = topics[topic] || { n: 0, parents: {} });
      tp.n++;
      (tp.parents[P] = tp.parents[P] || []).push(t);
    });
    var topicNames = Object.keys(topics).sort(function (a, b) { return topics[b].n - topics[a].n; });

    var active = function (s) { return window._devState === s ? ' active' : ''; };
    var head = '<div class="dev-toolbar">' +
      '<div class="dev-counts"><strong>' + tasks.length + '</strong> משימות<span class="dev-counts-sub">· ' + topicNames.length + ' נושאים</span></div>' +
      '<input id="devSearch" class="dev-search" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" inputmode="search">' +
      '<div class="dev-state-btns">' +
        '<button class="inv-btn small' + active('open') + '" onclick="devSetState(\'open\')">פתוחות</button>' +
        '<button class="inv-btn small' + active('all') + '" onclick="devSetState(\'all\')">הכל</button>' +
        '<button class="inv-btn small" onclick="renderDevTasks()">🔄 רענן</button>' +
      '</div></div>';

    var chips = '<div class="dev-chips">' + topicNames.map(function (topic, i) {
      return '<button class="dev-chip" onclick="devJump(' + i + ')">📂 <bdi>' + devEsc(topic) + '</bdi><span class="dev-chip-n">' + topics[topic].n + '</span></button>';
    }).join('') + '</div>';

    var recent = tasks.filter(function (t) { return t.state !== 'closed'; })
      .slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 6);
    var ipBox = recent.length ? '<div class="card dev-now"><h3 class="dev-now-head">🔨 בפיתוח עכשיו <span class="dev-now-sub">· פעילות אחרונה</span></h3>' +
      '<div class="dev-now-list">' + recent.map(devTaskNode).join('') + '</div></div>' : '';

    var body = topicNames.map(function (topic, i) {
      var tp = topics[topic];
      var keys = Object.keys(tp.parents).sort(function (a, b) { return a.localeCompare(b, 'he'); });
      var inner = keys.map(function (k) {
        var group = tp.parents[k];
        var hasChild = group.some(function (t) { return !!t._p.sub; });
        return hasChild ? devParentNode(k, group) : group.map(devTaskNode).join('');
      }).join('');
      return '<details id="dtopic-' + i + '" class="dev-topic"' + (i === 0 ? ' open' : '') + '>' +
        '<summary class="dev-topic-sum"><span class="dev-topic-ico" aria-hidden="true">📂</span>' +
        '<span class="dev-topic-name"><bdi>' + devEsc(topic) + '</bdi></span>' +
        '<span class="dev-topic-n">' + tp.n + '</span><span class="dev-topic-caret" aria-hidden="true">⌄</span></summary>' +
        '<div class="dev-topic-body">' + inner + '</div></details>';
    }).join('');

    el.innerHTML = '<div class="dev-wrap">' + head + chips + ipBox + (tasks.length ? body : '<div class="dev-empty">אין משימות להצגה.</div>') + '</div>';
  }

  window.devJump = function (i) { var d = document.getElementById('dtopic-' + i); if (!d) return; d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // live filter: show/hide tasks; reveal (but don't expand the detail of) matching tasks' ancestors.
  window.devFilter = function (q) {
    q = (q || '').trim().toLowerCase();
    document.querySelectorAll('#devTasksContent .dev-task').forEach(function (t) {
      t.style.display = (!q || (t.getAttribute('data-s') || '').indexOf(q) !== -1) ? '' : 'none';
    });
    document.querySelectorAll('#devTasksContent .dev-parent').forEach(function (p) {
      var any = Array.prototype.some.call(p.querySelectorAll('.dev-task'), function (t) { return t.style.display !== 'none'; });
      p.style.display = any ? '' : 'none'; if (q) p.open = any;
    });
    document.querySelectorAll('#devTasksContent .dev-topic').forEach(function (d) {
      var any = Array.prototype.some.call(d.querySelectorAll('.dev-task'), function (t) { return t.style.display !== 'none'; });
      d.style.display = any ? '' : 'none'; if (q) d.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; renderDevTasks(); };
  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
