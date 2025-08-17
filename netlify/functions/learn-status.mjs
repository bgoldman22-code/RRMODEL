// netlify/functions/learn-status.mjs
import { getStore } from "@netlify/blobs";

export const handler = async () => {
  try {
    const store = getStore({ name: "rrmodel" });
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
