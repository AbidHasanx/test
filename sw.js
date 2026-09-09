/* ============================================================
   sw.js — অফলাইন চলার জন্য সার্ভিস ওয়ার্কার
   ============================================================ */
const CACHE = 'jarvis-bd-v2';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/store.js',
  './js/tools.js',
  './js/ai.js',
  './js/speech.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // API কল কখনো ক্যাশ করবো না
  if (/generativelanguage|openrouter|groq|open-meteo|wikipedia|duckduckgo|localhost|fonts\.googleapis|fonts\.gstatic/.test(url.hostname)) {
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        // ব্যাকগ্রাউন্ডে নতুন ভার্সন আপডেট
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then(res => {
          if (res && res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504 });
        });
    })
  );
});
