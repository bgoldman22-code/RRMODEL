// netlify/functions/mlb-learn-status.mjs
import { getStore } from "@netlify/blobs";
const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const store = getStore(STORE_NAME);

async function readJSON(key) {
  try {
    const rsp = await store.get(key, { type: "json" });
    if (rsp != null) return rsp;
  } catch (_) {}
  const blob = await store.get(key);
  if (!blob) return null;
  const txt = await blob.text();
  try { return JSON.parse(txt); } catch { return null; }
}

export async function handler(event, context) {
  try {
    const manifest = await readJSON("learn/manifest.json");
    const latest   = await readJSON("learn/latest.json");
    const days = Array.isArray(manifest) ? manifest.length : 0;

    const aggregate = await readJSON("learn/aggregate.json");
    let samples = null;
    if (aggregate && typeof aggregate.samples === "number") samples = aggregate.samples;
    else if (latest && latest.results_meta && typeof latest.results_meta.samples === "number") samples = latest.results_meta.samples;

    return { statusCode: 200, body: JSON.stringify({ ok:true, days, last_run: latest && latest.date || null, latest_at: latest && latest.at || null, approximate_samples: samples }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
}