const CACHE = 'harmoni-v2'

// Skip Firebase/Google API requests — those have their own caching
const SKIP = ['gstatic.com', 'googleapis.com', 'firebaseio.com', 'firebase']

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (SKIP.some(s => e.request.url.includes(s))) return

  const url = e.request.url
  // CSS only — cache-first (safe, changes rarely)
  const isCSS = url.endsWith('.css')

  if (isCSS) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        const res = await fetch(e.request)
        if (res && res.ok) cache.put(e.request, res.clone())
        return res
      })
    )
  } else {
    // Network-first for HTML + JS: always fresh, fallback to cache if offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res
      }).catch(() => caches.match(e.request))
    )
  }
})
