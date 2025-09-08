'use strict';
// CommonJS shim so functions using `require()` can import a working getBlobsStore().
const { getStore } = require('@netlify/blobs');

function getBlobsStore(name) {
  const storeName = name || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name: storeName, siteID, token });
}

module.exports = { getBlobsStore };
