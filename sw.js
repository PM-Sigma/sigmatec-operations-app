// Sigmatec Operations App — service worker.
// NETWORK-FIRST for same-origin (always serves the latest deploy when online; falls back
// to cache only when offline). This avoids the cache-first "stale deploy" trap. Cross-origin
// (Supabase / Apps Script) is never touched → data is always live. build.mjs restamps CACHE
// on every build so phones fetch fresh bytes each deploy.
const CACHE = 'sigmatec-ops-mufkaxx7';
const SHELL = ['./', './index.html', './js/app.js', './css/app.min.css', './ui/sigma.js', './ui/sigma.css', './ui/manifest.json', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

// The React islands are code-split, so their file list is not knowable here — build.mjs
// writes ui/manifest.json (every ui/*.js|css of this build) and we precache from it.
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL).catch(() => {});
  try {
    const r = await fetch('./ui/manifest.json', { cache: 'no-store' });
    if (r.ok) { const files = await r.json(); if (Array.isArray(files)) await c.addAll(files).catch(() => {}); }
  } catch (_) { /* offline install — the network-first handler fills the cache later */ }
}

// Precaching used to run inside `install`, i.e. WHILE the page was still loading: it re-fetched
// the shell the page was already downloading and pulled every code-split island chunk (📈 שימוש
// alone is 400 kB) over the same connection. On a throttled phone that was ~1.8 s of "unused
// JavaScript" competing with the first paint (task 22b). The page now asks for it once it is
// loaded and idle — see the end of index.html — so offline readiness lands a few seconds later
// and costs the boot nothing. A page that never asks (an old cached index.html) still gets a
// filled cache from the network-first fetch handler below.
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'precache') e.waitUntil ? e.waitUntil(precache()) : precache();
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
  // Cache key = path, plus the `?v=` build stamp when there is one, so a new index.html can never
  // be paired with an old js/app.js out of the cache. Only 2xx responses are stored — otherwise
  // every version-probe (index.html?vc=<ts>) minted an entry and a mid-deploy 404 could be
  // cached and served as the offline shell.
  const v = url.searchParams.get('v');
  const key = url.origin + url.pathname + (v ? '?v=' + v : '');
  const store = r => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(key, c)).catch(() => {}); } return r; };

  // The page itself and the stamped shell files paint FROM THE CACHE, immediately, and the
  // network refreshes the copy behind them (עידן 22.9, A4: a phone coming back from the
  // background on a slow link sat on a loading screen while network-first waited). A new
  // deploy still lands: build.mjs restamps CACHE, `activate` drops the old one, and the
  // version watcher offers the reload.
  if (req.mode === 'navigate' || v) {
    e.respondWith(
      caches.match(key).then(cached => {
        const net = fetch(req).then(store).catch(() => undefined);
        if (cached) { e.waitUntil(net); return cached; }
        return net.then(r => r || caches.match(req, { ignoreSearch: true }))
          .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
          .then(r => r || Response.error());
      })
    );
    return;
  }
  // Everything else same-origin (icons, the manifest): network-first, cached fallback offline.
  e.respondWith(
    fetch(req).then(store)
      .catch(() => caches.match(req, { ignoreSearch: true }))
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
