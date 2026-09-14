// PILOT HUD - STAGE 3 TARGET SYSTEM
// screenproj.js: Hedef izdusumu ve ekran kenari hesaplama modulu.
// Saf ES modulu: DOM veya pencere nesnesi kullanilmaz, yan etki icermez.

var EARTH_RADIUS = 6371000;
var DEG_TO_RAD = Math.PI / 180;
var RAD_TO_DEG = 180 / Math.PI;

function norm(a) {
  return ((a % 360) + 360) % 360;
}

function haversineDistance(a, b) {
  var lat1 = a.lat * DEG_TO_RAD;
  var lon1 = a.lon * DEG_TO_RAD;
  var lat2 = b.lat * DEG_TO_RAD;
  var lon2 = b.lon * DEG_TO_RAD;
  var dLat = lat2 - lat1;
  var dLon = lon2 - lon1;
  var sinDLat2 = Math.sin(dLat / 2);
  var sinDLon2 = Math.sin(dLon / 2);
  var s = sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon2 * sinDLon2;
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(s), Math.sqrt(Math.max(0, 1 - s)));
}

function initialBearing(a, b) {
  var lat1 = a.lat * DEG_TO_RAD;
  var lon1 = a.lon * DEG_TO_RAD;
  var lat2 = b.lat * DEG_TO_RAD;
  var lon2 = b.lon * DEG_TO_RAD;
  var dLon = lon2 - lon1;
  var y = Math.sin(dLon) * Math.cos(lat2);
  var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return norm(Math.atan2(y, x) * RAD_TO_DEG);
}

/**
 * projectTarget(me, target, pose, view)
 *
 * me/target: {lat, lon}
 * pose: {heading, pitch} (heading: 0-360 kuzey=0, pitch: 0=ufuk, pozitif=yukari, negatif=asagi)
 * view: {width, height, hfov, margin} (hfov varsayilan 63, vfov igne deligi modeliyle aspect oranindan turetilir)
 *
 * Donus degeri:
 * -> { onScreen, x, y, dist, relBearing, edge: {x, y, angle} | null }
 *
 * Matematiksel Cikarsama:
 * 1. Mesafe ve Kerteriz (Haversine & Bearing):
 *    Mesafe kuresel haversine formuluyle metre cinsinden hesaplanir:
 *      dLat = (target.lat - me.lat) * pi / 180
 *      dLon = (target.lon - me.lon) * pi / 180
 *      a = sin^2(dLat / 2) + cos(lat1) * cos(lat2) * sin^2(dLon / 2)
 *      dist = 2 * R * atan2(sqrt(a), sqrt(1 - a)), R = 6371000 m.
 *    Kerteriz kuzey=0 saat yonunde 0-360 araliginda hesaplanir:
 *      y = sin(dLon) * cos(lat2)
 *      x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
 *      targetBearing = norm(atan2(y, x) * 180 / pi).
 *
 * 2. En Kisa Yonlu Goreli Aci (relBearing):
 *    diff = norm(targetBearing - pose.heading)
 *    relBearing = diff > 180 ? diff - 360 : diff  (-180..180 araliginda)
 *
 * 3. Hedef Yukseklik Acisi (elevAngle):
 *    Hedef goz seviyesinde (0 deg) kabul edilir ve zemine 1.5 m dusus cikarilir:
 *      elevAngle = atan2(-1.5, dist) * 180 / pi (derece cinsinden).
 *
 * 4. Igne Deligi (Pinhole) Kamera Modeli ve vfov:
 *    Kare pikselli kamera modelinde odak uzakligi f:
 *      f = (w / 2) / tan(hfov / 2)
 *      tan(vfov / 2) = (h / 2) / f = (h / w) * tan(hfov / 2)
 *      vfov = 2 * atan((h / w) * tan(hfov / 2)) * 180 / pi
 *    Ekran izdusum koordinatlari:
 *      x = w / 2 + (w / 2) * tan(relBearing) / tan(hfov / 2)
 *      y = h / 2 - (h / 2) * tan(elevAngle - pose.pitch) / tan(vfov / 2).
 *
 * 5. Ekran Ici (onScreen) Kontrolu:
 *    |relBearing| < hfov / 2 (yatay gorus alani icinde olma)
 *    y degeri [-margin, h + margin] araliginda (dikey gorus alani icinde olma).
 *
 * 6. Ekran Disi Kenar Noktasi (edge: {x, y, angle}):
 *    Ekran sinir dikdortgeni: 28 px iceride (inset = 28 px).
 *    Merkez: cx = w / 2, cy = h / 2.
 *    hw = max(0, w / 2 - 28), hh = max(0, h / 2 - 28).
 *    2B Yon vektoru (dirX, dirY):
 *      Eger |relBearing| > 90 ise hedef arkadadir:
 *        dirX = relBearing > 0 ? 1 : -1, dirY = 0 (tam saga veya sola).
 *      Aksi halde (|relBearing| <= 90):
 *        dirX = relBearing
 *        dirY = -(elevAngle - pose.pitch)  (ekranda yukari -y yonudur).
 *    Isin-dikdortgen kesisimi:
 *      tX = hw / |dirX|, tY = hh / |dirY|
 *      t = min(tX, tY)
 *      edge.x = cx + t * dirX
 *      edge.y = cy + t * dirY
 *    Ok donus acisi:
 *      angle = atan2(dirY, dirX) * 180 / pi.
 */
export function projectTarget(me, target, pose, view) {
  if (!me || typeof me.lat !== 'number' || typeof me.lon !== 'number' || isNaN(me.lat) || isNaN(me.lon)) {
    return null;
  }
  if (!target || typeof target.lat !== 'number' || typeof target.lon !== 'number' || isNaN(target.lat) || isNaN(target.lon)) {
    return null;
  }

  var heading = (pose && typeof pose.heading === 'number' && !isNaN(pose.heading)) ? pose.heading : 0;
  var pitch = (pose && typeof pose.pitch === 'number' && !isNaN(pose.pitch)) ? pose.pitch : 0;

  var w = (view && typeof view.width === 'number') ? view.width : 0;
  var h = (view && typeof view.height === 'number') ? view.height : 0;
  var hfov = (view && typeof view.hfov === 'number') ? view.hfov : 63;
  var margin = (view && typeof view.margin === 'number') ? view.margin : 0;

  var dist = haversineDistance(me, target);
  var targetBearing = initialBearing(me, target);

  var diff = norm(targetBearing - heading);
  var relBearing = diff > 180 ? diff - 360 : diff;

  var elevAngle = Math.atan2(-1.5, dist) * RAD_TO_DEG;

  if (w <= 0 || h <= 0) {
    return {
      onScreen: false,
      x: 0,
      y: 0,
      dist: dist,
      relBearing: relBearing,
      edge: null
    };
  }

  var halfHfovRad = (hfov / 2) * DEG_TO_RAD;
  var tanHalfHfov = Math.tan(halfHfovRad);
  if (tanHalfHfov <= 0) {
    tanHalfHfov = 1e-6;
  }

  var tanHalfVfov = (h / w) * tanHalfHfov;
  if (tanHalfVfov <= 0) {
    tanHalfVfov = 1e-6;
  }

  var relRad = relBearing * DEG_TO_RAD;
  var elevDiff = elevAngle - pitch;
  var elevDiffRad = elevDiff * DEG_TO_RAD;

  var x = (w / 2) + (w / 2) * (Math.tan(relRad) / tanHalfHfov);
  var y = (h / 2) - (h / 2) * (Math.tan(elevDiffRad) / tanHalfVfov);

  var onScreen = (Math.abs(relBearing) < hfov / 2) && (y >= -margin && y <= h + margin);
  var edge = null;

  if (!onScreen) {
    var inset = 28;
    var cx = w / 2;
    var cy = h / 2;
    var hw = cx - inset;
    var hh = cy - inset;
    if (hw < 0) {
      hw = 0;
    }
    if (hh < 0) {
      hh = 0;
    }

    var dirX = 0;
    var dirY = 0;

    if (Math.abs(relBearing) > 90) {
      dirX = relBearing > 0 ? 1 : -1;
      dirY = 0;
    } else {
      dirX = relBearing;
      dirY = -elevDiff;
    }

    if (dirX === 0 && dirY === 0) {
      dirX = 1;
    }

    var tX = dirX !== 0 ? hw / Math.abs(dirX) : Infinity;
    var tY = dirY !== 0 ? hh / Math.abs(dirY) : Infinity;
    var t = Math.min(tX, tY);
    if (!isFinite(t) || t < 0) {
      t = 0;
    }

    var edgeX = cx + t * dirX;
    var edgeY = cy + t * dirY;

    if (hw > 0) {
      edgeX = Math.max(inset, Math.min(w - inset, edgeX));
    } else {
      edgeX = cx;
    }
    if (hh > 0) {
      edgeY = Math.max(inset, Math.min(h - inset, edgeY));
    } else {
      edgeY = cy;
    }

    var angle = Math.atan2(dirY, dirX) * RAD_TO_DEG;
    if (angle === 0) {
      angle = 0;
    }

    edge = {
      x: edgeX,
      y: edgeY,
      angle: angle
    };
  }

  return {
    onScreen: onScreen,
    x: x,
    y: y,
    dist: dist,
    relBearing: relBearing,
    edge: edge
  };
}
