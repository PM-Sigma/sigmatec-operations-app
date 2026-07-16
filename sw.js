// Sigmatec Operations App — service worker.
// NETWORK-FIRST for same-origin (always serves the latest deploy when online; falls back
// to cache only when offline). This avoids the cache-first "stale deploy" trap. Cross-origin
// (Supabase / Apps Script) is never touched → data is always live. build.mjs restamps CACHE
// on every build so phones fetch fresh bytes each deploy.
const CACHE = 'sigmatec-ops-mrnfzu5y';
const SHELL = ['./', './index.html', './stats.html', './js/app.js', './css/app.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  ]));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // APIs → live network, untouched
  // network-first: fresh when online, cached fallback offline.
  // Cache key = path WITHOUT the query string, and only 2xx responses — otherwise every
  // version-probe (index.html?vc=<ts>) and every ?v= stamp minted a new cache entry forever, and a
  // mid-deploy 404 could be cached and served as the offline shell.
  const key = url.origin + url.pathname;
  e.respondWith(
    fetch(req)
      .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(key, c)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(m => m || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

// ===== Web Push — single handler for all events (order approvals + attendance reminders) =====
// Payload from push-send: { title, body, tag, url, requireInteraction?, actions?, data:{oid,otype,actUrls} }.
const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';   // for the one-tap approve POST (anon key is public)
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'סיגמטק', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'סיגמטק', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || undefined,                       // same tag → replaces, no stacking
    renotify: !!d.tag,                             // re-send still alerts even when replacing
    requireInteraction: !!d.requireInteraction,    // sticky until the user interacts (attendance nags)
    dir: 'rtl', lang: 'he',
    data: { url: d.url || './index.html', oid: (d.data && d.data.oid) || '', actUrls: (d.data && d.data.actUrls) || {} },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : []
  }));
});

// One-tap supplier approve straight from the notification — no app window (customer orders use 'approveOpen'
// which just deep-links into the in-app confirm, since they move stock + open an EMS task).
async function approveFromPush(oid) {
  try {
    const r = await fetch(SB_URL + '/functions/v1/push-send', {
      method: 'POST', headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'approveOrder', orderId: String(oid) })
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && j.ok;
    await self.registration.showNotification(ok ? '✅ ההזמנה אושרה' : '⚠️ האישור נכשל', {
      body: ok ? 'ההזמנה עברה ל"ממתין להזמנה".' : (j.error || 'נסה שוב מתוך האפליקציה.'),
      icon: './icons/icon-192.png', tag: 'approve-result-' + oid, dir: 'rtl', lang: 'he'
    });
  } catch (_) {
    await self.registration.showNotification('⚠️ האישור נכשל', { body: 'אין חיבור — נסה מתוך האפליקציה.', icon: './icons/icon-192.png', dir: 'rtl', lang: 'he' });
  }
}
function openApp(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  });
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  if (e.action === 'approve' && data.oid) { e.waitUntil(approveFromPush(data.oid)); return; }   // supplier one-tap
  const url = (data.actUrls && data.actUrls[e.action]) || data.url || './index.html';           // buttons + body-click
  e.waitUntil(openApp(url));
});
