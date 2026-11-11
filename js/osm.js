// Nombres de pistas y remontes cruzando la traza con OpenStreetMap (vía Overpass).
import { hav } from './stats.js';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export async function fetchWays(bbox) {
  const [s, w, n, e] = bbox.map(v => v.toFixed(5));
  const q = `[out:json][timeout:25];(way["piste:type"="downhill"](${s},${w},${n},${e});way["aerialway"](${s},${w},${n},${e}););out tags geom;`;
  let err;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return (j.elements || []).filter(el => el.geometry && el.geometry.length > 1).map(el => ({
        id: el.id, lift: !!el.tags?.aerialway,
        name: el.tags?.name || el.tags?.['piste:name'] || el.tags?.ref || el.tags?.['piste:ref'] || '',
        diff: el.tags?.['piste:difficulty'] || '', pts: el.geometry.map(g => [g.lat, g.lon]),
      }));
    } catch (e2) { err = e2; }
  }
  throw err || new Error('Sin respuesta de OpenStreetMap');
}

// Distancia de un punto a un segmento, en metros (aproximación plana, de sobra a esta escala).
function segDist(la, lo, a, b) {
  const kx = 111320 * Math.cos(la * Math.PI / 180), ky = 110540;
  const px = (lo - a[1]) * kx, py = (la - a[0]) * ky, bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  const L = bx * bx + by * by, t = L ? Math.max(0, Math.min(1, (px * bx + py * by) / L)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}
function nearest(la, lo, ways, maxM) {
  let best = null, bd = maxM;
  for (const w of ways) {
    if (la < w.box[0] || la > w.box[2] || lo < w.box[1] || lo > w.box[3]) continue;
    for (let i = 0; i < w.pts.length - 1; i++) { const d = segDist(la, lo, w.pts[i], w.pts[i + 1]); if (d < bd) { bd = d; best = w; } }
  }
  return best;
}

/** Devuelve { runs: {n: {name, diff}}, lifts: {liftId: name} } */
export function matchDay(day, ways) {
  const pad = 0.0006;
  for (const w of ways) if (!w.box) {
    const la = w.pts.map(p => p[0]), lo = w.pts.map(p => p[1]);
    w.box = [Math.min(...la) - pad, Math.min(...lo) - pad, Math.max(...la) + pad, Math.max(...lo) + pad];
  }
  const pistes = ways.filter(w => !w.lift), aerial = ways.filter(w => w.lift && w.name);
  const T = day.track, out = { runs: {}, lifts: {} };
  for (const a of day.actions) {
    const pool = a.type === 'run' ? pistes : aerial, hits = new Map(); let total = 0, order = 0;
    for (let i = a.i0; i <= a.i1; i += 3) {
      total++;
      const w = nearest(T.lat[i], T.lon[i], pool, a.type === 'run' ? 40 : 60);
      if (!w) continue;
      const key = w.name || '#' + w.id, h = hits.get(key) || { key, name: w.name, diff: w.diff, c: 0, first: order++ };
      h.c++; hits.set(key, h);
    }
    const list = [...hits.values()];
    if (a.type === 'lift') {
      const top = list.sort((x, y) => y.c - x.c)[0];
      if (top && a.liftId && top.c / total > 0.4 && !out.lifts[a.liftId]) out.lifts[a.liftId] = top.name;
    } else {
      const named = list.filter(h => h.name && h.c / total >= 0.15).sort((x, y) => x.first - y.first).slice(0, 3);
      const dom = list.sort((x, y) => y.c - x.c)[0];
      if (named.length) out.runs[a.n] = { name: named.map(h => h.name).join(' → '), diff: dom?.diff || named[0].diff };
      else if (dom?.diff && dom.c / total >= 0.3) out.runs[a.n] = { name: '', diff: dom.diff };
    }
  }
  return out;
}
