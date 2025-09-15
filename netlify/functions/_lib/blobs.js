
// Blobs helper using ONLY Netlify Functions' `context.blobs` binding.
// Adds a guard that throws a clear error if the binding isn't present.

function ensureContextBlobs(context) {
  if (!context || !context.blobs) {
    const hint = `Missing Netlify 'blobs' binding on function context.
To fix, add bindings in netlify.toml:
  [[functions.blobs]]
    function = "odds-refresh"
    name = "nfl-td"
  [[functions.blobs]]
    function = "nfl-predictions-generate"
    name = "nfl-td"`;
    const err = new Error(hint);
    err.code = "NETLIFY_BLOBS_BINDING_MISSING";
    throw err;
  }
  return context.blobs;
}

export async function blobsGetJSON(context, key, defaultValue = null) {
  const blobs = ensureContextBlobs(context);
  try {
    const data = await blobs.getJSON(key);
    return (data === undefined || data === null) ? defaultValue : data;
  } catch (e) {
    try {
      const res = await blobs.get(key);
      if (!res) return defaultValue;
      const txt = await res.text();
      return JSON.parse(txt);
    } catch {
      return defaultValue;
    }
  }
}

export async function blobsPutJSON(context, key, obj) {
  const blobs = ensureContextBlobs(context);
  const body = JSON.stringify(obj);
  try {
    await blobs.setJSON(key, obj);
  } catch (e) {
    await blobs.set(key, body, { contentType: 'application/json' });
  }
  const bytes = new TextEncoder().encode(body).length;
  return { key, bytes };
}

export async function blobsGetResponse(context, key) {
  const blobs = ensureContextBlobs(context);
  try {
    const res = await blobs.get(key);
    return res || null;
  } catch {
    return null;
  }
}
