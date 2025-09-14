// ESM helper for Netlify Blobs.
// NOTE: We only use getStore; do NOT import createClient to avoid bundling errors.
import { getStore } from '@netlify/blobs';

/**
 * Opens (or creates) a blobs store by name.
 * @param {string} name store name (from env BLOBS_STORE_NFL or BLOBS_STORE)
 * @returns {Promise<import('@netlify/blobs').BlobStore>}
 */
export async function openStore(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('openStore(name) requires a non-empty string');
  }
  // Netlify automatically binds authentication; just return a store handle.
  const store = getStore({ name });
  return store;
}
