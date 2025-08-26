// netlify/functions/_lib/http.mjs
export async function fetchJSON(url, { headers = {}, timeoutMs = 12000, retries = 1, method = "GET", body } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} for ${url} :: ${txt.slice(0,200)}`);
    }
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      return await fetchJSON(url, { headers, timeoutMs, retries: retries - 1, method, body });
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" }
  });
}

export function getInt(qs, key, def) {
  const v = qs.get(key);
  if (v == null) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
