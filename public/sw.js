// Kill-switch service worker.
// Older iPad installs of the study tool used a generated Workbox service worker
// that could keep serving stale bundles from an old Vercel deployment. Keep this
// file at /sw.js so those registrations update, take control, clear old caches,
// then unregister themselves.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await self.registration.unregister();
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});
