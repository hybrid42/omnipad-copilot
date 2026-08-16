/* Omnipad service worker — offline app shell caching.
   Cache-first for the shell so the dashboard opens instantly and works
   with no network. Favicons are fetched network-first and are optional. */

const CACHE = 'omnipad-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Favicons / third-party: try network, fall back gracefully (no cache noise).
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }

  // App shell: cache-first, then update cache in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
