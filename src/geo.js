/* Cografi hesaplar. Saf fonksiyonlar, sensor bilmez, test edilebilir. */

const R = 6371000; // Dunya yaricapi, metre
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

/* Iki nokta arasi mesafe, metre. Haversine formulu.
   Duz geometri kullanmiyoruz cunku enlem arttikca boylam dereceleri kisaliyor;
   birkac kilometrede bile hata birikiyor. */
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* a noktasindan b noktasina bakis acisi, 0-360 derece, kuzey = 0. */
export function bearing(a, b) {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
            Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/* Referans noktasina gore yerel metre koordinati.
   Minimap kucuk bir alani gosterdigi icin duzlem yaklasimi yeterli. */
export function toLocal(origin, p) {
  const x = distance(origin, { lat: origin.lat, lon: p.lon }) * (p.lon < origin.lon ? -1 : 1);
  const y = distance(origin, { lat: p.lat, lon: origin.lon }) * (p.lat < origin.lat ? -1 : 1);
  return { x, y };
}

/* Aciyi 0-360 araligina getirir. */
export const norm = a => ((a % 360) + 360) % 360;

/* Pusula yonunu 16 yone cevirir: 0 -> K, 90 -> D ... */
const NAMES = ['K','KKD','KD','DKD','D','DGD','GD','GGD','G','GGB','GB','BGB','B','BKB','KB','KKB'];
export function cardinal(a) {
  return NAMES[Math.round(norm(a) / 22.5) % 16];
}

/* Mesafeyi okunur metne cevirir. */
export function fmtDist(m) {
  if (m == null || !isFinite(m)) return '---';
  if (m < 1000) return Math.round(m) + ' m';
  return (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km';
}
