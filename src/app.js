/* Ana dongu. Sensorlerden gelen veriyi tek bir durum nesnesinde toplar,
   ekrani sabit hizda tazeler. Cizim ve veri ayri tutuluyor:
   sensor olaylari sadece durumu gunceller, ciziME karar veren tek yer render(). */

import { distance, bearing, fmtDist, norm } from './geo.js';
import { startGPS, startCompass, startSim } from './sensors.js';
import { drawMap, drawStrip } from './minimap.js';
import { startCamera, stopCamera } from './camera.js';
import { initBasemap, updateBasemap } from './basemap.js';

/* --- Servis calisani ve kalici depolama --- */
try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
} catch (e) {}

try {
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    navigator.storage.persist().catch(() => {});
  }
} catch (e) {}

const RANGES = [50, 100, 250, 500, 1000];   // minimap menzil kademeleri, metre
const TRAIL_MAX = 300;                       // izde tutulan nokta sayisi
const TRAIL_MIN_M = 3;                       // bu mesafeden yakin noktalar ize eklenmez

const st = {
  pos: null, acc: null, alt: null, spd: 0,
  heading: null, hsrc: '---',
  trail: [], waypoint: null, trip: 0,
  range: 100, sim: false, fix: false
};

const $ = id => document.getElementById(id);
const els = {
  gate: $('gate'), hud: $('hud'), err: $('gate-err'),
  map: $('map'), strip: $('strip'),
  cam: $('cam'), bCam: $('b-cam')
};

/* --- Ekran kip ve kilitleri --- */

let wakeLock = null;
let keepAwake = false;

function requestFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    try {
      const p = req.call(el);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
  }
}

function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      const p = screen.orientation.lock('landscape');
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch (e) {}
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}

function initDisplay() {
  keepAwake = true;
  requestFullscreen();
  lockLandscape();
  requestWakeLock();
}

document.addEventListener('visibilitychange', () => {
  if (keepAwake && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});

/* --- Sensor girisleri --- */

function onFix(f) {
  const p = { lat: f.lat, lon: f.lon };

  if (st.pos) {
    const d = distance(st.pos, p);
    // 0.5 m alti hareketi yok sayiyoruz: GPS duruyorken bile birkac metre
    // ziplar, bunu ize ve toplam mesafeye yazarsak sen hic yurumeden km birikir.
    if (d > 0.5) st.trip += d;
    if (d > TRAIL_MIN_M) pushTrail(p);
  } else {
    pushTrail(p);
  }

  st.pos = p;
  st.acc = f.acc;
  st.alt = f.alt;
  st.spd = (f.spd != null && f.spd >= 0) ? f.spd : 0;
  st.fix = true;

  // Pusula yoksa hareket yonunu kullan: dururken ise yaramaz ama
  // yururken makul bir yon verir.
  if (st.heading === null && f.gpsHdg != null && !isNaN(f.gpsHdg)) {
    st.heading = norm(f.gpsHdg);
    st.hsrc = 'GPS';
  }
}

function pushTrail(p) {
  st.trail.push(p);
  if (st.trail.length > TRAIL_MAX) st.trail.shift();
}

function onHeading(h, src) {
  // Yumusatma: ham manyetometre titriyor, HUD'da harita zipliyor.
  // Kisa yoldan aci ortalamasi aliyoruz ki 359 -> 1 gecisi geriye donmesin.
  if (st.heading === null) { st.heading = h; }
  else {
    let d = ((h - st.heading + 540) % 360) - 180;
    st.heading = norm(st.heading + d * 0.25);
  }
  st.hsrc = src;
}

/* --- Ekran --- */

function render() {
  const t = (id, v) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v; };

  const gpsWarn = $('gps-warn');
  if (gpsWarn) {
    gpsWarn.hidden = (st.fix || st.sim) ? true : false;
  }

  t('v-spd', (st.spd * 3.6).toFixed(1));
  t('v-scale', st.range + ' m');

  // Hedef paneli
  const box = $('wp-box');
  if (st.waypoint && st.pos) {
    const d = distance(st.pos, st.waypoint);
    const b = bearing(st.pos, st.waypoint);
    // Bagil aci: hedefin sana gore nerede oldugu. Duz yon degil, bu okunur.
    const rel = st.heading == null ? null : norm(b - st.heading);
    t('v-wpd', fmtDist(d));
    t('v-wpb', rel == null ? String(Math.round(b)).padStart(3, '0') + '°'
      : (rel > 180 ? '◀ ' + Math.round(360 - rel) : Math.round(rel) + ' ▶') + '°');
    box.classList.add('on');
  } else {
    box.classList.remove('on');
  }

  if (st.pos) {
    updateBasemap(st);
  }
  drawMap(els.map, st);
  drawStrip(els.strip, st.heading);
  requestAnimationFrame(render);
}

/* --- Kontroller --- */

$('b-mark').onclick = () => { if (st.pos) st.waypoint = { ...st.pos }; };
$('b-clear').onclick = () => { st.waypoint = null; st.trail = []; st.trip = 0; };
$('b-zoom').onclick = () => {
  st.range = RANGES[(RANGES.indexOf(st.range) + 1) % RANGES.length];
};

/* --- Kamera kontrolleri --- */

let camOn = false;
let camBusy = false;
let camErrTimer = null;

function showCamError(msg) {
  els.err.textContent = msg;
  els.bCam.textContent = 'KAMERA YOK';
  if (camErrTimer) clearTimeout(camErrTimer);
  camErrTimer = setTimeout(() => {
    if (!camOn) els.bCam.textContent = 'KAMERA';
  }, 2000);
}

els.bCam.onclick = async () => {
  if (camBusy) return;
  camBusy = true;

  if (camOn) {
    stopCamera(els.cam);
    camOn = false;
    document.body.classList.remove('cam-on');
    els.bCam.classList.remove('on');
    els.bCam.textContent = 'KAMERA';
    camBusy = false;
    return;
  }

  try {
    await startCamera(els.cam);
    camOn = true;
    document.body.classList.add('cam-on');
    els.bCam.classList.add('on');
    els.bCam.textContent = 'KAMERA';
  } catch (e) {
    camOn = false;
    stopCamera(els.cam);
    document.body.classList.remove('cam-on');
    els.bCam.classList.remove('on');
    const msg = e.message || String(e);
    showCamError(msg);
  } finally {
    camBusy = false;
  }
};

/* --- Baslatma --- */

let basemapStarted = false;

function enter() {
  els.gate.hidden = true;
  els.hud.hidden = false;

  if (!basemapStarted) {
    basemapStarted = true;
    const container = $('basemap');
    const statusEl = $('map-status');
    initBasemap(container, (status) => {
      if (statusEl) {
        if (statusEl.textContent !== status) {
          statusEl.textContent = status;
        }
        statusEl.hidden = (status === 'HARITA HAZIR');
      }
      if (status === 'HARITA HAZIR') {
        document.body.classList.add('map-on');
      }
    });
  }

  requestAnimationFrame(render);
}

$('gate-connect').onclick = async () => {
  initDisplay();
  els.err.textContent = '';
  const fail = m => { els.err.textContent = m; };

  try {
    await startCompass(onHeading, m => {
      // Pusula yoksa olumcul degil: GPS yonune duseriz, uyari yeter.
      els.err.textContent = m + ' GPS hareket yonu kullanilacak.';
    });
    startGPS(onFix, fail);
  } catch (e) {
    els.err.textContent = e.message || String(e);
  } finally {
    enter();
  }
};

$('gate-sim').onclick = () => {
  initDisplay();
  st.sim = true;
  startSim(onFix, onHeading);
  enter();
};

// Ekran donduruldugunde canvas olculeri degisir; yeniden cizim zaten
// her karede oluyor, sadece boyut onbellegini bozmak yeterli.
function onResize() {
  els.map.width = 0;
  els.strip.width = 0;
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.__hudReady = true;
