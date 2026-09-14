/* Ana dongu. Sensorlerden gelen veriyi tek bir durum nesnesinde toplar,
   ekrani sabit hizda tazeler. Cizim ve veri ayri tutuluyor:
   sensor olaylari sadece durumu gunceller, ciziME karar veren tek yer render(). */

import { distance, bearing, fmtDist, norm } from './geo.js';
import { startGPS, startCompass, startSim } from './sensors.js';
import { drawMap, drawStrip } from './minimap.js';
import { startCamera, stopCamera } from './camera.js';
import { initBasemap, updateBasemap, getBuildingFeatures } from './basemap.js';
import { cameraPose, smoothAngle } from './aim.js';
import { destination, pickTarget } from './geoaim.js';
import { projectTarget } from './screenproj.js';

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

const WP_HFOV = 63;                          // Yatay gorus acisi (derece), kamera optigine gore kalibre edilebilir
const RANGES = [50, 100, 250, 500, 1000];   // minimap menzil kademeleri, metre
const TRAIL_MAX = 300;                       // izde tutulan nokta sayisi
const TRAIL_MIN_M = 3;                       // bu mesafeden yakin noktalar ize eklenmez

const st = {
  pos: null, acc: null, alt: null, spd: 0,
  heading: null, hsrc: '---',
  pose: { heading: null, pitch: 0 },
  trail: [], waypoint: null, wpMethod: null, trip: 0,
  range: 100, sim: false, fix: false
};

let gotAbsPose = false;

const $ = id => document.getElementById(id);
const els = {
  gate: $('gate'), hud: $('hud'), err: $('gate-err'),
  map: $('map'), strip: $('strip'),
  cam: $('cam'), bCam: $('b-cam'),
  wpMark: $('wp-mark'), wpLabel: $('wp-label'),
  wpEdge: $('wp-edge'), wpEdgeLabel: $('wp-edge-label'),
  bMark: $('b-mark'),
  mapWrap: document.querySelector('.map-wrap')
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

  if (st.sim) {
    st.pose = { heading: st.heading, pitch: 0 };
  } else if (st.pose.heading === null) {
    st.pose.heading = st.heading;
  }
}

function onPose(ev) {
  if (st.sim) return;
  const angle = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (window.orientation || 0);
  const raw = cameraPose(ev.alpha, ev.beta, ev.gamma, angle, null);

  // Ham yunuslama (pitch) yumusatma
  if (st.pose.pitch === null || isNaN(st.pose.pitch)) {
    st.pose.pitch = raw.pitch;
  } else {
    st.pose.pitch = st.pose.pitch + (raw.pitch - st.pose.pitch) * 0.25;
  }

  // Yon (heading): mutlak olay veya iOS basligi varsa yumusatilmis ham baslik, yoksa st.heading
  const isAbs = Boolean(ev.absolute || typeof ev.webkitCompassHeading === 'number');
  if (isAbs) {
    gotAbsPose = true;
    if (st.pose.heading === null) {
      st.pose.heading = raw.heading;
    } else {
      st.pose.heading = smoothAngle(st.pose.heading, raw.heading, 0.25);
    }
  } else {
    // Android ayni anda hem mutlak (deviceorientationabsolute) hem de goreceli
    // (deviceorientation) olay firlatir. Mutlak yon bilgisi alindiysa goreceli olay
    // st.pose.heading degerini ezmemelidir; aksi takdirde yatay kipte cihaz ust kenari
    // ile kamera yonu arasindaki 90 derecelik farktan dolayi yon surekli iki deger
    // arasinda gidip gelir. Bu nedenle mutlak veri varsa yalnizca yunuslama guncellenir,
    // henuz mutlak veri yoksa st.heading yedek degerine donulur.
    if (!gotAbsPose) {
      st.pose.heading = st.heading;
    }
  }
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

  if (st.sim) {
    st.pose = { heading: st.heading, pitch: 0 };
  } else if (st.pose.heading === null && st.heading !== null) {
    st.pose.heading = st.heading;
  }

  const camHdg = (st.pose && st.pose.heading !== null) ? st.pose.heading : st.heading;

  // Hedef paneli
  const box = $('wp-box');
  if (st.waypoint && st.pos) {
    const d = distance(st.pos, st.waypoint);
    const b = bearing(st.pos, st.waypoint);
    // Bagil aci: hedefin sana gore nerede oldugu. Duz yon degil, bu okunur.
    const rel = camHdg == null ? null : norm(b - camHdg);
    t('v-wpd', fmtDist(d));
    t('v-wpb', rel == null ? String(Math.round(b)).padStart(3, '0') + '°'
      : (rel > 180 ? '◀ ' + Math.round(360 - rel) : Math.round(rel) + ' ▶') + '°');
    box.classList.add('on');
  } else {
    box.classList.remove('on');
  }

  // Ekran ustu hedef nisan kutusu ve kenar oku
  if (st.waypoint && st.pos) {
    const pose = {
      heading: (st.pose && st.pose.heading !== null) ? st.pose.heading : (st.heading !== null ? st.heading : 0),
      pitch: (st.pose && typeof st.pose.pitch === 'number') ? st.pose.pitch : 0
    };
    const p = projectTarget(st.pos, st.waypoint, pose, {
      width: window.innerWidth,
      height: window.innerHeight,
      hfov: WP_HFOV
    });

    if (p && p.onScreen) {
      if (els.wpMark) {
        els.wpMark.hidden = false;
        els.wpMark.style.transform = 'translate(' + p.x.toFixed(1) + 'px, ' + p.y.toFixed(1) + 'px)';
        const rawScale = 1.4 - (Math.min(p.dist, 300) / 300) * 0.7;
        const wpScale = Math.max(0.7, Math.min(1.4, rawScale));
        els.wpMark.style.setProperty('--wp-scale', wpScale.toFixed(2));
      }
      t('wp-label', fmtDist(p.dist));
      if (els.wpEdge) els.wpEdge.hidden = true;
    } else if (p && p.edge) {
      if (els.wpMark) els.wpMark.hidden = true;
      if (els.wpEdge) {
        els.wpEdge.hidden = false;
        els.wpEdge.style.transform = 'translate(' + p.edge.x.toFixed(1) + 'px, ' + p.edge.y.toFixed(1) + 'px)';
        const arrow = els.wpEdge.querySelector('.wp-arrow');
        if (arrow) {
          arrow.style.transform = 'rotate(' + p.edge.angle.toFixed(1) + 'deg)';
        }
      }
      t('wp-edge-label', fmtDist(p.dist));
    } else {
      if (els.wpMark) els.wpMark.hidden = true;
      if (els.wpEdge) els.wpEdge.hidden = true;
    }
  } else {
    if (els.wpMark) els.wpMark.hidden = true;
    if (els.wpEdge) els.wpEdge.hidden = true;
  }

  if (st.pos) {
    updateBasemap(st);
  }
  drawMap(els.map, (camHdg !== null && camHdg !== st.heading) ? Object.assign({}, st, { heading: camHdg }) : st);
  drawStrip(els.strip, camHdg);
  requestAnimationFrame(render);
}

/* --- Kontroller --- */

let markFlashTimer = null;
function flashMark(text) {
  const btn = $('b-mark');
  if (!btn) return;
  if (markFlashTimer) clearTimeout(markFlashTimer);
  btn.textContent = text;
  markFlashTimer = setTimeout(() => {
    btn.textContent = 'HEDEF KOY';
  }, 1800);
}

$('b-mark').onclick = () => {
  if (!st.pos) {
    flashMark('GPS YOK');
    return;
  }
  const features = getBuildingFeatures();
  const pose = {
    heading: (st.pose && st.pose.heading !== null) ? st.pose.heading : (st.heading !== null ? st.heading : 0),
    pitch: (st.pose && typeof st.pose.pitch === 'number') ? st.pose.pitch : 0
  };
  const res = pickTarget(st.pos, pose, features);
  if (res) {
    st.waypoint = res.point;
    st.wpMethod = res.method;
    const typeStr = res.method === 'ground' ? 'YER' : 'BINA';
    flashMark(typeStr + ' ' + fmtDist(res.dist));
  } else {
    flashMark('HEDEF YOK - HARITAYA DOKUN');
  }
};

$('b-clear').onclick = () => {
  st.waypoint = null;
  st.wpMethod = null;
  st.trail = [];
  st.trip = 0;
};

$('b-zoom').onclick = () => {
  st.range = RANGES[(RANGES.indexOf(st.range) + 1) % RANGES.length];
};

const mapWrap = document.querySelector('.map-wrap');
if (mapWrap) {
  mapWrap.addEventListener('pointerdown', ev => {
    if (!st.pos) return;
    const mapCanvas = els.map;
    if (!mapCanvas) return;
    const rect = mapCanvas.getBoundingClientRect();
    const radiusPx = rect.width / 2;
    if (radiusPx <= 0) return;
    const cx = rect.left + radiusPx;
    const cy = rect.top + rect.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    const distPx = Math.hypot(dx, dy);
    if (distPx > radiusPx) return;

    const camHdg = (st.pose && st.pose.heading !== null) ? st.pose.heading : (st.heading !== null ? st.heading : 0);
    const worldBearing = norm(camHdg + Math.atan2(dx, -dy) * 180 / Math.PI);
    const meters = distPx * st.range / radiusPx;
    st.waypoint = destination(st.pos, worldBearing, meters);
    st.wpMethod = 'map';
  });
}

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
    }, onPose);
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
  st.pose = { heading: 0, pitch: 0 };
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
