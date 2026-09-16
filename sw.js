// No-Cache Service Worker — always fetches from network
// Bump this version string to force update on all clients
const CACHE_VERSION = '20260915-v3.0.0-rc32-real-map';

// Install: take control immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: clear obsolete caches and take control without interrupting forms,
// chats or other work currently open in the app.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: always go to network, never serve from cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
  );
});
