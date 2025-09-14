// netlify/functions/_lib/blobs-helper.mjs
// Minimal helper wrapper around Netlify Blobs that works across @netlify/blobs versions.
export async function openStore(storeNameEnvVar, fallbackName = "default") {
  const storeName = process.env[storeNameEnvVar] || process.env["BLOBS_STORE"] || fallbackName;
  // Use getStore when available; otherwise no-op shim with in-memory object
  let getStore = null;
  try {
    ({ getStore } = await import('@netlify/blobs'));
  } catch (e) {
    // ignore
  }
  if (getStore) {
    return getStore({ name: storeName });
  }
  const mem = new Map();
  return {
    async get(key) { return mem.get(key) || null; },
    async setJSON(key, val) { mem.set(key, JSON.stringify(val)); },
    async getJSON(key) {
      const v = mem.get(key);
      try { return v ? JSON.parse(v) : null; } catch { return null; }
    }
  };
}
