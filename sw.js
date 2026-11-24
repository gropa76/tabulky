/* Offline režim: appka se uloží do zařízení a funguje i bez internetu.
   Při každé změně souborů zvyšte číslo verze, aby se telefon aktualizoval. */
const VERZE = 'tabulky-v5';
const SOUBORY = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/formula.js', 'js/pipeline.js', 'js/db.js', 'js/app.js', 'lib/xlsx.bundle.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERZE).then(c => c.addAll(SOUBORY)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERZE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // nejdřív síť (ať máte vždy nejnovější verzi), bez internetu uložená kopie
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERZE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
