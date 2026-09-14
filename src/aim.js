// PILOT HUD - Asama 3 Hedef Sistemi: aim.js
// Telefon tarayici kask HUD (Titanfall tarzi), LANDSCAPE (yatay) tutus, arka kamera HUD arkasinda.
//
// Matematiksel Turetim (Math Derivation):
// 1. W3C DeviceOrientation koordinat sistemi (Earth Frame):
//    X: Dogu (East), Y: Kuzey (North), Z: Yukari (Up).
// 2. Cihaz koordinat sistemi (Device Frame):
//    x: Ekran sagina dogru, y: Ekran ustune dogru, z: Ekrana dik kullaniciya dogru.
// 3. Arka kamera optik ekseni (Rear Camera Optical Axis):
//    Cihazin arkasindan disa dogru baktigi icin cihaz koordinatlarinda v_cam = [0, 0, -1]^T dir.
// 4. W3C ZXY Tait-Bryan icel donusum matrisi R = Z(alpha) * X(beta) * Y(gamma):
//    R matrisinin 3. sutunu (col3):
//      R13 =  cos(alpha)*sin(gamma) + sin(alpha)*sin(beta)*cos(gamma)
//      R23 =  sin(alpha)*sin(gamma) - cos(alpha)*sin(beta)*cos(gamma)
//      R33 =  cos(beta)*cos(gamma)
//    Kamera vektoru dunya koordinatlarinda v_prime = R * v_cam = -col3(R):
//      v_prime_x = -cos(alpha)*sin(gamma) - sin(alpha)*sin(beta)*cos(gamma)  (Dogu bileseni)
//      v_prime_y = -sin(alpha)*sin(gamma) + cos(alpha)*sin(beta)*cos(gamma)  (Kuzey bileseni)
//      v_prime_z = -cos(beta)*cos(gamma)                                    (Yukari bileseni)
// 5. Pitch (Yunuslama) Turetisi:
//    v_prime birim vektor oldugundan, ufuk duzlemi (Z=0) ile yaptigi egim acisi:
//    sin(pitch) = v_prime_z = -cos(beta)*cos(gamma).
//    pitch = asin(-cos(beta)*cos(gamma)) * (180 / PI).
//    Gosterildigi uzere pitch yalnizca beta ve gamma acilarina baglidir ve tum yonelimlerde
//    (landscape 90, landscape 270, portrait 0) dogrudur.
// 6. Heading (Pusula / Azimut) Turetisi:
//    v_prime vektorunun yatay duzlemdeki projeksiyonu (v_prime_x, v_prime_y) dir.
//    Kuzeyden saat yonunde olculen pusula acisi:
//    heading = atan2(v_prime_x, v_prime_y) * (180 / PI), aralik [0, 360).
// 7. compassHeading Entegrasyonu (Secilen ve Belgelenen Yaklasim):
//    compassHeading degeri uygulamanin duzeltilmis cihaz ust kenar (+Y ekseni) mutlak yonudur.
//    W3C modelinde cihaz ust kenarinin (+Y) yatay duzlemdeki azimutu (360 - alpha) dir.
//    Dolayisiyla eger compassHeading verilmis ise:
//    alpha_kalibre = (360 - compassHeading) mod 360 olarak hesaplanir.
//    Bu kalibre edilmis alpha degeri rotasyon matrisine uygulanarak kamera ekseni azimutu
//    tam geometrik tutarlilikla elde edilir.
//    Kameranin tam asagi veya yukari baktigi tekil durumda (v_prime_x = 0, v_prime_y = 0),
//    ekran acisi (screenAngle) limit yonelimi saglar.

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;

// Acilari [0, 360) araligina normalize eden yardimci fonksiyon
function norm360(deg) {
  var res = deg % 360;
  if (res < 0) {
    res += 360;
  }
  return res;
}

export function cameraPose(alpha, beta, gamma, screenAngle, compassHeading) {
  var a = (alpha !== null && alpha !== undefined) ? alpha : 0;
  var b = (beta !== null && beta !== undefined) ? beta : 0;
  var g = (gamma !== null && gamma !== undefined) ? gamma : 0;
  var s = (screenAngle !== null && screenAngle !== undefined) ? screenAngle : 0;

  var bRad = b * D2R;
  var gRad = g * D2R;

  var cosB = Math.cos(bRad);
  var sinB = Math.sin(bRad);
  var cosG = Math.cos(gRad);
  var sinG = Math.sin(gRad);

  // Pitch hesaplamasi: v_prime_z = -cos(beta) * cos(gamma)
  var vz = -cosB * cosG;
  if (vz > 1) {
    vz = 1;
  } else if (vz < -1) {
    vz = -1;
  }
  var pitch = Math.asin(vz) * R2D;

  // Heading hesaplamasi:
  // Eger compassHeading verilmis ise cihaz ust kenari referans alinarak alpha kalibre edilir.
  var effAlpha;
  if (compassHeading !== null && compassHeading !== undefined) {
    effAlpha = norm360(360 - compassHeading);
  } else {
    effAlpha = norm360(a);
  }

  var aRad = effAlpha * D2R;
  var cosA = Math.cos(aRad);
  var sinA = Math.sin(aRad);

  // Kamera ekseninin dunya koordinatlarindaki X (Dogu) ve Y (Kuzey) bilesenleri
  var vx = -cosA * sinG - sinA * sinB * cosG;
  var vy = -sinA * sinG + cosA * sinB * cosG;

  var heading;
  // Yatay bilesenler sifira yakin ise (tekil durum, orn. masada duz dururken)
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) {
    var baseHeading = (compassHeading !== null && compassHeading !== undefined) ? compassHeading : norm360(360 - a);
    heading = norm360(baseHeading + s);
  } else {
    heading = norm360(Math.atan2(vx, vy) * R2D);
  }

  return {
    heading: heading,
    pitch: pitch
  };
}

export function smoothAngle(prev, next, k) {
  var p = norm360(prev);
  var n = norm360(next);
  var factor = (k !== null && k !== undefined) ? k : 1;

  var diff = (n - p) % 360;
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }

  return norm360(p + diff * factor);
}
