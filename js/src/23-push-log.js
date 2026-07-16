  // ===========================================================
  // PUSH LOG (התראות) — admin-only (עידן) read-only table of every Web-Push notification the system
  // sent. Rows are written server-side by the push-send Edge Function (one per recipient device).
  // Data source: push_log table via Supabase REST (anon read; screen gated to isIdan()).
  // ===========================================================
  function pushLogCanSee() { return typeof isIdan === 'function' && isIdan(); }
  function pushEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pushFmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('he-IL') + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }
  var PUSH_EVENT = { pending: { icon: '🔔', label: 'ממתין לאישור', cls: 'med' }, approved: { icon: '✅', label: 'אושר', cls: 'done' } };
  var PUSH_STATUS = {
    sent:    { icon: '✅', label: 'נשלח',    color: '#059669', bg: '#d1fae5' },
    failed:  { icon: '⚠️', label: 'נכשל',    color: '#b91c1c', bg: '#fee2e2' },
    expired: { icon: '💀', label: 'מנוי מת', color: '#92400e', bg: '#fef3c7' }
  };

  async function renderPushLog() {
    var el = document.getElementById('pushLogContent');
    if (!el) return;
    if (!pushLogCanSee()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }
    el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען לוג התראות…</div></div>';
    var rows;
    try {
      var r = await fetch(SB_URL + '/rest/v1/push_log?select=*&order=sent_at.desc&limit=200', {
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON }
      });
      if (!r.ok) throw new Error('push_log ' + r.status);
      rows = await r.json();
    } catch (e) {
      el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ טעינת הלוג נכשלה: ' + pushEsc(e.message) +
        ' <button class="inv-btn small" style="margin-right:8px;" onclick="renderPushLog()">🔄 נסה שוב</button></div></div>';
      return;
    }
    if (!Array.isArray(rows) || !rows.length) {
      el.innerHTML = '<div class="dev-wrap"><div class="push-head"><h2 class="push-title">🔔 לוג התראות Push</h2>' +
        '<button class="inv-btn small" onclick="renderPushLog()" title="רענן">🔄</button></div>' +
        '<div class="dev-empty">לא נשלחו התראות עדיין.</div></div>';
      return;
    }

    // summary tiles: total + per-status counts
    var by = { sent: 0, failed: 0, expired: 0 };
    rows.forEach(function (x) { if (by[x.status] != null) by[x.status]++; });
    var tile = function (n, label, color) {
      return '<div class="push-tile" style="--c:' + color + '"><div class="push-tile-n">' + n + '</div><div class="push-tile-l">' + label + '</div></div>';
    };
    var tiles = '<div class="push-tiles">' +
      tile(rows.length, 'סה״כ', '#334155') +
      tile(by.sent, 'נשלחו', PUSH_STATUS.sent.color) +
      tile(by.failed, 'נכשלו', PUSH_STATUS.failed.color) +
      tile(by.expired, 'מנוי מת', PUSH_STATUS.expired.color) + '</div>';

    var body = rows.map(function (x) {
      var ev = PUSH_EVENT[x.event] || { icon: '•', label: x.event || '—', cls: 'todo' };
      var st = PUSH_STATUS[x.status] || { icon: '•', label: x.status || '—', color: '#64748b', bg: '#f1f5f9' };
      var errTitle = x.error ? ' title="' + pushEsc(x.error) + '"' : '';
      return '<tr>' +
        '<td data-label="זמן" style="white-space:nowrap;">' + pushFmtTime(x.sent_at) + '</td>' +
        '<td data-label="סוג"><span class="dev-status dev-status-' + ev.cls + '">' + ev.icon + ' ' + pushEsc(ev.label) + '</span></td>' +
        '<td data-label="הזמנה">' + pushEsc(x.where_txt || '—') + (x.qty ? ' <span style="color:#94a3b8;">· ' + x.qty + ' פריטים</span>' : '') + '</td>' +
        '<td data-label="נמען"><bdi>' + pushEsc(x.recipient || '—') + '</bdi></td>' +
        '<td data-label="סטטוס"' + errTitle + '><span class="push-badge" style="color:' + st.color + ';background:' + st.bg + ';">' + st.icon + ' ' + pushEsc(st.label) + '</span></td>' +
        '<td data-label="מבצע"><bdi>' + pushEsc(x.actor || '—') + '</bdi></td>' +
      '</tr>';
    }).join('');

    el.innerHTML = '<div class="dev-wrap">' +
      '<div class="push-head"><h2 class="push-title">🔔 לוג התראות Push</h2>' +
      '<button class="inv-btn small" onclick="renderPushLog()" title="רענן עכשיו">🔄 רענן</button></div>' +
      tiles +
      '<div style="overflow-x:auto;"><table class="inv-table"><thead><tr>' +
      '<th>זמן</th><th>סוג</th><th>הזמנה</th><th>נמען</th><th>סטטוס</th><th>מבצע</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="push-foot">מציג ' + rows.length + ' התראות אחרונות · שורה לכל נמען</div></div>';
  }

  window.renderPushLog = renderPushLog;
