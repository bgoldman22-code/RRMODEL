// Ensure Netlify bundles your local JSONs with the function (CJS syntax)
exports.config = {
  includedFiles: ["netlify/functions/nfl-depthcharts-get/_data/**"]
};

// bump when you want to force a new artifact
const BUNDLE_VERSION = "2025-09-11-1";

const path = require("path");
const fs = require("fs/promises");

const LOCAL_BASE = path.join(__dirname, "_data", "nfl");

// Accept either { charts: {...} } or raw {...team map...}
function normalizeToCharts(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.charts && typeof obj.charts === "object") return obj.charts;
  return obj;
}

async function loadLocal(season, week) {
  // 1) season/week/depth-charts.json
  const weekPath = path.join(LOCAL_BASE, String(season), `week${week}`, "depth-charts.json");
  const buf = await fs.readFile(weekPath, "utf8").catch(() => null);
  if (buf) {
    const charts = normalizeToCharts(JSON.parse(buf));
    if (charts) return { charts, source: `local:${path.relative(process.cwd(), weekPath)}` };
  }
  // 2) current.json
  const currPath = path.join(LOCAL_BASE, "current.json");
  const buf2 = await fs.readFile(currPath, "utf8").catch(() => null);
  if (buf2) {
    const charts = normalizeToCharts(JSON.parse(buf2));
    if (charts) return { charts, source: `local:${path.relative(process.cwd(), currPath)}` };
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || 2025);
    const week   = Number(event.queryStringParameters?.week   || 2);
    const sourcePref = String(event.queryStringParameters?.source || "").toLowerCase(); // "local" to bypass blobs

    // 1) If explicitly forcing local, DO NOT touch blobs at all.
    if (sourcePref === "local") {
      const local = await loadLocal(season, week);
      if (local?.charts) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, season, week, charts: local.charts, source: local.source })
        };
      }
      // fall through if local missing
    }

    // 2) Try blobs (require lazily so missing config doesn't crash function)
    let chartsFromBlobs = null;
    let blobsSource     = null;
    try {
      const { getBlobsStore } = require("../_blobs.js"); // <-- lazy require
      const store  = getBlobsStore("nfl-td");
      const currKey = `depth/season/${season}/current.json`;
      const wkKey   = `depth/season/${season}/week${week}.json`;

      const currStr = await store.get(currKey);
      if (currStr) {
        const charts = normalizeToCharts(JSON.parse(currStr));
        if (charts) {
          chartsFromBlobs = charts;
          blobsSource = "blobs:current";
        }
      }
      if (!chartsFromBlobs) {
        const wkStr = await store.get(wkKey);
        if (wkStr) {
          const charts = normalizeToCharts(JSON.parse(wkStr));
          if (charts) {
            chartsFromBlobs = charts;
            blobsSource = "blobs:week";
          }
        }
      }
    } catch (e) {
      // No blobs config or network issue — just fall back to local.
      console.error("Blobs unavailable, falling back to local:", e?.message || e);
    }

    if (chartsFromBlobs) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, season, week, charts: chartsFromBlobs, source: blobsSource })
      };
    }

    // 3) Local bundled fallback
    const local = await loadLocal(season, week);
    if (local?.charts) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, season, week, charts: local.charts, source: local.source })
      };
    }

    // 4) Nothing found
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "No depth charts found in blobs or local data",
        season, week, BUNDLE_VERSION
      })
    };
  } catch (err) {
    // Return the error so you can see it in the browser (helps avoid 502 mystery)
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};
