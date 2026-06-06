const CACHE = 'harmoni-v1'

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

  // Stale-while-revalidate: return cache instantly, update in background
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request)
      const network = fetch(e.request).then(res => {
        if (res && res.ok) cache.put(e.request, res.clone())
        return res
      }).catch(() => null)
      return cached || network
    })
  )
})
