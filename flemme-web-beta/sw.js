// Service worker : garde une copie du site pour qu'il s'affiche même hors connexion.
// Stratégie « réseau d'abord » : on essaie toujours la version en ligne, et on
// ne se sert de la copie que si le réseau ne répond pas.
// Changer V (flemme-v5 → flemme-v6…) force les visiteurs à repartir de zéro.
const V = 'flemme-v2.8-beta-resultats';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'sb.js', 'espace.html', 'espace.js', 'espace.css', 'content.js', 'manifest.webmanifest', 'icon-192.png', 'favicon.ico'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match('./')))
  );
});
