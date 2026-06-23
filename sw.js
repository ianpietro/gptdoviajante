const CACHE_NAME = 'copiloto-viagem-v1.2';
const ASSETS_TO_CACHE = [
  '/',
  '/app',
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
      .then(async cache => {
        console.log('[Service Worker] Caching app shell...');
        // Custom addAll to handle redirected responses safely
        for (const url of ASSETS_TO_CACHE) {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Request for ${url} failed with status ${response.status}`);
            }
            // If the response is redirected, clone it without the redirected flag to avoid TypeError in cache.put()
            let responseToCache = response;
            if (response.redirected) {
              responseToCache = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            }
            await cache.put(url, responseToCache);
          } catch (err) {
            console.error(`[Service Worker] Failed to cache ${url}:`, err);
          }
        }
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
          // Fallback for navigation requests in offline mode
          if (event.request.mode === 'navigate') {
            if (event.request.url.includes('/app')) {
              return caches.match('/app');
            }
            return caches.match('/');
          }
        });
      })
  );
});
