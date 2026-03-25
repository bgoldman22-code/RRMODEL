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
    const store = createStore();
    const url = new URL(
      event.rawUrl ||
        `https://${event.headers.host}${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`
    );
    const date  = url.searchParams.get("date");
    const label = url.searchParams.get("label");

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
      message: "No F5 ML picks available yet. Picks are generated daily once the season is underway.",
      meta: {
        model_id: "f5_ml_v2_0_0",
        note: "Picks are generated daily during the MLB season via GitHub Actions smart scheduler.",
      },
    });
  } catch (err) {
    console.error("f5-ml-latest error:", err);
    return json(500, { ok: false, error: err.message || "Internal server error" });
  }
}
