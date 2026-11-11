// Historia para Instagram: tu foto de fondo con la traza y los datos encima (1080×1920),
// o solo la pegatina con fondo transparente para ponerla sobre cualquier foto.
const W = 1080, H = 1920;
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif', TEXT = 'Barlow, system-ui, sans-serif';
const STYLES = { ruta: 'Ruta y datos', datos: 'Solo datos', pegatina: 'Pegatina' };

/**
 * data: { title, sub, file, stats: [{key, v, l}], lines: [{pts:[[lat,lon]], hot}], defaults: [keys] }
 */
export function openStory(data, { toast }) {
  const st = { style: 'ruta', pick: data.defaults.slice(0, 3), img: null, zoom: 1, ox: 0, oy: 0, shade: true };
  const ov = document.createElement('div'); ov.className = 'story';
  ov.innerHTML = `<div class="st-card" role="dialog" aria-label="Crear historia">
    <div class="st-prev"><canvas width="${W}" height="${H}"></canvas><p class="st-hint">Arrastra la foto para encuadrarla</p></div>
    <div class="st-ctl">
      <label class="btn primary st-photo">Elegir foto<input type="file" accept="image/*" hidden></label>
      <div class="seg st-style" role="group" aria-label="Estilo">${Object.entries(STYLES).map(([k, v]) => `<button data-style="${k}" class="${k === 'ruta' ? 'on' : ''}">${v}</button>`).join('')}</div>
      <label class="st-zoom">Zoom de la foto <input type="range" min="100" max="300" value="100"></label>
      <label class="st-shade"><input type="checkbox" checked> Oscurecer la parte de abajo para que se lean los datos</label>
      <p class="st-lbl">Datos (elige hasta 3)</p>
      <div class="st-chips">${data.stats.map(s => `<button data-stat="${s.key}" class="${st.pick.includes(s.key) ? 'on' : ''}">${s.l}</button>`).join('')}</div>
      <div class="actions"><button class="btn primary" data-s="share">Compartir</button><button class="btn" data-s="copy" hidden>Copiar pegatina</button><button class="btn" data-s="save">Descargar</button><button class="btn" data-s="close">Cerrar</button></div>
      <p class="note">La foto no sale de tu móvil. En Compartir, elige Instagram y después «Historia».</p>
    </div></div>`;
  document.body.appendChild(ov);
  const $ = s => ov.querySelector(s), cv = $('canvas'), x = cv.getContext('2d');

  /* ----- dibujo ----- */
  const shadow = (on) => { x.shadowColor = on ? 'rgba(0,0,0,.45)' : 'transparent'; x.shadowBlur = on ? 18 : 0; x.shadowOffsetY = on ? 2 : 0; };
  function route(box) {
    let a0 = 90, a1 = -90, o0 = 180, o1 = -180;
    for (const l of data.lines) for (const [la, lo] of l.pts) { a0 = Math.min(a0, la); a1 = Math.max(a1, la); o0 = Math.min(o0, lo); o1 = Math.max(o1, lo); }
    const kx = Math.cos((a0 + a1) / 2 * Math.PI / 180), sc = Math.min(box.w / ((o1 - o0) * kx || 1), box.h / ((a1 - a0) || 1));
    const ox = box.x + (box.w - (o1 - o0) * kx * sc) / 2, oy = box.y + (box.h - (a1 - a0) * sc) / 2;
    x.lineCap = x.lineJoin = 'round';
    for (const hot of [false, true]) for (const l of data.lines.filter(l => !!l.hot === hot)) {
      x.beginPath(); l.pts.forEach(([la, lo], i) => { const px = ox + (lo - o0) * kx * sc, py = oy + (a1 - la) * sc; i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.strokeStyle = hot ? '#FF4D63' : '#FFFFFF'; x.lineWidth = hot ? 11 : 7; x.stroke();
    }
  }
  function draw(forExport) {
    x.clearRect(0, 0, W, H); shadow(false);
    const sticker = st.style === 'pegatina';
    if (!sticker) {
      if (st.img) {
        const im = st.img, s = Math.max(W / im.width, H / im.height) * st.zoom, w = im.width * s, h = im.height * s;
        st.ox = Math.min(0, Math.max(W - w, st.ox)); st.oy = Math.min(0, Math.max(H - h, st.oy));
        x.drawImage(im, st.ox, st.oy, w, h);
      } else { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16324F'); g.addColorStop(1, '#0F2740'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
      if (st.shade) { const g = x.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)'); x.fillStyle = g; x.fillRect(0, H * 0.45, W, H * 0.55); }
    }
    shadow(true);
    const stats = st.pick.map(k => data.stats.find(s => s.key === k)).filter(Boolean);
    // cabecera
    x.fillStyle = '#FFFFFF'; x.textAlign = 'left';
    x.font = `700 92px ${COND}`; x.fillText(data.title, 80, 330, W - 160);
    x.font = `500 42px ${TEXT}`; x.globalAlpha = 0.92; x.fillText(data.sub, 84, 392, W - 160); x.globalAlpha = 1;
    if (st.style !== 'datos') route({ x: 140, y: 470, w: W - 280, h: 760 });
    if (st.style === 'datos') {
      stats.forEach((s, i) => { const y = 1180 + i * 190; x.font = `500 40px ${TEXT}`; x.fillText(s.l, 84, y - 112); x.font = `700 132px ${COND}`; x.fillText(s.v, 78, y + 10); });
    } else {
      const cw = (W - 160) / Math.max(1, stats.length);
      stats.forEach((s, i) => { const cx = 80 + i * cw; x.font = `500 36px ${TEXT}`; x.fillText(s.l, cx, 1430, cw - 20); x.font = `700 112px ${COND}`; x.fillText(s.v, cx - 4, 1540, cw - 16); });
    }
    x.font = `600 40px ${COND}`; x.textAlign = 'right'; x.globalAlpha = 0.85; x.fillText('Traza', W - 80, 1660); x.globalAlpha = 1; x.textAlign = 'left';
    shadow(false);
    ov.classList.toggle('sticker', sticker);
    $('.st-hint').hidden = !st.img || sticker; $('.st-zoom').hidden = !st.img || sticker; $('.st-shade').hidden = sticker;
    $('[data-s=copy]').hidden = !(sticker && window.ClipboardItem && navigator.clipboard?.write);
  }
  draw();

  /* ----- controles ----- */
  $('.st-photo input').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const im = new Image(); im.src = URL.createObjectURL(file);
    try { await im.decode(); } catch { return toast('No se pudo abrir esa foto. Prueba con otra (JPG o PNG).'); }
    st.img = im; st.zoom = 1; st.ox = -1e9; st.oy = -1e9;
    const s = Math.max(W / im.width, H / im.height); st.ox = (W - im.width * s) / 2; st.oy = (H - im.height * s) / 2;
    $('.st-zoom input').value = 100; if (st.style === 'pegatina') st.style = 'ruta';
    ov.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === st.style)); draw();
  };
  $('.st-zoom input').oninput = e => {
    const old = st.zoom; st.zoom = +e.target.value / 100;
    const k = st.zoom / old; st.ox = W / 2 - (W / 2 - st.ox) * k; st.oy = H / 2 - (H / 2 - st.oy) * k; draw();
  };
  $('.st-shade input').onchange = e => { st.shade = e.target.checked; draw(); };
  let drag = null;
  cv.addEventListener('pointerdown', e => { if (!st.img || st.style === 'pegatina') return; cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy, k: W / cv.clientWidth }; });
  cv.addEventListener('pointermove', e => { if (!drag) return; st.ox = drag.ox + (e.clientX - drag.x) * drag.k; st.oy = drag.oy + (e.clientY - drag.y) * drag.k; draw(); });
  cv.addEventListener('pointerup', () => { drag = null; }); cv.addEventListener('pointercancel', () => { drag = null; });

  const blob = () => new Promise(res => { draw(true); cv.toBlob(res, 'image/png'); });
  const name = () => `traza-historia-${data.file}.png`;
  ov.addEventListener('click', async e => {
    const sb = e.target.closest('[data-style]'), ch = e.target.closest('[data-stat]'), a = e.target.closest('[data-s]')?.dataset.s;
    if (sb) { st.style = sb.dataset.style; ov.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b === sb)); draw(); }
    if (ch) {
      const k = ch.dataset.stat;
      if (st.pick.includes(k)) st.pick = st.pick.filter(x => x !== k); else { if (st.pick.length >= 3) st.pick.shift(); st.pick.push(k); }
      ov.querySelectorAll('[data-stat]').forEach(b => b.classList.toggle('on', st.pick.includes(b.dataset.stat))); draw();
    }
    if (a === 'close' || e.target === ov) ov.remove();
    if (a === 'save') { const b = await blob(), l = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: name() }); l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 5000); toast('Imagen descargada'); }
    if (a === 'share') {
      const b = await blob(), file = new File([b], name(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
      else { const l = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: name() }); l.click(); toast('Este navegador no deja compartir imágenes; se ha descargado.'); }
    }
    if (a === 'copy') {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]); toast('Pegatina copiada. En Instagram, crea la historia y pega.'); }
      catch { toast('No se pudo copiar. Usa Descargar.'); }
    }
  });
  window.__trazaStory = { st, draw, cv };
}
