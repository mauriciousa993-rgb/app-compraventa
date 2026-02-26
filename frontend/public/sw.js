// Service Worker para Compraventa de Vehículos PWA
const CACHE_NAME = 'autotech-v1';
const STATIC_CACHE = 'autotech-static-v1';

// Recursos estáticos a cachear
const staticUrlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/autotech-logo.png',
  '/autotech-logo.svg'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Cache estático abierto');
        return cache.addAll(staticUrlsToCache);
      })
      .then(() => {
        console.log('[SW] Recursos cacheados exitosamente');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Error al cachear recursos:', err);
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE) {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker activado');
      return self.clients.claim();
    })
  );
});

// Fetch event - estrategia cache first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // No interceptar peticiones de extensión chrome-extension o API
  if (url.protocol === 'chrome-extension:' || url.pathname.startsWith('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retornar respuesta del cache
        if (response) {
          return response;
        }
        // No está en cache, ir a la red
        return fetch(event.request);
      })
  );
});

// ==================== NOTIFICACIONES PUSH ====================

// Escuchar eventos push del servidor
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido:', event);

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'AutoTech - Compraventa',
      body: event.data.text() || 'Nueva notificación',
      icon: '/autotech-logo.png',
      badge: '/autotech-logo.png',
      tag: 'general',
      data: { url: '/' }
    };
  }

  const options = {
    body: data.body || 'Nueva notificación de AutoTech',
    icon: data.icon || '/autotech-logo.png',
    badge: data.badge || '/autotech-logo.png',
    tag: data.tag || 'general',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'AutoTech - Compraventa',
      options
    )
  );
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notificación clickeada:', event);

  event.notification.close();

  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una ventana abierta, enfocarla
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no hay ventana abierta, abrir una nueva
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Manejar mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
