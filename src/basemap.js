/* Pilot HUD - Taban harita modulu (MapLibre GL + PMTiles)
   ASCII-only Turkce aciklamalar, nullish coalescing operatoru yok */

var map = null;
var containerEl = null;
var mapReady = false;
var pendingSt = null;

var lastLat = null;
var lastLon = null;
var lastHdg = null;
var lastRange = null;
var lastWidth = null;

export async function initBasemap(container, onStatus) {
  try {
    containerEl = typeof container === 'string' ? document.getElementById(container) : container;

    if (typeof window === 'undefined' || !window.maplibregl || !window.pmtiles) {
      if (typeof onStatus === 'function') onStatus('HARITA YOK');
      return;
    }

    if (!('caches' in window)) {
      if (typeof onStatus === 'function') onStatus('HARITA YOK');
      return;
    }

    var cache = await window.caches.open('pilot-map-v1');
    var url = 'data/istanbul.pmtiles';
    var cached = await cache.match(url);

    if (!cached) {
      if (typeof onStatus === 'function') onStatus('HARITA 0%');
      var fetchRes = await fetch(url);
      if (!fetchRes.ok) {
        if (typeof onStatus === 'function') onStatus('HARITA YOK');
        return;
      }

      var lenHeader = fetchRes.headers.get('content-length');
      var total = lenHeader ? parseInt(lenHeader, 10) : 0;
      var blob = null;

      if (fetchRes.body && total > 0 && typeof ReadableStream !== 'undefined') {
        var reader = fetchRes.body.getReader();
        var loaded = 0;
        var chunks = [];
        while (true) {
          var step = await reader.read();
          if (step.done) break;
          chunks.push(step.value);
          loaded += step.value.length;
          var pct = Math.floor((loaded / total) * 100);
          if (typeof onStatus === 'function') {
            onStatus('HARITA ' + pct + '%');
          }
        }
        blob = new Blob(chunks);
      } else {
        blob = await fetchRes.blob();
      }

      var putRes = new Response(blob, {
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Content-Length': String(blob.size)
        }
      });
      await cache.put(url, putRes);
      cached = await cache.match(url);
    }

    var mapBlob = await cached.blob();
    var file = new File([mapBlob], 'istanbul.pmtiles');
    var instance = new window.pmtiles.PMTiles(new window.pmtiles.FileSource(file));
    var protocol = new window.pmtiles.Protocol();
    protocol.add(instance);
    try {
      if (typeof window.maplibregl.removeProtocol === 'function') {
        window.maplibregl.removeProtocol('pmtiles');
      }
    } catch (removeErr) {
      // Protokol henuz tanimli olmayabilir
    }
    window.maplibregl.addProtocol('pmtiles', protocol.tile);

    var style = {
      version: 8,
      sources: {
        istanbul: {
          type: 'vector',
          url: 'pmtiles://istanbul.pmtiles'
        }
      },
      layers: [
        {
          id: 'bg',
          type: 'background',
          paint: {
            'background-color': '#000000'
          }
        },
        {
          id: 'earth',
          type: 'fill',
          source: 'istanbul',
          'source-layer': 'earth',
          paint: {
            'fill-color': '#000000'
          }
        },
        {
          id: 'landuse',
          type: 'fill',
          source: 'istanbul',
          'source-layer': 'landuse',
          filter: [
            'in',
            'kind',
            'park',
            'garden',
            'pitch',
            'grass',
            'meadow',
            'forest',
            'wood',
            'nature_reserve',
            'recreation_ground',
            'cemetery',
            'playground'
          ],
          paint: {
            'fill-color': '#04140f',
            'fill-opacity': 0.8
          }
        },
        {
          id: 'water',
          type: 'fill',
          source: 'istanbul',
          'source-layer': 'water',
          paint: {
            'fill-color': '#06262b'
          }
        },
        {
          id: 'buildings',
          type: 'fill',
          source: 'istanbul',
          'source-layer': 'buildings',
          paint: {
            'fill-color': '#0b2a30',
            'fill-opacity': 0.6
          }
        },
        {
          id: 'roads-other',
          type: 'line',
          source: 'istanbul',
          'source-layer': 'roads',
          filter: ['!in', 'kind', 'highway', 'major_road', 'minor_road'],
          paint: {
            'line-color': '#4de2f0',
            'line-opacity': 0.25,
            'line-width': 0.8
          }
        },
        {
          id: 'roads-minor',
          type: 'line',
          source: 'istanbul',
          'source-layer': 'roads',
          filter: ['==', 'kind', 'minor_road'],
          paint: {
            'line-color': '#4de2f0',
            'line-opacity': 0.55,
            'line-width': 1.4
          }
        },
        {
          id: 'roads-major',
          type: 'line',
          source: 'istanbul',
          'source-layer': 'roads',
          filter: ['in', 'kind', 'highway', 'major_road'],
          paint: {
            'line-color': '#4de2f0',
            'line-opacity': 0.9,
            'line-width': 2.4
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        }
      ]
    };

    map = new window.maplibregl.Map({
      container: containerEl,
      interactive: false,
      attributionControl: false,
      maxTileCacheSize: 30,
      fadeDuration: 0,
      style: style,
      center: [28.9784, 41.0082],
      zoom: 14,
      bearing: 0
    });

    var readyNotified = false;
    function notifyReady() {
      if (readyNotified) return;
      readyNotified = true;
      mapReady = true;
      if (typeof onStatus === 'function') {
        onStatus('HARITA HAZIR');
      }
      if (pendingSt) {
        updateBasemap(pendingSt);
        pendingSt = null;
      }
    }

    map.once('render', notifyReady);
    map.once('load', notifyReady);

    map.on('error', function(e) {
      // Harita ici ag veya tile hatalari uygulamayi cokertmesin
      console.warn('Harita uyarisi:', e && e.error ? e.error : e);
    });

  } catch (err) {
    if (typeof onStatus === 'function') {
      onStatus('HARITA YOK');
    }
  }
}

export function updateBasemap(st) {
  if (!st || !st.pos) return;
  if (!map || !mapReady) {
    pendingSt = st;
    return;
  }

  var lat = st.pos.lat;
  var lon = st.pos.lon;
  var hdg = (st.heading !== null && typeof st.heading === 'number') ? st.heading : 0;
  var range = st.range || 100;
  var w = containerEl ? containerEl.clientWidth : 0;

  if (
    lat === lastLat &&
    lon === lastLon &&
    hdg === lastHdg &&
    range === lastRange &&
    w === lastWidth
  ) {
    return;
  }

  if (w !== lastWidth) {
    try { map.resize(); } catch (e) {}
  }

  lastLat = lat;
  lastLon = lon;
  lastHdg = hdg;
  lastRange = range;
  lastWidth = w;

  var radiusPx = (w > 0 ? w : 148) / 2;
  var metersPerPixel = range / radiusPx;
  var latRad = lat * Math.PI / 180;
  var zoom = Math.log2((40075016.686 * Math.cos(latRad)) / (512 * metersPerPixel));

  try {
    map.jumpTo({
      center: [lon, lat],
      bearing: hdg,
      zoom: zoom
    });
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', function() {
    if (map) {
      try { map.resize(); } catch (e) {}
    }
  });
  window.addEventListener('orientationchange', function() {
    if (map) {
      try { map.resize(); } catch (e) {}
    }
  });
}
