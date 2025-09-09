// netlify/functions/_blobs.js
const { getStore, createClient } = require('@netlify/blobs');

/**
 * Returns a named Netlify Blobs store.
 * If NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN exist, we build an explicit client
 * (bulletproof in prod) and get the store from that client.
 * Otherwise, fall back to auto-injected getStore(name) (OK for local dev).
 */
function getBlobsStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    const client = createClient({ siteID, token });
    return client.getStore(name);
  }
  return getStore(name);
}

module.exports = { getBlobsStore };
