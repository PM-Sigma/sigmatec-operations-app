  // ========== 🔔 WEB PUSH — subscriptions + attendance reminders ==========
  // Spec: docs/superpowers/specs/2026-07-16-attendance-push-reminder-design.md
  // Foundation shared with the (future) order-events push. VAPID public key is safe in the client.
  const PUSH_VAPID_PUBLIC = 'BGlLTZ-fWd8PZN35Y0gEm8WlPQfuZfIZuv_owazHbuvmN-LTMDASgn8F-dqplIpD4cqSkw9axAjEPAc7zui0XgI';
  const PUSH_USERS = ['אביאם', 'ניתאי', 'עמיחי'];   // receivers — field/approval people carry the app on Android

  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function pushB64ToU8(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  // subscribe this device for the logged-in team user and store it (multi-device: one row per endpoint)
  async function pushEnsureSubscribed() {
    if (!pushSupported()) return false;
    const who = (typeof getCurrentUser === 'function') ? getCurrentUser() : '';
    if (PUSH_USERS.indexOf(who) === -1) return false;
    if (Notification.permission === 'denied') return false;
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushB64ToU8(PUSH_VAPID_PUBLIC) });
    const j = sub.toJSON();
    // mint the authenticated pass first (RLS: authenticated-only writes), same as the data layer
    if ((!window._sbToken || (window._sbTokenExp || 0) <= Date.now()) && typeof window._sbBridge === 'function') {
      try { await window._sbBridge(); } catch (e) {}
    }
    const hdr = { apikey: SB_ANON, Authorization: 'Bearer ' + (window._sbToken || SB_ANON), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
    const r = await fetch(SB_URL + '/rest/v1/push_subscriptions?on_conflict=endpoint', {
      method: 'POST', headers: hdr,
      body: JSON.stringify({ endpoint: j.endpoint, owner: who, keys: j.keys, user_agent: navigator.userAgent.slice(0, 200) })
    });
    return r.ok;
  }
  window.pushEnsureSubscribed = pushEnsureSubscribed;
  // small opt-in nudge after login for team users (never auto-request on load — browser penalty)
  function pushMaybeOffer() {
    try {
      if (!pushSupported()) return;
      const who = (typeof getCurrentUser === 'function') ? getCurrentUser() : '';
      if (PUSH_USERS.indexOf(who) === -1) return;
      if (Notification.permission === 'granted') { pushEnsureSubscribed(); return; }   // silent re-sync
      if (Notification.permission === 'denied') return;
      if (localStorage.getItem('push_offer_dismissed_v1')) return;
      const bar = document.createElement('div');
      bar.id = 'pushOfferBar';
      bar.style.cssText = 'position:fixed;bottom:70px;right:12px;left:12px;z-index:9000;background:#1b2a4a;color:#fff;padding:10px 14px;border-radius:10px;display:flex;gap:10px;align-items:center;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.25);';
      bar.innerHTML = '<span style="flex:1;">🔔 לקבל התראות מהאפליקציה גם כשהיא סגורה?</span>' +
        '<button class="btn btn-primary" style="font-size:12px;" onclick="pushEnsureSubscribed().then(ok=>{document.getElementById(\'pushOfferBar\').remove();});">אפשר</button>' +
        '<button class="btn btn-secondary" style="font-size:12px;" onclick="localStorage.setItem(\'push_offer_dismissed_v1\',\'1\');document.getElementById(\'pushOfferBar\').remove();">לא עכשיו</button>';
      document.body.appendChild(bar);
    } catch (e) {}
  }
  window.pushMaybeOffer = pushMaybeOffer;
  setTimeout(function () { try { pushMaybeOffer(); } catch (e) {} }, 4000);

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
  // notification payload preview (kept in sync with the fn's fixed text — used for the confirm UI)
  function attReminderText(person, dates) {
    const fmt = dates.map(d => { const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? (+m[2]) + '.' + (+m[1]) : ''; }).filter(Boolean);
    return 'נא לעדכן נוכחות לימים: ' + fmt.join(', ');
  }

  // ---- attendance-report hook: red chips + viewer's 🔔 button ----
  function attRenderMissing() {
    const row = document.getElementById('attMissingRow');
    if (!row) return;
    row.style.display = 'none'; row.innerHTML = '';
    const person = (typeof attPerson === 'function') ? attPerson() : '';
    if (!person) return;
    const missing = attMissingDays(
      (window.SHEET_DATA && window.SHEET_DATA.attendance) || [],
      (window.SHEET_DATA && window.SHEET_DATA.visits) || [],
      person, window.attendanceViewYear, window.attendanceViewMonth, new Date());
    if (!missing.length) return;
    const chips = missing.map(d => { const m = d.match(/-(\d{2})-(\d{2})$/); return (+m[2]) + '.' + (+m[1]); }).join(' · ');
    const canNag = (typeof isViewer === 'function' && isViewer()) || (typeof isIdan === 'function' && isIdan());
    row.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
      '<span style="color:#b91c1c;font-weight:700;font-size:13px;">⚠️ ימים ללא נוכחות: ' + chips + '</span>' +
      (canNag ? '<button class="inv-btn small" style="background:#dc2626;color:#fff;" onclick="attSendReminder()">🔔 בקש עדכון נוכחות</button>' : '') +
      '<span id="attNagStatus" style="font-size:12px;color:#64748b;"></span></div>';
    row.style.display = '';
    window._attMissing = { person: person, dates: missing };
  }
  window.attRenderMissing = attRenderMissing;
  async function attSendReminder() {
    const ctx = window._attMissing;
    if (!ctx || !ctx.dates.length) return;
    if (!confirm('לשלוח תזכורת ל' + ctx.person + '?\n' + attReminderText(ctx.person, ctx.dates))) return;
    const st = document.getElementById('attNagStatus');
    if (st) st.textContent = '⏳ שולח…';
    try {
      const r = await fetch(SB_URL + '/functions/v1/push-send', {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'attendanceReminder', person: ctx.person, dates: ctx.dates })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      if (st) st.textContent = j.delivered > 0 ? ('✅ נשלח (' + j.delivered + ' מכשירים)') :
        '⚠️ ל' + ctx.person + ' אין עדיין מכשיר רשום להתראות — יקבל תזכורת באפליקציה';
      // fallback: no push device → leave an in-app nag the worker sees on next open (same pattern as order notifications)
      if (!(j.delivered > 0)) {
        try {
          const k = 'att_nag_' + ctx.person + '_v1';
          localStorage.setItem(k, JSON.stringify({ dates: ctx.dates, at: Date.now() }));
        } catch (e) {}
      }
    } catch (e) {
      if (st) st.textContent = '❌ שליחה נכשלה: ' + e.message;
    }
  }
  window.attSendReminder = attSendReminder;
