// Helper to get a Netlify Blobs store robustly.
// Uses automatic context when available. Falls back to manual mode if NETLIFY_SITE_ID + NETLIFY_API_TOKEN provided.
import { getStore as _getStore } from "@netlify/blobs";

export function getNFLStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "site:nfl-td";
  const siteIDEnv = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const tokenEnv = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.AUTH_TOKEN;

  // First try automatic context (normal when the Blobs extension is enabled)
  try {
    return _getStore({ name });
  } catch (err) {
    // If automatic context is missing, try manual mode if we have creds
    if (siteIDEnv && tokenEnv) {
      return _getStore({ name, siteID: siteIDEnv, token: tokenEnv });
    }
    const diag = {
      NFL_STORE_NAME: name,
      HAS_NETLIFY_BLOBS_CONTEXT: !!process.env.NETLIFY_BLOBS_CONTEXT,
      HAS_NETLIFY_SITE_ID: !!siteIDEnv,
    };
    const detail = `${err?.name||"Error"} ${err?.message||String(err)}`;
    throw new Error(`Blobs unavailable. Enable Netlify Blobs for this site and set BLOBS_STORE_NFL or BLOBS_STORE. Detail: ${detail}`, { cause: { diag } });
  }
}
