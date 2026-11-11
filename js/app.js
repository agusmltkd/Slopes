import { db } from './db.js';
import { parseFile } from './parse.js';
import { dayStats, aggregate, badges, season, localDate, KMH, BANDS } from './stats.js';
import { bars, stack, rose, lines } from './charts.js';
import { MapView, SPEED_STOPS } from './mapview.js';
import { fetchWays, matchDay } from './osm.js';
import { dayCard } from './share.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const f = {
  int: v => group(String(Math.round(v))),
  km: m => (m / 1000).toFixed(1).replace('.', ','),
  kmh: ms => (ms * KMH).toFixed(1).replace('.', ','),
  dur: s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; },
  ms: s => { s = Math.round(s); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; },
  hm: (t, tz) => new Date((t + tz * 3600) * 1000).toISOString().slice(11, 16),
  dateLong: d => localDate(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  dateShort: d => localDate(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
};
const DIFF = { novice: ['#27A567', 'verde'], easy: ['#1D6FE0', 'azul'], intermediate: ['#D7263D', 'roja'], advanced: ['#16181C', 'negra'], expert: ['#16181C', 'negra'], freeride: ['#16181C', 'fuera de pista'] };
const gradDiff = g => g < 14 ? 'novice' : g < 20 ? 'easy' : g < 28 ? 'intermediate' : 'advanced';

const S = { days: [], liftNames: {}, runNames: {}, A: null };
const body = $('#body');
const mv = new MapView($('#map'), { onResort: key => { location.hash = '#/r/' + encodeURIComponent(key); } });
window.__traza = { S, mv };

function toast(msg, ms = 3800) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, ms); }
function refresh() { S.days.sort((a, b) => b.start - a.start); S.A = aggregate(S.days); }
const liftName = (id, A = S.A) => S.liftNames[id] || (() => { const ids = [...A.lifts.values()].sort((a, b) => b.count - a.count).map(l => l.id); return 'Remonte ' + String.fromCharCode(65 + (ids.indexOf(id) % 26)); })();

/* ---------- importación ---------- */
async function importFiles(fileList) {
  const files = [...fileList]; if (!files.length) return;
  let added = 0, dup = 0; const errors = [];
  toast(`Leyendo ${files.length} ${files.length === 1 ? 'fichero' : 'ficheros'}…`, 60000);
  for (const file of files) {
    try {
      for (const { day, bytes, name } of parseFile(await file.arrayBuffer(), file.name)) {
        const had = S.days.findIndex(d => d.id === day.id);
        if (had >= 0) { dup++; S.days[had] = day; } else { added++; S.days.push(day); }
        const store = { ...day }; delete store._s;
        await db.putDay(store); await db.putRaw({ id: day.id, name, bytes });
      }
    } catch (e) { errors.push(`${file.name}: ${e.message}`); }
  }
  refresh(); navigator.storage?.persist?.();
  toast([added && `${added} ${added === 1 ? 'día añadido' : 'días añadidos'}`, dup && `${dup} ya ${dup === 1 ? 'estaba' : 'estaban'} (actualizado)`, errors.length && `${errors.length} con error`].filter(Boolean).join(' · ') || 'Nada que importar');
  S.importErrors = errors;
  if (added === 1 && files.length === 1 && !errors.length) location.hash = '#/d/' + encodeURIComponent(S.days.find(d => d.file === files[0].name)?.id || S.days[0].id);
  else if (location.hash.startsWith('#/add') || errors.length) { location.hash = '#/add'; route(); }
  else { location.hash = '#/'; route(); }
}
$('#file').addEventListener('change', e => { importFiles(e.target.files); e.target.value = ''; });
let dragN = 0;
addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragN++; $('#drop').hidden = false; } });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#drop').hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('#drop').hidden = true; if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files); });

/* ---------- piezas de interfaz ---------- */
const stat = (v, l, cls = '') => `<div class="stat ${cls}${String(v).length > 6 ? ' long' : ''}"><b>${v}</b><span>${l}</span></div>`;
const dropzone = () => `<button class="dropzone" data-act="pick"><strong>Añadir ficheros .slopes</strong><span>Tócalo para elegirlos, o arrástralos a la ventana. También vale un .zip con varios.</span></button>`;
const dayRow = d => `<a class="row" href="#/d/${encodeURIComponent(d.id)}"><span class="when"><b>${localDate(d).getUTCDate()}</b>${localDate(d).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' })} ${String(localDate(d).getUTCFullYear()).slice(2)}</span>
  <span class="what"><b>${esc(d.resort)}</b><i>${d.runCount} bajadas, ${f.km(d.distance)} km, ${f.int(d.vertical)} m</i></span><span class="num">${Math.round(d.topSpeed * KMH)}<small>km/h</small></span></a>`;
const speedLegend = () => `<div class="speedlegend"><span>0</span><i style="background:linear-gradient(90deg,${SPEED_STOPS.map(([v, c]) => `${c} ${v / 75 * 100}%`).join(',')})"></i><span>75+ km/h</span></div>`;

/* ---------- vistas ---------- */
function viewHome() {
  const A = S.A;
  if (!S.days.length) {
    body.innerHTML = `<h1 class="hero">Tu historial de esquí, sobre el relieve real.</h1>
      <p class="lead">Añade los días que grabaste con Slopes y aparecerán en el globo. Entra en cada estación para verla en 3D, repetir la jornada y comparar temporadas.</p>
      ${dropzone()}
      <h2>Cómo sacar los ficheros de Slopes</h2>
      <ol class="steps"><li>Abre el día en Slopes.</li><li>Pulsa compartir y elige exportar el fichero <b>.slopes</b>.</li><li>Guárdalo en Archivos y añádelo aquí. Puedes seleccionar muchos a la vez.</li></ol>
      <p class="note">Todo se queda guardado en este dispositivo. No se sube nada a ningún servidor.</p>`;
    mv.showGlobe([]); return;
  }
  const resorts = [...A.resorts.values()].sort((a, b) => b.days.length - a.days.length);
  body.innerHTML = `<h1 class="hero">${f.km(A.dist)} km de nieve</h1>
    <p class="lead">${A.days} ${A.days === 1 ? 'día' : 'días'} en ${resorts.length} ${resorts.length === 1 ? 'estación' : 'estaciones'}, ${A.seasons.size} ${A.seasons.size === 1 ? 'temporada' : 'temporadas'}.</p>
    <div class="stats">${stat(f.int(A.vert), 'm de desnivel')}${stat(A.runs, 'bajadas')}${stat(Math.round(A.top * KMH), 'km/h de máxima', 'hot')}</div>
    <h2>Tus estaciones</h2>
    <div class="list">${resorts.map(r => `<a class="row" href="#/r/${encodeURIComponent(r.key)}"><span class="disc" style="background:var(--red)">${r.days.length}</span>
      <span class="what"><b>${esc(r.name)}</b><i>${f.km(r.dist)} km, ${f.int(r.vert)} m, cota ${f.int(r.peak)} m</i></span><span class="go">Entrar en 3D</span></a>`).join('')}</div>
    <h2>Últimos días</h2><div class="list">${S.days.slice(0, 6).map(dayRow).join('')}</div>
    ${S.days.length > 6 ? `<p><a href="#/add">Ver los ${S.days.length} días guardados</a></p>` : ''}`;
  mv.showGlobe(resorts);
}

function liftRows(lifts) {
  return `<div class="list">${lifts.map(l => `<div class="row"><span class="disc lift">${l.count}</span>
    <span class="what"><input class="rename" data-lift="${esc(l.id)}" value="${esc(liftName(l.id))}" aria-label="Nombre del remonte"><i>${l.count} ${l.count === 1 ? 'subida' : 'subidas'}, ${f.int(l.vert)} m subidos, ${f.dur(l.time)} sentado</i></span></div>`).join('')}</div>`;
}

function viewResort(key) {
  const r = S.A.resorts.get(key); if (!r) return void (location.hash = '#/');
  const A = aggregate(r.days), lifts = [...A.lifts.values()].sort((a, b) => b.count - a.count);
  body.innerHTML = `<a class="back" href="#/">Globo</a>
    <h1 class="hero">${esc(r.name)}</h1>
    <p class="lead">${r.days.length} ${r.days.length === 1 ? 'día esquiado' : 'días esquiados'}. En rojo, todas tus bajadas superpuestas: cuanto más intenso, más veces has pasado.</p>
    <div class="stats">${stat(f.km(r.dist), 'km')}${stat(f.int(r.vert), 'm de desnivel')}${stat(r.runs, 'bajadas')}${stat(Math.round(r.top * KMH), 'km/h de máxima', 'hot')}${stat(f.int(r.peak), 'm cota máxima')}${stat(f.dur(A.liftTime), 'en remontes')}</div>
    <h2>Días aquí</h2><div class="list">${r.days.map(dayRow).join('')}</div>
    ${lifts.length ? `<h2>Remontes que usas</h2><p class="note">Slopes no guarda el nombre. Escríbelo tú, o usa «Buscar nombres» dentro de un día.</p>${liftRows(lifts)}` : ''}
    <h2>Hacia dónde bajas</h2><div class="split">${rose(A.rose)}<p class="note">Orientación de tus bajadas, por metros recorridos. Las laderas norte guardan mejor la nieve.</p></div>`;
  mv.showResort(r.days);
}

function insights(d, s) {
  const out = [], tz = d.tz;
  if (s.fastest) out.push(`La bajada más rápida fue la <b>n.º ${s.fastest.n}</b>, a las ${f.hm(s.fastest.t0, tz)}: <b>${f.kmh(s.fastest.top)} km/h</b> a ${f.int(s.fastest.maxAlt)}–${f.int(s.fastest.minAlt)} m.`);
  if (s.brk) out.push(`Paraste <b>${f.dur(s.brk.gap)}</b>, de ${f.hm(s.brk.t0, tz)} a ${f.hm(s.brk.t1, tz)}.`);
  if (s.before != null) { const diff = s.after - s.before; out.push(`Antes de la parada tu máxima media por bajada fue de <b>${s.before.toFixed(0)} km/h</b>; después, <b>${s.after.toFixed(0)} km/h</b> (${diff < 0 ? 'bajaste el ritmo' : 'apretaste más'}).`); }
  if (s.liftTime && s.runTime) out.push(`Por cada minuto bajando pasaste <b>${(s.liftTime / s.runTime).toFixed(1).replace('.', ',')} min</b> en un remonte.`);
  if (s.queues.length >= 3) out.push(`Entre acabar una bajada y montarte en el remonte pasaron de media <b>${f.ms(s.queueAvg)}</b> (${f.dur(s.queueTotal)} en total entre colas y llegar a la silla).`);
  if (s.steepest) out.push(`La más empinada fue la n.º ${s.steepest.n}: <b>${Math.round(s.steepest.grad)} %</b> de pendiente media.`);
  if (s.longest) out.push(`La más larga, la n.º ${s.longest.n}: <b>${f.km(s.longest.dist)} km</b> y ${f.int(s.longest.vert)} m de un tirón.`);
  return out;
}

function viewDay(id) {
  const d = S.days.find(x => x.id === id); if (!d) return void (location.hash = '#/');
  const s = dayStats(d), names = S.runNames[d.id] || {}, hasNames = Object.keys(names).length > 0;
  const runColor = r => DIFF[names[r.n]?.diff || gradDiff(r.grad)][0];
  body.innerHTML = `<a class="back" href="#/r/${encodeURIComponent(d.locationId)}">${esc(d.resort)}</a>
    <h1 class="hero">${esc(d.resort)}</h1><p class="lead cap">${f.dateLong(d)}, de ${f.hm(d.start, d.tz)} a ${f.hm(d.end, d.tz)}</p>
    <section class="replay" aria-label="Repetición del día">
      <div class="rp-top"><button class="play" data-act="play" aria-label="Reproducir el día"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 4v16l13-8z" fill="currentColor"/></svg></button>
        <div class="rp-read"><b id="rp-time">${f.hm(d.start, d.tz)}</b><span id="rp-what">Pulsa para repetir la jornada</span></div>
        <select id="rate" aria-label="Velocidad de la repetición"><option value="30">×30</option><option value="60" selected>×60</option><option value="150">×150</option><option value="400">×400</option></select></div>
      <canvas id="profile" height="110" aria-hidden="true"></canvas>
      <input id="scrub" type="range" min="${Math.floor(d.start)}" max="${Math.ceil(d.end)}" value="${Math.floor(d.start)}" step="1" aria-label="Momento del día">
      <div class="rp-opts"><label><input type="checkbox" id="follow" checked> Seguir con la cámara</label><label><input type="checkbox" id="skip" checked> Saltar las esperas</label></div>
    </section>
    <div class="stats">${stat(f.km(d.distance), 'km')}${stat(f.int(d.vertical), 'm de desnivel')}${stat(d.runCount, 'bajadas')}${stat(f.kmh(d.topSpeed), 'km/h de máxima', 'hot')}${stat(f.int(d.peakAlt), 'm cota máxima')}${stat(f.dur(s.total), 'en pistas')}</div>
    ${speedLegend()}
    <h2>Lo que cuentan los datos</h2><ul class="insights">${insights(d, s).map(t => `<li>${t}</li>`).join('')}</ul>
    <h2>En qué se fue el tiempo</h2>${stack([{ label: 'Bajando', value: s.runTime, color: 'var(--red)' }, { label: 'En remontes', value: s.liftTime, color: 'var(--sun)' }, { label: 'Parado o en cola', value: s.rest, color: 'var(--mist)' }], f.dur)}
    <h2>Velocidad máxima de cada bajada</h2>${bars(s.runs.map(r => ({ label: r.n, value: r.top * KMH, color: runColor(r), act: 'run:' + r.n })), { unit: 'km/h' })}
    <h2>A qué velocidad bajas</h2>${bars(BANDS.map((b, i) => ({ label: b + (i === BANDS.length - 1 ? '+' : ''), value: s.bands[i] / 60, color: SPEED_STOPS.reduce((c, [v, col]) => b + 5 >= v ? col : c, SPEED_STOPS[0][1]) })), { unit: 'min', fmt: v => v >= 10 ? Math.round(v) : v.toFixed(1).replace('.', ','), height: 100 })}
    <p class="note">Minutos de bajada en cada tramo de 10 km/h.</p>
    <h2>Bajadas</h2>
    <p class="note">${hasNames ? 'Color y nombre según OpenStreetMap; donde no hay dato, color estimado por la pendiente.' : 'El color del disco es una estimación por la pendiente media, no la dificultad oficial de la pista.'}</p>
    <div class="list">${s.runs.map(r => `<button class="row" data-act="run:${r.n}"><span class="disc" style="background:${runColor(r)}">${r.n}</span>
      <span class="what"><b>${names[r.n]?.name ? esc(names[r.n].name) : f.hm(r.t0, d.tz) + ' · ' + f.ms(r.dur)}</b><i>${names[r.n]?.name ? f.hm(r.t0, d.tz) + ', ' : ''}${f.km(r.dist)} km, ${f.int(r.vert)} m, ${Math.round(r.grad)} % de pendiente</i></span>
      <span class="num">${Math.round(r.top * KMH)}<small>km/h</small></span></button>`).join('')}</div>
    <h2>Remontes</h2>${liftRows([...aggregate([d]).lifts.values()].sort((a, b) => b.count - a.count))}
    <h2>Hacia dónde bajaste</h2><div class="split">${rose(s.rose)}<p class="note">Orientación de las bajadas del día, por metros recorridos.</p></div>
    <div class="actions"><button class="btn primary" data-act="share">Crear tarjeta para compartir</button>
      <button class="btn" data-act="names">Buscar nombres de pistas</button>
      <button class="btn danger" data-act="del:${esc(d.id)}">Eliminar este día</button></div>
    <p class="note">«Buscar nombres» consulta OpenStreetMap con la zona del día (no envía tu traza) y es aproximado donde dos pistas van pegadas.</p>`;
  mv.showDay(d); replay.attach(d, s);
}

function viewStats() {
  const A = S.A;
  if (!S.days.length) { body.innerHTML = `<h1 class="hero">Estadísticas</h1><p class="lead">Aún no hay días guardados.</p>${dropzone()}`; mv.showGlobe([]); return; }
  const seasons = [...A.seasons.values()].sort((a, b) => a.key.localeCompare(b.key));
  const palette = ['#1D6FE0', '#D7263D', '#27A567', '#F2B705', '#7A4FD3', '#0F2740'];
  const R = A.rec, recRow = (label, val, r) => r ? `<a class="row" href="#/d/${encodeURIComponent(r.d.id)}"><span class="what"><b>${label}</b><i>${esc(r.d.resort)}, ${f.dateShort(r.d)}${r.extra ? ', bajada ' + r.extra.n : ''}</i></span><span class="num wide">${val}</span></a>` : '';
  const bd = badges(S.days, A), top = [...A.lifts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const cmp = (label, get, fmt) => `<tr><th>${label}</th>${seasons.map(s => { const max = Math.max(...seasons.map(get)) || 1; return `<td><b>${fmt(get(s))}</b><i style="width:${100 * get(s) / max}%"></i></td>`; }).join('')}</tr>`;
  body.innerHTML = `<h1 class="hero">${f.int(A.vert)} m cuesta abajo</h1>
    <p class="lead">Eso son <b>${(A.vert / 104).toFixed(0)} Giraldas</b> una encima de otra, o <b>${(A.vert / 8849).toFixed(1).replace('.', ',')} veces</b> el Everest desde el nivel del mar.</p>
    <div class="stats">${stat(A.days, A.days === 1 ? 'día' : 'días')}${stat(f.km(A.dist), 'km')}${stat(A.runs, 'bajadas')}${stat(Math.round(A.top * KMH), 'km/h de máxima', 'hot')}${stat(f.int(A.peak), 'm cota máxima')}${stat(f.dur(A.runTime), 'bajando')}</div>
    <h2>Temporada contra temporada</h2>
    <div class="scroll"><table class="cmp"><thead><tr><th></th>${seasons.map((s, i) => `<th style="color:${palette[i % 6]}">${s.name}</th>`).join('')}</tr></thead><tbody>
      ${cmp('Días', s => s.days.length, v => v)}${cmp('Km', s => s.dist, f.km)}${cmp('Desnivel', s => s.vert, v => f.int(v) + ' m')}${cmp('Bajadas', s => s.runs, v => v)}
      ${cmp('Máxima', s => s.top * KMH, v => Math.round(v) + ' km/h')}${cmp('Km por día', s => s.dist / s.days.length, f.km)}${cmp('Desnivel por día', s => s.vert / s.days.length, v => f.int(v) + ' m')}</tbody></table></div>
    <h2>Desnivel acumulado, día a día</h2>${lines(seasons.map((s, i) => { let acc = 0; return { name: s.name, color: palette[i % 6], pts: [...s.days].sort((a, b) => a.start - b.start).map(d => acc += d.vertical) }; }), { fmt: v => f.int(v) + ' m' })}
    <p class="note">Cada temporada arranca en cero. La línea que va por encima es la que lleva más metros a igual número de días.</p>
    <h2>Tus récords</h2><div class="list">
      ${recRow('Más rápido', f.kmh(R.top?.v || 0) + ' km/h', R.top)}${recRow('Más desnivel en un día', f.int(R.vert?.v || 0) + ' m', R.vert)}${recRow('Más kilómetros en un día', f.km(R.dist?.v || 0) + ' km', R.dist)}
      ${recRow('Más bajadas en un día', R.runs?.v, R.runs)}${recRow('Bajada más larga', f.km(R.longRun?.v || 0) + ' km', R.longRun)}${recRow('Más desnivel en una bajada', f.int(R.vertRun?.v || 0) + ' m', R.vertRun)}
      ${recRow('Bajada más empinada', Math.round(R.steep?.v || 0) + ' %', R.steep)}${recRow('Punto más alto', f.int(R.peak?.v || 0) + ' m', R.peak)}</div>
    <h2>Logros</h2><p class="note">${bd.filter(b => b.got).length} de ${bd.length} conseguidos.</p>
    <ul class="badges">${bd.map(b => `<li class="${b.got ? 'got' : ''}"><b>${b.name}</b><span>${b.desc}</span></li>`).join('')}</ul>
    <h2>En qué se va un día de esquí</h2>${stack([{ label: 'Bajando', value: A.runTime, color: 'var(--red)' }, { label: 'En remontes', value: A.liftTime, color: 'var(--sun)' }, { label: 'Parado o en cola', value: A.rest, color: 'var(--mist)' }], f.dur)}
    <h2>A qué hora empiezas tus bajadas</h2>${bars(Array.from({ length: 10 }, (_, i) => ({ label: (i + 8) + 'h', value: A.hours[i + 8] })), { unit: 'bajadas', height: 100 })}
    <h2>A qué velocidad bajas</h2>${bars(BANDS.map((b, i) => ({ label: b + (i === BANDS.length - 1 ? '+' : ''), value: A.bands[i] / 60, color: SPEED_STOPS.reduce((c, [v, col]) => b + 5 >= v ? col : c, SPEED_STOPS[0][1]) })), { unit: 'min', height: 100 })}
    <p class="note">Minutos de bajada en cada tramo de 10 km/h.</p>
    <h2>Qué días de la semana esquías</h2>${bars(['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l, i) => ({ label: l, value: A.weekdays[i] })), { unit: 'días', height: 80 })}
    ${top.length ? `<h2>Tus remontes de siempre</h2><div class="list">${top.map(l => `<div class="row"><span class="disc lift">${l.count}</span><span class="what"><b>${esc(liftName(l.id))}</b><i>${esc(l.resort)}, ${f.int(l.vert)} m subidos, ${f.dur(l.time)} sentado</i></span></div>`).join('')}</div>` : ''}
    <h2>Hacia dónde bajas</h2><div class="split">${rose(A.rose)}<p class="note">Orientación de todas tus bajadas, por metros recorridos.</p></div>`;
  if (!mv.mode.startsWith('globe')) mv.showGlobe([...A.resorts.values()]);
}

function viewAdd() {
  const errs = S.importErrors || [];
  body.innerHTML = `<h1 class="hero">Añadir días</h1>${dropzone()}
    ${errs.length ? `<div class="errors"><b>No se pudieron leer:</b><ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    <ol class="steps"><li>En Slopes, abre el día.</li><li>Compartir, y exporta el fichero <b>.slopes</b>.</li><li>Añádelo aquí. Si un día ya estaba, se actualiza sin duplicarse.</li></ol>
    <h2>Guardados en este dispositivo</h2>
    ${S.days.length ? `<div class="list">${S.days.map(d => `<div class="row"><a class="what" href="#/d/${encodeURIComponent(d.id)}"><b>${esc(d.resort)}</b><i>${f.dateShort(d)}, ${d.runCount} bajadas, temporada ${season(d)}</i></a><button class="btn small danger" data-act="del:${esc(d.id)}">Eliminar</button></div>`).join('')}</div>
      <div class="actions"><button class="btn" data-act="backup">Descargar copia de seguridad (.zip)</button></div>
      <p class="note">La copia lleva los .slopes originales. Para restaurarla en otro dispositivo, añade ese .zip aquí.</p>` : '<p class="note">Todavía no hay ninguno.</p>'}
    <p class="note">Los datos viven solo en el navegador de este dispositivo. Si borras los datos del sitio, se pierden: guarda una copia de vez en cuando.</p>`;
  if (!mv.mode.startsWith('globe')) mv.showGlobe([...S.A.resorts.values()]);
}

/* ---------- repetición del día ---------- */
const replay = {
  d: null, t: 0, playing: false, base: null,
  attach(d, s) {
    this.stop(); this.d = d; this.s = s; this.t = d.start; this.cv = $('#profile'); this.drawBase(); this.set(d.start, false);
    $('#hud').hidden = false;
    const cv = this.cv, at = e => { const r = cv.getBoundingClientRect(); this.set(d.start + (d.end - d.start) * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), true); };
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); at(e); cv.onpointermove = at; };
    cv.onpointerup = cv.onpointercancel = () => { cv.onpointermove = null; };
    $('#scrub').oninput = e => this.set(+e.target.value, true);
    $('#follow').onchange = e => { mv.follow = e.target.checked; };
    mv.follow = true;
  },
  detach() { this.stop(); this.d = null; $('#hud').hidden = true; },
  drawBase() {
    const d = this.d, cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 340, H = 110;
    cv.width = W * dpr; cv.height = H * dpr;
    const o = this.base = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }), x = o.getContext('2d'); x.scale(dpr, dpr);
    const T = d.track; let lo = 1e9, hi = -1e9; for (const a of d.actions) { lo = Math.min(lo, a.minAlt); hi = Math.max(hi, a.maxAlt); }
    lo -= 20; hi += 20; this.W = W;
    const X = t => W * (t - d.start) / (d.end - d.start), Y = a => H - 14 - (H - 22) * (a - lo) / (hi - lo);
    x.font = '500 10px Barlow, sans-serif'; x.fillStyle = '#51667B'; x.fillText(Math.round(hi - 20) + ' m', 2, 10); x.fillText(Math.round(lo + 20) + ' m', 2, H - 16);
    for (const a of d.actions) {
      x.beginPath(); x.moveTo(X(a.t0), H - 14);
      for (let i = a.i0; i <= a.i1; i++) x.lineTo(X(T.t[i]), Y(T.alt[i]));
      x.lineTo(X(a.t1), H - 14); x.closePath(); x.fillStyle = a.type === 'run' ? 'rgba(215,38,61,.16)' : 'rgba(242,183,5,.18)'; x.fill();
      x.beginPath(); for (let i = a.i0; i <= a.i1; i++) { const px = X(T.t[i]), py = Y(T.alt[i]); i === a.i0 ? x.moveTo(px, py) : x.lineTo(px, py); }
      x.strokeStyle = a.type === 'run' ? '#D7263D' : '#C99700'; x.lineWidth = a.type === 'run' ? 2 : 1.3; x.stroke();
    }
    x.fillStyle = '#51667B'; const h0 = Math.ceil((d.start + d.tz * 3600) / 3600) * 3600 - d.tz * 3600;
    for (let t = h0; t < d.end; t += 3600) { x.fillRect(X(t), H - 14, 1, 4); x.fillText(f.hm(t, d.tz), X(t) + 3, H - 2); }
  },
  idx(t) { const a = this.d.track.t; let lo = 0, hi = a.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; a[m] <= t ? lo = m : hi = m - 1; } return lo; },
  set(t, user) {
    const d = this.d; if (!d) return; t = Math.max(d.start, Math.min(d.end, t)); this.t = t;
    const T = d.track, i = this.idx(t), j = Math.min(i + 1, T.t.length - 1), k = T.t[j] > T.t[i] ? Math.min(1, Math.max(0, (t - T.t[i]) / (T.t[j] - T.t[i]))) : 0;
    const L = (arr) => arr[i] + (arr[j] - arr[i]) * k, lat = L(T.lat), lon = L(T.lon), alt = L(T.alt), v = L(T.spd) * KMH;
    const act = d.actions.find(a => t >= a.t0 && t <= a.t1);
    mv.setCursor(lat, lon, this.playing || user);
    const hm = f.hm(t, d.tz);
    $('#hud-time').textContent = hm; $('#hud-speed b').textContent = Math.round(act ? v : 0); $('#hud-alt b').textContent = f.int(alt);
    const rt = $('#rp-time'); if (rt) { rt.textContent = hm; $('#rp-what').textContent = act ? (act.type === 'run' ? `Bajada ${act.n} · ${Math.round(v)} km/h · ${f.int(alt)} m` : `${liftName(act.liftId)} · ${f.int(alt)} m`) : `Parado · ${f.int(alt)} m`; $('#scrub').value = Math.round(t); }
    const cv = this.cv; if (cv && this.base) { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(this.base, 0, 0);
      const px = cv.width * (t - d.start) / (d.end - d.start); x.fillStyle = '#0F2740'; x.fillRect(px - 1, 0, 2, cv.height); }
    if (act?.type === 'run' && this.playing) mv.highlight(-1);
  },
  toggle() { this.playing ? this.stop() : this.play(); },
  play() {
    const d = this.d; if (!d) return; if (this.t >= d.end - 1) this.t = d.start;
    this.playing = true; this.last = performance.now(); document.body.classList.add('playing');
    const step = now => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
      let t = this.t + dt * +$('#rate').value;
      if ($('#skip')?.checked && !d.actions.some(a => t >= a.t0 - 4 && t <= a.t1 + 4)) { const nx = d.actions.find(a => a.t0 > t); if (nx && nx.t0 - t > 20) t = nx.t0 - 4; }
      this.set(t, false);
      if (t >= d.end) return this.stop();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },
  stop() { this.playing = false; cancelAnimationFrame(this.raf); document.body.classList.remove('playing'); },
};

/* ---------- acciones ---------- */
async function act(name, el) {
  const [cmd, ...rest] = name.split(':'), arg = rest.join(':');
  if (cmd === 'pick') $('#file').click();
  else if (cmd === 'play') replay.toggle();
  else if (cmd === 'run') { const d = replay.d, r = d && dayStats(d).runs.find(x => x.n === +arg); if (!r) return; replay.stop(); mv.highlight(r.n); mv.fitAction(d, r); replay.set(r.t0, false); if (innerWidth < 900) body.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (cmd === 'del') {
    if (el.dataset.sure) { await db.delDay(arg); S.days = S.days.filter(d => d.id !== arg); refresh(); toast('Día eliminado'); if (location.hash.startsWith('#/d/')) location.hash = '#/'; else route(); }
    else { el.dataset.sure = '1'; el.textContent = 'Pulsa otra vez para eliminar'; setTimeout(() => { if (el.isConnected) { delete el.dataset.sure; el.textContent = el.classList.contains('small') ? 'Eliminar' : 'Eliminar este día'; } }, 4000); }
  }
  else if (cmd === 'share') {
    const d = replay.d; el.disabled = true;
    try { const blob = await dayCard(d, dayStats(d), f), name = `traza-${localDate(d).toISOString().slice(0, 10)}.png`, file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
      else { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Tarjeta descargada'); }
    } finally { el.disabled = false; }
  }
  else if (cmd === 'names') {
    const d = replay.d; el.disabled = true; el.textContent = 'Consultando OpenStreetMap…';
    try {
      const T = d.track; let s = 90, n = -90, w = 180, e = -180; for (let i = 0; i < T.t.length; i += 5) { s = Math.min(s, T.lat[i]); n = Math.max(n, T.lat[i]); w = Math.min(w, T.lon[i]); e = Math.max(e, T.lon[i]); }
      const ways = await fetchWays([s - 0.003, w - 0.003, n + 0.003, e + 0.003]), m = matchDay(d, ways);
      S.runNames[d.id] = m.runs; for (const [id, nm] of Object.entries(m.lifts)) S.liftNames[id] ||= nm;
      await db.set('runNames', S.runNames); await db.set('liftNames', S.liftNames);
      const k = Object.values(m.runs).filter(r => r.name).length;
      toast(k ? `Nombre encontrado para ${k} de ${d.runCount} bajadas` : 'OpenStreetMap no tiene nombres para estas pistas'); const y = body.scrollTop; viewDay(d.id); body.scrollTop = y;
    } catch { toast('No se pudo consultar OpenStreetMap. Prueba más tarde.'); el.disabled = false; el.textContent = 'Buscar nombres de pistas'; }
  }
  else if (cmd === 'backup') {
    const raws = await db.allRaw(), zip = {}; raws.forEach((r, i) => { zip[(r.name || `dia-${i}`).replace(/\.slopes$/i, '') + `-${i}.slopes`] = [r.bytes, { level: 0 }]; });
    const blob = new Blob([fflate.zipSync(zip)], { type: 'application/zip' }), a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `traza-copia-${new Date().toISOString().slice(0, 10)}.zip` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast(`Copia con ${raws.length} ${raws.length === 1 ? 'día' : 'días'} descargada`);
  }
}
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el) { e.preventDefault(); act(el.dataset.act, el); } });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bar[data-act]')) { e.preventDefault(); act(e.target.dataset.act, e.target); } });
document.addEventListener('change', async e => { if (e.target.matches('.rename')) { S.liftNames[e.target.dataset.lift] = e.target.value.trim(); if (!S.liftNames[e.target.dataset.lift]) delete S.liftNames[e.target.dataset.lift]; await db.set('liftNames', S.liftNames); toast('Nombre guardado'); } });
$('#mapctl').addEventListener('click', e => {
  const b = e.target.closest('[data-base]'); if (b) { mv.ready.then(() => mv.setBase(b.dataset.base)); document.querySelectorAll('[data-base]').forEach(x => x.classList.toggle('on', x === b)); }
  if (e.target.id === 'btn-pistes') { const on = !e.target.classList.contains('on'); e.target.classList.toggle('on', on); e.target.setAttribute('aria-pressed', on); mv.ready.then(() => mv.setPistes(on)); }
});

/* ---------- rutas y arranque ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, ''), [p, arg] = h.split('/'), key = arg ? decodeURIComponent(arg) : '';
  const view = p === 'r' ? 'resort' : p === 'd' ? 'day' : p === 'stats' ? 'stats' : p === 'add' ? 'add' : 'home';
  document.body.dataset.view = view; if (view !== 'day') replay.detach();
  document.querySelectorAll('#tabs [data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === (view === 'resort' || view === 'day' ? 'home' : view)));
  mv.pad();
  ({ home: viewHome, stats: viewStats, add: viewAdd, resort: () => viewResort(key), day: () => viewDay(key) })[view]();
  body.scrollTop = 0;
}
addEventListener('hashchange', route);
addEventListener('resize', () => { if (replay.d) { replay.drawBase(); replay.set(replay.t, false); } });

(async () => {
  try { S.days = await db.allDays(); S.liftNames = (await db.get('liftNames')) || {}; S.runNames = (await db.get('runNames')) || {}; }
  catch { toast('Este navegador no deja guardar datos (¿modo privado?). Podrás ver los días, pero no se conservarán.', 8000); }
  refresh(); route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
