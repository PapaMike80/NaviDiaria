/*
 * Service Worker per NaviDiaria.
 *
 * Obiettivi:
 * - mantenere in cache la shell dell'app;
 * - eliminare automaticamente le cache obsolete;
 * - provare sempre prima la rete e usare la cache solo come fallback.
 */

const CACHE_VERSION = 'navisuite-v105';
const CACHE_NAME = CACHE_VERSION;

// File statici da pre-caricare durante l'installazione.
// La lista include le pagine principali, i fogli di stile e gli script comuni.
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'logo/favicon.svg',
  'logo/icona_192.png',
  'logo/icona_512.png',
  'logo/icona_apple_180.png',
  'logo/logo_maskable.svg',
  'logo/logo_principale.svg',
  'logo/splash_ios.png',
  'navidiaria.html',
  'naviturni.html',
  'cambi_turno.html',
  'aggiornamenti.html',
  'agenti.html',
  'documenti.html',
  'impostazioni.html',
  'Orario.html',
  'orari-tabella.html',
  'portal.css',
  'styles.css',
  'navidiaria-weekly.css',
  'navidiaria-monthly.css',
  'navi-layout.css',
  'navi-shared.css',
  'naviturni-theme.css',
  'orario.css',
  'turni.css',
  'turni-common.css',
  'shared-menu.css',
  'shared-data.js',
  'firebase-data.js',
  'admin-firebase-rest.js',
  'draft-period.js',
  'cambi-change-arrows.js',
  'aggiornamenti-data.js',
  'vendor/pdfjs/pdf.min.js',
  'vendor/pdfjs/pdf.worker.min.js',
  'cloud-data.js',
  'portal.js',
  'app.js',
  'navidiaria-weekly.js',
  'navidiaria-monthly.js',
  'shared-menu.js',
  'documenti.js',
  'orari-tabella.js',
  'orario-main.js',
  'orario-main - Copia.js',
  'orario-shared.js',
  'orario-tooltip.js',
  'cambia-pin.js'
];

self.addEventListener('install', event => {
  // Durante l'installazione salviamo la shell minima dell'app.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  // Alla nuova attivazione eliminiamo tutte le cache vecchie.
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(cacheName => cacheName !== CACHE_NAME)
        .map(cacheName => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' && event.request.method !== 'POST') {
    return;
  }

  event.respondWith(networkFirst(event.request, event));
});

async function networkFirst(request, event) {
  const cacheKey = await buildCacheKey(request);
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    // Conserviamo nella cache le risposte utili per un eventuale fallback offline.
    if (response && (response.ok || response.type === 'opaque')) {
      event.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Per le navigazioni, se la pagina specifica non esiste in cache,
    // proviamo almeno a servire la home per mantenere l'app accessibile.
    if (request.mode === 'navigate') {
      const fallback = await cache.match('index.html') || await cache.match('./');
      if (fallback) {
        return fallback;
      }
    }

    throw error;
  }
}

async function buildCacheKey(request) {
  if (request.method === 'GET') {
    const url = new URL(request.url);

    // Rimuoviamo i parametri usati solo per rompere la cache, così il fallback
    // offline può riusare l'ultima risposta valida.
    url.searchParams.delete('t');
    url.searchParams.delete('cacheBust');
    url.searchParams.delete('cache-bust');
    url.searchParams.delete('_');

    return new Request(url.toString(), { method: 'GET' });
  }

  const bodyText = await request.clone().text();
  const bodyHash = await sha256Hex(bodyText);
  const normalizedUrl = new URL(request.url);
  const cacheUrl = new URL('/__navi_cache__', self.location.origin);

  cacheUrl.searchParams.set('method', 'POST');
  cacheUrl.searchParams.set('url', normalizedUrl.toString());
  cacheUrl.searchParams.set('hash', bodyHash);

  return new Request(cacheUrl.toString(), { method: 'GET' });
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashBytes = Array.from(new Uint8Array(hashBuffer));
  return hashBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}
