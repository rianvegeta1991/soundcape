/* Soundcape – Service Worker (Offline-Cache)
 * Bei Dateiänderungen die Versionsnummer hochzählen. */
const CACHE = 'soundcape-v8';
const ASSETS = [
  './',
  './index.html',
  './sound.js',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // einzeln cachen: eine fehlende Datei darf die Installation nicht scheitern lassen
      Promise.all(ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('[SW] nicht gecacht:', url, err))
      ))
    ).then(() => self.skipWaiting())
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

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Netz zuerst, Cache als Rückfalllinie – so ist ein Update sofort da,
  // offline funktioniert die App trotzdem.
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
