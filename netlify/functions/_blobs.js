// netlify/functions/_blobs.js
const { getStore } = require('@netlify/blobs');

/**
 * Returns a named Netlify Blobs store.
 * Always tries explicit credentials first (works in all envs),
 * then falls back to implicit env injection on Netlify.
 */
function getBlobsStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    // Bulletproof path: pass creds directly
    return getStore(name, { siteID, token });
  }
  // Netlify serverless path (injected creds)
  return getStore(name);
}

module.exports = { getBlobsStore };
