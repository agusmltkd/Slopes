// Tarjeta resumen de un día como imagen PNG (1080×1350).
import { KMH } from './stats.js';

export async function dayCard(d, s, f) {
  await document.fonts.ready;
  const W = 1080, H = 1350, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), x = c.getContext('2d');
  x.fillStyle = '#0F2740'; x.fillRect(0, 0, W, H);
  // traza del día
  const T = d.track, box = { x: 70, y: 330, w: W - 140, h: 560 };
  let a0 = 90, a1 = -90, o0 = 180, o1 = -180;
  for (const a of d.actions) for (let i = a.i0; i <= a.i1; i++) { a0 = Math.min(a0, T.lat[i]); a1 = Math.max(a1, T.lat[i]); o0 = Math.min(o0, T.lon[i]); o1 = Math.max(o1, T.lon[i]); }
  const kx = Math.cos((a0 + a1) / 2 * Math.PI / 180), sc = Math.min(box.w / ((o1 - o0) * kx || 1), box.h / ((a1 - a0) || 1));
  const ox = box.x + (box.w - (o1 - o0) * kx * sc) / 2, oy = box.y + (box.h - (a1 - a0) * sc) / 2;
  const P = i => [ox + (T.lon[i] - o0) * kx * sc, oy + (a1 - T.lat[i]) * sc];
  x.lineCap = x.lineJoin = 'round';
  for (const a of d.actions) {
    x.beginPath(); for (let i = a.i0; i <= a.i1; i++) { const [px, py] = P(i); i === a.i0 ? x.moveTo(px, py) : x.lineTo(px, py); }
    if (a.type === 'lift') { x.setLineDash([10, 12]); x.strokeStyle = 'rgba(242,183,5,.75)'; x.lineWidth = 3; }
    else { x.setLineDash([]); x.strokeStyle = '#F2F6F9'; x.lineWidth = 5; x.globalAlpha = 0.85; }
    x.stroke(); x.globalAlpha = 1;
  }
  x.setLineDash([]);
  if (s.fastest) { x.fillStyle = '#D7263D'; x.beginPath(); const px = ox + (s.fastest.topLon - o0) * kx * sc, py = oy + (a1 - s.fastest.topLat) * sc; x.arc(px, py, 14, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.stroke(); }
  // textos
  x.fillStyle = '#F2F6F9'; x.textBaseline = 'alphabetic';
  x.font = '700 104px "Barlow Condensed", sans-serif'; x.fillText(d.resort, 70, 190, W - 140);
  x.font = '500 40px Barlow, sans-serif'; x.fillStyle = '#A9BDD0'; x.fillText(f.dateLong(d), 70, 252);
  const cells = [[f.km(d.distance), 'km esquiados'], [f.int(d.vertical), 'm de desnivel'], [String(Math.round(d.topSpeed * KMH)), 'km/h de máxima'], [String(d.runCount), 'bajadas'], [f.int(d.peakAlt), 'm cota máxima'], [f.dur(s.runTime), 'bajando']];
  cells.forEach(([v, l], i) => {
    const cx = 70 + (i % 3) * 320, cy = 1010 + Math.floor(i / 3) * 170;
    x.fillStyle = i === 2 ? '#FF5A6E' : '#F2F6F9'; x.font = '700 92px "Barlow Condensed", sans-serif'; x.fillText(v, cx, cy, 300);
    x.fillStyle = '#A9BDD0'; x.font = '500 30px Barlow, sans-serif'; x.fillText(l, cx, cy + 44);
  });
  x.fillStyle = '#5E7790'; x.font = '500 26px Barlow, sans-serif'; x.textAlign = 'right'; x.fillText('Traza', W - 70, H - 44);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
