// PILOT HUD - STAGE 3 TARGET SYSTEM
// geoaim.js: Cografi hedefleme ve isin kesisim fonksiyonlari.
// Saf ES modulu: DOM veya pencere nesnesi kullanilmaz, yan etki icermez.

var EARTH_RADIUS = 6371000;
var DEG_TO_RAD = Math.PI / 180;
var RAD_TO_DEG = 180 / Math.PI;

/**
 * destination(p, bearingDeg, meters) -> {lat, lon}
 *
 * Kure uzerinde baslangic noktasindan verilen aci ve mesafedeki hedefi hesaplar (great-circle).
 *
 * Matematiksel cikarsama:
 * Kuresel trigonometri formulleri (buyuk daire seyriseferi):
 * delta = meters / R (radyan cinsinden acisal mesafe, R = 6371000 m)
 * theta = bearingDeg * pi / 180 (kerteriz acisi radyan)
 * phi1 = p.lat * pi / 180, lambda1 = p.lon * pi / 180
 *
 * Kuresel ucgende kenar kosinus kurali:
 * sin(phi2) = sin(phi1) * cos(delta) + cos(phi1) * sin(delta) * cos(theta)
 * phi2 = asin(sin(phi2))
 *
 * Boylam farki icin kuresel ucgen formulu:
 * y = sin(theta) * sin(delta) * cos(phi1)
 * x = cos(delta) - sin(phi1) * sin(phi2)
 * lambda2 = lambda1 + atan2(y, x)
 */
export function destination(p, bearingDeg, meters) {
  if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') {
    return null;
  }
  if (meters === 0) {
    return { lat: p.lat, lon: p.lon };
  }

  var d = meters / EARTH_RADIUS;
  var brng = bearingDeg * DEG_TO_RAD;
  var lat1 = p.lat * DEG_TO_RAD;
  var lon1 = p.lon * DEG_TO_RAD;

  var sinLat1 = Math.sin(lat1);
  var cosLat1 = Math.cos(lat1);
  var sinD = Math.sin(d);
  var cosD = Math.cos(d);

  var sinLat2 = Math.max(-1, Math.min(1, sinLat1 * cosD + cosLat1 * sinD * Math.cos(brng)));
  var lat2 = Math.asin(sinLat2);
  var y = Math.sin(brng) * sinD * cosLat1;
  var x = cosD - sinLat1 * sinLat2;
  var lon2 = lon1 + Math.atan2(y, x);

  var resLat = lat2 * RAD_TO_DEG;
  var resLon = lon2 * RAD_TO_DEG;
  resLon = ((resLon + 180) % 360 + 360) % 360 - 180;

  return { lat: resLat, lon: resLon };
}

/**
 * groundTarget(p, heading, pitch, eyeHeight = 1.5, maxDist = 150)
 *  -> { point, dist } or null
 *
 * pitch >= -1 derece ise ufuk veya uzerine bakildigi icin yer hedefi yoktur (null doner).
 *
 * Matematiksel cikarsama:
 * Gozlemci h yuksekligindedir (eyeHeight).
 * Kamera pitch acisi negatifken asagi dogru bakar (orn. -45 derece).
 * Bakis dogrusu ile duz zemin arasindaki dik ucgen:
 * tan(-pitch) = eyeHeight / dist  =>  dist = eyeHeight / tan(-pitch).
 * Eger dist > maxDist ise hedef menzil disindadir (null doner).
 * Hedef noktasi ise p noktasindan heading yonunde dist mesafedeki kuresel noktadir.
 */
export function groundTarget(p, heading, pitch, eyeHeight, maxDist) {
  var h = eyeHeight === undefined ? 1.5 : eyeHeight;
  var maxD = maxDist === undefined ? 150 : maxDist;

  if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') {
    return null;
  }
  if (typeof pitch !== 'number' || isNaN(pitch)) {
    return null;
  }
  if (pitch >= -1) {
    return null;
  }

  var pitchRad = -pitch * DEG_TO_RAD;
  var tanVal = Math.tan(pitchRad);
  if (tanVal <= 0) {
    return null;
  }

  var dist = h / tanVal;
  if (dist > maxD || dist < 0 || !isFinite(dist)) {
    return null;
  }

  var point = destination(p, heading, dist);
  return { point: point, dist: dist };
}

/**
 * buildingHit(p, heading, features, maxDist = 600)
 *  -> { point, dist } or null
 *
 * features: MapLibre querySourceFeatures formatinda GeoJSON benzeri ozellikler dizisi.
 * p noktasindan heading dogrultusunda isin firlatilir.
 * Noktalar p etrafinda yerel esdikdortgen (equirectangular) metre cinsine izdusurulur.
 * [0, maxDist] isin segmenti poligon kenarlariyla kesistirilir.
 * Icinde bulunulan binayi elemek icin dist > 2 m sartiyla en yakin kesisim donulur.
 * Kesisim noktasi lat/lon koordinat sistemine geri donusturulur.
 *
 * Matematiksel cikarsama:
 * 1. Yerel Esdikdortgen Izdusum (p etrafinda metre cinsinden):
 *    cosLat0 = cos(p.lat * pi / 180)
 *    x = (lon - p.lon) * (pi / 180) * R * cosLat0 (Dogu yonu)
 *    y = (lat - p.lat) * (pi / 180) * R (Kuzey yonu)
 *
 * 2. Isin Denklemi (Baslangic noktasi orijin (0,0)):
 *    heading theta kuzeyden saat yonunde tanimlidir (kuzey=0, dogu=90).
 *    Birim dogrultu vektoru d = (dx, dy):
 *    dx = sin(theta * pi / 180)
 *    dy = cos(theta * pi / 180)
 *    Isin uzerindeki nokta: R(t) = (t * dx, t * dy), t in [2, maxDist].
 *
 * 3. Poligon Kenar Segmenti:
 *    A = (x1, y1) ve B = (x2, y2) arasi segment.
 *    v = B - A = (x2 - x1, y2 - y1) = (vx, vy).
 *    Segment uzerindeki nokta: S(u) = A + u * v = (x1 + u * vx, y1 + u * vy), u in [0, 1].
 *
 * 4. Kesisim Hesabi (R(t) = S(u)):
 *    t * dx = x1 + u * vx  =>  t * dx - u * vx = x1
 *    t * dy = y1 + u * vy  =>  t * dy - u * vy = y1
 *
 *    Determinant: denom = dx * vy - dy * vx.
 *    Eger |denom| < 1e-12 ise dogrular paraleldir, kesisim yoktur.
 *    Cramer kurali ile cozum:
 *    t = (x1 * vy - y1 * vx) / denom
 *    u = (x1 * dy - y1 * dx) / denom
 *
 *    Gecerli kesisim icin:
 *    u in [0, 1] (sayisal hassasiyet icin [-1e-9, 1 + 1e-9])
 *    t > 2 (icinde durulan binayi atlamak icin)
 *    t <= maxDist
 *    En kucuk t degeri en yakin binayi verir.
 *
 * 5. Geri Donusum:
 *    hitX = t * dx, hitY = t * dy
 *    hitLat = p.lat + (hitY / R) * (180 / pi)
 *    hitLon = p.lon + (hitX / (R * cosLat0)) * (180 / pi)
 */
export function buildingHit(p, heading, features, maxDist) {
  var maxD = maxDist === undefined ? 600 : maxDist;

  if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') {
    return null;
  }
  if (typeof heading !== 'number' || isNaN(heading)) {
    return null;
  }
  if (!features || !Array.isArray(features) || features.length === 0) {
    return null;
  }

  var lat0Rad = p.lat * DEG_TO_RAD;
  var cosLat0 = Math.cos(lat0Rad);
  var cosFactor = Math.abs(cosLat0) < 1e-12 ? 1e-12 : cosLat0;

  var headingRad = heading * DEG_TO_RAD;
  var dx = Math.sin(headingRad);
  var dy = Math.cos(headingRad);

  var minDist = Infinity;

  function intersectEdge(p1, p2) {
    var x1 = p1[0];
    var y1 = p1[1];
    var x2 = p2[0];
    var y2 = p2[1];
    var vx = x2 - x1;
    var vy = y2 - y1;
    var denom = dx * vy - dy * vx;
    if (Math.abs(denom) < 1e-12) {
      return;
    }

    var t = (x1 * vy - y1 * vx) / denom;
    var u = (x1 * dy - y1 * dx) / denom;

    if (u >= -1e-9 && u <= 1 + 1e-9) {
      if (t > 2 && t <= maxD && t < minDist) {
        minDist = t;
      }
    }
  }

  function processRing(ring) {
    if (!ring || ring.length < 2) {
      return;
    }
    var pts = new Array(ring.length);
    for (var i = 0; i < ring.length; i++) {
      var c = ring[i];
      if (!c || typeof c[0] !== 'number' || typeof c[1] !== 'number') {
        return;
      }
      var dLon = c[0] - p.lon;
      if (dLon > 180) {
        dLon -= 360;
      }
      if (dLon < -180) {
        dLon += 360;
      }
      pts[i] = [
        dLon * DEG_TO_RAD * EARTH_RADIUS * cosFactor,
        (c[1] - p.lat) * DEG_TO_RAD * EARTH_RADIUS
      ];
    }

    var numEdges = ring.length - 1;
    for (var j = 0; j < numEdges; j++) {
      intersectEdge(pts[j], pts[j + 1]);
    }
    var first = ring[0];
    var last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      intersectEdge(pts[ring.length - 1], pts[0]);
    }
  }

  for (var f = 0; f < features.length; f++) {
    var feat = features[f];
    if (!feat || !feat.geometry) {
      continue;
    }
    var geom = feat.geometry;
    if (!geom.coordinates || !Array.isArray(geom.coordinates)) {
      continue;
    }

    if (geom.type === 'Polygon') {
      for (var r = 0; r < geom.coordinates.length; r++) {
        processRing(geom.coordinates[r]);
      }
    } else if (geom.type === 'MultiPolygon') {
      for (var pIdx = 0; pIdx < geom.coordinates.length; pIdx++) {
        var poly = geom.coordinates[pIdx];
        if (!Array.isArray(poly)) {
          continue;
        }
        for (var pr = 0; pr < poly.length; pr++) {
          processRing(poly[pr]);
        }
      }
    }
  }

  if (minDist === Infinity) {
    return null;
  }

  var hitX = minDist * dx;
  var hitY = minDist * dy;
  var hitLat = p.lat + (hitY / EARTH_RADIUS) * RAD_TO_DEG;
  var hitLon = p.lon + (hitX / (EARTH_RADIUS * cosFactor)) * RAD_TO_DEG;
  hitLon = ((hitLon + 180) % 360 + 360) % 360 - 180;

  return {
    point: { lat: hitLat, lon: hitLon },
    dist: minDist
  };
}

/**
 * pickTarget(p, pose, features) -> { point, dist, method: "ground"|"building" } or null
 *
 * Hedef belirleme oncelik sirasi: once groundTarget, eger null ise buildingHit.
 */
export function pickTarget(p, pose, features) {
  if (!p || !pose) {
    return null;
  }

  var ground = groundTarget(p, pose.heading, pose.pitch);
  if (ground !== null) {
    return {
      point: ground.point,
      dist: ground.dist,
      method: 'ground'
    };
  }

  var building = buildingHit(p, pose.heading, features);
  if (building !== null) {
    return {
      point: building.point,
      dist: building.dist,
      method: 'building'
    };
  }

  return null;
}
