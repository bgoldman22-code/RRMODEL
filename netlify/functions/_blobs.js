const { getStore } = require('@netlify/blobs');

function getBlobsStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore({ name }); // Netlify runtime auto-creds
}

module.exports = { getBlobsStore };
