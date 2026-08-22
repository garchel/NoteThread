// NoteThread Service Worker — app shell offline + cache-first para assets.
// Bump CACHE (vN) a cada deploy para invalidar versões anteriores.
const CACHE = 'notethread-v35';
const ASSETS = [
  './', './index.html', './app.js', './styles.css',
  './js/utils.js', './js/icons.js', './js/emojis.js', './js/markdown.js',
  './js/store.js', './js/sound.js', './js/sync-supabase.js', './js/offline-queue.js',
  './js/friendly-names.js',
  './js/ui/picker.js', './js/ui/navigation.js', './js/ui/messages.js',
  './js/ui/mentions.js', './js/ui/reminders.js',
  './js/ui/settings.js', './js/ui/auth.js', './js/ui/tree.js',
  './js/ui/composer.js', './js/ui/sync-events.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-1024.png',
  './privacy.html', './terms.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estratégia: cache-first para GET estáticos; rede com fallback ao cache para navegação.
self.addEventListener('sync', (e) => {
  if (e.tag === 'notethread-sync') {
    e.waitUntil(
      (async () => {
        // tenta notificar clientes para flush da fila
        const clients = await self.clients.matchAll();
        clients.forEach((c) => c.postMessage({ type: 'notethread-sync' }));
      })()
    );
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // não cachear POST/WebSocket
  const url = new URL(req.url);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  // nunca interceptar o sync server (WebSocket/http de dados)
  if (url.port === '3001') return;
  // fonts: deixar o browser buscar direto (SW fetch cai no connect-src do CSP)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return;
  // supabase/esm.sh: idem — não responder via SW
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'esm.sh') return;

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // cacheia apenas respostas ok de mesmo origem
        if (res && res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        // offline: se for navegação, entrega o app shell
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
