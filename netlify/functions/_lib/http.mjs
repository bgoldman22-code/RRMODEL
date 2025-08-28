// netlify/functions/_lib/http.mjs
export async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'accept': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

export function ok(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  };
}

export function bad(status = 400, message = 'bad request', extra = {}) {
  return ok({ ok: false, error: message, ...extra }, status);
}
