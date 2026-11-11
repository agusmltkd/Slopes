// Vídeo resumen de temporada: animación en canvas grabada con MediaRecorder (1080×1920, vertical).
import { aggregate, dayStats, KMH, localDate } from './stats.js';

const W = 1080, H = 1920, FPS = 30;
const C = { bg: '#0F2740', bg2: '#16324F', snow: '#F2F6F9', mute: '#A9BDD0', dim: '#5E7790', red: '#FF5A6E', red2: '#D7263D', sun: '#F2B705' };
const ease = x => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const clamp01 = x => Math.max(0, Math.min(1, x));
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif', TEXT = 'Barlow, system-ui, sans-serif';

function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

/** Prepara las escenas a partir de los días. */
function build(days, title, f, trip) {
  const A = aggregate(days), resorts = [...A.resorts.values()].sort((a, b) => b.days.length - a.days.length).slice(0, 3);
  const big = [...days].sort((a, b) => b.vertical - a.vertical)[0];
  const rec = A.rec.top, fastest = rec?.extra;
  // perfil de altitud del día con más desnivel: la «cordillera» de la portada
  const prof = []; { const T = big.track, step = Math.max(1, Math.floor(T.t.length / 400)); for (let i = 0; i < T.t.length; i += step) prof.push([T.t[i], T.alt[i]]); }
  // trazas por estación, ya proyectadas a una caja de 900×900
  const traces = resorts.map(r => {
    let a0 = 90, a1 = -90, o0 = 180, o1 = -180; const lines = [];
    for (const d of r.days) { const T = d.track; for (const a of d.actions) if (a.type === 'run') {
      const pts = []; for (let i = a.i0; i <= a.i1; i += 2) { pts.push([T.lat[i], T.lon[i]]); a0 = Math.min(a0, T.lat[i]); a1 = Math.max(a1, T.lat[i]); o0 = Math.min(o0, T.lon[i]); o1 = Math.max(o1, T.lon[i]); }
      lines.push({ pts, fast: fastest && a === fastest });
    } }
    const kx = Math.cos((a0 + a1) / 2 * Math.PI / 180), box = 880, sc = Math.min(box / ((o1 - o0) * kx || 1), box / ((a1 - a0) || 1));
    const ox = (W - (o1 - o0) * kx * sc) / 2, oy = 560 + (box - (a1 - a0) * sc) / 2;
    lines.forEach(l => { l.xy = l.pts.map(([la, lo]) => [ox + (lo - o0) * kx * sc, oy + (a1 - la) * sc]); });
    return { r, lines };
  });
  const tripDays = trip ? Math.round((new Date(trip + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5) : null;
  const scenes = [
    { dur: 3.4, draw: (x, t) => cover(x, t, title, prof) },
    { dur: 4.2, draw: (x, t) => totals(x, t, A, f) },
    ...traces.map(tr => ({ dur: 3.6, draw: (x, t) => resort(x, t, tr, f) })),
    ...(rec ? [{ dur: 3.2, draw: (x, t) => speed(x, t, rec, f) }] : []),
    { dur: 3.2, draw: (x, t) => giraldas(x, t, A.vert, f) },
    { dur: 3, draw: (x, t) => outro(x, t, tripDays) },
  ];
  let acc = 0; for (const s of scenes) { s.t0 = acc; acc += s.dur; }
  return { scenes, total: acc };
}

/* ---------- escenas ---------- */
function bg(x) { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.bg); g.addColorStop(1, C.bg2); x.fillStyle = g; x.fillRect(0, 0, W, H); }
function text(x, s, X, Y, { font = `700 120px ${COND}`, color = C.snow, align = 'left', alpha = 1, max } = {}) {
  x.save(); x.globalAlpha *= alpha; x.font = font; x.fillStyle = color; x.textAlign = align; x.fillText(s, X, Y, max); x.restore();
}
function rise(t, at, dur = 0.5) { const k = ease((t - at) / dur); return { a: k, dy: (1 - k) * 40 }; }

function cover(x, t, title, prof) {
  const k = ease(t / 2.4), t0 = prof[0][0], t1 = prof.at(-1)[0];
  let lo = Infinity, hi = -Infinity; prof.forEach(p => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
  const X = tt => 60 + (W - 120) * (tt - t0) / (t1 - t0), Y = a => 1500 - 420 * (a - lo) / (hi - lo || 1);
  const n = Math.max(2, Math.floor(prof.length * k));
  x.beginPath(); x.moveTo(X(prof[0][0]), H); for (let i = 0; i < n; i++) x.lineTo(X(prof[i][0]), Y(prof[i][1])); x.lineTo(X(prof[n - 1][0]), H); x.closePath();
  x.fillStyle = 'rgba(242,246,249,.08)'; x.fill();
  x.beginPath(); for (let i = 0; i < n; i++) i ? x.lineTo(X(prof[i][0]), Y(prof[i][1])) : x.moveTo(X(prof[i][0]), Y(prof[i][1]));
  x.strokeStyle = C.red; x.lineWidth = 7; x.lineJoin = x.lineCap = 'round'; x.stroke();
  const [l1, ...rest] = title.split(' '), r1 = rise(t, 0.2), r2 = rise(t, 0.45);
  text(x, l1, 80, 470 + r1.dy, { font: `600 84px ${COND}`, color: C.mute, alpha: r1.a });
  text(x, rest.join(' '), 76, 640 + r2.dy, { font: `700 190px ${COND}`, alpha: r2.a, max: W - 150 });
}
function totals(x, t, A, f) {
  const rows = [[A.days, A.days === 1 ? 'día en la nieve' : 'días en la nieve', v => Math.round(v)], [A.dist / 1000, 'kilómetros esquiados', v => v.toFixed(1).replace('.', ',')], [A.vert, 'metros de desnivel', v => f.int(v)], [A.runs, 'bajadas', v => Math.round(v)]];
  rows.forEach(([v, l, fm], i) => {
    const at = 0.2 + i * 0.55, r = rise(t, at), cnt = ease((t - at) / 1.3), y = 470 + i * 360;
    text(x, fm(v * cnt), 80, y + r.dy, { font: `700 220px ${COND}`, color: i === 2 ? C.red : C.snow, alpha: r.a });
    text(x, l, 86, y + 70 + r.dy, { font: `500 52px ${TEXT}`, color: C.mute, alpha: r.a });
  });
}
function resort(x, t, tr, f) {
  const r = tr.r, k = clamp01((t - 0.3) / 2.4), r1 = rise(t, 0.05);
  text(x, r.name, 80, 300 + r1.dy, { font: `700 140px ${COND}`, alpha: r1.a, max: W - 160 });
  text(x, `${r.days.length} ${r.days.length === 1 ? 'día' : 'días'}, ${f.km(r.dist)} km, ${f.int(r.vert)} m`, 84, 390 + r1.dy, { font: `500 50px ${TEXT}`, color: C.mute, alpha: r1.a });
  x.lineCap = x.lineJoin = 'round';
  for (const l of tr.lines) {
    const n = Math.max(1, Math.floor(l.xy.length * ease(k)));
    x.beginPath(); for (let i = 0; i < n; i++) i ? x.lineTo(...l.xy[i]) : x.moveTo(...l.xy[i]);
    x.strokeStyle = l.fast ? C.red : 'rgba(242,246,249,.62)'; x.lineWidth = l.fast ? 9 : 4; x.stroke();
  }
  text(x, 'En rojo, tu bajada más rápida', 84, 1700, { font: `500 40px ${TEXT}`, color: C.dim, alpha: tr.lines.some(l => l.fast) ? rise(t, 2.2).a : 0 });
}
function speed(x, t, rec, f) {
  const v = rec.v * KMH, k = ease((t - 0.3) / 1.8), cx = W / 2, cy = 1050, R = 380;
  text(x, 'Lo más rápido', 80, 330, { font: `600 84px ${COND}`, color: C.mute, alpha: rise(t, 0).a });
  x.lineCap = 'round'; x.lineWidth = 44;
  x.beginPath(); x.arc(cx, cy, R, Math.PI * 0.8, Math.PI * 2.2); x.strokeStyle = 'rgba(242,246,249,.12)'; x.stroke();
  const frac = Math.min(1, v / 100) * k, g = x.createLinearGradient(cx - R, 0, cx + R, 0); g.addColorStop(0, '#2F6FE4'); g.addColorStop(0.5, C.sun); g.addColorStop(1, C.red2);
  x.beginPath(); x.arc(cx, cy, R, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * frac)); x.strokeStyle = g; x.stroke();
  text(x, (v * k).toFixed(1).replace('.', ','), cx, cy + 60, { font: `700 250px ${COND}`, align: 'center' });
  text(x, 'km/h', cx, cy + 140, { font: `500 56px ${TEXT}`, color: C.mute, align: 'center' });
  const r2 = rise(t, 1.6);
  text(x, `${rec.d.resort}, ${f.dateShort(rec.d)}${rec.extra ? ', bajada ' + rec.extra.n : ''}`, cx, 1620 + r2.dy, { font: `500 46px ${TEXT}`, color: C.mute, align: 'center', alpha: r2.a, max: W - 120 });
}
function giraldas(x, t, vert, f) {
  const n = vert / 104, shown = Math.min(200, Math.round(n)), k = ease((t - 0.2) / 2), r1 = rise(t, 0);
  text(x, 'Has bajado', 80, 330 + r1.dy, { font: `600 84px ${COND}`, color: C.mute, alpha: r1.a });
  text(x, `${Math.round(n * k)} Giraldas`, 76, 500 + r1.dy, { font: `700 170px ${COND}`, alpha: r1.a, max: W - 150 });
  const cols = 20, cw = (W - 160) / cols, ch = cw * 1.9;
  for (let i = 0; i < Math.floor(shown * k); i++) {
    const c = i % cols, r = Math.floor(i / cols), X = 80 + c * cw, Y = 1640 - (r + 1) * (ch + 10);
    x.fillStyle = i % 10 === 9 ? C.red : 'rgba(242,246,249,.75)';
    x.fillRect(X + cw * 0.3, Y + ch * 0.25, cw * 0.4, ch * 0.75); x.fillRect(X + cw * 0.38, Y + ch * 0.06, cw * 0.24, ch * 0.2); x.fillRect(X + cw * 0.46, Y, cw * 0.08, ch * 0.08);
  }
  text(x, `${f.int(vert)} m cuesta abajo${n > shown ? ' (dibujadas las primeras 200)' : ''}`, 84, 1730, { font: `500 46px ${TEXT}`, color: C.mute, alpha: rise(t, 1.8).a });
}
function outro(x, t, tripDays) {
  const r1 = rise(t, 0.1), r2 = rise(t, 0.6);
  text(x, 'Nos vemos', 80, 820 + r1.dy, { font: `700 190px ${COND}`, alpha: r1.a });
  text(x, 'en la nieve', 80, 1000 + r1.dy, { font: `700 190px ${COND}`, color: C.red, alpha: r1.a });
  if (tripDays > 0) text(x, tripDays === 1 ? 'Falta 1 día para volver' : `Faltan ${tripDays} días para volver`, 84, 1120 + r2.dy, { font: `500 56px ${TEXT}`, color: C.mute, alpha: r2.a });
  text(x, 'Traza', W - 80, H - 110, { font: `600 52px ${COND}`, color: C.dim, align: 'right', alpha: r2.a });
}

/* ---------- grabación ---------- */
export async function makeVideo(days, title, { f, db, toast }) {
  const mime = pickMime();
  if (mime === null) return toast('Este navegador no puede grabar vídeo. Prueba con una versión más reciente.');
  await document.fonts.ready;
  const trip = await db.get('trip').catch(() => null);
  const { scenes, total } = build(days, title, f, trip);
  const ov = document.createElement('div'); ov.className = 'vidmodal';
  ov.innerHTML = `<div class="vm-card"><canvas width="${W}" height="${H}"></canvas><div class="vm-bar"><i></i></div><p>Grabando el vídeo… deja esta pantalla abierta.</p>
    <div class="actions" hidden><button class="btn primary" data-v="share">Compartir</button><button class="btn" data-v="save">Descargar</button><button class="btn" data-v="close">Cerrar</button></div></div>`;
  document.body.appendChild(ov);
  const cv = ov.querySelector('canvas'), x = cv.getContext('2d'), bar = ov.querySelector('.vm-bar i');
  const draw = t => {
    bg(x);
    const i = scenes.findIndex(s => t < s.t0 + s.dur), s = scenes[i < 0 ? scenes.length - 1 : i], lt = t - s.t0;
    x.save(); x.globalAlpha = Math.min(clamp01(lt / 0.35), i === scenes.length - 1 ? 1 : clamp01((s.dur - lt) / 0.3)); s.draw(x, lt); x.restore();
  };
  draw(0);
  const stream = cv.captureStream(FPS), rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8e6 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(res => rec.onstop = res);
  let cancelled = false;
  ov.addEventListener('click', e => { if (e.target.dataset.v === 'close') { cancelled = true; if (rec.state !== 'inactive') rec.stop(); ov.remove(); } });
  rec.start(250);
  const t0 = performance.now();
  await new Promise(res => { const step = () => { if (cancelled) return res(); const t = (performance.now() - t0) / 1000; draw(Math.min(t, total)); bar.style.width = (100 * Math.min(1, t / total)) + '%'; t < total + 0.3 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  if (cancelled) return;
  rec.stop(); await done;
  const type = rec.mimeType || mime || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type }), name = `traza-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`, url = URL.createObjectURL(blob);
  const v = document.createElement('video'); v.src = url; v.controls = v.loop = v.playsInline = true; v.muted = true; v.autoplay = true;
  cv.replaceWith(v); ov.querySelector('.vm-bar').remove(); ov.querySelector('p').textContent = `Listo: ${Math.round(total)} segundos.`; ov.querySelector('.actions').hidden = false;
  window.__trazaVideo = { size: blob.size, type };
  ov.addEventListener('click', async e => {
    const a = e.target.dataset.v; if (!a) return;
    if (a === 'close') { URL.revokeObjectURL(url); ov.remove(); }
    if (a === 'save' || (a === 'share' && !navigator.canShare?.({ files: [new File([blob], name, { type })] }))) { const l = Object.assign(document.createElement('a'), { href: url, download: name }); l.click(); if (a === 'share') toast('Este navegador no deja compartir vídeos; se ha descargado.'); }
    else if (a === 'share') await navigator.share({ files: [new File([blob], name, { type })] }).catch(() => {});
  });
}
