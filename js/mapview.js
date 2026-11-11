// Mapa: globo con estaciones, relieve 3D, trazas coloreadas y cursor de repetición.
import { bearing, KMH } from './stats.js';

const ATTR = {
  sat: 'Imágenes © Esri, Maxar, Earthstar Geographics',
  topo: '© OpenTopoMap (CC-BY-SA) · © OpenStreetMap',
  pistes: 'Pistas © OpenSnowMap · © OpenStreetMap',
  dem: 'Relieve: Mapzen / AWS Terrain Tiles',
};
const DEM = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: ATTR.dem };
const STYLE = {
  version: 8, projection: { type: 'globe' },
  sources: {
    sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: ATTR.sat },
    topo: { type: 'raster', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 17, attribution: ATTR.topo },
    pistes: { type: 'raster', tiles: ['https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 9, maxzoom: 18, attribution: ATTR.pistes },
    dem: DEM, dem2: DEM,
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#1B3F63' } },
    { id: 'sat', type: 'raster', source: 'sat' },
    { id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
    { id: 'hill', type: 'hillshade', source: 'dem2', minzoom: 7, paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#10243B', 'hillshade-highlight-color': '#FFFFFF' } },
    { id: 'pistes', type: 'raster', source: 'pistes', minzoom: 10, paint: { 'raster-opacity': 0.9 } },
  ],
  sky: { 'sky-color': '#6FA8DC', 'horizon-color': '#E3EDF5', 'fog-color': '#EEF3F7', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.2,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.8, 9, 0] },
};
const BASES = {
  // de lejos, la Tierra con su color; al acercarse a la montaña, aspecto nevado
  nieve: { layer: 'sat', paint: { 'raster-saturation': ['interpolate', ['linear'], ['zoom'], 6, 0, 10, -0.8], 'raster-brightness-min': ['interpolate', ['linear'], ['zoom'], 6, 0, 10, 0.42], 'raster-contrast': ['interpolate', ['linear'], ['zoom'], 6, 0, 10, 0.15] } },
  sat: { layer: 'sat', paint: { 'raster-saturation': 0, 'raster-brightness-min': 0, 'raster-contrast': 0 } },
  topo: { layer: 'topo', paint: {} },
};
export const SPEED_STOPS = [[0, '#2F6FE4'], [25, '#27A567'], [45, '#F2B705'], [60, '#F0701A'], [75, '#D7263D']];
const FC = (features = []) => ({ type: 'FeatureCollection', features });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MapView {
  constructor(el, { onResort }) {
    this.onResort = onResort; this.pins = []; this.mode = 'globe'; this.follow = true;
    const map = this.map = new maplibregl.Map({ container: el, style: STYLE, center: [1.5, 38], zoom: 1.4, maxPitch: 80, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('error', () => {});                          // una tesela que falla no debe romper nada
    this.ready = new Promise(res => map.on('load', () => {
      for (const id of ['heat', 'lifts', 'runs', 'trail', 'speed', 'seg', 'cover', 'cmp']) map.addSource(id, { type: 'geojson', data: FC() });
      map.addLayer({ id: 'heat', type: 'line', source: 'heat', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D7263D', 'line-opacity': 0.34, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 4] } });
      map.addLayer({ id: 'lifts', type: 'line', source: 'lifts', paint: { 'line-color': '#F2B705', 'line-width': 2.2, 'line-dasharray': [2, 1.5] } });
      map.addLayer({ id: 'hl', type: 'line', source: 'runs', filter: ['==', ['get', 'n'], -1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 12, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'runs-case', type: 'line', source: 'runs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0F2740', 'line-width': 6.5, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'runs', type: 'line', source: 'runs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['interpolate', ['linear'], ['get', 'v'], ...SPEED_STOPS.flat()], 'line-width': 4 } });
      map.addLayer({ id: 'speed', type: 'circle', source: 'speed', paint: {
        'circle-color': ['interpolate', ['linear'], ['get', 'v'], ...SPEED_STOPS.flat()],
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 1.6, 15, 6, 17, 22], 'circle-opacity': 0.85, 'circle-blur': 0.35 } }, 'lifts');
      map.addLayer({ id: 'cover-todo', type: 'line', source: 'cover', filter: ['!', ['get', 'done']], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#7D8FA3', 'line-width': 2.6, 'line-dasharray': [1.2, 1.6] } }, 'lifts');
      map.addLayer({ id: 'cover-done', type: 'line', source: 'cover', filter: ['get', 'done'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4.5 } }, 'lifts');
      map.addLayer({ id: 'cmp-case', type: 'line', source: 'cmp', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 7, 'line-opacity': 0.8 } });
      map.addLayer({ id: 'cmp', type: 'line', source: 'cmp', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3.6, 'line-opacity': ['case', ['get', 'hl'], 1, 0.85] } });
      map.addLayer({ id: 'seg-case', type: 'line', source: 'seg', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0F2740', 'line-width': 11 } });
      map.addLayer({ id: 'seg', type: 'line', source: 'seg', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 6 } });
      map.addLayer({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 5, 'line-opacity': 0.95 } });
      this.setBase('nieve'); res();
    }));
    let q = 0; map.on('move', () => { if (!q && this.pins.length) q = requestAnimationFrame(() => { q = 0; this.declutter(); }); });
    const stop = () => { this.spinning = false; };
    for (const ev of ['mousedown', 'touchstart', 'wheel']) el.addEventListener(ev, stop, { passive: true });
    const el2 = document.createElement('div'); el2.className = 'skier';
    this.cursor = new maplibregl.Marker({ element: el2 });
    this.pad();
    addEventListener('resize', () => this.pad());
  }
  pad() {
    const wide = innerWidth >= 900, m = this.map;
    if (wide) return m.setPadding({ left: document.getElementById('panel').getBoundingClientRect().right, top: 0, right: 0, bottom: 0 });
    // en móvil se usa la altura de destino del cuaderno, no la que tenga a mitad de animación
    const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || innerHeight * 0.56;
    m.setPadding({ left: 0, top: 96, right: 0, bottom: Math.min(h, innerHeight - 62) });
  }
  setBase(mode) {
    const b = BASES[mode], m = this.map;
    m.setLayoutProperty('sat', 'visibility', b.layer === 'sat' ? 'visible' : 'none');
    m.setLayoutProperty('topo', 'visibility', b.layer === 'topo' ? 'visible' : 'none');
    for (const [k, v] of Object.entries(b.paint)) m.setPaintProperty('sat', k, v);
  }
  setPistes(on) { this.map.setLayoutProperty('pistes', 'visibility', on ? 'visible' : 'none'); }
  clear() { this.ghost?.remove(); for (const id of ['heat', 'lifts', 'runs', 'trail', 'speed', 'seg', 'cover', 'cmp']) this.map.getSource(id).setData(FC()); this.cursor.remove(); this.highlight(-1); }
  /** 'pasadas' = mapa de calor de por dónde pasas; 'velocidad' = media de velocidad por zona. */
  setHeat(mode, cells) {
    this.map.setLayoutProperty('heat', 'visibility', mode === 'velocidad' ? 'none' : 'visible');
    this.map.getSource('speed').setData(FC(mode === 'velocidad' ? cells : []));
  }
  /** Cobertura: pistas bajadas en su color y las que faltan en gris discontinuo. */
  setCover(pistes, colors) {
    const on = !!pistes;
    this.map.setLayoutProperty('heat', 'visibility', on ? 'none' : 'visible');
    this.map.getSource('cover').setData(FC((pistes || []).map(p => ({ type: 'Feature', properties: { done: p.done, color: colors(p.diff) }, geometry: { type: 'LineString', coordinates: p.pts.map(([la, lo]) => [lo, la]) } }))));
  }
  /** Dos días a la vez, cada uno de un color. */
  async showCompare(a, b, colors) {
    await this.ready; this.mode = 'cmp'; this.spinning = false; this.clear(); this.clearPins(); this.pad(); this._terrain();
    const feats = [];
    [a, b].forEach((d, k) => { const T = d.track; for (const r of d.actions) if (r.type === 'run') {
      const c = []; for (let i = r.i0; i <= r.i1; i += 2) c.push([T.lon[i], T.lat[i]]);
      if (c.length > 1) feats.push({ type: 'Feature', properties: { color: colors[k], hl: false }, geometry: { type: 'LineString', coordinates: c } });
    } });
    this.map.getSource('cmp').setData(FC(feats));
    this._frame([a, b]);
  }
  setSegment(coords, fit) {
    this.map.getSource('seg').setData(FC(coords && coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : []));
    if (fit && coords?.length > 1) { const bb = new maplibregl.LngLatBounds(); coords.forEach(c => bb.extend(c)); this.map.fitBounds(bb, { padding: 80, pitch: 60, bearing: this.uphill || 0, maxZoom: 16.5, duration: reduced ? 0 : 1100 }); }
  }
  setGhost(lat, lon) {
    if (lat == null) { this.ghost?.remove(); return; }
    if (!this.ghost) { const el = document.createElement('div'); el.className = 'ghost'; el.title = 'Tu mejor bajada por aquí'; this.ghost = new maplibregl.Marker({ element: el }); }
    this.ghost.setLngLat([lon, lat]); if (!this.ghost._map) this.ghost.addTo(this.map);
  }
  setTrail(coords) { const src = this.map.getSource('trail'); if (src) src.setData(FC(coords && coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [])); }
  clearPins() { this.pins.forEach(p => p.remove()); this.pins = []; }
  /** Oculta los nombres que chocarían con otra chincheta o con otro nombre; manda la estación con más días. */
  declutter() {
    if (!this.pins.length) return;
    const placed = [], hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const order = [...this.pins].sort((a, b) => b._r.days.length - a._r.days.length);
    for (const mk of order) {
      const p = this.map.project(mk.getLngLat()), s = mk._s, size = 32 * s;
      placed.push({ x: p.x - size / 2, y: p.y - 56 * s + 2 * s, w: size, h: size });
    }
    order.forEach((mk, i) => {
      const tag = mk.getElement().querySelector('.tag'), head = placed[i];
      const r = { x: head.x + head.w + 4, y: head.y + head.h / 2 - 20, w: tag.offsetWidth || 110, h: 40 };
      const clash = placed.some((o, j) => j !== i && hit(r, o));
      mk.getElement().classList.toggle('quiet', clash);
      if (!clash) placed.push(r);
    });
  }

  /** resorts: [{key, name, lat, lon, days:[]}] */
  async showGlobe(resorts) {
    await this.ready; this.mode = 'globe'; this.clear(); this.clearPins(); this.pad();
    const m = this.map; m.setTerrain(null);
    for (const r of resorts) {
      const b = document.createElement('button'); b.className = 'pin'; b.type = 'button';
      const n = r.days.length, big = n >= 10 ? 1.25 : n >= 4 ? 1.12 : 1;
      b.style.setProperty('--s', big); b.style.setProperty('--d', (this.pins.length * 0.12) + 's');
      b.innerHTML = `<svg viewBox="0 0 40 56" width="40" height="56" aria-hidden="true">
          <defs><radialGradient id="pg" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#FF8A98"/><stop offset=".45" stop-color="#D7263D"/><stop offset="1" stop-color="#8E1023"/></radialGradient>
          <linearGradient id="pn" x1="0" x2="1"><stop offset="0" stop-color="#F4F7FA"/><stop offset="1" stop-color="#8A9AAB"/></linearGradient></defs>
          <ellipse cx="24" cy="54" rx="9" ry="2.2" fill="#000" opacity=".35"/>
          <path d="M18.6 30h2.8L20.4 55h-.8z" fill="url(#pn)"/>
          <circle cx="20" cy="17" r="15" fill="url(#pg)" stroke="#fff" stroke-width="2"/>
          <ellipse cx="14.5" cy="10.5" rx="4.2" ry="2.6" fill="#fff" opacity=".45" transform="rotate(-30 14.5 10.5)"/>
          <text x="20" y="22.5" text-anchor="middle">${n}</text></svg><span class="tag"><b></b><i>${n} ${n === 1 ? 'día' : 'días'}</i></span>`;
      b.querySelector('b').textContent = r.name;
      b.setAttribute('aria-label', `Entrar en ${r.name}, ${n} ${n === 1 ? 'día' : 'días'}`);
      b.addEventListener('click', () => this.onResort(r.key));
      const mk = new maplibregl.Marker({ element: b, anchor: 'bottom' }).setLngLat([r.lon, r.lat]).addTo(m);
      mk._r = r; mk._s = big; mk.getElement().style.zIndex = String(10 + n); this.pins.push(mk);
    }
    requestAnimationFrame(() => this.declutter());
    if (resorts.length > 1) {
      const bb = new maplibregl.LngLatBounds(); resorts.forEach(r => bb.extend([r.lon, r.lat]));
      m.fitBounds(bb, { padding: 90, maxZoom: 4.2, pitch: 0, bearing: 0, duration: reduced ? 0 : 2200 });
    } else {
      const c = resorts[0] ? [resorts[0].lon, resorts[0].lat - 4] : [1.5, 30];
      m.flyTo({ center: c, zoom: resorts[0] ? (innerWidth >= 900 ? 2.2 : 1.7) : 1.5, pitch: 0, bearing: 0, duration: reduced ? 0 : 2200 });
    }
    if (!resorts.length && !reduced) this.spin();
  }
  spin() {
    this.spinning = true;
    const step = () => { if (!this.spinning || this.mode !== 'globe') return; const c = this.map.getCenter(); this.map.jumpTo({ center: [c.lng + 0.12, c.lat] }); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  _frame(days, opts = {}) {
    const bb = new maplibregl.LngLatBounds(); let lo = null, hi = null;
    for (const d of days) { const T = d.track; for (const a of d.actions) for (let i = a.i0; i <= a.i1; i += 4) {
      bb.extend([T.lon[i], T.lat[i]]);
      if (!lo || T.alt[i] < lo[2]) lo = [T.lat[i], T.lon[i], T.alt[i]];
      if (!hi || T.alt[i] > hi[2]) hi = [T.lat[i], T.lon[i], T.alt[i]];
    } }
    if (bb.isEmpty()) return;
    this.uphill = lo && hi ? bearing(lo[0], lo[1], hi[0], hi[1]) : 0;
    this.map.fitBounds(bb, { padding: 40, pitch: 62, bearing: this.uphill, maxZoom: 15.5, duration: reduced ? 0 : (opts.fast ? 900 : 3200), essential: true });
  }
  _terrain() { try { this.map.setTerrain({ source: 'dem', exaggeration: 1.25 }); } catch { /* sin relieve */ } }

  async showResort(days, opts = {}) {
    await this.ready; this.mode = opts.mode || 'resort'; this.spinning = false; this.clear(); this.clearPins(); this.pad(); this._terrain();
    const feats = [], lifts = new Map();
    for (const d of days) { const T = d.track; for (const a of d.actions) {
      const coords = []; for (let i = a.i0; i <= a.i1; i += 2) coords.push([T.lon[i], T.lat[i]]);
      if (coords.length < 2) continue;
      if (a.type === 'run') feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
      else if (!lifts.has(a.liftId || a.t0)) lifts.set(a.liftId || a.t0, { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
    } }
    this.map.getSource('heat').setData(FC(feats)); this.map.getSource('lifts').setData(FC([...lifts.values()]));
    if (!opts.noFrame) this._frame(days);
  }
  /** Posición en directo: la primera vez vuela hasta ti; después te sigue. */
  async liveFix(lat, lon) {
    await this.ready; this.cursor.setLngLat([lon, lat]); if (!this.cursor._map) this.cursor.addTo(this.map);
    if (!this._liveFlown) { this._liveFlown = true; this._terrain(); this.map.flyTo({ center: [lon, lat], zoom: 14.6, pitch: 60, duration: reduced ? 0 : 2500 }); this._liveT = performance.now() + 2600; }
    else if (this.follow && performance.now() > this._liveT) this.map.easeTo({ center: [lon, lat], duration: 900, easing: t => t });
  }
  liveEnd() { this._liveFlown = false; this.cursor.remove(); }

  async showDay(d) {
    await this.ready; const again = this.mode === 'day:' + d.id; this.mode = 'day:' + d.id; this.spinning = false;
    this.clear(); this.clearPins(); this.pad(); this._terrain();
    const T = d.track, runs = [], lifts = [];
    for (const a of d.actions) {
      if (a.type === 'lift') { const c = []; for (let i = a.i0; i <= a.i1; i++) c.push([T.lon[i], T.lat[i]]); if (c.length > 1) lifts.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }); continue; }
      for (let i = a.i0; i < a.i1; i += 2) {
        const j = Math.min(i + 2, a.i1), c = []; let v = 0;
        for (let k = i; k <= j; k++) { c.push([T.lon[k], T.lat[k]]); v += T.spd[k]; }
        runs.push({ type: 'Feature', properties: { n: a.n, v: v / c.length * KMH }, geometry: { type: 'LineString', coordinates: c } });
      }
    }
    this.map.getSource('runs').setData(FC(runs)); this.map.getSource('lifts').setData(FC(lifts));
    this._frame([d], { fast: again });
  }
  highlight(n) { if (this.map.getLayer('hl')) this.map.setFilter('hl', ['==', ['get', 'n'], n]); }
  fitAction(d, a) {
    const bb = new maplibregl.LngLatBounds(), T = d.track; for (let i = a.i0; i <= a.i1; i += 2) bb.extend([T.lon[i], T.lat[i]]);
    if (!bb.isEmpty()) this.map.fitBounds(bb, { padding: 70, pitch: 62, bearing: this.uphill || 0, maxZoom: 16, duration: reduced ? 0 : 1200 });
  }
  setCursor(lat, lon, moving) {
    this.cursor.setLngLat([lon, lat]); if (!this.cursor._map) this.cursor.addTo(this.map);
    if (moving && this.follow) this.map.jumpTo(this.orbit && !reduced ? { center: [lon, lat], bearing: this.map.getBearing() + 0.12 } : { center: [lon, lat] });
  }
}
