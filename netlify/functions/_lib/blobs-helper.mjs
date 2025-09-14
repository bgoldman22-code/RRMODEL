// Lightweight helper to open a Netlify Blobs store without using deprecated exports.
// Works with @netlify/blobs >= 6.x
import { getStore } from '@netlify/blobs';

/**
 * Open a blobs store.
 * Tries explicit `name`, then BLOBS_STORE_NFL, then BLOBS_STORE, then "rrmodel".
 */
export function openStore({ name, fallbackEnv = 'BLOBS_STORE_NFL' } = {}) {
  const storeName = name || process.env[fallbackEnv] || process.env.BLOBS_STORE || 'rrmodel';
  const store = getStore({ name: storeName });
  const api = {
    /**
     * Read JSON value; returns defaultValue on any error.
     */
    async getJSON(key, defaultValue = null) {
      try {
        const val = await store.getJSON(key);
        return (val == null ? defaultValue : val);
      } catch (err) {
        console.error('[blobs] getJSON error', { key, err: String(err) });
        return defaultValue;
      }
    },
    /**
     * Write JSON value; returns true on success, false otherwise.
     */
    async setJSON(key, value, opts = {}) {
      try {
        await store.setJSON(key, value, opts);
        return true;
      } catch (err) {
        console.error('[blobs] setJSON error', { key, err: String(err) });
        return false;
      }
    },
    raw: store,
    name: storeName
  };
  return api;
}
