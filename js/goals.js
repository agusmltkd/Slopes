// Retos de temporada: objetivos con su progreso.
import { season, KMH } from './stats.js';

export const METRICS = {
  vert: { label: 'Metros de desnivel', unit: 'm', of: ds => ds.reduce((s, d) => s + d.vertical, 0), def: 50000 },
  dist: { label: 'Kilómetros esquiados', unit: 'km', of: ds => ds.reduce((s, d) => s + d.distance, 0) / 1000, def: 200 },
  days: { label: 'Días de esquí', unit: 'días', of: ds => ds.length, def: 10 },
  runs: { label: 'Bajadas', unit: 'bajadas', of: ds => ds.reduce((s, d) => s + d.runCount, 0), def: 120 },
  top: { label: 'Velocidad máxima', unit: 'km/h', of: ds => Math.max(0, ...ds.map(d => d.topSpeed * KMH)), def: 80 },
  dayVert: { label: 'Desnivel en un solo día', unit: 'm', of: ds => Math.max(0, ...ds.map(d => d.vertical)), def: 8000 },
  resorts: { label: 'Estaciones distintas', unit: 'estaciones', of: ds => new Set(ds.map(d => d.locationId)).size, def: 3 },
};
export function currentSeason(now = new Date()) { const y = now.getFullYear(), s = now.getMonth() >= 7 ? y : y - 1; return `${s}/${String(s + 1).slice(2)}`; }
export const daysFor = (g, days) => g.season === '*' ? days : days.filter(d => season(d) === g.season);
export function progress(g, days) { const v = METRICS[g.metric].of(daysFor(g, days)); return { v, frac: Math.min(1, v / g.target), done: v >= g.target }; }

/** Mensajes tras importar: retos cumplidos o que han avanzado. */
export function changes(goals, before, after) {
  const out = [];
  for (const g of goals) {
    const a = progress(g, before), b = progress(g, after);
    if (b.done && !a.done) out.push(`Reto cumplido: ${METRICS[g.metric].label.toLowerCase()} (${fmtV(g, g.target)})`);
    else if (!b.done && b.v > a.v) out.push(`${METRICS[g.metric].label}: ${Math.round(100 * b.frac)} % del reto`);
  }
  return out;
}
export const fmtV = (g, v) => {
  const u = METRICS[g.metric].unit, n = g.metric === 'dist' ? v.toFixed(1).replace('.', ',') : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n} ${u}`;
};
