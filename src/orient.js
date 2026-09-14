// Pilot HUD - Sensor fuzyonu ve kuaterniyon yonelimi
// W3C AbsoluteOrientationSensor kuaterniyonundan kamera bakis acisi cikarimi.
// ASCII-only Turkce aciklamalar, nullish coalescing operatoru yok.

function norm(deg) {
  var r = ((deg % 360) + 360) % 360;
  return r === 0 ? 0 : r;
}

export function poseFromQuaternion(q) {
  if (!q || q.length < 4) {
    return { heading: null, pitch: 0 };
  }

  var x = q[0];
  var y = q[1];
  var z = q[2];
  var w = q[3];

  // Kamera ekseni cihaz koordinatlarinda [0, 0, -1] dir.
  // Bu vektor q kuaterniyonu ile ENU (East-North-Up) dunya koordinatlarina dondurulur:
  // v = q * [0, 0, -1] * q^-1 = [e, n, u]
  var e = -2 * (x * z + w * y);
  var n = 2 * (w * x - y * z);
  var u = 2 * (x * x + y * y) - 1;

  var hlen = Math.hypot(e, n);
  var heading = null;
  if (hlen >= 1e-6) {
    var deg = Math.atan2(e, n) * 180 / Math.PI;
    var h = norm(deg);
    if (Math.abs(h) < 1e-12 || Math.abs(h - 360) < 1e-12) {
      h = 0;
    }
    heading = h;
  }

  var cu = Math.max(-1, Math.min(1, u));
  var pitch = Math.asin(cu) * 180 / Math.PI;
  if (pitch === 0 || Math.abs(pitch) < 1e-12) {
    pitch = 0;
  }

  return {
    heading: heading,
    pitch: pitch
  };
}
