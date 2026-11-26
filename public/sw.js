/* Only the generic offline fallback and public icons are cached. */
'use strict';
const CACHE = 'unimarket-offline-v1';
const PUBLIC_ASSETS = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
const APP_PAGES = new Set(['/', '/index.html', '/browse.html', '/academic.html', '/item.html', '/login.html', '/messages.html', '/my-listings.html', '/notifications.html', '/post.html', '/profile.html', '/roommates.html', '/safety.html', '/saved.html', '/settings.html', '/transactions.html', '/offline.html']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS.map(path => new Request(path, { cache: 'reload', credentials: 'omit' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('unimarket-offline-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && APP_PAGES.has(url.pathname)) {
    // Never cache visited pages, even if the user is authenticated.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match('/offline.html') || new Response('UniMarket is offline. Reconnect and try again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
  } else if (PUBLIC_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(request)));
  }
  // API requests, uploads, external content, scripts and other resources remain network-only in this worker.
});
