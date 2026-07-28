// sw.js — Bronze Direct service worker.
// Stale-while-revalidate for same-origin assets (fast + auto-updates on next load).
// Cross-origin (Supabase, esm.sh) always goes to the network — never cached.
const CACHE = 'bd-v1';
const ASSETS = [
  './', './index.html', './styles.css', './logobd.svg', './manifest.webmanifest',
  './js/app.js', './js/config.js', './js/supabase.js', './js/render.js', './js/auth.js',
  './js/router.js', './js/ui.js', './js/db.js', './js/fmt.js', './js/state.js',
  './js/modules/idag.js', './js/modules/dagatal.js', './js/modules/verkbeidnir.js',
  './js/modules/vidskiptavinir.js', './js/modules/taeki.js', './js/modules/tilkynningar.js',
  './js/modules/vorur.js', './js/modules/reikningar.js', './js/modules/stjornun.js',
  './js/modules/signature.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a)))) // tolerate a missing file
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase / CDN → network only
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
