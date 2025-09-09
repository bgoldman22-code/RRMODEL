const { getStore } = require('@netlify/blobs');

function getBlobsStore(preferred) {
  const name = preferred || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
  if (!name) return null;
  return getStore(name);
}

module.exports = { getBlobsStore };