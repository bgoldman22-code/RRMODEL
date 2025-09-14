// netlify/functions/_lib/blobs-helper.mjs
// Safer Blobs helper: use namespace import to avoid bundler errors for non-existent named exports.
// Falls back to manual client via env (NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN) and, if unavailable,
// to an in-memory ephemeral store (so the function never hard-crashes).

import * as blobs from '@netlify/blobs';

const getStore = blobs.getStore;              // always present in supported versions
const createClient = blobs.createClient;      // may be undefined on older versions

function getStoreName() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
  if (!name) {
    throw new Error('[BLOBS] Missing store name. Set BLOBS_STORE_NFL or BLOBS_STORE.');
  }
  return name;
}

export async function openStore() {
  const name = getStoreName();

  // Try environment-configured getStore first
  try {
    const store = await getStore({ name });
    return store;
  } catch (err) {
    console.warn('[BLOBS] getStore failed, trying manual client…', err && (err.name || err.message));
  }

  // Try manual client when running outside Netlify’s fully-configured env
  try {
    if (typeof createClient === 'function') {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN || process.env.AUTH_TOKEN;
      if (siteID && token) {
        const client = createClient({ siteID, token });
        const store = client.getStore({ name });
        return store;
      } else {
        console.warn('[BLOBS] createClient available but NETLIFY_SITE_ID/NETLIFY_AUTH_TOKEN not set.');
      }
    } else {
      console.warn('[BLOBS] createClient not available in @netlify/blobs version installed.');
    }
  } catch (err) {
    console.warn('[BLOBS] manual client fallback failed.', err && (err.name || err.message));
  }

  // Final fallback to in-memory store (non-persistent) to avoid crashes
  console.warn('[BLOBS] Falling back to ephemeral in-memory store (not persisted).');
  const mem = new Map();
  return {
    async get(key) { return mem.has(key) ? mem.get(key) : null; },
    async set(key, value, opts={}) {
      mem.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return { key };
    },
    async list() { return Array.from(mem.keys()); },
    async delete(key){ mem.delete(key); }
  };
}
