// netlify/functions/learn-status.mjs
// Utility to create a Blobs store that works both on Netlify and locally
import { getStore } from './_blobs.js';

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


export const handler = async () => {
  try {
    const store = makeStore("rrmodel");
    const prefix = "mlb/learn_receipts/";
    const list = await store.list({ prefix, cursor: null, limit: 1000 });
    const files = (list?.blobs || []).filter(b => b.key.endsWith(".json"));
    if (!files.length) return respond(404, { ok: false, error: "no_receipts" });
    files.sort((a, b) => a.key < b.key ? 1 : -1);
    const latestKey = files[0].key;
    const latest = await store.get(latestKey, { type: "json" });
    return respond(200, { ok: true, key: latestKey, receipt: latest });
  } catch (err) {
    return respond(500, { ok: false, error: String(err?.message || err) });
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body),
  };
}
