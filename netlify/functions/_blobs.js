// netlify/functions/_blobs.js
// Compatible helper for Netlify Blobs in Node functions.
// Works both on Netlify runtime (auto creds) and with manual creds via env:
//   NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN
//
// Usage:
//   const { getBlobsStore } = require('../_blobs.js');
//   const store = getBlobsStore('nfl-predictions'); await store.set('key', 'value');

const { getStore } = require('@netlify/blobs');

function getBlobsStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  // If manual credentials are present, pass them into getStore (no need to use `new Blobs()`).
  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  // Otherwise let Netlify provide credentials automatically in production.
  return getStore({ name });
}

module.exports = { getBlobsStore };
