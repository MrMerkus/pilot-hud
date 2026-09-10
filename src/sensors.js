/* Sensor katmani. Tarayici API'lerini tek bir arayuz altinda toplar,
   ve simulasyon modunda ayni arayuzu sahte veriyle doldurur.
   Bu ayrim onemli: HUD kodu verinin nereden geldigini bilmez. */

import { norm } from './geo.js';

/* --- Konum --- */
export function startGPS(onFix, onErr) {
  if (!('geolocation' in navigator)) {
    onErr('Bu tarayicida konum servisi yok.');
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    pos => onFix({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      acc: pos.coords.accuracy,
      alt: pos.coords.altitude,
      spd: pos.coords.speed,          // m/s, yoksa null
      gpsHdg: pos.coords.heading,     // hareket yonu, dururken null
      t: pos.timestamp
    }),
    e => onErr(gpsErrText(e)),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

function gpsErrText(e) {
  if (e.code === 1) return 'Konum izni reddedildi. Tarayici ayarlarindan siteye izin ver.';
  if (e.code === 2) return 'Konum alinamiyor. Acik alana cik, GPS kapaliysa ac.';
  if (e.code === 3) return 'Konum zaman asimina ugradi.';
  return 'Konum hatasi: ' + e.message;
}

/* --- Pusula ---
   Uc kaynak var ve hepsi ayni seyi soylemiyor:
   - iOS: webkitCompassHeading, zaten kuzeye gore, dogrudan kullanilir.
   - Android: deviceorientationabsolute olayinda alpha, ama ters yonde sayiyor.
   - Bazi cihazlarda hicbiri yok; o zaman GPS'in hareket yonune duseriz. */
export async function startCompass(onHeading, onErr) {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') { onErr('Pusula izni reddedildi.'); return () => {}; }
    }
  } catch (e) {
    onErr('Pusula izni alinamadi: ' + e.message);
    return () => {};
  }

  const handle = ev => {
    let h = null, src = null;
    if (typeof ev.webkitCompassHeading === 'number') {
      h = ev.webkitCompassHeading; src = 'IOS';
    } else if (ev.absolute && typeof ev.alpha === 'number') {
      h = norm(360 - ev.alpha); src = 'MAG';
    }
    if (h !== null) onHeading(norm(h), src);
  };

  window.addEventListener('deviceorientationabsolute', handle, true);
  window.addEventListener('deviceorientation', handle, true);
  return () => {
    window.removeEventListener('deviceorientationabsolute', handle, true);
    window.removeEventListener('deviceorientation', handle, true);
  };
}

/* --- Simulasyon ---
   Masaustunde ve sensorsuz cihazda HUD'i gorebilmek icin.
   Ankara civarinda dairesel bir yuruyus uretir. */
export function startSim(onFix, onHeading) {
  const c = { lat: 39.9334, lon: 32.8597 };
  const rMeters = 120;
  let t = 0;
  const id = setInterval(() => {
    t += 0.02;
    const dLat = (rMeters * Math.cos(t)) / 111320;
    const dLon = (rMeters * Math.sin(t)) / (111320 * Math.cos(c.lat * Math.PI / 180));
    onFix({
      lat: c.lat + dLat, lon: c.lon + dLon,
      acc: 4 + Math.sin(t * 3) * 2,
      alt: 890 + Math.sin(t) * 5,
      spd: 1.4, gpsHdg: null, t: Date.now()
    });
    onHeading(norm(t * 180 / Math.PI + 90), 'SIM');
  }, 100);
  return () => clearInterval(id);
}
