// netlify/functions/_lib/blobs-helper.cjs
// CommonJS-friendly wrapper so CJS functions can use Netlify Blobs.
// Falls back to an in-memory store when Netlify Blobs isn't configured.

const MEMORY_STORES = new Map();

function log(...args) {
  console.log("[blobs-helper]", ...args);
}

function memoryStore(name) {
  if (!MEMORY_STORES.has(name)) MEMORY_STORES.set(name, new Map());
  const bag = MEMORY_STORES.get(name);
  return {
    async get(key) {
      return bag.has(key) ? bag.get(key) : null;
    },
    async set(key, value) {
      bag.set(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    },
    async has(key) {
      return bag.has(key);
    },
    async list() {
      return Array.from(bag.keys());
    }
  };
}

function envStoreName(name) {
  return name || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-store";
}

async function tryOpenWithNetlifyBlobs(name) {
  try {
    const { getStore } = require("@netlify/blobs"); // CJS import is supported for this pkg
    const storeName = envStoreName(name);
    // getStore can infer site from environment in Netlify. If running locally or lacking env,
    // provide siteID/token when available.
    const opts = {};
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
      opts.siteID = process.env.NETLIFY_SITE_ID;
      opts.token = process.env.NETLIFY_API_TOKEN;
    }
    const store = getStore({ name: storeName, ...opts });
    // Sanity check that the store has basic methods
    if (!store || typeof store.get !== "function" || typeof store.set !== "function") {
      throw new Error("Invalid store object from @netlify/blobs");
    }
    log("Opened Netlify Blobs store:", storeName, Object.keys(opts).length ? "(manual creds)" : "(auto)");
    return store;
  } catch (err) {
    log("Falling back to memory store. Reason:", err && err.message ? err.message : String(err));
    return null;
  }
}

async function openStore(name) {
  const n = envStoreName(name);
  const real = await tryOpenWithNetlifyBlobs(n);
  return real || memoryStore(n);
}

module.exports = { openStore, memoryStore };