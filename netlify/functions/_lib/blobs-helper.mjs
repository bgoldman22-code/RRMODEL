// netlify/functions/_lib/blobs-helper.mjs
// Compatible with @netlify/blobs that export getStore (no createClient needed)

import { getStore } from '@netlify/blobs';

/**
 * Open a Netlify Blobs store in a way that works both on Netlify and locally.
 * - On Netlify: uses implicit auth/context.
 * - Locally / CI: can be provided via env or opts: siteID + token.
 * - Fallback: in-memory shim so functions don't crash when not configured.
 */
export async function openStore(name, opts = {}) {
  const strong = { consistency: 'strong' };

  // On Netlify, context provides auth implicitly.
  if (process.env.NETLIFY || process.env.NETLIFY_LOCAL) {
    return getStore({ name, ...strong });
  }

  // Manual mode (useful for local dev/CI)
  const siteID = opts.siteID || process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token  = opts.token  || process.env.NETLIFY_BLOBS_TOKEN   || process.env.BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token, ...strong });
  }

  // Fallback shim (in-memory). Keeps API surface small but adequate for caching.
  const mem = new Map();
  return {
    async get(key) { return mem.get(key) ?? null; },
    async set(key, value) { mem.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
    async list() { return Array.from(mem.keys()); },
    async delete(key) { mem.delete(key); },
  };
}
