// netlify/functions/_lib/blobs-helper.mjs
import { getStore } from './_blobs.js';

/**
 * Open a Blobs store with graceful fallbacks.
 * By default, relies on Netlify's automatic injection inside functions.
 * If that fails (MissingBlobsEnvironmentError), we attempt manual credentials from env:
 *   NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN   (preferred)
 *   BLOBS_SITE_ID, BLOBS_TOKEN                   (optional aliases)
 *   NETLIFY_API_TOKEN                            (last resort token alias)
 */
export function openStore(name = "nfl") {
  // First try the standard "automatic" config Netlify provides in functions.
  try {
    return getStore({ name });
  } catch (err) {
    // Fallback: manual credentials via env vars
    const siteID =
      process.env.NETLIFY_BLOBS_SITE_ID ||
      process.env.BLOBS_STORE_SITE_ID ||
      process.env.BLOBS_SITE_ID ||
      process.env.SITE_ID;

    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.BLOBS_STORE_TOKEN ||
      process.env.BLOBS_TOKEN ||
      process.env.NETLIFY_API_TOKEN;

    if (!siteID || !token) {
      // Re-throw original error so build logs still show the real cause
      throw err;
    }
    return getStore({ name, siteID, token });
  }
}