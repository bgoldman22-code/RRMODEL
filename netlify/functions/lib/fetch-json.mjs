// netlify/functions/lib/fetch-json.mjs
export async function fetchJSON(url, { headers = {}, timeoutMs = 12000 } = {}) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return { ok:false, error:'json-parse', raw: txt };
    }
  } catch (e) {
    return { ok:false, error: String(e && e.message || e) };
  } finally {
    clearTimeout(to);
  }
}
