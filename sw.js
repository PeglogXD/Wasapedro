// sw.js - Notificaciones y cache offline de WasaPedro
const CACHE_NAME = 'wasapedro-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      // Nunca bloquear la instalaciÃ³n del service worker por un recurso que falle:
      // las notificaciones dependen de que el SW quede activo.
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: primero la red para recibir siempre la versiÃ³n mÃ¡s reciente
  // de la app; si no hay conexiÃ³n se cae al cachÃ©.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(guardado => guardado || caches.match('./index.html')))
    );
    return;
  }

  // Recursos estÃ¡ticos: cachÃ© primero con actualizaciÃ³n en segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (error) {
    data = { body: event.data.text() };
  }
  const title = data.title || 'Nueva NotificaciÃ³n';

  // ConfiguraciÃ³n adaptada a Chromebook
  const options = {
    body: data.body || '',
    icon: data.icon || './icon.svg',
    badge: data.badge || './icon.svg',
    tag: data.tag || 'general-notification',
    renotify: true,
    data: {
      url: data.url || './',
      type: data.type,
      callId: data.callId
    },
    // Mantener notificaciÃ³n activa en pantalla si es llamada entrante
    requireInteraction: data.type === 'call'
  };

  // AÃ±adir botones interactivos si es una llamada
  if (data.type === 'call') {
    options.actions = [
      { action: 'open', title: 'ðŸ“ž Abrir para responder' }
    ];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// Manejar clic en la notificaciÃ³n
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const notificationData = event.notification.data || {};
    const targetUrl = typeof notificationData === 'string'
      ? notificationData
      : (notificationData.url || './');

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus().then(() => {
                      if ('navigate' in client && targetUrl) return client.navigate(targetUrl);
                    });
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
