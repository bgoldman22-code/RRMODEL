// netlify/functions/_lib/learn-receipt.mjs
// Utility to create a Blobs store that works both on Netlify and locally
import { getStore } from "@netlify/blobs";

export function makeStore(name = "rrmodel") {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.siteID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_BLOBS_WRITE_TOKEN || process.env.BLOBS_TOKEN;
  const opts = { name };
  if (siteID && token) {
    // Manual mode (e.g., local dev or non-Netlify env)
    opts.siteID = siteID;
    opts.token = token;
  }
  return getStore(opts);
}


export async function writeReceipt(rec) {
  const store = makeStore("rrmodel");
  const { dateEt } = rec;
  if (!dateEt) throw new Error("writeReceipt: dateEt is required (YYYY-MM-DD)");
  const key = `mlb/learn_receipts/${dateEt}.json`;
  const body = {
    date_et: rec.dateEt,
    started_at: rec.startedAt,
    finished_at: rec.finishedAt,
    games: rec.games,
    samples: rec.samples,
    factors: rec.factors,
    calibration: rec.calibration,
    deltas: rec.deltas,
    version: rec.version,
    commit: rec.commit,
    warnings: rec.warnings || [],
    ok: true
  };
  await store.set(key, JSON.stringify(body), { contentType: "application/json" });
  return { key };
}

export async function readLatestReceipt() {
  const store = makeStore("rrmodel");
  const list = await store.list({ prefix: "mlb/learn_receipts/", limit: 1000 });
  const files = (list?.blobs || []).filter(b => b.key.endsWith(".json"));
  if (!files.length) return null;
  files.sort((a, b) => a.key < b.key ? 1 : -1);
  const latestKey = files[0].key;
  const json = await store.get(latestKey, { type: "json" });
  return { key: latestKey, receipt: json };
}
