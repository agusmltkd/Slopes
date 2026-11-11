// Lectura de ficheros .slopes (un zip con Metadata.xml y GPS.csv) y de copias .zip con varios dentro.
const num = v => (v == null || v === '' ? 0 : +v);
const epoch = s => Date.parse(s.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d)(\d\d)$/, '$1T$2$3:$4')) / 1000;

function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; arr[m] < x ? lo = m + 1 : hi = m; } return lo; }

function parseDay(files, fileName) {
  const key = n => Object.keys(files).find(k => k === n || k.endsWith('/' + n));
  const mk = key('Metadata.xml'), gk = key('GPS.csv');
  if (!mk || !gk) throw new Error('No es un fichero de Slopes válido (faltan Metadata.xml o GPS.csv)');
  const dec = new TextDecoder();
  const xml = new DOMParser().parseFromString(dec.decode(files[mk]), 'application/xml');
  const A = xml.querySelector('Activity');
  if (!A) throw new Error('Metadata.xml no contiene una actividad');
  const a = n => A.getAttribute(n);

  const rows = dec.decode(files[gk]).split('\n');
  const n0 = rows.length;
  const t = new Float64Array(n0), lat = new Float64Array(n0), lon = new Float64Array(n0), alt = new Float32Array(n0), spd = new Float32Array(n0);
  let n = 0, last = -1;
  for (const row of rows) {
    const p = row.split(',');
    if (p.length < 6) continue;
    const ti = +p[0];
    if (!(ti > last)) continue;            // descarta duplicados y saltos atrás
    t[n] = ti; lat[n] = +p[1]; lon[n] = +p[2]; alt[n] = +p[3]; spd[n] = Math.max(0, +p[5]); last = ti; n++;
  }
  if (n < 2) throw new Error('El fichero no trae traza GPS');
  const track = { t: t.slice(0, n), lat: lat.slice(0, n), lon: lon.slice(0, n), alt: alt.slice(0, n), spd: spd.slice(0, n) };

  const actions = [...A.querySelectorAll('actions > Action')].map(e => {
    const g = k => e.getAttribute(k);
    const t0 = epoch(g('start')), t1 = epoch(g('end'));
    return {
      type: g('type') === 'Lift' ? 'lift' : 'run', n: num(g('numberOfType')), t0, t1, dur: num(g('duration')) || t1 - t0,
      dist: num(g('distance')), vert: num(g('vertical')), minAlt: num(g('minAlt')), maxAlt: num(g('maxAlt')),
      top: num(g('topSpeed')), avg: num(g('avgSpeed')), topLat: num(g('topSpeedLat')), topLon: num(g('topSpeedLong')),
      liftId: g('trackIDs') || null,
      i0: lowerBound(track.t, t0), i1: Math.max(lowerBound(track.t, t1 + 0.001) - 1, 0),
    };
  }).sort((x, y) => x.t0 - y.t0);

  const runs = actions.filter(x => x.type === 'run');
  return {
    id: a('identifier') || fileName, file: fileName,
    resort: a('locationName') || 'Estación sin nombre', locationId: a('locationId') || a('locationName') || 'x',
    start: epoch(a('start')), end: epoch(a('end')), tz: num(a('timeZoneOffset')),
    distance: num(a('distance')) || runs.reduce((s, r) => s + r.dist, 0),
    vertical: num(a('vertical')) || runs.reduce((s, r) => s + r.vert, 0),
    topSpeed: num(a('topSpeed')) || Math.max(0, ...runs.map(r => r.top)),
    peakAlt: num(a('peakAltitude')) || Math.max(0, ...actions.map(r => r.maxAlt)),
    runCount: runs.length, lat: num(a('centerLat')) || track.lat[0], lon: num(a('centerLong')) || track.lon[0],
    device: a('sourceDevice') || '', sport: num(a('sport')), actions, track,
  };
}

/** Devuelve [{day, bytes, name}] o lanza un error legible. */
export function parseFile(buf, name) {
  const bytes = new Uint8Array(buf);
  let files;
  try { files = fflate.unzipSync(bytes, { filter: f => !/RawGPS\.csv$/.test(f.name) }); }
  catch { throw new Error('No se puede abrir: no es un .slopes ni un .zip'); }
  const inner = Object.keys(files).filter(k => /\.slopes$/i.test(k));
  if (inner.length) {
    const out = [];
    for (const k of inner) { try { out.push(...parseFile(files[k].buffer.slice(files[k].byteOffset, files[k].byteOffset + files[k].byteLength), k.split('/').pop())); } catch { /* se ignora el que falle */ } }
    if (!out.length) throw new Error('El .zip no contiene ningún .slopes legible');
    return out;
  }
  return [{ day: parseDay(files, name), bytes, name }];
}
