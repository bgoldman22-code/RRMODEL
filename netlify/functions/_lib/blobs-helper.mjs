// netlify/functions/_lib/blobs-helper.mjs
// ESM helper that opens a Netlify Blobs store.
// - First tries implicit Netlify runtime via getStore().
// - If missing env, falls back to createClient(siteID, token) using env vars.
// Works whether bundler/tree-shaker sees createClient or not (dynamic import).

export async function openStore(name) {
  const blobs = await import('@netlify/blobs');
  const getStore = blobs.getStore;
  /** @type any */
  let store;
  try {
    store = await getStore({ name });
    return wrap(store);
  } catch (err) {
    const msg = (err && (err.name || err.message)) || String(err);
    // Fallback only for missing-env error
    if (msg && String(msg).includes('MissingBlobsEnvironmentError')) {
      const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
      const token  = process.env.BLOBS_TOKEN   || process.env.NETLIFY_API_TOKEN;
      if (!siteID || !token) {
        console.warn('[blobs-helper] Missing env for manual client. Set BLOBS_SITE_ID and BLOBS_TOKEN (or NETLIFY_SITE_ID and NETLIFY_API_TOKEN).');
        throw err;
      }
      const createClient = blobs.createClient;
      if (!createClient) {
        throw new Error('[blobs-helper] @netlify/blobs.createClient is not available. Please update @netlify/blobs to v5+ or run in Netlify runtime.');
      }
      const client = createClient({ siteID, token });
      store = client.getStore({ name });
      return wrap(store);
    }
    throw err;
  }
}

function wrap(store) {
  return {
    async getJSON(key) {
      const val = await store.get(key, { type: 'json' });
      return val ?? null;
    },
    async setJSON(key, value) {
      await store.setJSON(key, value);
    },
  };
}
