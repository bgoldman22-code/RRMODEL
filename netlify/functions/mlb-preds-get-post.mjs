// netlify/functions/mlb-preds-get-post.mjs
import { applyExtensions } from './_lib/extensions-apply.mjs';
export const handler = async (event) => {
  try {
    const urlObj = new URL(event.rawUrl || `https://example.com${event.path}${event.queryString || ''}`);
    const date = urlObj.searchParams.get('date');
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
    if (!base) {
      return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Missing Netlify URL (URL/DEPLOY_PRIME_URL)'}) };
    }
    const baseUrl = `${base}/.netlify/functions/mlb-preds-get${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    const res = await fetch(baseUrl);
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: 502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'mlb-preds-get failed', detail: txt}) };
    }
    const payload = await res.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const adjusted = await applyExtensions(items, { date });
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, date: payload.date || date || null, items: adjusted }) };
  } catch (e) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e?.message || e) }) };
  }
};
