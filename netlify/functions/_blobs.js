const { getStore } = require('@netlify/blobs');

// Explicit, isolated store for NFL TD data.
const NFL_STORE_NAME = 'nfl-td';

function getNFLStore() {
  return getStore(NFL_STORE_NAME);
}

module.exports = { getNFLStore, NFL_STORE_NAME };