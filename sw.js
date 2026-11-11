// Traza: caché de la app (red primero, para no quedarse con versiones viejas) y de teselas de mapa.
const V = 'traza-v6';
const SHELL = ['./','index.html','css/app.css','js/app.js','js/db.js','js/parse.js','js/stats.js','js/charts.js','js/mapview.js','js/osm.js','js/share.js','js/live.js','js/compare.js','js/video.js',
  'vendor/maplibre-gl.js','vendor/maplibre-gl.css','vendor/fflate.js','manifest.webmanifest','icons/icon.svg',
  'fonts/barlow-latin-400-normal.woff2','fonts/barlow-latin-500-normal.woff2','fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-500-normal.woff2','fonts/barlow-condensed-latin-600-normal.woff2','fonts/barlow-condensed-latin-700-normal.woff2'];
const TILES = 'traza-tiles';
const TILE_HOSTS = ['s3.amazonaws.com','server.arcgisonline.com','tiles.opensnowmap.org','tile.opentopomap.org'];
const MAX_TILES = 1500;

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())));

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (TILE_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { c.put(req, r.clone()); if (Math.random() < 0.02) trim(c); }
      return r;
    }));
  }
});
