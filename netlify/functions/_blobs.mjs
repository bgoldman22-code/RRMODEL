import { getEnv } from "./_env.mjs";

export async function getBlobsStoreSafe(name, opts = {}) {
  // honor explicit skip
  if (opts.noblobs) return { store: null, context: { reason: "noblobs flag" } };

  // Try to import client
  let blobs;
  try {
    ({ getStore: blobs } = await import("@netlify/blobs"));
  } catch (e) {
    return { store: null, context: { reason: "blobs package not found" } };
  }

  const env = getEnv();
  const siteID = process.env.NETLIFY_SITE_ID || env.NETLIFY_SITE_ID || null;
  const token = process.env.NETLIFY_AUTH_TOKEN || env.NETLIFY_AUTH_TOKEN || null;

  // If running on Netlify, context should be auto-injected. If not, require siteID+token.
  const hasRuntimeCtx = !!process.env.NETLIFY || !!process.env.NETLIFY_IMAGES_CDN_DOMAIN || !!process.env.NETLIFY_DEV;

  try {
    const store = blobs({
      name: name || env.NFL_STORE_NAME,
      siteID: hasRuntimeCtx ? undefined : siteID,
      token: hasRuntimeCtx ? undefined : token,
    });
    // Probe capability (no-op list)
    return { store, context: { hasRuntimeCtx, siteID: !!siteID } };
  } catch (err) {
    return { store: null, context: { error: String(err) } };
  }
}
