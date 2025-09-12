// netlify/functions/nfl-predictions-train/index.cjs
const BUNDLE_VERSION = "predictions-2025-09-12-v7";
const ARTIFACT_KEY   = "nfl/predictions/artifacts/latest.json";

const json = (code, obj) => ({
  statusCode: code,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  try {
    const open = String(event.queryStringParameters?.open || "") === "1";
    if (!open) {
      const supplied = event.headers["x-secret-header"];
      if (!supplied || supplied !== process.env.TRAIN_SECRET) {
        return json(401, { ok:false, error:"Unauthorized", hint:"use ?open=1 to test", BUNDLE_VERSION });
      }
    }

    let blobs;
    try {
      blobs = require("../_blobs.js");
    } catch (e) {
      return json(500, { ok:false, error:`Blobs wrapper import failed: ${String(e)}`, BUNDLE_VERSION });
    }

    // Minimal mock artifact to prove end-to-end pipeline works
    const artifact = {
      meta: { lastUpdated: new Date().toISOString(), sampleSize: 10, notes: "Mock artifact for pipeline sanity." },
      historicalData: [
        { id: "game-1", matchup: "WAS @ GB", outcome: "GB Win" },
        { id: "game-2", matchup: "KC @ DEN", outcome: "KC Win" }
      ]
    };

    const res = await blobs.set(ARTIFACT_KEY, artifact);
    if (res === true) {
      return json(200, { ok:true, wrote: ARTIFACT_KEY, BUNDLE_VERSION });
    } else {
      return json(500, { ok:false, error: res?.error || "Unknown set() failure", where: res?.where, key: ARTIFACT_KEY, BUNDLE_VERSION });
    }
  } catch (err) {
    return json(500, { ok:false, error:`Unhandled: ${String(err)}`, BUNDLE_VERSION });
  }
};
