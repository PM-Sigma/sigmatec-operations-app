// ===== Web Push notifications (order approvals) =====
// Android/desktop → OS push even when the app is closed. iOS (unless installed to home screen) and
// unsupported browsers → no-op here; the existing in-app order modal (07-orders.js) already covers them.
// Design: docs/superpowers/specs/2026-07-16-web-push-notifications-design.md
(function () {
  'use strict';
  var SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
  // anon key is public by design (safe in the client bundle) — mirrors 01-data.js SB_ANON.
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';
  // VAPID public key (safe to ship). Private key lives ONLY as a Supabase Edge Function secret.
  var VAPID_PUBLIC = 'BFIsMdmbzVjYVF5ZdYp89modREfn7hw-lMrV3a7rDIs1ctkUvKpxb1skMLHFLzOS98XBqkPazZhCXHuKWQHx8mM';

  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function authHeaders() {
    var tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : SB_ANON;
    return { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  }
  function urlB64ToUint8Array(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function currentOwner() { return (typeof getCurrentUser === 'function' && getCurrentUser()) || ''; }

  // Store this device's subscription against the current owner.
  async function storeSubscription(sub) {
    var j = sub.toJSON();
    await fetch(SB_URL + '/rest/v1/push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: Object.assign({}, authHeaders(), { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ endpoint: j.endpoint, owner: currentOwner(), keys: j.keys, user_agent: navigator.userAgent })
    });
  }

  async function subscribe() {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
    await storeSubscription(sub);
  }

  // Firm enable-prompt — reappears EVERY session until notifications are actually enabled (no permanent
  // dismissal). 'default' = never decided → request permission on click; 'denied' = blocked earlier →
  // the browser won't re-prompt, so guide the user to re-enable it in site settings.
  function showEnablePrompt(mode) {
    if (window._pushPromptShown || document.getElementById('pushEnableModal')) return;
    window._pushPromptShown = true;   // once per session; next login shows it again if still not enabled
    var blocked = mode === 'denied';
    var msg = blocked
      ? 'בעקבות העדכון האחרון נדרשות התראות, אך הן חסומות במכשיר זה. יש לאפשר אותן ידנית: לחצו על 🔒/⋮ בשורת הכתובת → הגדרות אתר → התראות → אפשר, ואז רעננו.'
      : 'בעקבות העדכון האחרון נדרש לאפשר קבלת התראות כדי לקבל עדכונים על הזמנות ונוכחות. נא לאשר.';
    var wrap = document.createElement('div');
    wrap.id = 'pushEnableModal';
    wrap.className = 'modal-backdrop open';
    wrap.style.zIndex = '100003';
    wrap.innerHTML = '<div class="modal" style="max-width:400px;text-align:center;">' +
      '<div style="font-size:40px;">🔔</div>' +
      '<h3 style="margin:8px 0 6px;color:#b91c1c;">נדרש לאפשר התראות</h3>' +
      '<div style="font-size:14px;color:#334155;line-height:1.6;margin-bottom:16px;">' + msg + '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="pushEnableYes" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:8px;padding:12px;font-weight:800;cursor:pointer;font-size:15px;">' + (blocked ? '🔄 ניסיתי — רענן' : '✅ אפשר התראות') + '</button>' +
      '<button id="pushEnableLater" style="background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:12px 14px;font-weight:700;cursor:pointer;">אחר כך</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    document.getElementById('pushEnableLater').onclick = function () { wrap.remove(); };   // session-only; reappears next login
    document.getElementById('pushEnableYes').onclick = async function () {
      if (blocked) { wrap.remove(); location.reload(); return; }
      wrap.remove();
      try {
        var perm = await Notification.requestPermission();
        if (perm === 'granted') await subscribe();
        else if (perm === 'denied') { window._pushPromptShown = false; showEnablePrompt('denied'); }   // they blocked it → show the manual-enable guidance
      } catch (e) { console.warn('[push] enable failed', e); }
    };
  }

  // Call after login. iOS/unsupported → silent no-op (in-app modal covers them).
  window.initPush = async function () {
    if (!supported || isIOS) return;
    try {
      if (Notification.permission === 'granted') { await subscribe(); return; }   // already granted → re-sync owner
      showEnablePrompt(Notification.permission === 'denied' ? 'denied' : 'default');
    } catch (e) { console.warn('[push] init failed', e); }
  };

  // Fire a push for an order event. Best-effort: never blocks or breaks the calling flow.
  // event: 'pending' (created, awaiting approval) | 'approved'. actor = the acting user (excluded).
  window.pushNotify = function (event, orderId, actor) {
    try {
      fetch(SB_URL + '/functions/v1/push-send', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ event: event, orderId: String(orderId), actor: actor || currentOwner() })
      }).catch(function () {});
    } catch (e) {}
  };

  // Auto-init on load (login hard-refreshes, so this covers the authed state). Delay lets the SW register.
  function boot() {
    if (!currentOwner()) return;                 // not logged in yet → skip
    if (currentOwner() === 'צפייה') return;      // viewer never approves orders → no push needed
    setTimeout(function () { window.initPush(); }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

// ===== Attendance reminders (viewer-triggered) =====
// Reuses the subscription created above (same push_subscriptions table, same VAPID key) — this block
// only computes missing days, renders the red chips + viewer's 🔔 button, and asks push-send to nudge.
// Design: docs/superpowers/specs/2026-07-16-attendance-push-reminder-design.md
(function () {
  'use strict';
  var SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';

  // ---- missing attendance (pure — tested in test-attendance-push.mjs) ----
  // A weekday (Sun–Thu) from the 1st of (year,month) up to `today`-1 with no visit AND no
  // attendance entry for `person`. Dates returned as 'YYYY-MM-DD' ascending.
  function attMissingDays(attendance, visits, person, year, month, today) {
    const have = {};
    (attendance || []).forEach(a => { if (a.person === person && a.date) have[String(a.date).slice(0, 10)] = 1; });
    (visits || []).forEach(v => {
      if (v.visitor !== person || !v.date) return;
      const d = new Date(v.date);
      if (!isNaN(d)) have[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')] = 1;
    });
    const out = [];
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());   // strip time
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, month, day);
      if (d.getMonth() !== month) break;
      if (d >= end) break;                                   // only up to yesterday
      if (d.getDay() > 4) continue;                          // Fri/Sat out
      const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      if (!have[key]) out.push(key);
    }
    return out;
  }
  window.attMissingDays = attMissingDays;
  // notification payload preview (kept in sync with the fn's fixed text — used for the confirm UI)
  function attReminderText(person, dates) {
    const fmt = dates.map(d => { const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? (+m[2]) + '.' + (+m[1]) : ''; }).filter(Boolean);
    return 'נא לעדכן נוכחות לימים: ' + fmt.join(', ');
  }
  window.attReminderText = attReminderText;   // exposed for test-attendance-push.mjs

  // ---- attendance-report: missing weekdays render as RED ROWS in the table (04-attendance-daily).
  // Each red row carries a 🔔 (viewer+עידן): clicking ADDS that day to one accumulating
  // notification for that person+month — same server tag → the worker sees ONE notification
  // listing every day clicked so far.
  function attNagKey(person, ym) { return 'att_nag_sel_' + person + '_' + ym; }
  function attNagSelected(person, ym) {
    try { return JSON.parse(localStorage.getItem(attNagKey(person, ym)) || '[]'); } catch (e) { return []; }
  }
  window.attNagSelected = attNagSelected;
  function attCanNag() {
    return (typeof isViewer === 'function' && isViewer()) || (typeof isIdan === 'function' && isIdan());
  }
  window.attCanNag = attCanNag;
  // red <tr> for a missing weekday — same column layout as the report table (5 cells)
  function attMissingRowHtml(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    const dateStr = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', weekday: 'short' });
    const person = (typeof attPerson === 'function') ? attPerson() : '';
    const ym = dateKey.slice(0, 7);
    const sent = attNagSelected(person, ym).indexOf(dateKey) !== -1;
    const bell = attCanNag()
      ? '<button data-d="' + dateKey + '" onclick="attNagDay(this.dataset.d)" title="' + (sent ? 'נשלחה תזכורת — לחיצה שולחת שוב את כל הימים' : 'שלח תזכורת על יום זה (מצטרף להתראה הקיימת)') + '"' +
        ' style="background:' + (sent ? '#dcfce7' : '#fee2e2') + ';border:1px solid ' + (sent ? '#16a34a' : '#fecaca') + ';border-radius:6px;min-width:34px;height:26px;cursor:pointer;font-size:13px;">' + (sent ? '✅' : '🔔') + '</button>'
      : '';
    return '<tr style="background:#fef2f2;">' +
      '<td style="color:#b91c1c;font-weight:700;">' + dateStr + '</td>' +
      '<td><span class="att-badge" style="background:#fee2e2;color:#b91c1c;">❌ חסרה נוכחות</span></td>' +
      '<td style="color:#fca5a5;">—</td><td style="text-align:center;color:#fca5a5;">—</td>' +
      '<td style="text-align:center;">' + bell + '</td></tr>';
  }
  window.attMissingRowHtml = attMissingRowHtml;
  function attToast(msg) {
    const t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }
  // 🔔 click: add the day to the month's selection and (re)send ONE notification with all of it
  async function attNagDay(dateKey) {
    const person = (typeof attPerson === 'function') ? attPerson() : '';
    if (!person) return;
    const ym = dateKey.slice(0, 7);
    const sel = attNagSelected(person, ym);
    if (sel.indexOf(dateKey) === -1) sel.push(dateKey);
    sel.sort();
    try { localStorage.setItem(attNagKey(person, ym), JSON.stringify(sel)); } catch (e) {}
    if (typeof renderAttendanceReport === 'function') { try { renderAttendanceReport(); } catch (e) {} }
    try {
      const r = await fetch(SB_URL + '/functions/v1/push-send', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'attendanceReminder', person: person, dates: sel })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      if (j.delivered > 0) {
        attToast('🔔 נשלחה תזכורת ל' + person + ' — ' + sel.length + ' ימים');
      } else {
        attToast('⚠️ ל' + person + ' אין מכשיר רשום להתראות — בקש ממנו לאשר 🔔 באפליקציה');
        // in-app fallback the worker sees on next open (their device reads att_nag_<name>)
        try { localStorage.setItem('att_nag_' + person + '_v1', JSON.stringify({ dates: sel, at: Date.now() })); } catch (e) {}
      }
    } catch (e) {
      attToast('❌ שליחה נכשלה: ' + e.message);
    }
  }
  window.attNagDay = attNagDay;
})();

// ===== Push deep-links =====
// Notification buttons open the app with ?pushact=<act>[&oid=<id>]. Wait for data + login, then act,
// then strip the params so a refresh doesn't re-fire. Handlers reuse existing globals (top-level fns).
(function () {
  'use strict';
  if (typeof location === 'undefined' || typeof URLSearchParams === 'undefined') return;   // non-browser (tests)
  var qs = new URLSearchParams(location.search);
  var act = qs.get('pushact');
  if (!act) return;
  var oid = qs.get('oid') || '';

  function ready() { return !!(window.SHEET_DATA && typeof getCurrentUser === 'function' && getCurrentUser()); }
  function run() {
    try {
      if (act === 'approve' && oid && typeof approveOrder === 'function') { approveOrder(oid); }
      else if (act === 'order' && typeof showPage === 'function') { showPage('inventory'); }
      else if (act === 'fillToday') { if (typeof showPage === 'function') showPage('attendance'); if (typeof openVisitQuick === 'function') openVisitQuick(); }
      else if (act === 'fillMissing') { if (typeof showPage === 'function') showPage('attendance'); }
    } catch (e) { console.warn('[push] deep-link failed', e); }
    // strip the params (keep the hash) so a manual refresh doesn't repeat the action
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }
  var tries = 0;
  (function wait() {
    if (ready()) { setTimeout(run, 400); return; }   // small delay lets the target page/modal mount
    if (++tries > 60) return;                          // ~15s ceiling, then give up
    setTimeout(wait, 250);
  })();
})();
