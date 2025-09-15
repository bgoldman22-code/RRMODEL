
'use strict';

/**
 * Blobs helper with environment fallback:
 * - BLOBS_STORE_NFL
 * - BLOBS_STORE
 * - default "nfl-td"
 *
 * Works on Netlify runtime (no args needed) or locally by setting:
 *  NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN
 */

let createClient = null;
let getStore = null;

try {
  // @netlify/blobs v5
  ({ createClient, getStore } = require('@netlify/blobs'));
} catch (e) {
  // Leave null; we'll error lazily in ensureClient()
}

const DEFAULT_STORE = 'nfl-td';

function getStoreName() {
  return process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || DEFAULT_STORE;
}

function ensureClient() {
  if (createClient && getStore) {
    // In Netlify runtime this will pick up context automatically
    try {
      const client = createClient();
      return client;
    } catch (e) {
      // In local mode, require siteID/token
      const siteID = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;
      if (!siteID || !token) {
        const err = new Error("[blobs-helper] @netlify/blobs.createClient is not available or lacks credentials. Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN or run in Netlify runtime.");
        err.code = "MISSING_BLOBS_ENV";
        throw err;
      }
      const client = createClient({ siteID, token });
      return client;
    }
  } else {
    const err = new Error("[blobs-helper] @netlify/blobs.createClient is not available. Please update @netlify/blobs to v5+ or run in Netlify runtime.");
    err.code = "NO_BLOBS_LIB";
    throw err;
  }
}

async function openStore(name = getStoreName()) {
  const client = ensureClient();
  // Prefer getStore if available (v5)
  if (getStore) {
    return getStore({ name });
  }
  // Fallback: v4-style
  if (client && client.store) {
    return client.store(name);
  }
  throw new Error("[blobs-helper] Unable to open blobs store.");
}

async function saveToBlobs(key, data, { contentType = 'application/json', encode = true } = {}) {
  const store = await openStore();
  const value = encode ? JSON.stringify(data) : data;
  await store.set(key, value, { contentType });
  return true;
}

async function loadFromBlobs(key, { parse = true } = {}) {
  try {
    const store = await openStore();
    const txt = await store.get(key);
    if (!txt) return null;
    return parse ? JSON.parse(txt) : txt;
  } catch (e) {
    return null;
  }
}

async function listKeys(prefix = '') {
  const store = await openStore();
  const items = [];
  for await (const entry of store.list({ prefix })) {
    items.push(entry.key || entry);
  }
  return items;
}

module.exports = {
  DEFAULT_STORE,
  getStoreName,
  openStore,
  saveToBlobs,
  loadFromBlobs,
  listKeys,
};
