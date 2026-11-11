// Cálculos sobre los días: resúmenes, récords, temporadas, logros.
export const KMH = 3.6;
const R = 6371000, rad = Math.PI / 180;
export function hav(la1, lo1, la2, lo2) {
  const dla = (la2 - la1) * rad, dlo = (lo2 - lo1) * rad;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function bearing(la1, lo1, la2, lo2) {
  const y = Math.sin((lo2 - lo1) * rad) * Math.cos(la2 * rad);
  const x = Math.cos(la1 * rad) * Math.sin(la2 * rad) - Math.sin(la1 * rad) * Math.cos(la2 * rad) * Math.cos((lo2 - lo1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
export const localDate = d => new Date((d.start + d.tz * 3600) * 1000);   // leer con getUTC*
export function season(d) {
  const dt = localDate(d), y = dt.getUTCFullYear(), s = dt.getUTCMonth() >= 7 ? y : y - 1;
  return `${s}/${String(s + 1).slice(2)}`;
}
export const BANDS = [0, 10, 20, 30, 40, 50, 60, 70, 80];   // km/h, inicio de cada tramo

export function dayStats(d) {
  if (d._s) return d._s;
  const T = d.track, runs = d.actions.filter(a => a.type === 'run'), lifts = d.actions.filter(a => a.type === 'lift');
  const runTime = runs.reduce((s, r) => s + r.dur, 0), liftTime = lifts.reduce((s, r) => s + r.dur, 0);
  const total = d.end - d.start, rest = Math.max(0, total - runTime - liftTime);
  const queues = [], gaps = [];
  d.actions.forEach((a, i) => {
    const p = d.actions[i - 1]; if (!p) return;
    const gap = a.t0 - p.t1;
    if (a.type === 'lift' && p.type === 'run' && gap > 0 && gap < 1500) queues.push({ gap, lift: a });
    if (gap > 900) gaps.push({ t0: p.t1, t1: a.t0, gap, idx: i });
  });
  const brk = gaps.sort((x, y) => y.gap - x.gap)[0] || null;
  const bands = BANDS.map(() => 0), rose = new Array(16).fill(0);
  for (const r of runs) {
    r.grad = r.dist > 0 ? 100 * r.vert / Math.sqrt(Math.max(r.dist * r.dist - r.vert * r.vert, 1)) : 0;
    for (let i = r.i0; i < r.i1; i++) {
      const dt = T.t[i + 1] - T.t[i]; if (dt <= 0 || dt > 30) continue;
      const v = (T.spd[i] + T.spd[i + 1]) / 2 * KMH;
      bands[Math.min(BANDS.length - 1, Math.floor(v / 10))] += dt;
      const m = hav(T.lat[i], T.lon[i], T.lat[i + 1], T.lon[i + 1]);
      if (m > 2) rose[Math.round(bearing(T.lat[i], T.lon[i], T.lat[i + 1], T.lon[i + 1]) / 22.5) % 16] += m;
    }
  }
  const by = (f) => runs.reduce((b, r) => (!b || f(r) > f(b) ? r : b), null);
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  let before = null, after = null;
  if (brk) {
    const b = runs.filter(r => r.t1 <= brk.t0 && r.dist > 800), a = runs.filter(r => r.t0 >= brk.t1 && r.dist > 800);
    if (b.length >= 2 && a.length >= 2) { before = mean(b.map(r => r.top)) * KMH; after = mean(a.map(r => r.top)) * KMH; }
  }
  return d._s = {
    runs, lifts, runTime, liftTime, rest, total, queues, brk, bands, rose, before, after,
    queueAvg: mean(queues.map(q => q.gap)), queueTotal: queues.reduce((s, q) => s + q.gap, 0),
    fastest: by(r => r.top), longest: by(r => r.dist), biggest: by(r => r.vert), steepest: by(r => (r.dist > 500 ? r.grad : 0)),
    liftVert: lifts.reduce((s, l) => s + l.vert, 0),
  };
}

export function aggregate(days) {
  const A = { days: days.length, runs: 0, dist: 0, vert: 0, top: 0, peak: 0, runTime: 0, liftTime: 0, rest: 0, queue: 0,
    bands: BANDS.map(() => 0), rose: new Array(16).fill(0), hours: new Array(24).fill(0), weekdays: new Array(7).fill(0),
    seasons: new Map(), resorts: new Map(), lifts: new Map(), rec: {} };
  const rec = (k, v, d, extra) => { if (!A.rec[k] || v > A.rec[k].v) A.rec[k] = { v, d, extra }; };
  for (const d of days) {
    const s = dayStats(d);
    A.runs += d.runCount; A.dist += d.distance; A.vert += d.vertical; A.top = Math.max(A.top, d.topSpeed); A.peak = Math.max(A.peak, d.peakAlt);
    A.runTime += s.runTime; A.liftTime += s.liftTime; A.rest += s.rest; A.queue += s.queueTotal;
    s.bands.forEach((v, i) => A.bands[i] += v); s.rose.forEach((v, i) => A.rose[i] += v);
    A.weekdays[(localDate(d).getUTCDay() + 6) % 7]++;
    for (const r of s.runs) A.hours[new Date((r.t0 + d.tz * 3600) * 1000).getUTCHours()]++;
    for (const [map, key, name] of [[A.seasons, season(d), season(d)], [A.resorts, d.locationId, d.resort]]) {
      const g = map.get(key) || { key, name, days: [], runs: 0, dist: 0, vert: 0, top: 0, peak: 0, lat: 0, lon: 0 };
      g.days.push(d); g.runs += d.runCount; g.dist += d.distance; g.vert += d.vertical; g.top = Math.max(g.top, d.topSpeed); g.peak = Math.max(g.peak, d.peakAlt);
      g.lat += d.lat; g.lon += d.lon; map.set(key, g);
    }
    for (const l of s.lifts) if (l.liftId) {
      const g = A.lifts.get(l.liftId) || { id: l.liftId, resort: d.resort, count: 0, vert: 0, time: 0, len: 0, sample: null };
      g.count++; g.vert += l.vert; g.time += l.dur; g.len = Math.max(g.len, l.dist); g.sample ||= { d, l }; A.lifts.set(l.liftId, g);
    }
    rec('vert', d.vertical, d); rec('dist', d.distance, d); rec('runs', d.runCount, d); rec('top', d.topSpeed, d, s.fastest);
    rec('peak', d.peakAlt, d);
    if (s.longest) rec('longRun', s.longest.dist, d, s.longest);
    if (s.biggest) rec('vertRun', s.biggest.vert, d, s.biggest);
    if (s.steepest) rec('steep', s.steepest.grad, d, s.steepest);
  }
  for (const g of A.resorts.values()) { g.lat /= g.days.length; g.lon /= g.days.length; }
  return A;
}

export function badges(days, A) {
  const some = f => days.find(f) || null;
  const firstRunH = d => { const r = dayStats(d).runs[0]; return r ? ((r.t0 + d.tz * 3600) % 86400) / 3600 : 24; };
  const list = [
    ['Primera huella', 'Importar tu primer día', some(() => true)],
    ['Primera silla', 'Estar bajando antes de las 9:00', some(d => firstRunH(d) < 9)],
    ['Club de los 70', 'Pasar de 70 km/h', some(d => d.topSpeed * KMH >= 70)],
    ['Club de los 90', 'Pasar de 90 km/h', some(d => d.topSpeed * KMH >= 90)],
    ['Seis mil', 'Bajar 6.000 m de desnivel en un día', some(d => d.vertical >= 6000)],
    ['Diez mil', 'Bajar 10.000 m de desnivel en un día', some(d => d.vertical >= 10000)],
    ['Maratón blanco', 'Esquiar 42 km en un día', some(d => d.distance >= 42195)],
    ['Sin parar', '20 bajadas en un día', some(d => d.runCount >= 20)],
    ['Hasta el cierre', 'Última bajada pasadas las 16:30', some(d => { const r = dayStats(d).runs.at(-1); return r && ((r.t1 + d.tz * 3600) % 86400) / 3600 >= 16.5; })],
    ['Trotamontes', 'Esquiar en 3 estaciones distintas', A.resorts.size >= 3 ? days[0] : null],
    ['Un Everest', 'Acumular 8.849 m de desnivel', A.vert >= 8849 ? days[0] : null],
    ['Diez Everest', 'Acumular 88.490 m de desnivel', A.vert >= 88490 ? days[0] : null],
    ['Cien kilómetros', 'Acumular 100 km esquiados', A.dist >= 100000 ? days[0] : null],
    ['Fiel a la cita', 'Esquiar en 3 temporadas distintas', A.seasons.size >= 3 ? days[0] : null],
  ];
  return list.map(([name, desc, hit]) => ({ name, desc, got: !!hit }));
}
