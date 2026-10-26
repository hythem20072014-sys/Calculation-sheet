/* دفتر الحسابات — عامل الخدمة: يخزّن كل ملفات التطبيق ليعمل دون إنترنت */
var CACHE = 'dafter-v1.0.1';
var ASSETS = [
  './', './index.html', './app.css', './core.js', './app.js', './xlsx.min.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-512.png', './apple-touch-icon.png',
  './noto-sans-arabic-arabic-400-normal.woff2', './noto-sans-arabic-arabic-700-normal.woff2',
  './noto-sans-arabic-latin-400-normal.woff2', './noto-sans-arabic-latin-700-normal.woff2'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('dafter-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(function (r) {
      return r || fetch(req);
    }).catch(function () { return caches.match('./'); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) {
    return r || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
