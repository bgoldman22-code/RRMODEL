// netlify/functions/_blobs.js
// ESM helper for Netlify Blobs with a safe in-memory fallback.
import { getStore } from "@netlify/blobs";

function qsHasNoBlobs(event) {
  try {
    const q = event?.queryStringParameters || {};
    if (typeof q === "object") {
      return ("noblobs" in q) || q.noblobs === "1";
    }
    return false;
  } catch {
    return false;
  }
}

export function getBlobsStore(event, opts = {}) {
  const NFL_STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || opts.name || "nfl-td";
  const HAS_NETLIFY_BLOBS_CONTEXT = !!process.env.NETLIFY_BLOBS_CONTEXT;
  const useMemory = qsHasNoBlobs(event) || !HAS_NETLIFY_BLOBS_CONTEXT;

  if (useMemory) {
    const mem = new Map();
    return {
      type: "memory",
      diag: { NFL_STORE_NAME, HAS_NETLIFY_BLOBS_CONTEXT, MODE: "memory" },
      async get(key) { return mem.get(key) ?? null; },
      async set(key, val) { mem.set(key, typeof val === "string" ? val : JSON.stringify(val)); },
      async delete(key) { mem.delete(key); },
      async list({ prefix } = {}) {
        const keys = [...mem.keys()].filter(k => !prefix || k.startsWith(prefix));
        return { blobs: keys.map(k => ({ key: k })), directories: [] };
      }
    };
  }

  const store = getStore({ name: NFL_STORE_NAME });
  store.type = "netlify";
  store.diag = { NFL_STORE_NAME, HAS_NETLIFY_BLOBS_CONTEXT, MODE: "netlify" };
  return store;
}

export function getNFLStore(event) {
  return getBlobsStore(event, { name: process.env.BLOBS_STORE_NFL || "nfl-td" });
}
