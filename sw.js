/* ============================================
   SERVICE WORKER — Chat Pareja PWA
   Cachea solo assets estáticos.
   NUNCA cachea index.html ni app.js.
   Siempre deja pasar Firebase/API.
   ============================================ */
const SW_VERSION = 'chatpareja-v1.0.3';
const SHELL_CACHE = 'chatpareja-shell-' + SW_VERSION;
const FONT_CACHE = 'chatpareja-fonts-v1';

const SHELL_ASSETS = [
  './style.css',
  './icons.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './assets/splash-bg.png',
  './assets/app-icon.png'
];

const FIREBASE_HOSTS = [
  'firebaseio.com',
  'firestore.googleapis.com',
  'firebase.com',
  'googleapis.com',
  'gstatic.com',
  'firebaseapp.com',
  'web.app'
];

function isFirebaseRequest(url) {
  try {
    const host = new URL(url).hostname;
    return FIREBASE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; }
  catch { return false; }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== FONT_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = request.url;

  // Nunca interceptar Firebase/API
  if (isFirebaseRequest(url)) return;

  // Navegación: SIEMPRE network (nunca cachear HTML)
  if (request.mode === 'navigate') return;

  // Google Fonts: cache-first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(r => {
            if (r.ok) cache.put(request, r.clone());
            return r;
          });
        })
      )
    );
    return;
  }

  // Assets splash: cache-first
  if (isSameOrigin(url) && url.includes('/assets/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(r => {
            if (r.ok) cache.put(request, r.clone());
            return r;
          });
        })
      )
    );
    return;
  }

  // CSS e imágenes: stale-while-revalidate
  if (isSameOrigin(url) && (url.endsWith('.css') || url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.svg') || url.endsWith('.woff2'))) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(r => {
            if (r.ok) cache.put(request, r.clone());
            return r;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Todo lo demás: network directa
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
