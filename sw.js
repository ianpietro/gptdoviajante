// No-Cache Service Worker — always fetches from network
// Bump this version string to force update on all clients
const CACHE_VERSION = '20260826-v2.0.0-rc3-runtime-fix';

// Install: take control immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: clear all caches and force all open windows to reload
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => {
        clients.forEach(client => {
          // Force reload all open tabs so they pick up the new HTML
          client.navigate(client.url);
        });
      })
  );
});

// Fetch: always go to network, never serve from cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
  );
});
