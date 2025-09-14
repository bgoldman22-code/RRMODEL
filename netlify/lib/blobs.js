'use strict';
const { getStore } = require('@netlify/blobs');

function openStore(nameEnv, fallback = 'nfl-td') {
  const name = process.env[nameEnv] || process.env.BLOBS_STORE || fallback;
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;
  try {
    return (siteID && token) ? getStore(name, { siteID, token }) : getStore(name);
  } catch {
    return null; // soft: no store
  }
}

async function withJsonCache(store, key, ttlMs, compute) {
  if (!store) return compute(); // soft: no cache
  const now = Date.now();
  try {
    const cached = await store.get(key, { type: 'json' }).catch(() => null);
    if (cached && cached.fetched_at && (now - cached.fetched_at) < ttlMs) return cached.value ?? cached;
  } catch {}
  const value = await compute();
  try { await store.setJSON(key, { fetched_at: now, value }); } catch {}
  return value;
}

module.exports = { openStore, withJsonCache };
