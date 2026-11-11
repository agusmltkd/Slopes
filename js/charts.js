// Gráficas pequeñas en HTML/SVG, sin librerías.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Barras verticales. items: [{label, value, color?, tip?, act?}] */
export function bars(items, { unit = '', fmt = v => Math.round(v), height = 120 } = {}) {
  const max = Math.max(1e-9, ...items.map(i => i.value));
  return `<div class="bars" style="height:${height}px">${items.map(i =>
    `<div class="bar"${i.act ? ` data-act="${i.act}" role="button" tabindex="0"` : ''} title="${esc(i.tip || `${i.label}: ${fmt(i.value)} ${unit}`)}">
      <em>${i.value > 0 ? fmt(i.value) : ''}</em><i style="height:${Math.max(i.value > 0 ? 2 : 0, 100 * i.value / max)}%;background:${i.color || 'var(--ink)'}"></i><span>${esc(i.label)}</span></div>`).join('')}</div>`;
}

/** Barra apilada horizontal. parts: [{label, value, color}] */
export function stack(parts, fmt) {
  const tot = parts.reduce((s, p) => s + p.value, 0) || 1;
  return `<div class="stack">${parts.map(p => `<i style="flex:${p.value / tot};background:${p.color}" title="${esc(p.label)}"></i>`).join('')}</div>
  <ul class="legend">${parts.map(p => `<li><i style="background:${p.color}"></i>${esc(p.label)} <b>${fmt(p.value)}</b> <span>${Math.round(100 * p.value / tot)} %</span></li>`).join('')}</ul>`;
}

/** Rosa de orientaciones: 16 sectores, 0 = norte. */
export function rose(bins) {
  const max = Math.max(1e-9, ...bins), c = 100, R = 78;
  const pt = (ang, r) => [c + r * Math.sin(ang), c - r * Math.cos(ang)];
  const wedges = bins.map((v, i) => {
    const r = 10 + (R - 10) * Math.sqrt(v / max), a0 = (i - 0.5) * Math.PI / 8, a1 = (i + 0.5) * Math.PI / 8;
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return `<path d="M${c} ${c}L${x0.toFixed(1)} ${y0.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z" fill="var(--red)" fill-opacity="${(0.35 + 0.65 * v / max).toFixed(2)}"/>`;
  }).join('');
  const lab = [['N', 0], ['E', 90], ['S', 180], ['O', 270]].map(([t, a]) => { const [x, y] = pt(a * Math.PI / 180, 92); return `<text x="${x}" y="${y + 4}" text-anchor="middle">${t}</text>`; }).join('');
  return `<svg class="rose" viewBox="0 0 200 200" role="img" aria-label="Rosa de orientaciones de tus bajadas">
    <circle cx="100" cy="100" r="78" fill="none" stroke="var(--line)"/><circle cx="100" cy="100" r="44" fill="none" stroke="var(--line)"/>${wedges}${lab}</svg>`;
}

/** Líneas acumuladas. series: [{name, color, pts:[y...]}], eje x = nº de día. */
export function lines(series, { fmt = v => v } = {}) {
  const W = 320, H = 130, pl = 6, pr = 44, pt = 8, pb = 18;
  const nx = Math.max(2, ...series.map(s => s.pts.length)), my = Math.max(1, ...series.flatMap(s => s.pts));
  const X = i => pl + (W - pl - pr) * i / (nx - 1 || 1), Y = v => H - pb - (H - pt - pb) * v / my;
  return `<svg class="lines" viewBox="0 0 ${W} ${H}" role="img">
    <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" stroke="var(--line)"/>
    ${series.map(s => { const p = [0, ...s.pts]; const last = p.length - 1;
      return `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${p.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>
      <circle cx="${X(last)}" cy="${Y(p[last])}" r="3.5" fill="${s.color}"/><text x="${X(last) + 6}" y="${Y(p[last]) + 4}" fill="${s.color}">${esc(s.name)}</text>`; }).join('')}
    <text x="${pl}" y="${H - 4}">día 1</text><text x="${W - pr}" y="${H - 4}" text-anchor="end">día ${nx - 1}</text>
    <text x="${pl}" y="${pt + 6}">${esc(fmt(my))}</text></svg>`;
}
