/**
 * Service worker: offline support.
 *
 * Vite fingerprints the build output, so a hand-written precache list cannot know
 * the file names. Instead this uses a stale-while-revalidate strategy at runtime:
 * the first visit fills the cache, later visits serve instantly and refresh in the
 * background, and the app keeps working with no network at all.
 *
 * Bump CACHE_NAME when the caching strategy (not the app) changes; app updates are
 * picked up automatically because every response is revalidated.
 */

const CACHE_NAME = 'keys-from-json-v1';
const CACHE_PREFIX = 'keys-from-json-';

self.addEventListener('install', (event) => {
  // Take over as soon as possible; the app has no server-side state to protect.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET, and only same-origin: the app makes no cross-origin requests, and
  // caching them would be a privacy surprise.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: false });

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Refresh in the background; the user never waits on the network.
        event.waitUntil(network);
        return cached;
      }

      const response = await network;
      if (response) return response;

      // Navigating offline to a URL that was never cached: fall back to the shell.
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }

      return new Response('Offline and not cached yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })(),
  );
});
