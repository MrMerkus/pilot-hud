// Pilot HUD - Service Worker
// ASCII-only Turkce aciklamalar, nullish coalescing operatoru yok

var CACHE_NAME = 'pilot-shell-v8';

var SHELL_FILES = [
  './',
  'index.html',
  'style.css',
  'src/aim.js',
  'src/app.js',
  'src/basemap.js',
  'src/camera.js',
  'src/geo.js',
  'src/geoaim.js',
  'src/minimap.js',
  'src/orient.js',
  'src/screenproj.js',
  'src/sensors.js',
  'vendor/maplibre-gl.js',
  'vendor/maplibre-gl.css',
  'vendor/pmtiles.js'
];

// Kurulum: kabuk dosyalarini registration scope uzerinden cozumleyip onbellege al
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      var urls = SHELL_FILES.map(function(rel) {
        return new URL(rel, self.registration.scope).toString();
      });
      return Promise.all(
        urls.map(function(url) {
          return cache.add(url).catch(function(err) {
            // JS lane basemap.js dosyasini henuz olusturmamis olabilir
            console.warn('Onbellege eklenemedi:', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Etkinlestirme: eski pilot-shell-* onbelleklerini temizle
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key.indexOf('pilot-shell-') === 0 && key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Istek yakalama:
// - data/istanbul.pmtiles icin araya girme (basemap.js pilot-map-v1 ile yonetir)
// - vendor/* icin cache-first
// - navigasyon ve src/style icin network-first, onbellek yedekli
self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  var url = new URL(request.url);

  // Harita veri paketini basemap.js yonetir, service worker mudahale etmez
  if (url.pathname.indexOf('istanbul.pmtiles') !== -1 || url.pathname.indexOf('/data/') !== -1) {
    return;
  }

  // vendor/* varliklari: cache-first stratejisi
  if (url.pathname.indexOf('/vendor/') !== -1) {
    event.respondWith(
      caches.match(request).then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Navigasyon, src/ ve style icin network-first stratejisi (cevrimdisi fallback)
  event.respondWith(
    fetch(request).then(function(networkResponse) {
      if (networkResponse && networkResponse.status === 200) {
        var clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return networkResponse;
    }).catch(function() {
      return caches.match(request).then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }
        return caches.match(request, { ignoreSearch: true }).then(function(fallback) {
          if (fallback) {
            return fallback;
          }
          if (request.mode === 'navigate') {
            return caches.match(new URL('index.html', self.registration.scope).toString());
          }
          return undefined;
        });
      });
    })
  );
});
