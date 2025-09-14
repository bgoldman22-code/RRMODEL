
// Wrapper around Netlify Blobs that works across versions (getStore only)
import { getStore } from '@netlify/blobs';

/**
 * Open a blobs store by name. Works locally and on Netlify.
 * @param {{ name: string }} param0
 */
export async function openStore({ name }) {
  if (!name) throw new Error('openStore: missing store name');
  const store = await getStore({ name });
  return {
    async getJSON(key, fallback = null) {
      try {
        const raw = await store.get(key, { type: 'json' });
        return raw ?? fallback;
      } catch (err) {
        return fallback;
      }
    },
    async setJSON(key, value) {
      const body = JSON.stringify(value ?? null);
      await store.set(key, body, { contentType: 'application/json' });
      return true;
    },
  };
}
