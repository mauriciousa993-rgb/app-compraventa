// Service Worker for Compraventa de Vehiculos PWA
const STATIC_CACHE = 'autotech-static-v2';
const RUNTIME_CACHE = 'autotech-runtime-v2';

const staticUrlsToCache = [
  '/manifest.json',
  '/autotech-logo.png',
  '/autotech-logo.svg'
];

const isSameOrigin = (url) => url.origin === self.location.origin;
const isStaticAsset = (pathname) =>
  pathname.startsWith('/assets/') ||
  /\.(?:js|css|png|svg|ico|json|webp|jpg|jpeg|gif)$/i.test(pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(staticUrlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (!isSameOrigin(url) || url.protocol === 'chrome-extension:' || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put('/index.html', responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html').then((cachedIndex) => cachedIndex || fetch('/')))
    );
    return;
  }

  if (!isStaticAsset(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});

// ==================== PUSH NOTIFICATIONS ====================

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data.json();
  } catch {
    data = {
      title: 'AutoTech - Compraventa',
      body: event.data?.text() || 'Nueva notificacion',
      icon: '/autotech-logo.png',
      badge: '/autotech-logo.png',
      tag: 'general',
      data: { url: '/' }
    };
  }

  const options = {
    body: data.body || 'Nueva notificacion de AutoTech',
    icon: data.icon || '/autotech-logo.png',
    badge: data.badge || '/autotech-logo.png',
    tag: data.tag || 'general',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AutoTech - Compraventa', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});