// netlify/functions/_blobs.cjs
const { getStore } = require('@netlify/blobs');

/**
 * get a named Netlify Blobs store, with explicit creds if available.
 * Works in Netlify Functions even when bundlers get in the way.
 */
function getBlobsStore(name = 'nfl-td') {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore(name, { siteID, token });
  }
  return getStore(name);
}

module.exports = { getBlobsStore };