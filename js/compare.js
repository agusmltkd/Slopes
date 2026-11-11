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

/* ---------- curvas y pendiente ---------- */
export const SLOPE_BINS = [0, 10, 20, 30, 40];      // % de pendiente, inicio de cada tramo
/** Forma de una bajada: giros amplios que capta el GPS y velocidad según la pendiente. */
export function shape(d, r) {
  if (r._shape) return r._shape;
  const T = d.track, P = [];
  for (let i = r.i0; i <= r.i1; i++) {
    const last = P[P.length - 1];
    if (!last || hav(last.la, last.lo, T.lat[i], T.lon[i]) >= 4) P.push({ la: T.lat[i], lo: T.lon[i], a: T.alt[i], t: T.t[i] });
  }
  // rumbos desenrollados y suavizados; un giro es cada cambio de sentido de más de 14°
  const h = []; for (let k = 1; k < P.length; k++) h.push(bearingDeg(P[k - 1], P[k]));
  for (let k = 1; k < h.length; k++) { while (h[k] - h[k - 1] > 180) h[k] -= 360; while (h[k] - h[k - 1] < -180) h[k] += 360; }
  const sm = h.map((_, k) => (h[Math.max(0, k - 1)] + h[k] + h[Math.min(h.length - 1, k + 1)]) / 3);
  let turns = 0, ext = sm[0], dir = 0;
  for (const v of sm) {
    if (dir === 0) { if (Math.abs(v - ext) > 14) { dir = v > ext ? 1 : -1; ext = v; } }
    else if (dir === 1) { if (v > ext) ext = v; else if (ext - v > 14) { turns++; dir = -1; ext = v; } }
    else { if (v < ext) ext = v; else if (v - ext > 14) { turns++; dir = 1; ext = v; } }
  }
  // pendiente por ventanas de ~40 m de recorrido
  const bins = SLOPE_BINS.map(() => ({ t: 0, d: 0 })); let maxSlope = 0;
  // pendiente máxima sostenida: en 150 m seguidos, para que un salto de altitud no la dispare
  const cumD = [0]; for (let k = 1; k < P.length; k++) cumD.push(cumD[k - 1] + hav(P[k - 1].la, P[k - 1].lo, P[k].la, P[k].lo));
  for (let k = 0, j = 0; k < P.length; k++) { while (j < P.length - 1 && cumD[j] - cumD[k] < 150) j++; if (cumD[j] - cumD[k] >= 150 && P[j].t - P[k].t < 90) maxSlope = Math.max(maxSlope, 100 * (P[k].a - P[j].a) / (cumD[j] - cumD[k])); }
  for (let k = 0; k < P.length - 1;) {
    let j = k + 1, dist = hav(P[k].la, P[k].lo, P[j].la, P[j].lo);
    while (j < P.length - 1 && dist < 40) { j++; dist += hav(P[j - 1].la, P[j - 1].lo, P[j].la, P[j].lo); }
    const dt = P[j].t - P[k].t, sl = dist > 0 ? 100 * (P[k].a - P[j].a) / dist : 0;
    if (dist >= 25 && dt > 0 && dt < 120) {
      const b = Math.max(0, SLOPE_BINS.findLastIndex(x => sl >= x)); bins[b].t += dt; bins[b].d += dist;
    }
    k = j;
  }
  return r._shape = { turns, perKm: r.dist > 200 ? turns / (r.dist / 1000) : 0, bins, maxSlope: Math.min(maxSlope, 100) };
}
function bearingDeg(a, b) {
  const rad = Math.PI / 180, y = Math.sin((b.lo - a.lo) * rad) * Math.cos(b.la * rad);
  const x = Math.cos(a.la * rad) * Math.sin(b.la * rad) - Math.sin(a.la * rad) * Math.cos(b.la * rad) * Math.cos((b.lo - a.lo) * rad);
  return Math.atan2(y, x) / rad;
}
/** Suma de la forma de varias bajadas. */
export function shapeOf(days) {
  const out = { turns: 0, km: 0, bins: SLOPE_BINS.map(() => ({ t: 0, d: 0 })), maxSlope: 0, most: null, steep: null };
  for (const d of days) for (const r of dayStats(d).runs) {
    const s = shape(d, r); out.turns += s.turns; out.km += r.dist / 1000; s.bins.forEach((b, i) => { out.bins[i].t += b.t; out.bins[i].d += b.d; });
    if (s.maxSlope > out.maxSlope) { out.maxSlope = s.maxSlope; out.steep = { d, r }; }
    if (r.dist > 800 && (!out.most || s.perKm > out.most.v)) out.most = { v: s.perKm, d, r };
  }
  out.perKm = out.km ? out.turns / out.km : 0;
  return out;
}

/* ---------- cobertura de pistas ---------- */
/** Qué pistas de la estación has bajado: una pista cuenta si has pasado por el 60 % de su trazado. */
export function coverage(days, ways) {
  const C = 0.00025, cells = new Set(), key = (la, lo) => Math.round(la / C) + ':' + Math.round(lo / (C / Math.cos(la * Math.PI / 180)));
  for (const d of days) { const T = d.track; for (const r of dayStats(d).runs) for (let i = r.i0; i <= r.i1; i++) cells.add(key(T.lat[i], T.lon[i])); }
  const near = (la, lo) => { const kx = C / Math.cos(la * Math.PI / 180), a = Math.round(la / C), b = Math.round(lo / kx);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (cells.has((a + i) + ':' + (b + j))) return true; return false; };
  const pistes = [];
  for (const w of ways) {
    if (w.lift) continue;
    let len = 0, hit = 0, n = 0;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [a0, o0] = w.pts[i], [a1, o1] = w.pts[i + 1], seg = hav(a0, o0, a1, o1), steps = Math.max(1, Math.ceil(seg / 20));
      len += seg;
      for (let s = 0; s < steps; s++) { const k = s / steps; n++; if (near(a0 + (a1 - a0) * k, o0 + (o1 - o0) * k)) hit++; }
    }
    if (len < 60) continue;
    pistes.push({ ...w, len, frac: n ? hit / n : 0, done: n > 0 && hit / n >= 0.6 });
  }
  const total = pistes.reduce((s, p) => s + p.len, 0), done = pistes.filter(p => p.done).reduce((s, p) => s + p.len, 0);
  // agrupar por nombre: OSM parte una pista en varios trozos
  const byName = new Map();
  for (const p of pistes) if (p.name) { const g = byName.get(p.name) || { name: p.name, diff: p.diff, len: 0, doneLen: 0 }; g.len += p.len; if (p.done) g.doneLen += p.len; byName.set(p.name, g); }
  const named = [...byName.values()].map(g => ({ ...g, done: g.doneLen / g.len >= 0.6 }));
  return { pistes, total, done, frac: total ? done / total : 0, named };
}
