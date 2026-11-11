// Comparar bajadas entre sí: fantasma, tramos cronometrados y mapa de velocidad.
import { hav, dayStats, KMH } from './stats.js';

/** Distancia acumulada (m) a lo largo de una bajada, índice a índice. */
export function cum(d, r) {
  if (r._cum) return r._cum;
  const T = d.track, out = new Float64Array(r.i1 - r.i0 + 1);
  for (let i = r.i0 + 1; i <= r.i1; i++) out[i - r.i0] = out[i - r.i0 - 1] + hav(T.lat[i - 1], T.lon[i - 1], T.lat[i], T.lon[i]);
  return r._cum = out;
}
/** Posición interpolada en el instante t (segundos). */
export function posAt(d, t) {
  const T = d.track; let lo = 0, hi = T.t.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; T.t[m] <= t ? lo = m : hi = m - 1; }
  const j = Math.min(lo + 1, T.t.length - 1), k = T.t[j] > T.t[lo] ? Math.max(0, Math.min(1, (t - T.t[lo]) / (T.t[j] - T.t[lo]))) : 0;
  return { lat: T.lat[lo] + (T.lat[j] - T.lat[lo]) * k, lon: T.lon[lo] + (T.lon[j] - T.lon[lo]) * k, i: lo, k };
}
/** Distancia recorrida en la bajada en el instante t. */
export function distAt(d, r, t) {
  const c = cum(d, r), p = posAt(d, Math.max(r.t0, Math.min(r.t1, t))), i = Math.max(r.i0, Math.min(r.i1, p.i)) - r.i0;
  return c[i] + ((c[Math.min(i + 1, c.length - 1)] - c[i]) * p.k);
}
/** Segundos desde el inicio de la bajada hasta recorrer x metros. */
export function timeToDist(d, r, x) {
  const c = cum(d, r), T = d.track;
  if (x >= c[c.length - 1]) return T.t[r.i1] - T.t[r.i0];
  let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; c[m] < x ? lo = m + 1 : hi = m; }
  if (lo === 0) return 0;
  const a = c[lo - 1], b = c[lo], k = b > a ? (x - a) / (b - a) : 0;
  return T.t[r.i0 + lo - 1] + (T.t[r.i0 + lo] - T.t[r.i0 + lo - 1]) * k - T.t[r.i0];
}

const ends = (d, r) => { const T = d.track; return [T.lat[r.i0], T.lon[r.i0], T.lat[r.i1], T.lon[r.i1]]; };
/** Bajadas que hacen el mismo recorrido: salen y llegan al mismo sitio con una longitud parecida. */
export function sameCourse(d, r, days) {
  const [a0, o0, a1, o1] = ends(d, r), out = [];
  for (const e of days) {
    if (hav(e.lat, e.lon, d.lat, d.lon) > 20000) continue;
    for (const q of dayStats(e).runs) {
      if (q.dist < 300 || Math.abs(q.dist / r.dist - 1) > 0.2) continue;
      const [b0, p0, b1, p1] = ends(e, q);
      if (hav(a0, o0, b0, p0) < 90 && hav(a1, o1, b1, p1) < 90) out.push({ d: e, r: q });
    }
  }
  return out;
}
/** Tu mejor bajada por el mismo recorrido, sin contar esta. */
export function ghostFor(d, r, days) {
  if (r._ghost !== undefined) return r._ghost;
  const list = sameCourse(d, r, days).filter(x => x.r !== r);
  return r._ghost = list.length ? Object.assign(list.reduce((b, x) => x.r.dur < b.r.dur ? x : b), { count: list.length + 1 }) : null;
}

/* ---------- tramos cronometrados ---------- */
const GATE = 40;      // radio de la puerta de salida y de llegada, en metros
export function segmentFromRun(d, r, f0, f1, name) {
  const c = cum(d, r), tot = c[c.length - 1], T = d.track;
  const idx = fr => { const x = tot * fr; let i = 0; while (i < c.length - 1 && c[i] < x) i++; return r.i0 + i; };
  const ia = idx(f0), ib = idx(f1);
  return { id: 's' + Date.now().toString(36), name, resort: d.locationId, a: [T.lat[ia], T.lon[ia]], b: [T.lat[ib], T.lon[ib]], len: c[ib - r.i0] - c[ia - r.i0], ia, ib };
}
function closestIn(T, from, to, la, lo) {
  // primera pasada por la puerta: el punto más cercano dentro del primer tramo seguido que entra en el radio
  let best = -1, bd = GATE;
  for (let i = from; i <= to; i++) {
    const m = hav(T.lat[i], T.lon[i], la, lo);
    if (m < bd) { bd = m; best = i; } else if (best >= 0 && m > GATE * 2) break;
  }
  return best;
}
/** Todas tus pasadas por un tramo, de más rápida a más lenta. */
export function efforts(seg, days) {
  const out = [];
  for (const d of days) {
    if (hav(d.lat, d.lon, seg.a[0], seg.a[1]) > 20000) continue;
    const T = d.track;
    for (const r of dayStats(d).runs) {
      let from = r.i0;
      while (from < r.i1) {
        const ia = closestIn(T, from, r.i1, seg.a[0], seg.a[1]); if (ia < 0) break;
        const ib = closestIn(T, ia + 1, r.i1, seg.b[0], seg.b[1]); if (ib < 0) break;
        let path = 0; for (let i = ia + 1; i <= ib; i++) path += hav(T.lat[i - 1], T.lon[i - 1], T.lat[i], T.lon[i]);
        if (path > seg.len * 0.7 && path < seg.len * 1.5) {
          const time = T.t[ib] - T.t[ia]; let top = 0; for (let i = ia; i <= ib; i++) top = Math.max(top, T.spd[i]);
          out.push({ d, r, time, avg: path / Math.max(time, 1), top, t0: T.t[ia] });
        }
        from = ib + 1;
      }
    }
  }
  return out.sort((x, y) => x.time - y.time);
}

/* ---------- mapa de velocidad ---------- */
/** Media de velocidad por celdas de unos 25 m, para pintar dónde vas rápido y dónde frenas. */
export function speedCells(days) {
  const g = new Map(), DY = 0.00022;
  for (const d of days) {
    const T = d.track, DX = DY / Math.cos(d.lat * Math.PI / 180);
    for (const r of dayStats(d).runs) for (let i = r.i0; i <= r.i1; i++) {
      const k = Math.round(T.lat[i] / DY) + ':' + Math.round(T.lon[i] / DX), c = g.get(k) || { la: 0, lo: 0, v: 0, n: 0 };
      c.la += T.lat[i]; c.lo += T.lon[i]; c.v += T.spd[i]; c.n++; g.set(k, c);
    }
  }
  return [...g.values()].map(c => ({ type: 'Feature', properties: { v: c.v / c.n * KMH, n: c.n }, geometry: { type: 'Point', coordinates: [c.lo / c.n, c.la / c.n] } }));
}
