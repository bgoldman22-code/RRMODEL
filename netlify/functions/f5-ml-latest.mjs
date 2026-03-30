/**
 * F5 ML Latest Picks — Netlify Function (Blobs-backed)
 *
 * Reads the latest F5 Moneyline picks from Netlify Blobs
 * at key: mlb/f5_ml/latest.json
 *
 * Endpoint: /.netlify/functions/f5-ml-latest
 *
 * Query params:
 *   ?date=YYYY-MM-DD&label=morning   → specific snapshot
 *   (no params)                       → latest.json
 */

import { createStore, readJSON } from "./_blobs-helper.mjs";

function json(statusCode, body, { cacheSeconds = 120 } = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${cacheSeconds}`,
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  try {
    const store = createStore("rrmodelblobs");
    const url = new URL(
      event.rawUrl ||
        `https://${event.headers.host}${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`
    );
    const date  = url.searchParams.get("date");
    const label = url.searchParams.get("label");
    const diag  = url.searchParams.get("diag") === "1";

    // Diagnostic mode: show store config and raw read attempts
    if (diag) {
      const testKey = "mlb/f5_ml/latest.json";
      let readResult = null, readError = null;
      try {
        const raw = await store.get(testKey);
        readResult = raw ? `got ${typeof raw}, length=${typeof raw === 'string' ? raw.length : 'n/a'}` : "null";
      } catch (e) {
        readError = e.message;
      }
      let readJsonResult = null, readJsonError = null;
      try {
        readJsonResult = await readJSON(store, testKey);
        readJsonResult = readJsonResult ? `parsed, keys=${Object.keys(readJsonResult).join(",")}` : "null";
      } catch (e) {
        readJsonError = e.message;
      }
      return json(200, {
        diag: true,
        storeName: process.env.BLOBS_STORE || "rrmodelblobs",
        siteIdSource: process.env.NETLIFY_SITE_ID ? "env:NETLIFY_SITE_ID" : process.env.SITE_ID ? "env:SITE_ID" : "hardcoded",
        tokenSource: process.env.NETLIFY_BLOBS_TOKEN ? "env:NETLIFY_BLOBS_TOKEN" : process.env.NETLIFY_AUTH_TOKEN ? "env:NETLIFY_AUTH_TOKEN" : "hardcoded",
        testKey,
        readResult,
        readError,
        readJsonResult,
        readJsonError,
        fn_version: "2026-03-30d",
      });
    }

    let blobKey;
    let cacheSeconds = 60; // default for latest

    if (date && label) {
      // Specific snapshot: mlb/f5_ml/2026-04-10_morning.json
      blobKey = `mlb/f5_ml/${date}_${label}.json`;
      cacheSeconds = 3600; // snapshots are immutable — 1h cache
    } else if (date) {
      // Try morning → pre_afternoon → pre_night for that date
      for (const l of ["pre_night", "pre_afternoon", "morning"]) {
        const k = `mlb/f5_ml/${date}_${l}.json`;
        const d = await readJSON(store, k);
        if (d) return json(200, { ok: true, source: k, ...d }, { cacheSeconds: 3600 });
      }
      return json(404, {
        ok: false,
        error: `No F5 ML picks found for ${date}.`,
        meta: { model_id: "f5_ml_v2_0_0" },
      });
    } else {
      // Default: latest
      blobKey = "mlb/f5_ml/latest.json";
      cacheSeconds = 60; // short cache for latest — updated throughout the day
    }

    const data = await readJSON(store, blobKey);
    if (data) {
      return json(200, { ok: true, source: blobKey, ...data }, { cacheSeconds });
    }

    // Specific snapshot requested but missing → 404
    if (date && label) {
      return json(404, {
        ok: false,
        error: `Snapshot not found: ${blobKey}`,
        meta: { model_id: "f5_ml_v2_0_0" },
      });
    }

    // No data — not yet generated
    return json(200, {
      ok: true,
      offseason: true,
      message: "F5 ML picks are not yet available for today. The model needs a few days of 2026 season data before generating picks. Check back soon!",
      meta: {
        model_id: "f5_ml_v2_0_0",
        fn_version: "2026-03-30c",
        note: "Picks are generated daily during the MLB season via GitHub Actions once sufficient game data is available.",
      },
    });
  } catch (err) {
    console.error("f5-ml-latest error:", err);
    return json(500, { ok: false, error: err.message || "Internal server error", fn_version: "2026-03-30c" });
  }
}
