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
  // פיתוח is for עידן + עמיחי (via canManageStaff) AND the developers (מתניה, אליה).
  // Names inlined (no module-level var) — canSeeDevTasks runs during nav init, before this section's
  // var-assignments would execute, so a hoisted `var` would be undefined at call time.
  function canSeeDevTasks() {
    var me = (typeof getCurrentUser === 'function' && getCurrentUser()) || '';
    return me === 'מתניה' || me === 'אליה' || ((typeof canManageStaff === 'function') && canManageStaff());
  }
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
  // status pill — the ticket's COLUMN, in Hebrew, colored by the same --stage-* token as the
  // column it sits in (spec §7d: "color carries meaning per column"). A ticket with no Status
  // field and still open shows nothing, exactly as before; the raw option name is the tooltip.
  function devStatus(t) {
    var s = String(t.status || '').trim();
    if (!s && t.state !== 'closed') return null;
    var k = devStage(t);
    return { label: DEV_STAGE[k].label, cls: k, raw: s };
  }
  function devInProgress(t) { return t.state !== 'closed' && /progress|בעבודה|doing|פיתוח|active|wip|בתהליך/i.test(String(t.status || '')); }
  function devEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Editable priority: a native <select> that replaces the static chip. Changing it auto-saves to the
  // GitHub Project's Priority field (via the github fn, mode:setPriority). stopPropagation so opening the
  // picker inside a <summary>/card doesn't also toggle the row.
  var DEV_PRIO_OPTS = ['קריטי', 'גבוהה', 'בינונית', 'נמוכה'];
  function devPrioControl(t) {
    var pr = devPriority(t);
    var cls = pr ? ('dev-prio-' + pr.cls) : 'dev-prio-none';
    var opts = '<option value="">— עדיפות —</option>' + DEV_PRIO_OPTS.map(function (o) {
      return '<option value="' + o + '"' + (pr && pr.label === o ? ' selected' : '') + '>' + o + '</option>';
    }).join('');
    return '<select class="dev-prio dev-prio-edit ' + cls + '" title="שנה עדיפות — נשמר אוטומטית ומתעדכן ב-GitHub"' +
      ' onclick="event.stopPropagation()" onmousedown="event.stopPropagation()"' +
      ' onchange="devSetPriority(' + t.number + ',this.value,this)">' + opts + '</select>';
  }
  // save a new priority to GitHub (optimistic; revert on failure)
  window.devSetPriority = async function (number, label, sel) {
    var d = window._devData; if (!d) return;
    var t = d.tasks.find(function (x) { return x.number === number; });
    if (!t) return;
    var old = t.priority;
    t.priority = label;   // optimistic — chip colour + counts update on repaint
    if (sel) sel.disabled = true;
    try {
      var res = await devWritePriority([number], label);
      if ((res.updated || []).indexOf(number) === -1) throw new Error((res.failed && res.failed[0] && res.failed[0].error) || 'לא עודכן');
      devSaveCache(window._devState, d.tasks);
      if (typeof toast === 'function') toast('✅ עדיפות #' + number + ' עודכנה');
      devPaint();
    } catch (e) {
      t.priority = old;
      if (sel) sel.disabled = false;
      alert('עדכון עדיפות נכשל: ' + (e && e.message || e));
      devPaint();
    }
  };

  // ----- Pipeline stages: the SEVEN live board columns, in pipeline order -----
  // The GitHub Projects v2 board was reworked on 2026-09-08: "Done" was removed, "Main Fields"
  // (parent/domain issues) and "Scope Refinement" (sent back for re-spec) were added, and "Ready"
  // became "Sprint Ready". The mapping below is PORTED from 91c0d5a (branch fix/dev-board-columns,
  // never merged) — without it "Main Fields"/"Scope Refinement" match no regex and ~37 parent
  // tickets fall silently into ממתין-לפיתוח. See the Task 11 report for the porting decision.
  // This order drives the flow strip, the rail and the day-stamps; the BOARD's four full columns
  // are DEV_FULL_KEYS below (spec §7d), and everything else is a minimized rail chip.
  var DEV_STAGES = [
    { key: 'fields',    label: 'תחומים ראשיים',   ico: '🗂️' },
    { key: 'backlog',   label: 'ממתין לפיתוח',    ico: '📋' },
    { key: 'scope',     label: 'חזר לאפיון מחדש', ico: '↩️' },
    { key: 'ready',     label: 'ספרינט הקרוב',    ico: '🟢' },
    { key: 'prog',      label: 'בפיתוח עכשיו',    ico: '🔨' },
    { key: 'review',    label: 'שלבי בדיקות',     ico: '🔍' },
    { key: 'committed', label: 'עלה לאוויר',      ico: '🚀' }
  ];
  // spec §7d: exactly these four are FULL columns, in this order (RTL: ספרינט rightmost).
  var DEV_FULL_KEYS = ['ready', 'prog', 'review', 'backlog'];
  var DEV_STAGE = {}; DEV_STAGES.forEach(function (s) { DEV_STAGE[s.key] = s; });
  // "שבוצע" for the tree's הסתר-שבוצע filter. The board folded Done into Committed, so עלה-לאוויר
  // (which is also where devStage sends a closed issue) is the only finished state left.
  var DEV_DONE_KEYS = { committed: true };
  // map a ticket's Projects-v2 Status string → one stage key (most-specific match first)
  function devStage(t) {
    var s = String(t.status || '').toLowerCase();
    if (/^main fields$|תחומים ראשי/.test(s)) return 'fields';
    if (/scope refinement|אפיון מחדש/.test(s)) return 'scope';
    if (/commit|deployed|\blive\b|released|production|פרוד|עלה לאוויר|אונליין|^done$|בוצע|הושלם|complete|merged|נסגר/.test(s)) return 'committed';
    if (/review|בדיק|qa/.test(s)) return 'review';
    if (/progress|בעבודה|doing|פיתוח|wip|בתהליך|active/.test(s)) return 'prog';
    if (/ready|מוכן|ספרינט|next|planned/.test(s)) return 'ready';   // matches "Sprint Ready" too
    if (t.state === 'closed') return 'committed';   // closed without a status → it shipped
    return 'backlog';                               // backlog / todo / new / empty
  }
  var DEV_PRANK = { 'קריטי': 4, 'גבוהה': 3, 'גבוה': 3, 'בינונית': 2, 'נמוכה': 1, 'נמוך': 1 };
  function devFmtDate(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d.getTime())) return ''; return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }

  // ----- FILTER predicates (open tasks only; closed never match a filter) -----
  function devMatchFilter(t, f) {
    if (!f) return true;
    // the flow strip / column filter is about the COLUMN, so it must reach closed tickets too
    // (עלה-לאוויר is mostly closed issues) — checked before the open-only rule below.
    if (f.type === 'stage') return devStage(t) === f.val;
    if (f.type === 'topic') return ((t._p || devParseT(t.title)).topic === f.val);
    if (t.state === 'closed') return false;
    if (f.type === 'prio')   { var pr = devPriority(t); return !!pr && pr.label === f.val; }
    if (f.type === 'status') return devInProgress(t);
    if (f.type === 'week')   { var u = t.updatedAt ? new Date(t.updatedAt).getTime() : 0; return u >= (new Date().getTime() - 7 * 864e5); }
    return true;
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
    if (f.type === 'stage')  return DEV_STAGE[f.val] ? DEV_STAGE[f.val].label : f.val;
    if (f.type === 'topic')  return 'נושא ' + f.val;
    return '';
  }
  // A string safe inside an inline onclick="fn('…')". Two layers, and the ORDER matters: the
  // browser un-escapes the HTML entities FIRST and only then parses the result as JavaScript,
  // so the JS-string escaping (backslash, apostrophe) has to survive that pass as literal
  // characters — which is why devEsc() must never turn a quote into an entity.
  // The final `"` → `&quot;` is the attribute layer: a GitHub issue title containing a double
  // quote (`תיקון "מצב ישיבה"`) used to end the onclick attribute early and scatter the rest of
  // the title into the tag as bogus attributes. Task 18 sweep; pinned by test-integration.mjs.
  function devArg(s) {
    return devEsc(String(s == null ? '' : s))
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;');
  }

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
    // the legend is a TOPIC filter (it used to scroll to a topic section; the topic sections are
    // gone with the §7d tree view, and every other hero control is a toggle filter anyway).
    var legend = visTopics.map(function (tp) {
      var act = !!f && f.type === 'topic' && f.val === tp;
      return '<button class="dev-leg' + (act ? ' active' : '') + '" onclick="devSetFilter({type:\'topic\',val:\'' + devArg(tp) + '\'})">' +
        '<span class="dev-leg-dot" style="background:' + colorOf[tp] + '"></span><bdi>' + devEsc(tp) + '</bdi>' +
        '<span class="dev-leg-n">' + matchCounts[tp] + '</span></button>';
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
      throw new Error(ac.signal.aborted ? 'זה לוקח רגע — נסה שוב עוד מעט' : ('אין חיבור כרגע — בדוק רשת ונסה שוב'));
    } finally { clearTimeout(to); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      // EMS token expired → route to re-login instead of a raw error toast
      if (r.status === 401 && typeof emsRequireLogin === 'function') { try { emsRequireLogin(); } catch (e2) {} }
      throw new Error(d.error || ('github ' + r.status));
    }
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
      devStamps(t) +
      (t.body ? '<div class="dev-detail-body">' + devEsc(t.body) + '</div>' : '<div class="dev-detail-empty">— אין תיאור זמין —</div>') +
    '</div>';
  }

  // summary row, shared by the flat highlight list and the tree nodes
  function devNodeSummary(label, t, kids) {
    var pr = devPriority(t), st = devStatus(t), closed = t.state === 'closed';
    return '<summary class="dev-task-sum">' +
      '<span class="dev-caret" aria-hidden="true">▸</span>' +
      '<span class="dev-task-desc">' + devEsc(label) + '</span>' +
      devPrioControl(t) +
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

  // desktop tree row — the issue + its GitHub sub-issues nested, to any depth. Takes a PURE node
  // from devTree() (already pruned by the tree filters), so the row itself only paints.
  function devTreeRowDesktop(node, depth) {
    var t = node.task, kids = node.children;
    var s = devEsc((t.title + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase());
    var childrenHtml = kids.length ? '<div class="dev-children">' + kids.map(function (k) { return devTreeRowDesktop(k, depth + 1); }).join('') + '</div>' : '';
    var pr = devPriority(t);
    var cls = 'dev-task' + (kids.length ? ' dev-haskids' : '') + (pr ? ' dev-pr-' + pr.cls : '');
    return '<details class="' + cls + '" data-s="' + s + '">' +
      devNodeSummary(node.label, t, kids) + devDetailPanel(t) + childrenHtml +
    '</details>';
  }

  // ---- MOBILE tree: flattened + card-based (≤768px). An epic (parent card) collapses to a thin
  // label + sub-count — its generic title isn't something to tap; leaf tasks become clean,
  // color-coded cards. One tap on a card opens its detail; the GitHub icon opens the issue. ----
  function devMobileCard(t) {
    var pr = devPriority(t), st = devStatus(t), closed = t.state === 'closed';
    var s = devEsc((t.title + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase());
    // drag-to-move between columns — עידן only, desktop board only (flag set per paint in devPaint)
    var drag = window._devDragOn ? ' draggable="true" ondragstart="devDragStart(event,' + t.number + ')"' : '';
    return '<details class="dev-mtask' + (pr ? ' dev-pr-' + pr.cls : '') + '"' + drag + ' data-s="' + s + '">' +
      '<summary class="dev-mtask-sum">' +
        '<div class="dev-mtask-row">' +
          (window._devSelMode ? '<input type="checkbox" class="dev-selbox" ' + (window._devSel[t.number] ? 'checked ' : '') + 'onclick="devToggleSel(event,' + t.number + ')" aria-label="בחר משימה">' : '') +
          '<span class="dev-mtask-title">' + devEsc(t._p.desc || t.title) + '</span>' +
          '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח ב-GitHub">' + DEV_GH + '</a>' +
        '</div>' +
        '<div class="dev-mtask-meta">' +
          (st ? '<span class="dev-status dev-status-' + st.cls + '">' + devEsc(st.label) + '</span>' : '') +
          devPrioControl(t) +
          '<span class="dev-mtask-num"><bdi dir="ltr">#' + devEsc(String(t.number)) + '</bdi></span>' +
          (t.assignee ? '<span class="dev-mtask-asg">👤 <bdi>' + devEsc(t.assignee) + '</bdi></span>' : '') +
          (closed ? '<span class="dev-done" title="סגור">✅</span>' : '') +
        '</div>' +
      '</summary>' +
      devStamps(t) +
      (t.body ? '<div class="dev-detail-body">' + devEsc(t.body) + '</div>' : '<div class="dev-detail-empty">— אין תיאור זמין —</div>') +
    '</details>';
  }
  // mobile tree row — a leaf is a card, a node with sub-issues collapses to a thin label + count
  // (its generic title isn't something to tap) and flattens its children under it.
  function devTreeRowMobile(node, depth) {
    var t = node.task, kids = node.children;
    if (!kids.length) return devMobileCard(t);
    var pr = devPriority(t);
    return '<div class="dev-mepic-wrap' + (depth ? ' dev-mepic-sub' : '') + '">' +
      '<div class="dev-mepic">' +
        '<span class="dev-mepic-name">' + devEsc(node.label) + '</span>' +
        (pr ? '<span class="dev-prio dev-prio-' + pr.cls + '">' + devEsc(pr.label) + '</span>' : '') +
        '<span class="dev-mepic-n">' + kids.length + ' תת-משימות</span>' +
        '<a class="dev-git" href="' + devEsc(t.url) + '" target="_blank" rel="noopener" onclick="devGitOpen(event,this)" title="פתח ב-GitHub">' + DEV_GH + '</a>' +
      '</div>' +
      '<div class="dev-mgroup">' + kids.map(function (k) { return devTreeRowMobile(k, depth + 1); }).join('') + '</div>' +
    '</div>';
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

  // ═══════════════ PURE layout builders (spec §7d) — no DOM, no globals ═══════════════
  // They are the unit under test (test-devboard.mjs evaluates this module and calls them), so
  // anything with a rule in it lives HERE and the render functions below only paint.

  // Board layout: the four full columns, plus a rail of every other column as a minimized chip.
  // Tapping a chip (devToggleRail) puts its key in `expanded`, which appends it as a 5th column
  // IN PLACE while leaving the chip in the rail (flagged) so a second tap collapses it again.
  //   → { full: [{key, tasks}], rail: [{key, count, expanded}] }
  // PER-TICKET placement: EVERY ticket (parent or child) sits in the column matching ITS OWN
  // status — so a pushed child actually moves and a column's count equals the cards it shows.
  function devBoardLayout(tasks, expanded) {
    var exp = {}; (expanded || []).forEach(function (k) { exp[k] = true; });
    var byStage = {}; DEV_STAGES.forEach(function (s) { byStage[s.key] = []; });
    (tasks || []).forEach(function (t) { var k = devStage(t); if (byStage[k]) byStage[k].push(t); });
    // order = GitHub Project board order (t.pos from the projectV2 items query); tickets not on the
    // board fall to the end (pos defaults to 1e9). ponytail: pos is the project's global item order,
    // the closest the API exposes — per-column board drag-order isn't queryable.
    var pos = function (t) { return (typeof t.pos === 'number') ? t.pos : 1e9; };
    DEV_STAGES.forEach(function (s) { byStage[s.key].sort(function (a, b) { return pos(a) - pos(b); }); });
    var full = DEV_FULL_KEYS.map(function (k) { return { key: k, tasks: byStage[k] }; });
    var rail = [];
    DEV_STAGES.forEach(function (s) {
      if (DEV_FULL_KEYS.indexOf(s.key) !== -1) return;
      var on = !!exp[s.key];
      rail.push({ key: s.key, count: byStage[s.key].length, expanded: on });
      if (on) full.push({ key: s.key, tasks: byStage[s.key] });
    });
    return { full: full, rail: rail };
  }

  // Stacked-bar segments from a {stageKey: count} map, in pipeline order, as INTEGER percentages
  // that sum to exactly 100 (largest-remainder; ties broken by pipeline order so it is stable).
  function devPctSegments(counts) {
    var total = 0; DEV_STAGES.forEach(function (s) { total += counts[s.key] || 0; });
    if (!total) return [];
    var out = [];
    DEV_STAGES.forEach(function (s, i) {
      var n = counts[s.key] || 0; if (!n) return;
      var exact = n * 100 / total;
      out.push({ key: s.key, label: s.label, n: n, pct: Math.floor(exact), _rem: exact - Math.floor(exact), _i: i });
    });
    var left = 100 - out.reduce(function (a, x) { return a + x.pct; }, 0);
    out.slice()
      .sort(function (a, b) { return (b._rem - a._rem) || (a._i - b._i); })
      .slice(0, Math.max(0, Math.min(left, out.length)))
      .forEach(function (x) { x.pct += 1; });
    out.forEach(function (x) { delete x._rem; delete x._i; });
    return out;
  }
  // Flow strip: one stacked bar for the WHOLE board — a mini Sankey without the ribbons.
  function devFlowSegments(tasks) {
    var counts = {};
    (tasks || []).forEach(function (t) { var k = devStage(t); counts[k] = (counts[k] || 0) + 1; });
    return devPctSegments(counts);
  }

  // Tree: the GitHub sub-issue tree. A parentless issue WITH sub-issues is a נושא row (root); a
  // parentless issue without them has no נושא, so it lands in the ללא-נושא bucket (always last).
  // Filters: hideDone (done leaves go; a container with nothing live left under it goes too — that
  // is the "root whose children are all done disappears" rule), assignee, stage (= column), q.
  //   → [{ key, number, task, label, stage, children, bar, n }]
  function devTreeMatch(t, o) {
    if (o.stage && devStage(t) !== o.stage) return false;
    if (o.assignee && String(t.assignee || '') !== o.assignee) return false;
    if (o.q) {
      var s = (String(t.title || '') + ' #' + t.number + ' ' + (t.assignee || '') + ' ' + (t.status || '')).toLowerCase();
      if (s.indexOf(String(o.q).toLowerCase()) === -1) return false;
    }
    return true;
  }
  function devTree(tasks, opts) {
    var o = opts || {}, list = tasks || [];
    var byNum = {}; list.forEach(function (t) { byNum[t.number] = t; });
    var kids = {}, tops = [];
    list.forEach(function (t) {
      if (t.parent && byNum[t.parent]) (kids[t.parent] = kids[t.parent] || []).push(t);
      else tops.push(t);   // no parent, or a parent outside the fetched set (orphans still surface)
    });
    // the ROOT row keeps its whole "נושא › תת-נושא › תיאור" path; a child drops the (redundant)
    // group topic, so same-topic children read cleanly and cross-topic ones keep their full path.
    function mk(t, children, groupTopic, depth) {
      var n = 1; children.forEach(function (c) { n += c.n; });
      return { key: 'i' + t.number, number: t.number, task: t, groupTopic: groupTopic,
        label: devNodeLabel(t, depth === 0, depth === 0 ? '' : groupTopic),
        stage: devStage(t), children: children, n: n };
    }
    function node(t, depth, groupTopic) {
      var raw = depth < 6 ? (kids[t.number] || []) : [];
      var children = raw.map(function (c) { return node(c, depth + 1, groupTopic); }).filter(Boolean);
      var st = devStage(t);
      if (raw.length) {
        if (children.length) return mk(t, children, groupTopic, depth);
        // a container with nothing left under it survives only if IT matches an explicit filter
        if (o.hideDone && DEV_DONE_KEYS[st]) return null;
        return (o.stage || o.assignee || o.q) && devTreeMatch(t, o) ? mk(t, [], groupTopic, depth) : null;
      }
      if (o.hideDone && DEV_DONE_KEYS[st]) return null;
      return devTreeMatch(t, o) ? mk(t, [], groupTopic, depth) : null;
    }
    function bar(children, self) {
      var counts = {};
      (function walk(ns) { ns.forEach(function (x) { counts[x.stage] = (counts[x.stage] || 0) + 1; walk(x.children); }); })(children);
      if (self) counts[self.stage] = (counts[self.stage] || 0) + 1;
      return devPctSegments(counts);
    }
    var roots = [], loose = [];
    tops.forEach(function (t) {
      if (!(kids[t.number] || []).length) { var lf = node(t, 0, ''); if (lf) loose.push(lf); return; }
      var r = node(t, 0, (t._p || devParseT(t.title)).topic);
      if (r) { r.bar = bar(r.children, r); roots.push(r); }
    });
    if (loose.length) {
      var n = 0; loose.forEach(function (x) { n += x.n; });
      roots.push({ key: 'none', number: null, task: null, groupTopic: '', label: 'ללא נושא',
        stage: null, children: loose, n: n, bar: bar(loose, null) });
    }
    return roots;
  }

  // ═══════════════ RENDER (paint only — every rule is in the pure builders above) ═══════════════

  // The board: four full columns + the minimized rail (spec §7d). Both carry .dev-stage and
  // data-stage, so the drag/drop wiring at the bottom of this file needs no second code path —
  // dropping a card on a rail chip writes the same status as dropping it on a full column.
  function renderDevBoard(d, f) {
    d = d || window._devData; f = (f === undefined) ? window._devFilter : f;
    var tasks = (d.tasks || []).filter(function (t) { return devMatchFilter(t, f); });
    var L = devBoardLayout(tasks, window._devExpanded);
    var cols = L.full.map(function (c) {
      var s = DEV_STAGE[c.key];
      var inner = c.tasks.length ? c.tasks.map(devMobileCard).join('') : '<div class="dev-stage-empty">—</div>';
      return '<details class="dev-stage dev-stage-' + c.key + '" data-stage="' + c.key + '" open>' +
        '<summary class="dev-stage-sum"><span class="dev-stage-ico" aria-hidden="true">' + s.ico + '</span>' +
        '<span class="dev-stage-name">' + devEsc(s.label) + '</span>' +
        '<span class="dev-stage-n">' + c.tasks.length + '</span><span class="dev-topic-caret" aria-hidden="true">⌄</span></summary>' +
        '<div class="dev-stage-body">' + inner + '</div></details>';
    }).join('');
    var rail = L.rail.map(function (r) {
      var s = DEV_STAGE[r.key];
      return '<button type="button" class="dev-stage dev-rail-chip dev-stage-' + r.key + (r.expanded ? ' active' : '') + '"' +
        ' data-stage="' + r.key + '" onclick="devToggleRail(\'' + r.key + '\')"' +
        ' aria-expanded="' + (r.expanded ? 'true' : 'false') + '" title="' + devEsc(s.label) + ' · ' + r.count + '">' +
        '<span class="dev-rail-dot" aria-hidden="true"></span>' +
        '<span class="dev-rail-name">' + devEsc(s.label) + '</span>' +
        '<span class="dev-stage-n">' + r.count + '</span></button>';
    }).join('');
    return '<div class="dev-board"><div class="dev-board-grid">' + cols + '</div>' +
      (rail ? '<div class="dev-rail">' + rail + '</div>' : '') + '</div>';
  }

  // The flow strip: one stacked bar for the whole board; a tap filters the board/tree to that stage.
  function renderFlowStrip(d, f) {
    d = d || window._devData; f = (f === undefined) ? window._devFilter : f;
    var segs = devFlowSegments((d && d.tasks) || []);
    if (!segs.length) return '';
    var bar = segs.map(function (s) {
      var on = !!f && f.type === 'stage' && f.val === s.key;
      return '<button type="button" class="dev-flow-seg' + (on ? ' active' : '') + '"' +
        ' style="width:' + s.pct + '%;background:var(--stage-' + s.key + ')"' +
        ' onclick="devSetFilter({type:\'stage\',val:\'' + s.key + '\'})"' +
        ' title="' + devEsc(s.label) + ' · ' + s.n + '" aria-label="' + devEsc(s.label) + ' · ' + s.n + '">' +
        '<span class="dev-flow-n">' + s.n + '</span></button>';
    }).join('');
    return '<div class="dev-flow"><div class="dev-flow-cap">זרימת הלוח</div>' +
      '<div class="dev-flow-bar">' + bar + '</div></div>';
  }

  // The tree view: one row per נושא (root issue), children indented, a stacked status bar per root.
  function renderDevTree(d, f) {
    d = d || window._devData; f = (f === undefined) ? window._devFilter : f;
    var roots = devTree((d && d.tasks) || [], {
      hideDone: !!window._devHideDone,
      assignee: window._devAssignee || '',
      stage: (f && f.type === 'stage') ? f.val : '',
      q: window._devQ || ''
    });
    if (!roots.length) return '<div class="dev-empty">אין משימות בסינון הזה.</div>';
    var mobile = devIsMobile();
    var openAll = window._devTreeOpen;
    return roots.map(function (r, i) {
      var bar = r.bar.map(function (s) {
        return '<span style="width:' + s.pct + '%;background:var(--stage-' + s.key + ')" title="' + devEsc(s.label) + ' · ' + s.n + '"></span>';
      }).join('');
      var body = r.children.map(function (c) { return mobile ? devTreeRowMobile(c, 0) : devTreeRowDesktop(c, 0); }).join('');
      var open = (openAll === false) ? '' : ((openAll === true || i === 0 || !!f || !!window._devQ) ? ' open' : '');
      return '<details class="dev-troot" id="dtroot-' + i + '"' + open + '>' +
        '<summary class="dev-troot-sum">' +
          '<span class="dev-topic-ico" aria-hidden="true">' + (r.task ? '🌳' : '📄') + '</span>' +
          '<span class="dev-topic-name"><bdi>' + devEsc(r.label) + '</bdi></span>' +
          (r.stage ? '<span class="dev-status dev-status-' + r.stage + '">' + devEsc(DEV_STAGE[r.stage].label) + '</span>' : '') +
          '<span class="dev-topic-n">' + r.n + '</span><span class="dev-topic-caret" aria-hidden="true">⌄</span>' +
        '</summary>' +
        '<div class="dev-troot-bar" aria-hidden="true">' + bar + '</div>' +
        '<div class="dev-topic-body">' + body + '</div></details>';
    }).join('');
  }

  // ----- Status-entry day-stamps (Supabase `dev_status_log`, forward-tracking; see db/dev_status_log.sql) -----
  function devFmtDay(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? (+p[2]) + '.' + (+p[1]) : ''; }
  function devStamps(t) {
    var log = (window._devStatusLog && window._devStatusLog[t.number]) || null;
    if (!log) return '';
    var names = { fields: 'תחומים', backlog: 'Backlog', scope: 'אפיון', ready: 'Sprint Ready', prog: 'בפיתוח', review: 'בדיקות', committed: 'עלה' };
    var parts = DEV_STAGES.map(function (s) { return log[s.key] ? names[s.key] + ' ' + devFmtDay(log[s.key]) : null; }).filter(Boolean);
    return parts.length ? '<div class="dev-stamps">' + parts.join(' · ') + '</div>' : '';
  }
  // load the whole log once (anon read) → { issue: { stageKey: 'YYYY-MM-DD' } }
  async function devLoadStatusLog() {
    try {
      var r = await fetch(SB_URL + '/rest/v1/dev_status_log?select=issue,status,day', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON } });
      if (!r.ok) return;
      var rows = await r.json();
      var m = {}; rows.forEach(function (x) { (m[x.issue] = m[x.issue] || {})[x.status] = x.day; });
      window._devStatusLog = m;
    } catch (e) { /* graceful: no stamps (table may not exist yet) */ }
  }
  // record today's date for each ticket's CURRENT stage, once per (issue,stage). Needs the auth pass (RLS).
  async function devLogStatuses(tasks) {
    var tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : null;
    if (!tok) return;
    var n = new Date(), day = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    var log = window._devStatusLog || {};
    var rows = tasks.map(function (t) { return { issue: t.number, status: devStage(t), day: day }; })
      .filter(function (x) { return !(log[x.issue] && log[x.issue][x.status]); });
    if (!rows.length) return;
    try {
      var r = await fetch(SB_URL + '/rest/v1/dev_status_log?on_conflict=issue,status', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows)
      });
      if (r.ok) rows.forEach(function (x) { (window._devStatusLog = window._devStatusLog || {}, window._devStatusLog[x.issue] = window._devStatusLog[x.issue] || {})[x.status] = x.day; });
    } catch (e) { /* graceful */ }
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

    // status-log day-stamps: load the log once per session (anon read), then repaint so stamps appear
    if (!window._devLogLoaded) { window._devLogLoaded = true; devLoadStatusLog().then(function () { devPaint(); }); }

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
      devLogStatuses(tasks).then(function () { devPaint(); });   // stamp current stages → day-stamps
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

    var view = devView();
    var active = function (s) { return window._devState === s ? ' active' : ''; };
    var vactive = function (v) { return view === v ? ' active' : ''; };
    var fchip = f ? '<div class="dev-fchip">מציג: ' + devEsc(devFilterLabel(f)) + ' <button type="button" onclick="devSetFilter(null)" aria-label="נקה סינון">✕</button></div>' : '';
    // cache line: shows it's served from the local store + freshness + (refreshing… / refresh-failed)
    var c = window._devCache, cacheLine = '';
    if (c) cacheLine = '<div class="dev-cacheline">📦 נשמר מקומית · עודכן ' + devEsc(devAgo(c.at)) +
      (c.refreshing ? ' · <span class="dev-refreshing">מרענן…</span>' : '') +
      (c.error ? ' · <span class="dev-refresherr">רענון נכשל</span>' : '') + '</div>';
    // sprint actions (board view only): multi-select → push to Sprint Ready, and "version released"
    var mobilePre = devIsMobile();
    // drag-to-move: עידן only, desktop board only (cards get draggable + columns accept drops)
    window._devDragOn = (view === 'board') && !mobilePre && (typeof isIdan === 'function' && isIdan());
    var actions = (view === 'board') ? '<div class="dev-actions">' +
      '<button class="inv-btn small' + (window._devSelMode ? ' active' : '') + '" onclick="devToggleSelMode()">' + (window._devSelMode ? '✕ בטל בחירה' : '☑️ בחר משימות') + '</button>' +
      (window._devDragOn ? '<span class="dev-drag-hint" style="font-size:11px;color:#94a3b8;align-self:center;">✋ אפשר לגרור משימה בין עמודות</span>' : '') +
      '<button class="inv-btn small dev-release-btn" onclick="devReleaseVersion(this)" title="לשימוש רק בעת העלאת גרסה אמיתית — מעביר את כל \'' + DEV_STAGE.review.label + '\' ל\'עלה לאוויר\'">🚀 עלתה גרסה</button>' +
      '</div>' : devTreeControls(d, f);
    var head = '<div class="dev-toolbar">' +
      '<input id="devSearch" class="dev-search" oninput="devFilter(this.value)" placeholder="🔍 חיפוש משימה…" inputmode="search">' +
      '<div class="dev-view-btns">' +
        '<button class="inv-btn small' + vactive('board') + '" onclick="devSetView(\'board\')">🗂 לוח</button>' +
        '<button class="inv-btn small' + vactive('tree') + '" onclick="devSetView(\'tree\')">🌳 עץ</button>' +
      '</div>' +
      '<div class="dev-state-btns">' +
        '<button class="inv-btn small' + active('open') + '" onclick="devSetState(\'open\')">פתוחות</button>' +
        '<button class="inv-btn small' + active('all') + '" onclick="devSetState(\'all\')">הכל</button>' +
      '</div></div>' + actions + cacheLine + fchip;

    // "בפיתוח עכשיו" spotlight — only in tree view (the board has its own In-Progress column),
    // and hidden while a filter is active (focused view).
    var ipBox = '';
    if (!f && view !== 'board') {
      var inProg = d.tasks.filter(devInProgress);
      var recent, ipSub;
      if (inProg.length) { recent = inProg.slice(0, 12); ipSub = '· לפי סטטוס'; }
      else { recent = d.tasks.filter(function (t) { return t.state !== 'closed'; }).slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 6); ipSub = '· פעילות אחרונה'; }
      ipBox = recent.length ? '<div class="card dev-now"><h3 class="dev-now-head">🔨 בפיתוח עכשיו <span class="dev-now-sub">' + ipSub + '</span></h3>' +
        '<div class="dev-now-list">' + recent.map(devTaskNode).join('') + '</div></div>' : '';
    }

    var bodyHtml = !d.tasks.length ? '<div class="dev-empty">אין משימות להצגה.</div>'
      : (view === 'board' ? renderDevBoard(d, f) : renderDevTree(d, f));
    // sticky action bar for multi-select (shown only in select mode)
    var selBar = window._devSelMode ? '<div id="devSelBar" class="dev-selbar" style="display:flex">' +
      '<span class="dev-selbar-n">' + devSelCount() + ' נבחרו</span>' +
      '<button class="inv-btn small dev-selbar-push" onclick="devPushToReady(this)"' + (devSelCount() ? '' : ' disabled') + '>🟢 העבר משימות לספרינט הקרוב</button>' +
      '<button class="inv-btn small" onclick="devToggleSelMode()">בטל</button>' +
      '</div>' : '';
    el.innerHTML = '<div class="dev-wrap' + (view === 'board' ? ' dev-wrap-board' : '') + '">' +
      devHero(d, f, matchCounts, colorOf) + renderFlowStrip(d, f) + head + ipBox + bodyHtml + selBar + '</div>';

    // restore the live text search across the re-paint
    var sb = document.getElementById('devSearch');
    if (sb && window._devQ) { sb.value = window._devQ; window.devFilter(window._devQ); }
  }

  // repaint on resize — mobile/desktop layout + board grid are decided per paint, so a
  // rotation or window resize must re-render (only when the dev page is actually visible)
  var _devResizeT = null;
  window.addEventListener('resize', function () {
    clearTimeout(_devResizeT);
    _devResizeT = setTimeout(function () {
      var v = document.getElementById('dev-view');
      if (v && v.style.display !== 'none' && window._devData) devPaint();
    }, 250);
  });

  // toggle a tile filter: same tile (or null) clears, otherwise apply. Repaints from cache (no fetch).
  window.devSetFilter = function (f) {
    var c = window._devFilter;
    var same = !!c && !!f && c.type === f.type && (c.val || '') === (f.val || '');
    window._devFilter = (!f || same) ? null : f;
    devPaint();
  };

  // the column select in the tree toolbar SETS (never toggles) — a <select> has no "tap again"
  window.devSetStageFilter = function (v) { window._devFilter = v ? { type: 'stage', val: v } : null; devPaint(); };

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
    document.querySelectorAll('#devTasksContent .dev-troot').forEach(function (dd) {
      var any = Array.prototype.some.call(dd.querySelectorAll('[data-s]'), function (t) { return t.style.display !== 'none'; });
      dd.style.display = any ? '' : 'none'; if (q) dd.open = any;
    });
  };

  window.devSetState = function (s) { window._devState = s; window._devFilter = null; renderDevTasks(); };

  // ----- view: 🗂 לוח (board) | 🌳 עץ (tree). Remembered PER DEVICE (spec §7d: "tree is the
  // recommended mobile default, remembered per device"), so the phone can sit on the tree while
  // the desktop sits on the board. Instant — a view flip never re-fetches. -----
  var DEV_VIEW_KEY = 'dev_view';
  function devIsMobile() { return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches); }
  function devView() {
    var v = window._devView;
    if (v === 'status') v = 'board';          // back-compat with the pre-§7d names
    if (v === 'topic') v = 'tree';
    if (v === 'board' || v === 'tree') return (window._devView = v);
    try {
      var s = localStorage.getItem(DEV_VIEW_KEY);
      if (s === 'board' || s === 'tree') return (window._devView = s);
    } catch (e) { /* private mode — fall through to the per-device default */ }
    return (window._devView = devIsMobile() ? 'tree' : 'board');
  }
  window.devSetView = function (v) {
    v = (v === 'tree') ? 'tree' : 'board';
    window._devView = v;
    try { localStorage.setItem(DEV_VIEW_KEY, v); } catch (e) { /* best-effort */ }
    devPaint();
  };
  // ----- the minimized rail: tap a chip to expand that column in place, tap again to collapse -----
  window._devExpanded = [];
  window.devToggleRail = function (key) {
    var a = window._devExpanded || (window._devExpanded = []);
    var i = a.indexOf(key);
    if (i === -1) a.push(key); else a.splice(i, 1);
    devPaint();
  };
  // ----- tree toolbar: הסתר שבוצע · by assignee · by column · פתח/כווץ הכל -----
  window.devToggleHideDone = function () { window._devHideDone = !window._devHideDone; devPaint(); };
  window.devSetAssignee = function (v) { window._devAssignee = v || ''; devPaint(); };
  window.devTreeAll = function (open) { window._devTreeOpen = !!open; devPaint(); };
  function devTreeControls(d, f) {
    var who = {};
    (d.tasks || []).forEach(function (t) { if (t.assignee) who[t.assignee] = true; });
    var cur = window._devAssignee || '';
    var asg = '<select class="dev-select" aria-label="סינון לפי אחראי" onchange="devSetAssignee(this.value)">' +
      '<option value=""' + (cur ? '' : ' selected') + '>כל האחראים</option>' +
      Object.keys(who).sort().map(function (a) {
        return '<option value="' + devEsc(a) + '"' + (cur === a ? ' selected' : '') + '>' + devEsc(a) + '</option>';
      }).join('') + '</select>';
    var st = (f && f.type === 'stage') ? f.val : '';
    var col = '<select class="dev-select" aria-label="סינון לפי עמודה" onchange="devSetStageFilter(this.value)">' +
      '<option value=""' + (st ? '' : ' selected') + '>כל העמודות</option>' +
      DEV_STAGES.map(function (s) {
        return '<option value="' + s.key + '"' + (st === s.key ? ' selected' : '') + '>' + devEsc(s.label) + '</option>';
      }).join('') + '</select>';
    return '<div class="dev-actions">' +
      '<button class="inv-btn small' + (window._devHideDone ? ' active' : '') + '" onclick="devToggleHideDone()" aria-pressed="' + (window._devHideDone ? 'true' : 'false') + '">🙈 הסתר שבוצע</button>' +
      asg + col +
      '<button class="inv-btn small" onclick="devTreeAll(true)">פתח הכל</button>' +
      '<button class="inv-btn small" onclick="devTreeAll(false)">כווץ הכל</button>' +
      '</div>';
  }

  // ----- WRITE: one project field, via the github fn (needs a project write token + redeploy) --
  // Status and Priority were two byte-identical copies of this (fix round 3, F14 ⑧) and
  // NEITHER had a deadline, while the read at devFetchTasks did (F6). One function now, with
  // the same 20 s budget as the read — `fetchWithTimeout` lives in js/src/00-guard.js.
  async function devWriteField(mode, numbers, value) {
    var tok = (typeof getEmsToken === 'function') ? getEmsToken() : '';
    if (!tok) throw new Error('יש להתחבר ל-EMS');
    var body = { token: tok, mode: mode, numbers: numbers };
    if (mode === 'setStatus') body.status = value; else body.priority = value;
    var r = await fetchWithTimeout(SB_URL + '/functions/v1/github', {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 20000);
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ('github ' + r.status));
    if (!d || !('updated' in d)) throw new Error('צריך לפרוס מחדש את פונקציית github (אין עדיין כתיבה)');
    return d;   // { updated:[], failed:[], statusOptions:[], target }
  }
  function devWriteStatus(numbers, targetName) { return devWriteField('setStatus', numbers, targetName); }
  function devWritePriority(numbers, label) { return devWriteField('setPriority', numbers, label); }
  // selection mode (multi-select tickets → push to Ready)
  window._devSel = {};
  window.devToggleSelMode = function () { window._devSelMode = !window._devSelMode; window._devSel = {}; devPaint(); };
  window.devToggleSel = function (e, n) {
    if (e) e.stopPropagation();
    if (window._devSel[n]) delete window._devSel[n]; else window._devSel[n] = true;
    var bar = document.getElementById('devSelBar'); if (bar) devPaintSelBar(bar);
  };
  function devSelCount() { return Object.keys(window._devSel || {}).length; }
  function devPaintSelBar(bar) {
    var n = devSelCount();
    bar.querySelector('.dev-selbar-n').textContent = n + ' נבחרו';
    bar.querySelector('.dev-selbar-push').disabled = !n;
  }
  // build a result message; surfaces per-ticket failure reasons + the project's actual Status options
  function devWriteResult(d, okLabel) {
    var ok = (d.updated || []).length, fail = (d.failed || []);
    var msg = '✅ ' + okLabel + ': ' + ok;
    if (fail.length) {
      msg += ' · נכשלו: ' + fail.length + '\n' + fail.slice(0, 6).map(function (x) { return '#' + x.number + ' — ' + x.error; }).join('\n');
      if (d.statusOptions && d.statusOptions.length) msg += '\n\nאופציות Status בפרויקט: ' + d.statusOptions.join(' · ');
    }
    return { msg: msg, ok: ok, fail: fail.length };
  }
  window.devPushToReady = async function (btn) {
    var numbers = Object.keys(window._devSel || {}).map(Number);   // flat board → each selected card moves on its own
    if (!numbers.length) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ מעביר…'; }
    try {
      var res = devWriteResult(await devWriteStatus(numbers, 'Sprint Ready'), 'הועברו ל"' + DEV_STAGE.ready.label + '"');
      if (res.fail) alert(res.msg); else if (typeof toast === 'function') toast(res.msg); else alert(res.msg);
      if (res.ok) { window._devSelMode = false; window._devSel = {}; renderDevTasks(true); }   // refresh so the board reflects the move
      else if (btn) { btn.disabled = false; btn.textContent = '🟢 העבר משימות לספרינט הקרוב'; }
    } catch (e) {
      alert('שגיאה: ' + (e && e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = '🟢 העבר משימות לספרינט הקרוב'; }
    }
  };
  // "עלתה גרסה" → move everything currently in review (שלבי בדיקות) to Committed (עלה לאוויר).
  // ponytail (ported from 91c0d5a): the board's old "Done" column (גמר פיתוח ממתין לגרסה) was
  // removed in the 2026-09-08 rework, so this button's source column is INFERRED as In Review —
  // the step right before a release. Flagged to עידן in the Task 11 report; the confirm dialog
  // below names the source column, so a wrong assumption is visible before anything is written.
  window.devReleaseVersion = async function (btn) {
    var d = window._devData; if (!d) return;
    var nums = d.tasks.filter(function (t) { return devStage(t) === 'review'; }).map(function (t) { return t.number; });
    if (!nums.length) { alert('אין משימות ב"' + DEV_STAGE.review.label + '".'); return; }
    if (!confirm('להעביר ' + nums.length + ' משימות מ"' + DEV_STAGE.review.label + '" ל"עלה לאוויר"?')) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
    try {
      var res = devWriteResult(await devWriteStatus(nums, 'Committed'), 'עלו לאוויר');
      if (res.fail) alert(res.msg); else if (typeof toast === 'function') toast(res.msg); else alert(res.msg);
      if (res.ok) renderDevTasks(true);
      if (btn) { btn.disabled = false; btn.textContent = '🚀 עלתה גרסה'; }
    } catch (e) {
      alert('שגיאה: ' + (e && e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = '🚀 עלתה גרסה'; }
    }
  };
  // ----- drag a card to another column OR onto a minimized rail chip (עידן only, desktop board) -----
  // Writes through the same `github` fn setStatus path as דחוף-לספרינט. Ported from 91c0d5a and
  // re-checked against supabase/functions/github/index.ts → optionRegexFor(): "Sprint Ready" /
  // "Committed" / "Backlog" / "In Progress" / "In Review" hit its keyword families unchanged, and
  // "Main Fields" / "Scope Refinement" match none of them, so they fall through to its literal
  // regex — which matches the live option names exactly. No function redeploy needed for either.
  var DEV_STAGE_TARGET = { fields: 'Main Fields', backlog: 'Backlog', scope: 'Scope Refinement', ready: 'Sprint Ready', prog: 'In Progress', review: 'In Review', committed: 'Committed' };
  window.devDragStart = function (e, n) {
    try { e.dataTransfer.setData('text/plain', String(n)); e.dataTransfer.effectAllowed = 'move'; } catch (er) {}
  };
  (function devDragWire() {
    var root = document.getElementById('devTasksContent');
    if (!root) return;
    root.addEventListener('dragover', function (e) {
      if (!window._devDragOn) return;
      var st = e.target.closest && e.target.closest('.dev-stage');
      if (st) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; st.classList.add('dev-drop-hover'); }
    });
    root.addEventListener('dragleave', function (e) {
      var st = e.target.closest && e.target.closest('.dev-stage');
      if (st) st.classList.remove('dev-drop-hover');
    });
    root.addEventListener('drop', async function (e) {
      if (!window._devDragOn) return;
      var st = e.target.closest && e.target.closest('.dev-stage');
      if (!st) return;
      e.preventDefault();
      st.classList.remove('dev-drop-hover');
      var n = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var key = st.getAttribute('data-stage');
      if (!n || !key || !DEV_STAGE_TARGET[key]) return;
      var t = (window._devData && window._devData.tasks || []).find(function (x) { return x.number === n; });
      if (!t || devStage(t) === key) return;   // dropped back on its own column
      var stage = DEV_STAGES.find(function (s) { return s.key === key; });
      var old = t.status;
      t.status = DEV_STAGE_TARGET[key];   // optimistic — repaint now, revert on failure
      devPaint();
      try {
        var d = await devWriteStatus([n], DEV_STAGE_TARGET[key]);
        if ((d.updated || []).indexOf(n) === -1) throw new Error((d.failed && d.failed[0] && d.failed[0].error) || 'לא עודכן');
        devSaveCache(window._devState, window._devData.tasks);   // keep the offline cache consistent with the move
        if (typeof toast === 'function') toast('✅ #' + n + ' הועבר ל"' + stage.label + '"');
      } catch (er) {
        t.status = old;
        devPaint();
        alert('העברת #' + n + ' נכשלה: ' + (er && er.message || er));
      }
    });
  })();

  window.renderDevTasks = renderDevTasks;
  window.canSeeDevTasks = canSeeDevTasks;
  // the PURE builders (spec §7d) — exposed so test-devboard.mjs asserts on the SHIPPED functions
  // instead of a copy of them. Nothing in the app calls them through window.
  window.devStage = devStage;
  window.devBoardLayout = devBoardLayout;
  window.devTree = devTree;
  window.devFlowSegments = devFlowSegments;
  window.devStageKeys = DEV_STAGES.map(function (s) { return s.key; });
  window.devFullKeys = DEV_FULL_KEYS;
