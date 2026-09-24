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
      '<button id="pushEnableYes" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:8px;padding:12px;font-weight:800;cursor:pointer;font-size:15px;">' + (blocked ? '🔄 ניסיתי, רענן' : '✅ אפשר התראות') + '</button>' +
      '<button id="pushEnableLater" style="background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:12px 14px;font-weight:700;cursor:pointer;">אחר כך</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    document.getElementById('pushEnableLater').onclick = function () { wrap.remove(); };   // session-only; reappears next login
    document.getElementById('pushEnableYes').onclick = function (ev) {
      if (blocked) { wrap.remove(); location.reload(); return; }
      // F8: single-flight. This used to be a bare async onclick, so a double tap ran
      // requestPermission()+subscribe() twice and registered the device twice.
      var btn = ev && ev.currentTarget;
      return runOnce(btn, 'מפעיל…', async function () {
        try {
          var perm = await Notification.requestPermission();
          if (perm === 'granted') await subscribe();
          else if (perm === 'denied') { window._pushPromptShown = false; showEnablePrompt('denied'); }   // they blocked it → show the manual-enable guidance
        } catch (e) { console.warn('[push] enable failed', e); }
        wrap.remove();
      });
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

  // ⚙️ הגדרות (spec §7h) — the 🔔 row. The panel needs three things the legacy prompt never
  // exposed: what the state IS, a way to ASK for permission from a real user gesture (which
  // is the only kind a browser honours), and a way to prove the device is registered.
  //
  // `pushState()` answers with one word, so the row can say פעיל / חסום / לא נתמך without
  // reading `Notification` itself from a React chunk that may run before the SW is ready.
  window.pushState = function () {
    if (!supported) return 'unsupported';
    if (isIOS && !(window.navigator.standalone === true)) return 'ios-needs-install';
    try { return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default'; }
    catch (e) { return 'unsupported'; }
  };

  // Ask, then subscribe. Resolves with the state AFTER the answer, so the caller re-renders
  // from the truth and not from what it hoped the person would tap.
  window.pushEnable = async function () {
    if (!supported) return 'unsupported';
    try {
      var perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';
      await subscribe();
      return 'granted';
    } catch (e) { console.warn('[push] enable failed', e); return 'error'; }
  };

  // 🔔 בדיקה — one notification to THIS device, shown by the service worker so it looks
  // exactly like a real one (a `new Notification()` in the page does not, on Android).
  window.pushTest = async function () {
    try {
      if (window.pushState() !== 'granted') return false;
      var reg = await navigator.serviceWorker.ready;
      await reg.showNotification('🔔 ההתראות עובדות', {
        body: 'ככה תיראה התראה מהאפליקציה.', tag: 'push-test', icon: 'icons/icon-192.png'
      });
      return true;
    } catch (e) { console.warn('[push] test failed', e); return false; }
  };

  // How many devices this person has registered — the 👤 האזור האישי line.
  window.pushDeviceCount = async function () {
    try {
      var owner = currentOwner();
      if (!owner) return 0;
      var r = await fetch(SB_URL + '/rest/v1/push_subscriptions?select=endpoint&owner=eq.' + encodeURIComponent(owner), { headers: authHeaders() });
      if (!r.ok) return 0;
      var rows = await r.json();
      return Array.isArray(rows) ? rows.length : 0;
    } catch (e) { return 0; }
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
    if (currentOwner() === window.VIEWER_NAME) return;   // viewer never approves orders → no push needed
    setTimeout(function () { window.initPush(); }, 2500);
  }
  // deferred bundle (task 22b): a macrotask, never inline — see 02-init-attendance.js.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
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
  //
  // 🕎 HOLIDAYS (spec §7e): a date in `holidays` with `required=false` — an Israeli public
  // holiday or a company closure — is NOT a work day and is never missing. `holidays` is
  // optional and defaults to whatever the session loaded into SHEET_DATA.holidays, so every
  // existing caller gets the behaviour without passing anything. The same rule is applied by
  // app/src/lib/attendance.ts (isRequiredDay) and by push-send's priorMissing; all three must
  // agree or a worker is nagged about יום כיפור.
  function attNotRequired(holidays) {
    var src = holidays;
    if (!src) { try { src = (window.SHEET_DATA || {}).holidays; } catch (e) { src = null; } }
    var out = {};
    (src || []).forEach(function (h) {
      if (!h || !h.date || h.required) return;
      out[String(h.date).slice(0, 10)] = 1;
    });
    return out;
  }
  window.attNotRequired = attNotRequired;

  // Round 5 rule 5 (readers switch to the rows): covered = has an ATTENDANCE row (any source —
  // manual, calendar or visit_auto). `visits` stays in the signature (every caller still passes
  // it) but is no longer read: a visit day with no matching row is missing, same as any other day,
  // until the visit save writes the visit_auto row (or the backfill did, for existing visits).
  function attMissingDays(attendance, visits, person, year, month, today, holidays) {
    const off = attNotRequired(holidays);
    const have = {};
    (attendance || []).forEach(a => { if (a.person === person && a.date) have[String(a.date).slice(0, 10)] = 1; });
    const out = [];
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());   // strip time
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, month, day);
      if (d.getMonth() !== month) break;
      if (d >= end) break;                                   // only up to yesterday
      if (d.getDay() > 4) continue;                          // Fri/Sat out
      const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      if (off[key]) continue;                                // 🕎 חג / חול המועד / סגירת חברה
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
      ? '<button data-d="' + dateKey + '" onclick="attNagDay(this.dataset.d, this)" title="' + (sent ? 'נשלחה תזכורת, לחיצה שולחת שוב את כל הימים' : 'שלח תזכורת על יום זה (מצטרף להתראה הקיימת)') + '"' +
        ' style="background:' + (sent ? 'var(--tint-ok)' : 'var(--tint-danger)') + ';border:1px solid ' + (sent ? 'var(--success)' : 'var(--tint-danger-border)') + ';border-radius:6px;min-width:34px;height:26px;cursor:pointer;font-size:13px;">' + (sent ? '✅' : '🔔') + '</button>'
      : '';
    // Tokens, not literals: the row used to be a light slab in dark mode and its em-dash
    // cells measured 1.74:1 in BOTH themes (audit B · F-16). --danger-fg is the 4.5:1 ink.
    return '<tr style="background:var(--tint-danger);">' +
      '<td style="color:var(--danger-fg);font-weight:700;">' + dateStr + '</td>' +
      '<td><span class="att-badge" style="background:var(--tint-danger);color:var(--danger-fg);">❌ חסרה נוכחות</span></td>' +
      '<td style="color:var(--danger-fg);">—</td><td style="text-align:center;color:var(--danger-fg);">—</td>' +
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
  // F7: a bell with no pending state and no timeout could be tapped into duplicate pushes.
  // `runOnce` disables it for the round trip; `fetchWithTimeout` ends the wait at 20 s.
  function attNagDay(dateKey, btn) {
    return runOnce(btn, 'שולח…', function () { return attNagDaySend(dateKey); });
  }
  async function attNagDaySend(dateKey) {
    const person = (typeof attPerson === 'function') ? attPerson() : '';
    if (!person) return;
    const ym = dateKey.slice(0, 7);
    const sel = attNagSelected(person, ym);
    if (sel.indexOf(dateKey) === -1) sel.push(dateKey);
    sel.sort();
    try { localStorage.setItem(attNagKey(person, ym), JSON.stringify(sel)); } catch (e) {}
    if (typeof renderAttendanceReport === 'function') { try { renderAttendanceReport(); } catch (e) {} }
    try {
      const r = await fetchWithTimeout(SB_URL + '/functions/v1/push-send', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'attendanceReminder', person: person, dates: sel })
      }, 20000);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      if (j.delivered > 0) {
        attToast('🔔 נשלחה תזכורת ל' + person + ': ' + sel.length + ' ימים');
      } else {
        attToast('⚠️ ל' + person + ' אין מכשיר רשום להתראות. בקש ממנו לאשר 🔔 באפליקציה');
        // in-app fallback the worker sees on next open (their device reads att_nag_<name>)
        try { localStorage.setItem('att_nag_' + person + '_v1', JSON.stringify({ dates: sel, at: Date.now() })); } catch (e) {}
      }
    } catch (e) {
      attToast('❌ שליחה נכשלה: ' + e.message);
    }
  }
  window.attNagDay = attNagDay;

  // 📋 הפערים שלי (spec §7h) — the same 🔔 nudge flow as attendance, for the gaps list.
  // עמיחי / the viewer taps a person's row; the SERVER decides the words, the daily cap and
  // whether the hour is a decent one to buzz someone (push-send `gapReminder`). `count` is
  // only how many items are open — never which, and never what they are.
  async function gapNag(person, count) {
    if (!person) return false;
    try {
      const tok = (typeof getEmsToken === 'function' && getEmsToken()) || (window.EMS_TOKEN || '');
      const r = await fetch(SB_URL + '/functions/v1/push-send', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'gapReminder', person: person, count: count || 1, token: tok, actor: currentOwner() })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      if (j.skipped) { attToast('כבר נשלחה תזכורת היום ל' + person); return false; }
      if (!j.delivered) { attToast('ל' + person + ' אין מכשיר רשום להתראות'); return false; }
      attToast('🔔 נשלחה תזכורת ל' + person);
      return true;
    } catch (e) {
      attToast('❌ שליחה נכשלה: ' + e.message);
      return false;
    }
  }
  window.gapNag = gapNag;
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
  var kibbutz = qs.get('kibbutz') || '';
  var cid = qs.get('cid') || '';

  function ready() { return !!(window.SHEET_DATA && typeof getCurrentUser === 'function' && getCurrentUser()); }
  function run() {
    try {
      if (act === 'approve' && oid && typeof approveOrder === 'function') { approveOrder(oid); }
      else if (act === 'order' && typeof showPage === 'function') { showPage('inventory'); }
      // Round 5 (V4: the attendance picker is gone from the visit flow) — a non-field day is filed
      // on the attendance page itself now, so fillToday only gets him there; it no longer opens a
      // visit picker.
      else if (act === 'fillToday') { if (typeof showPage === 'function') showPage('attendance'); }
      else if (act === 'fillMissing') { if (typeof showPage === 'function') showPage('attendance'); }
      // 📋 פתח את הרשימה — the gaps nudge (spec §7h). The panel is the settings island's,
      // and it opens over whatever page the app landed on.
      else if (act === 'gaps') {
        if (typeof window.sigmaOpenGaps === 'function') window.sigmaOpenGaps();
        else window.dispatchEvent(new CustomEvent('sigma-open-gaps'));
      }
      // ✍️ כתוב סיכום — the 2 h visit nudge (spec §5.2). One tap = the summary with the
      // kibbutz already in it. Round 5 V-L4b: sigma.openVisitEditor is the one door into the
      // sheet and owns its own retry loop while the Field chunk is not up yet — never the
      // legacy form.
      else if (act === 'visit') {
        if (typeof showPage === 'function') showPage('kibbutz');
        if (window.sigma && typeof window.sigma.openVisitEditor === 'function' && kibbutz) window.sigma.openVisitEditor({ kibbutz: kibbutz });
      }
      // ⏱ פתח את השעון — the 2 h timer nudge (עידן 22.9). One tap = the running clock's own
      // sheet on that kibbutz's card. The card is a React island rendered into the kibbutz
      // page, so we show the page and then announce the event; the WorkTimer whose timer is
      // running answers it, and every other card ignores it.
      else if (act === 'timer') {
        if (typeof showPage === 'function') showPage('kibbutz');
        var tTries = 0;
        (function tOpen() {
          try { window.dispatchEvent(new CustomEvent('sigma-open-timer', { detail: { kibbutz: kibbutz } })); } catch (e) {}
          // The cards mount asynchronously; keep announcing for a few seconds. A card that
          // already opened its sheet just re-opens the same one, so repeating is harmless.
          if (++tTries < 12) setTimeout(tOpen, 250);
        })();
      }
      // 🙈 לא היום — the React island owns the write (supabase-js + the query cache).
      else if (act === 'visitDismiss') {
        // The island is a LAZY chunk, so it can still be loading when the deep link runs.
        var tries2 = 0;
        (function waitField() {
          if (window.sigmaField && typeof window.sigmaField.dismiss === 'function') { window.sigmaField.dismiss(cid); return; }
          // ~5 s and the island never arrived: NOTHING WAS WRITTEN. Saying "בסדר, לא היום"
          // here would be a lie — the reminder is already spent for this arrival (push-send
          // stamped reminded_at), but the check-in is not dismissed, and the in-app banner
          // will still ask. Say what is true and leave him one tap that works.
          if (++tries2 > 20) {
            if (window.sigma && typeof window.sigma.toast === 'function') {
              window.sigma.toast('לא הצלחתי לסמן, תוכל לסגור את זה מהבאנר במסך הראשי');
            }
            return;
          }
          setTimeout(waitField, 250);
        })();
      }
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
