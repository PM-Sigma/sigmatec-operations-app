// Sigmatec Operations App — service worker.
// NETWORK-FIRST for same-origin (always serves the latest deploy when online; falls back
// to cache only when offline). This avoids the cache-first "stale deploy" trap. Cross-origin
// (Supabase / Apps Script) is never touched → data is always live. Bump CACHE to invalidate.
const CACHE = 'sigmatec-ops-v2';
const SHELL = ['./', './index.html', './stats.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

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
  e.respondWith(
    fetch(req)
      .then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); return r; })
      .catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
