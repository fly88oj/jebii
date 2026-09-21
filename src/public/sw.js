// Service worker: offline app shell for the /app/ scope.
// - Static assets (hashed bundles, Cubism core, model files): cache-first.
// - The document itself: network-first (the proxy serves it no-store), cache fallback for offline loads.
// - API channels live OUTSIDE /app/ (proxy routes /lmsapi, /jevapi), so this
//   scoped worker never sees them; nothing sensitive is ever cached.
// Bump on every deploy: activate() purges other caches, evicting stale hashed bundles
const CACHE = 'jebii-shell-20260923'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return

  if (req.mode === 'navigate') {
    // Network-first for the document: users get updates immediately, offline falls back to the shell.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put('/app/', fresh.clone())
        return fresh
      } catch {
        const cached = await caches.match('/app/')
        return cached || Response.error()
      }
    })())
    return
  }

  // Cache-first for static assets (content-hashed or immutable model data).
  event.respondWith((async () => {
    const cached = await caches.match(req)
    if (cached) return cached
    try {
      const fresh = await fetch(req)
      if (fresh.ok) {
        const cache = await caches.open(CACHE)
        cache.put(req, fresh.clone())
      }
      return fresh
    } catch {
      return cached || Response.error()
    }
  })())
})
