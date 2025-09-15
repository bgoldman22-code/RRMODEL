// optional Netlify Blobs wrapper — never crash if not configured
export function makeStore(storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td") {
  let blobs = null;
  let clientOpts = null;
  try {
    // Attempt to require @netlify/blobs via a tiny shim so this module can live in ESM.
    const mod = requireShim("@netlify/blobs");
    const { createClient, getStore } = mod || {};
    if (createClient && getStore) {
      clientOpts = {
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_API_TOKEN,
      };
      const client = createClient(clientOpts && (clientOpts.siteID && clientOpts.token) ? clientOpts : undefined);
      const store = getStore({ name: storeName, client });
      blobs = { store, ok: true, managed: !(clientOpts?.siteID && clientOpts?.token) };
    }
  } catch (_e) {
    // fall through to “no blobs” mode
  }
  return {
    name: storeName,
    hasBlobs: Boolean(blobs?.store),
    async get(key) {
      if (!blobs?.store) return null;
      try {
        const res = await blobs.store.get(key, { type: "json" });
        return res ?? null;
      } catch { return null; }
    },
    async set(key, value) {
      if (!blobs?.store) return { ok: false, reason: "no_blobs" };
      try {
        await blobs.store.set(key, JSON.stringify(value), { contentType: "application/json" });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e?.message || e) };
      }
    },
  };
}

// small helper so this file works in ESM-only bundles
function requireShim(pkg) {
  try {
    // eslint-disable-next-line no-eval
    return eval("require")(pkg); // esbuild bundles this, Netlify allows require in functions
  } catch {
    return null;
  }
}
