// Minimal service worker to allow PWA install ("Add to home screen").
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {}); // pass-through, no offline caching needed for now
