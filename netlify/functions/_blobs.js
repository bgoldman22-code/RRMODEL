const { NetlifyBlobs } = require('@netlify/blobs');

function getBlobsStore(preferred) {
  const name = preferred || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
  if (!name) return null;
  const client = new NetlifyBlobs();
  return client.getStore(name);
}

module.exports = { getBlobsStore };