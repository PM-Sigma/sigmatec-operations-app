// Sigmatec Operations App — service worker.
// NETWORK-FIRST for same-origin (always serves the latest deploy when online; falls back
// to cache only when offline). This avoids the cache-first "stale deploy" trap. Cross-origin
// (Supabase / Apps Script) is never touched → data is always live. Bump CACHE to invalidate.
const CACHE = 'sigmatec-ops-mrnejxn0';
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

// Web Push: show the notification. Payload = { title, body, tag, url } from the push-send Edge Function.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'סיגמטק', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'סיגמטק', {
    body: d.body || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: d.tag, renotify: true, data: { url: d.url || './' }
  }));
});

// Focus an existing app tab (or open one) on the target page when the notification is clicked.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.focus(); if ('navigate' in c) c.navigate(url).catch(() => {}); return; } }
    return self.clients.openWindow(url);
  }));
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

// ===== Web Push (attendance reminders + future events) =====
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'סיגמטק', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || undefined,                       // same tag → replaces, no stacking
    renotify: !!d.tag,                             // re-send still alerts even when replacing
    requireInteraction: !!d.requireInteraction,    // sticky until the user interacts
    dir: 'rtl', lang: 'he',
    data: { url: d.url || './index.html' },
    actions: d.action ? [{ action: 'open', title: d.action }] : []
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return clients.openWindow(url);
  }));
});
