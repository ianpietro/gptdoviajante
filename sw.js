const CACHE_VERSION = '20260917-v3.0.0-rc34-build-5452e77';

// Install: take control immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: clear obsolete static HTTP caches only, preserving all user data and DBs
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: API requests MUST ALWAYS bypass cache and hit network directly.
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
  );
});
