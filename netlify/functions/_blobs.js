const { getStore } = require('@netlify/blobs');

const NFL_STORE_NAME = 'nfl-td'; // explicit, isolated store for NFL TD

function getNFLStore() {
  // In Netlify prod, getStore(name) auto-configures creds.
  // If running elsewhere, the SDK will throw MissingBlobsEnvironmentError.
  return getStore(NFL_STORE_NAME);
}

module.exports = { getNFLStore, NFL_STORE_NAME };