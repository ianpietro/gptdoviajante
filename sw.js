// Temporary No-Cache Service Worker for development/creation phase
const CACHE_NAME = 'copiloto-viagem-dev-nocache';

// Install Event
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate Event - Delete ALL caches to clean up the browser storage
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheKeys => {
      return Promise.all(
        cacheKeys.map(key => {
          console.log('[Service Worker] Cleaning up cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Bypass cache completely and fetch directly from network
self.addEventListener('fetch', event => {
  // Always go directly to network
  event.respondWith(fetch(event.request));
});
