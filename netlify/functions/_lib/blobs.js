// Blobs helper using ONLY Netlify Functions' `context.blobs` binding.
// Do NOT import from '@netlify/blobs'. Always pass `context` into these helpers.

export async function blobsGetJSON(context, key, defaultValue = null) {
  try {
    const data = await context.blobs.getJSON(key);
    return (data === undefined || data === null) ? defaultValue : data;
  } catch (e) {
    try {
      const res = await context.blobs.get(key);
      if (!res) return defaultValue;
      const txt = await res.text();
      return JSON.parse(txt);
    } catch {
      return defaultValue;
    }
  }
}

export async function blobsPutJSON(context, key, obj) {
  const body = JSON.stringify(obj);
  try {
    await context.blobs.setJSON(key, obj);
  } catch (e) {
    await context.blobs.set(key, body, { contentType: 'application/json' });
  }
  const bytes = new TextEncoder().encode(body).length;
  return { key, bytes };
}

export async function blobsGetResponse(context, key) {
  try {
    const res = await context.blobs.get(key);
    return res || null;
  } catch {
    return null;
  }
}
