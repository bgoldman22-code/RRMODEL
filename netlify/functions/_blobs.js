// netlify/functions/_blobs.js
// Robust helper for Netlify Blobs with explicit credentials pass-through.
const { getStore } = require('@netlify/blobs');

/**
 * Returns a named Netlify Blobs store.
 * If NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are set (Netlify dashboard),
 * we pass them explicitly. Otherwise we fall back to the implicit env wiring.
 */
function getBlobsStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore(name, { siteID, token });
  }
  return getStore(name);
}

module.exports = { getBlobsStore };
