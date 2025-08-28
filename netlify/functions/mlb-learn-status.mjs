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

// netlify/functions/mlb-learn-status.mjs

export async function handler(event, context) {
  try {
    const store = createStore();
    const manifest = await readJSON(store, "learn/manifest.json");
    const latest   = await readJSON(store, "learn/latest.json");
    const days = Array.isArray(manifest) ? manifest.length : 0;

    const aggregate = await readJSON(store, "learn/aggregate.json");
    let samples = null;
    if (aggregate && typeof aggregate.samples === "number") samples = aggregate.samples;
    else if (latest && latest.results_meta && typeof latest.results_meta.samples === "number") samples = latest.results_meta.samples;

    return { statusCode: 200, body: JSON.stringify({ ok:true, days, last_run: latest && latest.date || null, latest_at: latest && latest.at || null, approximate_samples: samples }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
}