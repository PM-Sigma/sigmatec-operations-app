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

  // Small in-app opt-in (browsers penalise auto-requesting permission on load).
  function showOptIn() {
    if (document.getElementById('pushOptIn')) return;
    var bar = document.createElement('div');
    bar.id = 'pushOptIn';
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:100002;background:#1d4ed8;color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;font-size:14px;';
    bar.innerHTML = '<span style="font-size:20px;">🔔</span>' +
      '<span style="flex:1;">קבל התראות לטלפון על הזמנות שדורשות טיפול?</span>' +
      '<button id="pushYes" style="background:#fff;color:#1d4ed8;border:none;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;">הפעל</button>' +
      '<button id="pushNo" style="background:transparent;color:#dbeafe;border:none;cursor:pointer;font-weight:700;">לא עכשיו</button>';
    document.body.appendChild(bar);
    document.getElementById('pushNo').onclick = function () { try { localStorage.setItem('push_optin_dismissed', '1'); } catch (e) {} bar.remove(); };
    document.getElementById('pushYes').onclick = async function () {
      bar.remove();
      try {
        var perm = await Notification.requestPermission();
        if (perm === 'granted') { await subscribe(); try { localStorage.setItem('push_optin_dismissed', '1'); } catch (e) {} }
      } catch (e) { console.warn('[push] opt-in failed', e); }
    };
  }

  // Call after login. iOS/unsupported → silent no-op (in-app modal covers them).
  window.initPush = async function () {
    if (!supported || isIOS) return;
    try {
      if (Notification.permission === 'granted') { await subscribe(); return; }   // already granted → re-sync owner
      if (Notification.permission === 'denied') return;
      var dismissed = false;
      try { dismissed = localStorage.getItem('push_optin_dismissed') === '1'; } catch (e) {}
      if (!dismissed) showOptIn();
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
