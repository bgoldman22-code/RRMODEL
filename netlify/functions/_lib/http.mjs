export function jsonResponse(status, obj) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

export async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: "follow" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} :: ${body?.slice?.(0,200)}`);
  }
  return res.json();
}
