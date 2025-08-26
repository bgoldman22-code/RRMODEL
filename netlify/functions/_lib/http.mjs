// Simple fetch wrapper that works on Netlify (Node 18+ has global fetch)
export async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: 'follow' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url} :: ${txt?.slice(0,200)}`);
  }
  return res.json();
}

export function ok(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' }});
}

export function bad(err, extra = {}) {
  const body = { ok:false, error: String(err instanceof Error ? err.stack || err.message : err), ...extra };
  return new Response(JSON.stringify(body), { status: 500, headers: { 'content-type': 'application/json' }});
}