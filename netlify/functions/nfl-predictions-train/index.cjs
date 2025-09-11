// netlify/functions/nfl-predictions-train/index.cjs
const TRAIN_SECRET = process.env.TRAIN_SECRET || "";
const okJson = (obj) => ({
  statusCode: 200,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return okJson({ ok: false, error: "POST required" });
    }
    const hdr = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const provided = hdr["x-train-secret"] || hdr["authorization"]?.replace(/^Bearer\s+/i, "");
    if (!TRAIN_SECRET) {
      // Don't block if not configured, but warn
      console.warn("TRAIN_SECRET not set — allowing training for now");
    } else if (provided !== TRAIN_SECRET) {
      return okJson({ ok: false, error: "Unauthorized: bad or missing TRAIN_SECRET" });
    }

    // Placeholder: record a trained_at timestamp; attempt to persist if blobs helper exists
    const trained_at = new Date().toISOString();

    let persisted = false, where = null;
    try {
      const { getBlobsStore } = require("../_blobs.js");
      const store = getBlobsStore(process.env.BLOBS_STORE_NFL || process.env.NFL_TD_BLOBS || "nfl-td");
      const metaKey = "preds/meta.json";
      const meta = { trained_at };
      await store.setJSON(metaKey, meta);
      persisted = true;
      where = `blobs:${metaKey}`;
    } catch (e) {
      // Fallback: no blobs available in local dev
      where = "memory-only";
    }

    return okJson({ ok: true, trained_at, persisted, where });
  } catch (err) {
    // Always return JSON — never leak HTML errors to the UI
    return okJson({ ok: false, error: String(err) });
  }
};
