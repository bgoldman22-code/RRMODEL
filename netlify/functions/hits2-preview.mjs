// netlify/functions/hits2-preview.mjs
export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters||{});
    const date = qs.get("date") || new Date().toISOString().slice(0,10);
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host = event.headers['x-forwarded-host'] || event.headers['host'];
    const url = `${proto}://${host}/.netlify/functions/odds-hits2?date=${date}`;
    const r = await fetch(url, { cache:"no-store" });
    const j = await r.json();
    const names = (j.offers||[]).slice(0,12).map(o=>o.player);
    return { statusCode:200, headers:{ "content-type":"application/json" }, body: JSON.stringify({ ok:true, date, offers:j.count||0, sample:names })};
  } catch (e) {
    return { statusCode:200, headers:{ "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(e) })};
  }
};
