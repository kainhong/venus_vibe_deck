const CACHE_NAME = 'venus-terminal-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Venus';
  const body = payload.body || `${payload.source || 'Agent'} 已完成`;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.sessionId || 'venus-agent',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        sessionId: payload.sessionId,
        at: payload.at,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (allClients.length > 0) {
      await allClients[0].focus();
      return;
    }
    await self.clients.openWindow('/');
  })());
});
