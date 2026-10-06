const CACHE_NAME = 'srim-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return (
        res ||
        fetch(e.request).then((fetchRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            if (e.request.method === 'GET' && fetchRes.status === 200) {
              cache.put(e.request, fetchRes.clone());
            }
            return fetchRes;
          });
        })
      );
    })
  );
});
