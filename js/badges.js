// Logros: medallas por grupos, con progreso y el día en que se consiguieron.
import { dayStats, KMH, localDate, season } from './stats.js';
import { sameCourse, shape, efforts } from './compare.js';

const hourOf = (d, t) => ((t + d.tz * 3600) % 86400) / 3600;
const firstH = d => { const r = dayStats(d).runs[0]; return r ? hourOf(d, r.t0) : 24; };
const lastH = d => { const r = dayStats(d).runs.at(-1); return r ? hourOf(d, r.t1) : 0; };
const chrono = days => [...days].sort((a, b) => a.start - b.start);
/** Primer día (por fecha) que cumple la condición. */
const firstDay = (days, f) => ({ day: chrono(days).find(f) || null });
/** Día en que un acumulado alcanza el objetivo. */
function cumulative(days, val, target) {
  let acc = 0; for (const d of chrono(days)) { acc += val(d); if (acc >= target) return { day: d, prog: [target, target] }; }
  return { day: null, prog: [acc, target] };
}
function countDays(days, f, target) {
  let n = 0; for (const d of chrono(days)) if (f(d) && ++n >= target) return { day: d, prog: [target, target] };
  return { day: null, prog: [n, target] };
}

/** ctx: { segments, cover: {resortKey: coverage} } */
export function allBadges(days, ctx = {}) {
  const segs = ctx.segments || [], covers = Object.values(ctx.cover || {}).filter(c => c && typeof c === 'object');
  const byResort = new Map(); days.forEach(d => byResort.set(d.locationId, [...(byResort.get(d.locationId) || []), d]));
  const L = [];
  const add = (group, name, desc, res) => L.push({ group, name, desc, ...res, got: !!(res.day || res.got) });

  add('Velocidad', 'Club de los 70', 'Pasar de 70 km/h', firstDay(days, d => d.topSpeed * KMH >= 70));
  add('Velocidad', 'Club de los 80', 'Pasar de 80 km/h', firstDay(days, d => d.topSpeed * KMH >= 80));
  add('Velocidad', 'Club de los 90', 'Pasar de 90 km/h', firstDay(days, d => d.topSpeed * KMH >= 90));
  add('Velocidad', 'Rayo constante', 'Cinco bajadas de más de 70 km/h el mismo día', firstDay(days, d => dayStats(d).runs.filter(r => r.top * KMH >= 70).length >= 5));
  add('Velocidad', 'Pared', 'Un minuto bajando por pendientes de más del 40 % en un día', firstDay(days, d => dayStats(d).runs.reduce((s, r) => s + shape(d, r).bins[4].t, 0) >= 60));

  add('Aguante', 'Seis mil', 'Bajar 6.000 m de desnivel en un día', firstDay(days, d => d.vertical >= 6000));
  add('Aguante', 'Diez mil', 'Bajar 10.000 m de desnivel en un día', firstDay(days, d => d.vertical >= 10000));
  add('Aguante', 'Maratón blanco', 'Esquiar 42 km en un día', firstDay(days, d => d.distance >= 42195));
  add('Aguante', 'Sin parar', '20 bajadas en un día', firstDay(days, d => d.runCount >= 20));
  add('Aguante', 'Jornada completa', 'Seis horas en pistas en un día', firstDay(days, d => d.end - d.start >= 6 * 3600));
  add('Aguante', 'Primera silla', 'Estar bajando antes de las 9:00', firstDay(days, d => firstH(d) < 9));
  add('Aguante', 'Madrugador', 'Cinco días bajando antes de las 9:00', countDays(days, d => firstH(d) < 9, 5));
  add('Aguante', 'Hasta el cierre', 'Última bajada pasadas las 16:30', firstDay(days, d => lastH(d) >= 16.5));

  add('Acumulado', 'Cien bajadas', 'Sumar 100 bajadas', cumulative(days, d => d.runCount, 100));
  add('Acumulado', 'Mil bajadas', 'Sumar 1.000 bajadas', cumulative(days, d => d.runCount, 1000));
  add('Acumulado', 'Cien kilómetros', 'Sumar 100 km esquiados', cumulative(days, d => d.distance / 1000, 100));
  add('Acumulado', 'Mil kilómetros', 'Sumar 1.000 km esquiados', cumulative(days, d => d.distance / 1000, 1000));
  add('Acumulado', 'Un Everest', 'Sumar 8.849 m de desnivel', cumulative(days, d => d.vertical, 8849));
  add('Acumulado', 'Diez Everest', 'Sumar 88.490 m de desnivel', cumulative(days, d => d.vertical, 88490));

  // exploración
  const resortsSeen = []; let trot = null, colec = null;
  for (const d of chrono(days)) { if (!resortsSeen.includes(d.locationId)) { resortsSeen.push(d.locationId); if (resortsSeen.length === 3) trot = d; if (resortsSeen.length === 5) colec = d; } }
  add('Exploración', 'Trotamontes', 'Esquiar en 3 estaciones distintas', { day: trot, prog: [Math.min(3, resortsSeen.length), 3] });
  add('Exploración', 'Coleccionista', 'Esquiar en 5 estaciones distintas', { day: colec, prog: [Math.min(5, resortsSeen.length), 5] });
  const maxHome = Math.max(0, ...[...byResort.values()].map(l => l.length));
  add('Exploración', 'De la casa', '10 días en la misma estación', { got: maxHome >= 10, prog: [Math.min(10, maxHome), 10] });
  const seasons = new Set(days.map(season));
  add('Exploración', 'Fiel a la cita', 'Esquiar en 3 temporadas distintas', { got: seasons.size >= 3, prog: [Math.min(3, seasons.size), 3] });
  const fullSeason = [...seasons].some(s => { const m = new Set(days.filter(d => season(d) === s).map(d => localDate(d).getUTCMonth())); return [11, 0, 1, 2].every(x => m.has(x)); });
  add('Exploración', 'Temporada completa', 'Esquiar en diciembre, enero, febrero y marzo de una misma temporada', { got: fullSeason });
  const bestCover = Math.max(0, ...covers.map(c => c.frac));
  add('Exploración', 'Media estación', 'Bajar la mitad de las pistas de una estación', { got: bestCover >= 0.5, prog: covers.length ? [Math.round(100 * Math.min(bestCover, 0.5)), 50] : null, unit: '%' });
  add('Exploración', 'Estación completa', 'Bajar el 90 % de las pistas de una estación', { got: bestCover >= 0.9, prog: covers.length ? [Math.round(100 * Math.min(bestCover, 0.9)), 90] : null, unit: '%' });
  const hunter = (diffs, min) => covers.some(c => { const l = c.named.filter(p => diffs.includes(p.diff)); return l.length >= min && l.every(p => p.done); });
  add('Exploración', 'Cazador de negras', 'Bajar todas las negras con nombre de una estación', { got: hunter(['advanced', 'expert'], 2) });
  add('Exploración', 'Todas las rojas', 'Bajar todas las rojas con nombre de una estación', { got: hunter(['intermediate'], 2) });

  // contra ti mismo
  let beat = null;
  outer: for (const d of chrono(days)) for (const r of dayStats(d).runs) {
    const prev = sameCourse(d, r, days).filter(x => x.r.t0 < r.t0);
    if (prev.length && r.dur < Math.min(...prev.map(x => x.r.dur))) { beat = d; break outer; }
  }
  add('Contra ti mismo', 'Fantasma superado', 'Mejorar tu mejor tiempo en un recorrido que ya habías bajado', { day: beat });
  const segRec = segs.some(sg => { const E = efforts(sg, days); return E.length >= 2 && E[0].t0 > Math.min(...E.map(e => e.t0)); });
  add('Contra ti mismo', 'Récord en tramo', 'Batir tu marca en un tramo cronometrado', { got: segRec });
  add('Contra ti mismo', 'Cronometrador', 'Crear 3 tramos cronometrados', { got: segs.length >= 3, prog: [Math.min(3, segs.length), 3] });
  return L;
}
