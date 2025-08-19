// netlify/functions/mlb-learn-batch.mjs
function* dateRange(start, end) {
  const d = new Date(start);
  const e = new Date(end);
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0,10);
  }
}

export async function handler(event, context) {
  try {
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`);
    const start = url.searchParams.get("start");
    const end   = url.searchParams.get("end");
    const run   = url.searchParams.get("run");
    if (!start || !end) return { statusCode: 400, body: JSON.stringify({ ok:false, error:"missing start or end (YYYY-MM-DD)" }) };

    const selfBase = `https://${event.headers.host}`;
    const urls = [];
    for (const d of dateRange(start, end)) urls.push(`${selfBase}/.netlify/functions/mlb-daily-learn?date=${encodeURIComponent(d)}`);
    if (!run) return { statusCode: 200, body: JSON.stringify({ ok:true, preview:true, count:urls.length, urls }) };

    const results = [];
    for (const u of urls) {
      try {
        const rsp = await fetch(u, { headers: { "accept": "application/json" } });
        const body = await rsp.json().catch(() => ({}));
        results.push({ url:u, status:rsp.status, ok: !!body.ok, body });
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        results.push({ url:u, status:0, ok:false, error:String(err) });
      }
    }
    const okCount = results.filter(r => r.ok).length;
    return { statusCode: 200, body: JSON.stringify({ ok:true, start, end, attempted:results.length, succeeded:okCount, results }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
}