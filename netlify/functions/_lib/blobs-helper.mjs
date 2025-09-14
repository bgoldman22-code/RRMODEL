
// netlify/functions/_lib/blobs-helper.mjs
// Safe helper for Netlify Blobs with graceful fallbacks and loud logging.
import { getStore as _getStore, createClient as _createClient } from "@netlify/blobs";

export function envSummary() {
  return {
    siteID: process.env.NETLIFY_SITE_ID || null,
    token: process.env.NETLIFY_AUTH_TOKEN ? `***${process.env.NETLIFY_AUTH_TOKEN.slice(-4)}` : null,
    storeNFL: process.env.BLOBS_STORE_NFL || null,
    store: process.env.BLOBS_STORE || null,
  };
}

export async function openStore(nameEnv = "BLOBS_STORE_NFL") {
  const storeName = process.env[nameEnv] || process.env.BLOBS_STORE || "rrmodel-nfl";
  const env = envSummary();
  console.log(`[blobs-helper] openStore("${storeName}") env=`, env);

  // Try auto-configured environment first
  try {
    const store = _getStore(storeName);
    console.log("[blobs-helper] using auto-configured getStore");
    return {
      type: "blobs",
      name: storeName,
      putText: (...args) => store.setItem(...args),
      getText: (...args) => store.getItem(...args),
      del: (...args) => store.deleteItem(...args),
    };
  } catch (e) {
    console.warn("[blobs-helper] getStore failed, attempting manual client", e?.message);
  }

  // Manual client if siteID/token provided
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    try {
      const client = _createClient({
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_AUTH_TOKEN,
      });
      const store = client.getStore(storeName);
      console.log("[blobs-helper] using manual createClient + getStore");
      return {
        type: "blobs-manual",
        name: storeName,
        putText: (...args) => store.setItem(...args),
        getText: (...args) => store.getItem(...args),
        del: (...args) => store.deleteItem(...args),
      };
    } catch (e) {
      console.warn("[blobs-helper] manual client failed, falling back to memory store", e?.message);
    }
  } else {
    console.warn("[blobs-helper] NETLIFY_SITE_ID/NETLIFY_AUTH_TOKEN not set; falling back to memory store");
  }

  // In-memory fallback (avoids hard crash during dev)
  const mem = new Map();
  console.log("[blobs-helper] using in-memory store (not persisted)");
  return {
    type: "memory",
    name: storeName,
    async putText(key, value) { mem.set(key, value); },
    async getText(key) { return mem.get(key) ?? null; },
    async del(key) { mem.delete(key); },
  };
}
