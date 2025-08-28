import { getBlobsStore } from "./_blobs.js";

const createStore = (name) => getBlobsStore(name);

async function readJSON(store, key, fallback = null) {
  try {
    const val = await store.get(key, { type: "json" });
    return (val === undefined || val === null) ? fallback : val;
  } catch (e) {
    return fallback;
  }
}

// netlify/functions/_blobs-helper.js
export * from './_blobs.js';
