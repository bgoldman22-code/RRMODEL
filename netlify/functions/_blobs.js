const { createClient } = require('@netlify/blobs');

function getBlobsStore(preferred) {
  const name = preferred || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
  if (!name) return null;
  const client = createClient();
  return client.getStore(name);
}

module.exports = { getBlobsStore };