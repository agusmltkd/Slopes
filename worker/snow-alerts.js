// Traza · avisos de nieve. Worker de Cloudflare con un cron diario que mira la previsión
// de tus estaciones en Open-Meteo y te escribe por Telegram cuando va a nevar fuerte
// o cuando se acerca la fecha del viaje.
//
// Secretos: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, TRAZA_KEY.  KV: TRAZA.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dayName = iso => DAYS[new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' + Number(iso.slice(8, 10));
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export async function forecast(r) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&elevation=${Math.round(r.peak)}` +
    '&daily=snowfall_sum,temperature_2m_min,temperature_2m_max,wind_gusts_10m_max&timezone=Europe%2FMadrid&forecast_days=7';
  const res = await fetch(u); if (!res.ok) throw new Error('Open-Meteo ' + res.status);
  return (await res.json()).daily;
}
export async function send(env, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error('Telegram ' + res.status + ' ' + await res.text());
}
const line = (d, i) => `${dayName(d.time[i])}: ${Math.round(d.snowfall_sum[i] || 0)} cm, ${Math.round(d.temperature_2m_min[i])}°/${Math.round(d.temperature_2m_max[i])}°`;

/** Lo que hace el cron cada mañana. Devuelve los mensajes enviados (útil para probar). */
export async function run(env, now = new Date()) {
  const cfg = JSON.parse(await env.TRAZA.get('config') || 'null'); if (!cfg?.resorts?.length) return [];
  const sent = [], today = now.toISOString().slice(0, 10), th = cfg.threshold || 20;
  const fc = {};
  for (const r of cfg.resorts) { try { fc[r.key] = await forecast(r); } catch { /* una estación que falle no para las demás */ } }

  // 1. Nevada fuerte en los próximos 3 días
  for (const r of cfg.resorts) {
    const d = fc[r.key]; if (!d) continue;
    const next = [0, 1, 2].reduce((s, i) => s + (d.snowfall_sum[i] || 0), 0);
    if (next < th) continue;
    const key = 'sent:snow:' + r.key, last = JSON.parse(await env.TRAZA.get(key) || 'null');
    const recent = last && (Date.parse(today) - Date.parse(last.date)) / 864e5 < 3;
    if (recent && next < last.cm * 1.5) continue;             // misma nevada ya avisada, salvo que crezca mucho
    const best = [0, 1, 2].reduce((b, i) => (d.snowfall_sum[i] || 0) > (d.snowfall_sum[b] || 0) ? i : b, 0);
    const msg = `❄️ <b>${esc(r.name)}</b>: ${Math.round(next)} cm de nieve en los próximos 3 días.\n` +
      `Lo más fuerte, el ${dayName(d.time[best])} con ${Math.round(d.snowfall_sum[best])} cm (previsión a ${fmt(r.peak)} m).\n\n` + [0, 1, 2].map(i => line(d, i)).join('\n');
    await send(env, msg); sent.push(msg);
    await env.TRAZA.put(key, JSON.stringify({ date: today, cm: next }));
  }

  // 2. Cuenta atrás del viaje: a 7, 3 y 1 día
  if (cfg.trip) {
    const left = Math.round((Date.parse(cfg.trip) - Date.parse(today)) / 864e5);
    const key = `sent:trip:${cfg.trip}:${left}`;
    if ([7, 3, 1].includes(left) && !await env.TRAZA.get(key)) {
      const parts = cfg.resorts.filter(r => fc[r.key]).slice(0, 3).map(r => {
        const d = fc[r.key], week = d.snowfall_sum.reduce((s, v) => s + (v || 0), 0);
        return `<b>${esc(r.name)}</b>: ${Math.round(week)} cm previstos en 7 días\n` + [0, 1, 2].map(i => line(d, i)).join('\n');
      });
      const msg = `🎿 ${left === 1 ? 'Mañana' : `Faltan ${left} días`} para volver a la nieve.\n\n` + parts.join('\n\n');
      await send(env, msg); sent.push(msg);
      await env.TRAZA.put(key, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    }
  }
  return sent;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/') return json({ ok: true, service: 'Traza · avisos de nieve' });
    if ((req.headers.get('Authorization') || '') !== 'Bearer ' + env.TRAZA_KEY) return json({ ok: false, error: 'Clave incorrecta' }, 401);
    if (url.pathname === '/config' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !Array.isArray(b.resorts)) return json({ ok: false, error: 'Faltan las estaciones' }, 400);
      const resorts = b.resorts.slice(0, 20).map(r => ({ key: String(r.key).slice(0, 80), name: String(r.name).slice(0, 80), lat: +(+r.lat).toFixed(4), lon: +(+r.lon).toFixed(4), peak: Math.round(+r.peak || 2000) }))
        .filter(r => isFinite(r.lat) && isFinite(r.lon));
      const cfg = { resorts, trip: /^\d{4}-\d\d-\d\d$/.test(b.trip || '') ? b.trip : null, threshold: Math.max(5, Math.min(100, +b.threshold || 20)), at: new Date().toISOString() };
      await env.TRAZA.put('config', JSON.stringify(cfg));
      return json({ ok: true, resorts: resorts.length });
    }
    if (url.pathname === '/test' && req.method === 'POST') {
      const cfg = JSON.parse(await env.TRAZA.get('config') || 'null'), r = cfg?.resorts?.[0];
      try {
        const d = r ? await forecast(r) : null;
        await send(env, `✅ Traza conectada. Te avisaré cuando se esperen ${cfg?.threshold || 20} cm o más en ${cfg?.resorts?.length || 0} ${cfg?.resorts?.length === 1 ? 'estación' : 'estaciones'}.` +
          (d ? `\n\nAhora en <b>${esc(r.name)}</b>:\n` + [0, 1, 2].map(i => line(d, i)).join('\n') : ''));
        return json({ ok: true });
      } catch (e) { return json({ ok: false, error: e.message }, 502); }
    }
    return json({ ok: false, error: 'No existe' }, 404);
  },
  async scheduled(_evt, env, ctx) { ctx.waitUntil(run(env)); },
};
