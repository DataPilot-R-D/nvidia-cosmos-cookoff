/**
 * Custom Service Worker — Security Robot Command Center PWA
 *
 * Strategies:
 * - INSTALL: pre-cache app shell (offline fallback page)
 * - ACTIVATE: purge old caches
 * - FETCH: network-first for navigations, cache-first for static assets
 */

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `static-${CACHE_VERSION}`
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`

/** Resources to pre-cache during install */
const PRECACHE_URLS = [] // Empty — Next.js SSR pages cached at runtime via network-first strategy

// ---------------------------------------------------------------------------
// INSTALL — pre-cache app shell
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)))
  // Activate immediately (don't wait for old SW to die)
  self.skipWaiting()
})

// ---------------------------------------------------------------------------
// ACTIVATE — clean old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  const KEEP = new Set([STATIC_CACHE, RUNTIME_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
  )
  // Claim all clients so the new SW serves immediately
  self.clients.claim()
})

// ---------------------------------------------------------------------------
// FETCH — network-first for navigations, cache-first for static assets
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return

  // Navigations — network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match('/') || new Response('Offline', { status: 503 }))
    )
    return
  }

  // Static assets — cache-first (JS, CSS, images, fonts)
  if (request.url.match(/\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ico)(\?.*)?$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
            return response
          })
      )
    )
    return
  }
})
