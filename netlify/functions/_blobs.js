// netlify/functions/_blobs.js
// Bulletproof helper using getStore(name, { siteID, token })
const { getStore } = require('@netlify/blobs');

function getBlobsStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore(name, { siteID, token });
  }
  return getStore(name);
}

module.exports = { getBlobsStore };
