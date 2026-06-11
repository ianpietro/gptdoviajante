const CACHE_NAME = 'copiloto-viagem-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/config.js',
  '/vendas.css',
  '/vendas.js',
  '/assets/logo.jpeg',
  '/assets/logo-robozim.jpeg',
  '/assets/robo.png'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheKeys => {
      return Promise.all(
        cacheKeys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache...', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-first falling back to Cache)
self.addEventListener('fetch', event => {
  // Only intercept HTTP/S requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If it's a valid response, cache a clone and return it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, serve from cache
        console.log('[Service Worker] Network failed, serving from cache:', event.request.url);
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Optional: fallbacks for specific types (e.g. offline page)
        });
      })
  );
});
