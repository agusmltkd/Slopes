// «En vivo»: tu posición sobre la estación, parte de nieve y cuenta atrás del próximo viaje.
import { hav, KMH } from './stats.js';
import { nearest, prep } from './osm.js';
import { bars } from './charts.js';

const sky = c => c === 0 ? 'Despejado' : c <= 2 ? 'Poco nuboso' : c === 3 ? 'Cubierto' : c <= 48 ? 'Niebla' : c <= 57 ? 'Llovizna' : c <= 67 ? 'Lluvia' : c <= 77 ? 'Nevando' : c <= 82 ? 'Chubascos' : c <= 86 ? 'Chubascos de nieve' : 'Tormenta';
const DIFF_ES = { novice: 'verde', easy: 'azul', intermediate: 'roja', advanced: 'negra', expert: 'negra', freeride: 'fuera de pista' };
const HALF_HOUR = 30 * 60e3;

export function createLive({ S, mv, f, db, toast, esc }) {
  const $ = s => document.querySelector(s);
  const L = { watch: null, sess: null, lock: null, ways: null, near: null, trip: null };

  /* ----- parte de nieve (Open-Meteo) ----- */
  async function weather(r) {
    const key = 'wx:' + r.key, cached = await db.get(key).catch(() => null);
    if (cached && Date.now() - cached.at < HALF_HOUR) return cached;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat.toFixed(4)}&longitude=${r.lon.toFixed(4)}&elevation=${Math.round(r.peak)}` +
        '&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,weather_code&daily=snowfall_sum,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max&timezone=auto&forecast_days=7';
      const res = await fetch(u); if (!res.ok) throw new Error('HTTP ' + res.status);
      const fresh = { at: Date.now(), data: await res.json() }; await db.set(key, fresh).catch(() => {}); return fresh;
    } catch (e) { if (cached) return { ...cached, stale: true }; throw e; }
  }
  function wxHtml(r, w) {
    const c = w.data.current, d = w.data.daily, snow = d.snowfall_sum.map(v => v || 0), total = snow.reduce((a, b) => a + b, 0);
    const days = d.time.map(t => new Date(t + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''));
    const best = snow.indexOf(Math.max(...snow));
    return `<div class="wx-now"><b>${Math.round(c.temperature_2m)}°</b><span><strong>${sky(c.weather_code)}</strong>, sensación de ${Math.round(c.apparent_temperature)}°.<br>Viento ${Math.round(c.wind_speed_10m)} km/h, rachas de ${Math.round(c.wind_gusts_10m)}.</span></div>
      ${bars(snow.map((v, i) => ({ label: i === 0 ? 'hoy' : days[i], value: v, color: v >= 10 ? 'var(--red)' : 'var(--blue)' })), { unit: 'cm', fmt: v => v >= 10 ? Math.round(v) : v.toFixed(1).replace('.', ','), height: 96 })}
      <p class="note">${total >= 1 ? `Se esperan <b>${Math.round(total)} cm</b> de nieve nueva en 7 días${snow[best] >= 5 ? `; el mejor, ${best === 0 ? 'hoy' : 'el ' + days[best]} con ${Math.round(snow[best])} cm` : ''}.` : 'No se espera nieve nueva en 7 días.'}
        Mínimas de ${Math.round(Math.min(...d.temperature_2m_min))}°, rachas de hasta ${Math.round(Math.max(...d.wind_gusts_10m_max))} km/h.
        ${w.stale ? 'Sin conexión: datos de las ' : 'Actualizado a las '}${new Date(w.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.</p>`;
  }

  /* ----- posición en directo ----- */
  function resortNear(lat, lon) { let best = null, bd = 25000; for (const r of S.A.resorts.values()) { const d = hav(lat, lon, r.lat, r.lon); if (d < bd) { bd = d; best = r; } } return best; }
  function paint() {
    const s = L.sess; if (!s || !$('#lv-speed')) return;
    $('#lv-speed').textContent = Math.round(s.v * KMH);
    $('#lv-alt').textContent = s.alt != null ? f.int(s.alt) : '–';
    $('#lv-state').textContent = s.state;
    $('#lv-where').textContent = s.where || (L.near ? L.near.name : 'Buscando dónde estás…');
    $('#lv-max').textContent = Math.round(s.max * KMH); $('#lv-vert').textContent = f.int(s.vert); $('#lv-dist').textContent = f.km(s.dist);
    $('#lv-acc').textContent = s.acc != null ? `Precisión del GPS: ±${Math.round(s.acc)} m` : '';
    const hud = { t: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) };
    $('#hud-time').textContent = hud.t; $('#hud-speed b').textContent = Math.round(s.v * KMH); $('#hud-alt b').textContent = s.alt != null ? f.int(s.alt) : '–';
  }
  async function onFix(p) {
    const s = L.sess, c = p.coords, now = p.timestamp || Date.now(); if (!s) return;
    let v = c.speed != null && c.speed >= 0 ? c.speed : null;
    if (s.last) {
      const m = hav(s.last.lat, s.last.lon, c.latitude, c.longitude), dt = (now - s.last.t) / 1000;
      if (dt > 0.5 && m < 500) { if (v == null) v = m / dt; if (m > Math.max(3, (c.accuracy || 0) / 4)) s.dist += m; }
    }
    s.v = v || 0; s.acc = c.accuracy; if (s.v < 45) s.max = Math.max(s.max, s.v);      // 45 m/s = 162 km/h: por encima es un salto del GPS
    if (c.altitude != null) {
      s.alt = c.altitude; if (s.ref == null) s.ref = s.alt;
      if (s.alt < s.ref - 4) { s.vert += s.ref - s.alt; s.ref = s.alt; } else if (s.alt > s.ref + 4) s.ref = s.alt;
      s.win.push([now, s.alt]); while (s.win.length > 2 && now - s.win[0][0] > 20000) s.win.shift();
      const rate = s.win.length > 1 ? (s.alt - s.win[0][1]) / Math.max(1, (now - s.win[0][0]) / 1000) : 0;
      s.state = rate < -0.5 && s.v > 2 ? 'Bajando' : rate > 0.4 ? 'Subiendo' : s.v > 2 ? 'En movimiento' : 'Parado';
    } else s.state = s.v > 2 ? 'En movimiento' : 'Parado';
    s.last = { lat: c.latitude, lon: c.longitude, t: now };
    if (!L.near) {
      L.near = resortNear(c.latitude, c.longitude);
      if (L.near) { mv.showResort(L.near.days, { mode: 'live', noFrame: true }); const cache = await db.get('ways:' + L.near.key).catch(() => null); L.ways = cache ? prep(cache.ways) : null; }
    }
    if (L.ways) { const w = nearest(c.latitude, c.longitude, L.ways, 45); s.where = w ? (w.lift ? `En ${w.name || 'un remonte'}` : `${w.name || 'Pista sin nombre'}${DIFF_ES[w.diff] ? ' (' + DIFF_ES[w.diff] + ')' : ''}`) : (L.near ? `${L.near.name}, fuera de pista marcada` : ''); }
    else if (L.near) s.where = L.near.name; else s.where = 'Lejos de tus estaciones';
    mv.liveFix(c.latitude, c.longitude); paint();
  }
  function onErr(e) {
    if (e.code !== 1 && L.sess?.last && Date.now() - L.sess.last.t < 45000) return;      // un fallo suelto con posición reciente no merece aviso
    toast(e.code === 1 ? 'Sin permiso de ubicación. Actívalo en los ajustes del navegador para esta página.' : 'No se pudo obtener la posición. Sal a cielo abierto y vuelve a intentarlo.', 7000); if (e.code === 1) stop(); }
  async function lock() { try { L.lock = await navigator.wakeLock?.request('screen'); } catch { /* sin bloqueo de pantalla */ } }
  function start() {
    if (!navigator.geolocation) return toast('Este navegador no da acceso a la ubicación.');
    L.sess = { v: 0, max: 0, vert: 0, dist: 0, alt: null, ref: null, last: null, win: [], state: 'Esperando al GPS…', where: '', t0: Date.now() }; L.near = null; L.ways = null;
    L.watch = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 });
    lock(); mv.follow = true; $('#hud').hidden = false; render();
  }
  function stop() {
    if (L.watch != null) navigator.geolocation.clearWatch(L.watch); L.watch = null; L.lock?.release?.().catch(() => {}); L.lock = null; mv.liveEnd(); $('#hud').hidden = true;
    if ($('#lv')) render();
  }
  document.addEventListener('visibilitychange', () => { if (L.watch != null && document.visibilityState === 'visible') lock(); });

  /* ----- avisos de nieve (Worker propio + Telegram) ----- */
  async function alertsCfg() { return (await db.get('alerts').catch(() => null)) || null; }
  async function post(cfg, path, body) {
    const r = await fetch(cfg.url.replace(/\/+$/, '') + path, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : '{}' });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || 'HTTP ' + r.status); return j;
  }
  async function sync(cfg) {
    cfg ||= await alertsCfg(); if (!cfg) return;
    if (L.trip === null) L.trip = (await db.get('trip').catch(() => null)) || undefined;
    const resorts = [...S.A.resorts.values()].map(r => ({ key: r.key, name: r.name, lat: r.lat, lon: r.lon, peak: r.peak }));
    await post(cfg, '/config', { resorts, trip: L.trip || null, threshold: cfg.threshold });
    cfg.at = Date.now(); cfg.n = resorts.length; await db.set('alerts', cfg);
  }
  async function alertsHtml() {
    const c = await alertsCfg();
    if (!c || L.editAlerts) return `<div class="alerts"><p class="note">Recibe un mensaje en Telegram cuando vaya a nevar fuerte en tus estaciones y los días antes del viaje. Necesita el pequeño servidor que está en la carpeta <b>worker</b> del repositorio (las instrucciones están allí).</p>
      <label>Dirección del servidor <input id="al-url" type="url" inputmode="url" placeholder="https://traza-avisos.tu-usuario.workers.dev" value="${esc(c?.url || '')}"></label>
      <label>Clave <input id="al-key" type="password" autocomplete="off" value="${esc(c?.key || '')}"></label>
      <label>Avisar desde <select id="al-th">${[10, 20, 30, 50].map(v => `<option value="${v}"${(c?.threshold || 20) === v ? ' selected' : ''}>${v} cm en 3 días</option>`).join('')}</select></label>
      <div class="actions"><button class="btn primary" data-act="al-save">Activar avisos</button>${c ? '<button class="btn" data-act="al-cancel">Cancelar</button>' : ''}</div></div>`;
    return `<div class="alerts on"><b>Avisos activos</b><span>${c.n || 0} ${c.n === 1 ? 'estación' : 'estaciones'}, desde ${c.threshold} cm en 3 días${L.trip ? ', y a 7, 3 y 1 día del viaje' : ''}. Se comprueba cada mañana a las 7:17.</span>
      <div class="actions"><button class="btn primary" data-act="al-test">Enviar aviso de prueba</button><button class="btn" data-act="al-edit">Cambiar</button><button class="btn danger" data-act="al-off">Desactivar</button></div></div>`;
  }
  async function alertsAct(cmd, el) {
    const box = () => document.querySelector('#alerts-box');
    if (cmd === 'al-save') {
      const cfg = { url: $('#al-url').value.trim(), key: $('#al-key').value.trim(), threshold: +$('#al-th').value };
      if (!/^https:\/\//.test(cfg.url) || !cfg.key) return toast('Pon la dirección (empieza por https://) y la clave.');
      el.disabled = true; el.textContent = 'Conectando…';
      try { await sync(cfg); L.editAlerts = false; toast(`Avisos activados para ${cfg.n} ${cfg.n === 1 ? 'estación' : 'estaciones'}`); }
      catch (e) { toast('No se pudo conectar: ' + e.message, 6000); el.disabled = false; el.textContent = 'Activar avisos'; return; }
    } else if (cmd === 'al-test') {
      el.disabled = true; try { await post(await alertsCfg(), '/test'); toast('Mensaje de prueba enviado. Mira Telegram.'); } catch (e) { toast('No se pudo enviar: ' + e.message, 6000); } el.disabled = false; return;
    } else if (cmd === 'al-edit') L.editAlerts = true;
    else if (cmd === 'al-cancel') L.editAlerts = false;
    else if (cmd === 'al-off') {
      if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Pulsa otra vez'; return; }
      const c = await alertsCfg(); try { await post(c, '/config', { resorts: [], trip: null, threshold: c.threshold }); } catch { /* aunque falle, se olvida aquí */ }
      await db.set('alerts', null); toast('Avisos desactivados');
    }
    if (box()) box().innerHTML = await alertsHtml();
  }

  /* ----- vista ----- */
  function gpsHtml() {
    if (L.watch == null) {
      const s = L.sess;
      return `<button class="dropzone" data-act="live-start"><strong>Ver dónde estoy ahora</strong><span>Tu posición sobre la estación en 3D, con velocidad, altitud y la pista en la que estás.</span></button>
        ${s && s.dist > 50 ? `<p class="note">Última sesión: máxima de ${Math.round(s.max * KMH)} km/h, ${f.int(s.vert)} m bajados y ${f.km(s.dist)} km.</p>` : ''}
        <p class="note">Funciona con la app abierta y la pantalla encendida (se mantiene encendida sola). No sustituye a Slopes: para guardar el día, sigue grabándolo allí.</p>`;
    }
    const rec = L.near ? Math.round(L.near.top * KMH) : null;
    return `<div class="cockpit"><div class="big"><b id="lv-speed">0</b><span>km/h</span></div>
        <div class="side"><b id="lv-state">Esperando al GPS…</b><span id="lv-where">Buscando dónde estás…</span><span><b id="lv-alt">–</b> m de altitud</span></div></div>
      <div class="stats"><div class="stat hot"><b id="lv-max">0</b><span>km/h de máxima en esta sesión</span></div><div class="stat"><b id="lv-vert">0</b><span>m bajados</span></div><div class="stat"><b id="lv-dist">0,0</b><span>km</span></div></div>
      <p class="note">${rec ? `Tu récord en ${esc(L.near.name)}: ${rec} km/h. ` : ''}<span id="lv-acc"></span></p>
      <div class="rp-opts"><label><input type="checkbox" id="lv-follow" ${mv.follow ? 'checked' : ''}> Seguirme con la cámara</label></div>
      <div class="actions"><button class="btn" data-act="live-stop">Dejar de seguir mi posición</button></div>`;
  }
  function tripHtml() {
    const t = L.trip, today = new Date(); today.setHours(0, 0, 0, 0);
    const n = t ? Math.round((new Date(t + 'T00:00:00') - today) / 864e5) : null;
    return `<div class="trip">${n == null ? '<b>¿Cuándo vuelves?</b><span>Pon la fecha y te llevo la cuenta.</span>' : n > 0 ? `<b>${n === 1 ? 'Falta 1 día' : `Faltan ${n} días`}</b><span>para volver a la nieve.</span>` : n === 0 ? '<b>Es hoy</b><span>Buena nieve.</span>' : '<b>Ya has vuelto</b><span>Pon la fecha del siguiente viaje.</span>'}
      <label>Fecha del viaje <input type="date" id="trip-date" value="${esc(t || '')}"></label></div>`;
  }
  function render() {
    const body = $('#body'), resorts = [...S.A.resorts.values()].sort((a, b) => b.days.length - a.days.length);
    body.innerHTML = `<div id="lv"><h1 class="hero">En vivo</h1>${gpsHtml()}
      <h2>Próximo viaje</h2>${tripHtml()}
      <h2>Avisos de nieve en Telegram</h2><div id="alerts-box"></div>
      <h2>Parte de nieve</h2>
      ${resorts.length ? resorts.map((r, i) => `<section class="wx"><h3>${esc(r.name)} <span>en cota alta, ${f.int(r.peak)} m</span></h3><div id="wx-${i}"><p class="note">Consultando la previsión…</p></div></section>`).join('')
        : '<p class="note">Añade algún día y aquí verás la nieve prevista en tus estaciones.</p>'}
      <p class="note">Previsión de Open-Meteo. Es un modelo meteorológico, no el parte oficial de la estación: no dice qué pistas o remontes están abiertos.</p></div>`;
    resorts.forEach((r, i) => weather(r).then(w => { const el = $('#wx-' + i); if (el) el.innerHTML = wxHtml(r, w); })
      .catch(() => { const el = $('#wx-' + i); if (el) el.innerHTML = '<p class="note">No se pudo consultar la previsión. Revisa la conexión.</p>'; }));
    alertsHtml().then(h => { const b = $('#alerts-box'); if (b) b.innerHTML = h; });
    paint();
    const fo = $('#lv-follow'); if (fo) fo.onchange = e => { mv.follow = e.target.checked; };
    $('#trip-date').onchange = async e => { L.trip = e.target.value || null; await db.set('trip', L.trip).catch(() => {}); render(); sync().catch(() => {}); };
  }
  return {
    async view(keepMap) {
      if (L.trip === null) L.trip = (await db.get('trip').catch(() => null)) || undefined;
      render();
      if (!keepMap && L.watch == null) { const r = [...S.A.resorts.values()].sort((a, b) => b.days.length - a.days.length)[0]; r ? mv.showResort(r.days, { mode: 'live' }) : mv.showGlobe([]); }
    },
    alertsAct, sync: () => sync().catch(() => {}),
    start, stop, leave() { if (L.watch != null) stop(); }, active: () => L.watch != null,
  };
}
