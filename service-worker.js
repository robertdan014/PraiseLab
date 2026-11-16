const CACHE_VERSION = 'praiselab-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/praiselab-icon-192-v2.png',
  '/icons/praiselab-icon-512-v2.png',
  '/icons/praiselab-icon-maskable-512-v2.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('praiselab-') && key !== CACHE_VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Google sign-in, Firebase Auth, or Firestore data requests here.
  // Firestore's own persistent cache handles offline song/category data.
  if (url.hostname === 'identitytoolkit.googleapis.com' ||
      url.hostname === 'securetoken.googleapis.com' ||
      url.hostname === 'firestore.googleapis.com' ||
      url.hostname === 'www.googleapis.com') return;

  // Cache Firebase's version-pinned browser SDK modules after the first online load.
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION + '-modules');
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return new Response('This PraiseLab component is not available offline yet.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
        });
      }
    })());
    return;
  }

  // App navigation: prefer the newest deployed HTML, then fall back to the saved app.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put('/index.html', response.clone());
        }
        return response;
      } catch (error) {
        return (await caches.match('/index.html')) ||
               (await caches.match('/offline.html')) ||
               new Response('PraiseLab is offline. Reconnect and try again.', {status: 503});
      }
    })());
    return;
  }

  // Same-origin app assets: cache-first, with a network fill on first use.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        return new Response('', {status: 504, statusText: 'Offline'});
      }
    })());
  }
});
