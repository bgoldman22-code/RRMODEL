export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const date = qs.get('date') || new Date().toISOString().slice(0,10);
    const base = process.env.URL || '';
    const url = `${base}/.netlify/functions/mlb-metrics?date=${encodeURIComponent(date)}`;
    const res = await fetch(url);
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { payload = { ok: false, error: 'metrics-unavailable', detail: (text || '').slice(0,120) }; }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e?.message || e) })
    };
  }
};
