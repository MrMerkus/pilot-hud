/* Minimap cizimi. Canvas 2D, kutuphane yok.
   Harita "burun yukari": ekranin ustu her zaman baktigin yon.
   Sebebi kask kullanimi; kafani cevirdiginde harita da donmeli ki
   "sagimdaki sey haritada da sagimda" olsun. Kuzey ayri bir isaretle gosterilir. */

import { toLocal, norm } from './geo.js';

const CY = '#4de2f0';
const AM = '#ffa02b';

export function drawMap(cv, st) {
  const dpr = window.devicePixelRatio || 1;
  const size = cv.clientWidth;
  if (cv.width !== size * dpr) { cv.width = cv.height = size * dpr; }

  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, R = size / 2 - 2;
  const ppm = R / st.range;              // piksel / metre
  const hdg = st.heading !== null ? st.heading : 0;

  // Dis cerceve
  g.strokeStyle = '#4de2f055'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();

  // Menzil halkalari: mesafe hissi vermek icin, ucte bir ve ucte iki
  g.strokeStyle = '#4de2f022';
  for (const f of [0.33, 0.66]) {
    g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke();
  }

  // Bundan sonrasi haritanin donen kismi
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy);
  g.rotate(-hdg * Math.PI / 180);        // burun yukari icin ters cevir

  // Iz: gectigin yol. Eskiyen noktalar soluyor.
  if (st.trail.length > 1 && st.pos) {
    for (let i = 1; i < st.trail.length; i++) {
      const a = toLocal(st.pos, st.trail[i - 1]);
      const b = toLocal(st.pos, st.trail[i]);
      g.strokeStyle = `rgba(77,226,240,${0.12 + 0.5 * (i / st.trail.length)})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(a.x * ppm, -a.y * ppm);
      g.lineTo(b.x * ppm, -b.y * ppm);
      g.stroke();
    }
  }

  // Hedef isareti
  if (st.waypoint && st.pos) {
    const w = toLocal(st.pos, st.waypoint);
    let x = w.x * ppm, y = -w.y * ppm;
    const d = Math.hypot(x, y);
    const clipped = d > R - 8;
    if (clipped) { const k = (R - 8) / d; x *= k; y *= k; }  // menzil disindaysa kenara sabitle

    g.strokeStyle = AM; g.fillStyle = AM; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y);
    g.closePath();
    clipped ? g.stroke() : g.fill();     // menzil disinda ici bos, icinde dolu
  }

  // Kuzey isareti
  g.fillStyle = '#4de2f099';
  g.font = '9px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText('K', 0, -R + 12);

  g.restore();

  // Merkez: sen. Donmez, hep yukari bakar.
  g.fillStyle = CY;
  g.beginPath();
  g.moveTo(cx, cy - 7); g.lineTo(cx + 5, cy + 6); g.lineTo(cx, cy + 3); g.lineTo(cx - 5, cy + 6);
  g.closePath(); g.fill();
}

/* Ust pusula seridi. Bakis acisinin etrafindaki +-60 dereceyi gosterir. */
export function drawStrip(cv, heading) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = 50;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }

  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (heading == null) return;

  const span = 120;                       // gorunen aci araligi
  const pxPerDeg = w / span;
  const start = Math.floor((heading - span / 2) / 5) * 5;

  g.font = '10px ui-monospace, monospace';
  g.textAlign = 'center';

  for (let a = start; a <= heading + span / 2; a += 5) {
    const x = w / 2 + (a - heading) * pxPerDeg;
    if (x < -20 || x > w + 20) continue;
    const na = norm(a);
    const major = na % 30 === 0;

    g.strokeStyle = major ? '#4de2f0cc' : '#4de2f044';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 30); g.lineTo(x, major ? 18 : 24);
    g.stroke();

    if (major) {
      const lbl = { 0: 'K', 90: 'D', 180: 'G', 270: 'B' }[na] || String(na);
      g.fillStyle = lbl.length === 1 ? '#ffa02b' : '#4de2f0cc';
      g.fillText(lbl, x, 14);
    }
  }
}
