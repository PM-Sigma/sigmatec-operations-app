  // ═══════════════════════════════════════════════════════════════════════════
  // EMS shared CACHE + outbound QUEUE  (Phase 1)
  // ---------------------------------------------------------------------------
  // The Sheet holds a full snapshot of OPEN EMS tasks (EMS_CACHE), refreshed on
  // every successful connect, PLUS an outbound QUEUE (EMS_QUEUE) of writes made
  // while disconnected. All EMS users are admins → full-replace snapshot and any
  // connected user may flush the queue. This is what lets field users (who don't
  // connect to EMS) still SEE open tasks on kibbutz cards, and lets their visit
  // summaries reach EMS on the next connect by anyone.
  // ═══════════════════════════════════════════════════════════════════════════
  function emsOpenStatuses() {
    return Object.keys(EMS_STATUS).filter(s => EMS_CLOSED.indexOf(s) === -1);
  }
  function emsCacheData() {
    const c = window.SHEET_DATA && window.SHEET_DATA.emsCache;
    return (c && Array.isArray(c.tasks)) ? c : { tasks: [], syncedAt: '', syncedBy: '' };
  }
  // Open EMS tasks for a kibbutz card — reads the shared cache, resolves via the
  // bridge map (aggregates across merged sites, e.g. שדה אליהו + חקלאות).
  function emsCacheTasksForKibbutz(name) {
    const ids = kibbutzSiteIds(name);
    if (!ids.length) return [];
    return emsCacheData().tasks.filter(t => t.site && ids.indexOf(t.site.id) !== -1 && EMS_CLOSED.indexOf(t.status) === -1);
  }

  // Pull ALL open tasks from EMS (paginated) and write a fresh snapshot to the Sheet.
  async function emsSyncCache() {
    if (!isEmsConnected()) return { cached: 0 };
    const TAKE = 200;
    const open = [];
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({ page: page, take: TAKE });
      emsOpenStatuses().forEach(s => params.append('status', s));
      const res = await emsApi('/employee-tasks?' + params.toString());
      const batch = res.data || (Array.isArray(res) ? res : []);
      open.push.apply(open, batch);
      const total = (res.meta && (res.meta.total != null ? res.meta.total : res.meta.count));
      // stop on: empty page, short page (last page), reached total, or page cap. The short-page
      // check also guards APIs that omit meta.total and clamp page → repeating full pages.
      if (batch.length < TAKE || (total != null && open.length >= total)) break;
      if (page >= 20) { console.warn('[EMS] cache sync hit page cap (20) — snapshot may be truncated at', open.length, 'of', total); break; }
      page++;
    }
    // de-dup by id (clamping/overlapping pages can repeat tasks)
    const _seen = {};
    const slim = open.filter(t => t && t.id && !_seen[t.id] && (_seen[t.id] = 1)).map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, type: t.type,
      site: t.site ? { id: t.site.id, name: t.site.name } : null,
      expectedCompletionDate: t.expectedCompletionDate || '',
      assignee: t.assignee ? { id: t.assignee.id, firstName: t.assignee.firstName, lastName: t.assignee.lastName } : null,
      linkType: (t.linkType || t.link_type || ''), linkCount: emsLinkIds(t).length
    }));
    const syncedBy = localStorage.getItem('dashboard_user_v1') || '';
    // ponytail: last-writer-wins snapshot — a slow sync could overwrite a fresher one.
    // Self-heals on the next connect/sync. Upgrade path: send fetch-start ts, server keeps newer.
    await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'emsCacheWrite', syncedBy: syncedBy, tasks: slim }) });
    if (window.SHEET_DATA) window.SHEET_DATA.emsCache = { tasks: slim, syncedAt: new Date().toISOString(), syncedBy: syncedBy };
    return { cached: slim.length };
  }

  // Outbound queue ---------------------------------------------------------
  function emsQueuePending() { return (window.SHEET_DATA && window.SHEET_DATA.emsQueue) || []; }
  // Enqueue a write to perform on the next connect. item = {kind:'comment'|'status', taskId, message?, status?, meta?}
  async function emsQueueAdd(item) {
    const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'emsQueueAdd', item: item }) });
    let id = null; try { const b = await r.json(); id = b && b.id; } catch (e) {}
    // reflect in memory immediately so a same-session flush sees the item with its server id
    if (id && window.SHEET_DATA) { (window.SHEET_DATA.emsQueue = window.SHEET_DATA.emsQueue || []).push(Object.assign({ id: id }, item)); }
    return id;
  }
  async function emsSendItem(item) {
    if (item.kind === 'comment') return emsApi('/employee-tasks/' + item.taskId + '/comments', { method: 'POST', body: JSON.stringify({ message: item.message }) });
    if (item.kind === 'status')  return emsApi('/employee-tasks/' + item.taskId, { method: 'PATCH', body: JSON.stringify({ status: item.status }) });
    // createTask — used by customer-order approval ("אספקת ציוד"). The site + assignee are resolved
    // at SEND time (works whether sent live or flushed later by another connected user).
    if (item.kind === 'createTask') {
      var body = { title: item.title, type: item.taskType || 'supplying_meters', priority: 'normal' };
      // Resolve the site at SEND time. A lookup ERROR (network) must NOT be swallowed — otherwise we'd
      // create a site-less task and dead-letter it forever. Let it throw so the item stays queued and
      // retries on the next connect. (A successful lookup that finds NO match returns '' → we proceed;
      // the task is still created and can be fixed in EMS.) Assignee stays best-effort — a flaky users
      // endpoint shouldn't block creating the task; it just gets created unassigned.
      if (item.kibbutz) { var sid = await emsSiteIdForKibbutz(item.kibbutz); if (sid) body.siteId = sid; }
      if (item.description) body.description = item.description;
      if (item.assigneeName) {
        try { var us = await getEmsUsers(); var u = (us || []).find(function (x) { return emsUserName(x).indexOf(item.assigneeName) !== -1; }); if (u) body.assigneeUserId = u.id; } catch (e) {}
      }
      return emsApi('/employee-tasks', { method: 'POST', body: JSON.stringify(body) });
    }
  }
  // Try a write live; queue it for next connect ONLY on connectivity/expiry errors.
  // A real API rejection (4xx/5xx — emsApi throws "(NNN) …") is NOT retryable: queuing
  // it would loop forever, so we surface it instead.
  async function emsWriteOrQueue(item) {
    if (isEmsConnected()) {
      try { await emsSendItem(item); return { sent: true }; }
      catch (e) {
        const httpErr = /^\(\d{3}\)/.test(e.message || '');
        if (httpErr && isEmsConnected()) return { sent: false, error: e.message };   // real rejection → don't queue
        /* connectivity/expiry → fall through to queue */
      }
    }
    await emsQueueAdd(item);
    return { sent: false, queued: true };
  }

  // Idempotency guard: ids we already sent to EMS but haven't confirmed-cleared from
  // the Sheet queue yet. Prevents duplicate EMS comments if emsQueueClear ever fails.
  function _emsFlushedIds() { try { return JSON.parse(localStorage.getItem('ems_flushed_ids_v1') || '[]'); } catch (e) { return []; } }
  function _emsAddFlushed(id) { const s = _emsFlushedIds(); if (id && s.indexOf(id) === -1) { s.push(id); localStorage.setItem('ems_flushed_ids_v1', JSON.stringify(s.slice(-300))); } }
  function _emsDropFlushed(ids) { localStorage.setItem('ems_flushed_ids_v1', JSON.stringify(_emsFlushedIds().filter(x => ids.indexOf(x) === -1))); }

  // Replay queued writes (called on connect). Returns {done, failed, skipped, dead}.
  // ponytail: dedup guard is per-browser (localStorage _emsFlushedIds). Two admins flushing the
  // SAME Sheet queue at the same instant can double-send one comment — rare + reversible.
  // Upgrade path if it bites: claim rows server-side under the script lock before sending.
  async function emsQueueFlush() {
    if (!isEmsConnected()) return { done: 0, failed: 0, skipped: 0, dead: 0 };
    const q = emsQueuePending();
    const alreadySent = _emsFlushedIds();
    const doneIds = []; let failed = 0, skipped = 0, dead = 0;
    for (const item of q) {
      if (item.id && alreadySent.indexOf(item.id) !== -1) { doneIds.push(item.id); skipped++; continue; }  // sent before, clear pending
      try {
        await emsSendItem(item);
        _emsAddFlushed(item.id);
        doneIds.push(item.id);
      } catch (e) {
        if (!isEmsConnected()) break;             // 401/expiry → stop, leave the rest queued
        const httpErr = /^\(\d{3}\)/.test(e.message || '');
        if (httpErr) { _emsAddFlushed(item.id); doneIds.push(item.id); dead++; }   // permanently rejected → dead-letter (NOT a successful send)
        else failed++;
      }
    }
    if (doneIds.length) {
      try {
        const r = await fetch(SHEET_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'emsQueueClear', ids: doneIds }) });
        const body = await r.json().catch(() => null);
        if (body && body.ok) _emsDropFlushed(doneIds);   // confirmed cleared → release the guard ids
      } catch (e) { console.warn('emsQueueClear failed — items stay guarded against re-send', e); }
    }
    return { done: doneIds.length - skipped - dead, failed: failed, skipped: skipped, dead: dead };  // done = real sends only
  }

  // Orchestrate on a successful connect: flush pending writes, then refresh the snapshot.
  let _emsSyncedThisSession = false;
  async function emsOnConnected(force) {
    if (_emsSyncedThisSession && !force) return;
    _emsSyncedThisSession = true;
    let flushed = { done: 0, failed: 0, dead: 0 };
    try { flushed = await emsQueueFlush(); } catch (e) { console.warn('EMS queue flush failed', e); }
    try { await emsSyncCache(); } catch (e) { console.warn('EMS cache sync failed', e); }
    if (flushed.done) emsToast('✅ נשלחו ' + flushed.done + ' פעולות שהמתינו בתור');
    if (flushed.dead) emsToast('⚠️ ' + flushed.dead + ' פעולות בתור נדחו ע"י EMS ונמחקו (בדוק בלוג)');
    setTimeout(function () { if (typeof refreshData === 'function') refreshData(); }, 1200);
  }

  // ---- On-card EMS tasks widget (field 2) ----
  const EMS_PRIORITY_DOT = { urgent: '#dc2626', high: '#ea580c', normal: '#64748b', low: '#94a3b8' };
  function emsSyncStamp(iso) {
    if (!iso) return '';
    try { return ' · עודכן ' + new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  // Attach the EMS-tasks widget to every site-mapped card. Runs as its own pass so it
  // also covers cards that have NO Sheet row (e.g. a newly-added kibbutz). No-op until
  // the shared cache has actually been synced (syncedAt set) — until then cards keep
  // their legacy expectedTask via the enrichment fallback.
  function applyCardEmsWidgets() {
    if (!emsCacheData().syncedAt) return;
    document.querySelectorAll('.kibbutz[data-name]').forEach(card => {
      card.querySelectorAll('.card-ems, .card-ems-new').forEach(e => e.remove());   // clear stale
      const nm = card.dataset.name;
      if (!kibbutzSiteIds(nm).length) return;   // not an EMS-mapped kibbutz
      // Widget appears ONLY when there are open tasks. The "open new EMS task" affordance
      // lives inside the kibbutz modal (below the status), not on the cards.
      try { renderCardEmsTasks(card, nm); }
      catch (e) { console.warn('[EMS] card widget failed for', nm, e); }
    });
  }
  // Append the "משימות מה-EMS" block to a kibbutz card (open tasks from the shared cache).
  function renderCardEmsTasks(card, name) {
    const tasks = emsCacheTasksForKibbutz(name);
    if (!tasks.length) return false;   // no open task → caller shows the "open new EMS task" line
    const cache = emsCacheData();
    const wrap = document.createElement('div');
    wrap.className = 'card-ems excel-injected';
    const head = document.createElement('div');
    head.className = 'card-ems-head';
    head.innerHTML = '📋 משימות מה-EMS <span class="card-ems-stale">(' + tasks.length + emsSyncStamp(cache.syncedAt) + ')</span>';
    wrap.appendChild(head);
    tasks.forEach(t => {
      const row = document.createElement('div');
      const overdue = t.expectedCompletionDate && EMS_CLOSED.indexOf(t.status) === -1 && new Date(t.expectedCompletionDate) < new Date();
      row.className = 'card-ems-task status-' + t.status + (overdue ? ' overdue' : '');
      row.innerHTML =
        '<span class="t-dot" style="background:' + (EMS_PRIORITY_DOT[t.priority] || '#94a3b8') + '"></span>' +
        '<span class="t-title">' + (overdue ? '⏰ ' : '') + emsEsc(t.title) + (t.linkCount ? ' 🔗' + t.linkCount : '') + '</span>' +
        '<span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span>';
      row.onclick = (e) => { e.stopPropagation(); openKibbutzEmsTask(t.id); };
      wrap.appendChild(row);
    });
    // deterministic order: name → status → EMS tasks. Insert right after the status
    // (or the name) instead of blind-append, so the widget can never land above the name.
    const anchor = card.querySelector(':scope > .excel-status')
                || card.querySelector(':scope > .kibbutz-name-row')
                || card.querySelector(':scope > .kibbutz-name');
    if (anchor) anchor.insertAdjacentElement('afterend', wrap);
    else card.appendChild(wrap);
    return true;
  }
  // Click a task on a card: connected → full live detail (+comments); offline → cached read-only view.
  function openKibbutzEmsTask(id) {
    if (isEmsConnected()) { openEmsTask(id); return; }
    const t = emsCacheData().tasks.find(x => x.id === id);
    const modal = document.getElementById('emsDetailModal');
    if (!t || !modal) { alert('המשימה אינה בנתונים המקומיים — התחבר ל-EMS לצפייה מלאה.'); return; }
    window._emsCurrentTask = t;
    const site = t.site && t.site.name ? t.site.name : '—';
    const due  = t.expectedCompletionDate ? new Date(t.expectedCompletionDate).toLocaleDateString('he-IL') : '—';
    document.getElementById('emsDetailContent').innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
        '<h3 style="margin:0;flex:1;color:var(--primary);">' + emsEsc(t.title) + '</h3>' +
        '<button onclick="document.getElementById(\'emsDetailModal\').classList.remove(\'open\')" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">' +
        '<span class="ems-badge status-' + t.status + '">' + (EMS_STATUS[t.status] || t.status) + '</span>' +
        '<span class="ems-badge priority-' + t.priority + '">' + (EMS_PRIORITY[t.priority] || t.priority) + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:#475569;line-height:1.9;">🏢 אתר: ' + emsEsc(site) + '<br>📅 יעד: ' + due + '</div>' +
      '<div style="margin-top:12px;padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12px;color:#9a3412;">🔌 תצוגה מהמטמון המקומי. התחבר ל-EMS (טאב 📋 EMS משימות) כדי לראות תגובות, לעדכן סטטוס ולהגיב.</div>';
    modal.classList.add('open');
  }

