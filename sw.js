// Service worker de "Deudores": permite abrir la app sin internet.
// - Página (HTML): primero la red (para recibir siempre la versión nueva); si no hay internet, la copia guardada.
// - Librerías externas (Tailwind, Font Awesome, Supabase JS, html2pdf): copia guardada al instante y se actualiza en segundo plano.
// - La API de Supabase NO se toca: los datos siempre van directo a la red.
const VERSION = 'deudores-v2';
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const urls = [self.registration.scope, 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
    await Promise.all(urls.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Páginas de la app: red primero, con copia de respaldo sin conexión
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        // 'no-cache' obliga a revisar con el servidor (GitHub Pages guarda la página 10 min en caché)
        const resp = await fetch(req.url, { cache: 'no-cache' });
        if (resp && resp.ok) (await caches.open(VERSION)).put(self.registration.scope, resp.clone());
        return resp;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match(req)) || (await cache.match(self.registration.scope)) || Response.error();
      }
    })());
    return;
  }

  // Librerías y fuentes externas: copia guardada primero y actualización en segundo plano
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const guardada = await cache.match(req);
      const red = fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return guardada || (await red) || Response.error();
    })());
    return;
  }

  // Archivos propios (iconos, manifiesto): copia guardada primero
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const guardada = await cache.match(req);
      const red = fetch(req).then(resp => { if (resp && resp.ok) cache.put(req, resp.clone()); return resp; }).catch(() => null);
      return guardada || (await red) || Response.error();
    })());
  }
  // Todo lo demás (por ejemplo la API de Supabase) va directo a la red.
});
