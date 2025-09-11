// netlify/functions/nfl-depthcharts-get/index.cjs

// ✅ Make Netlify include the local JSONs in the function bundle (CJS syntax!)
exports.config = {
  includedFiles: ["netlify/functions/nfl-depthcharts-get/_data/**"]
};

// Bump to force a fresh build artifact when needed
const BUNDLE_VERSION = "2025-09-10-3";

const path = require("path");
const fs = require("fs/promises");
const { getBlobsStore } = require("../_blobs.js");

const LOCAL_BASE = path.join(__dirname, "_data", "nfl");

/**
 * Normalize either shape:
 *  - { charts: { ARI:{...}, ... } }
 *  - { ARI:{...}, ... } // raw map
 */
function normalizeToCharts(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.charts && typeof obj.charts === "object") return obj.charts;
  return obj; // assume raw team map
}

/**
 * Load local bundled JSON:
 *  - season/week file first
 *  - else current.json
 * Returns { charts } or null
 */
async function loadLocal(season, week) {
  // 1) season/weekN/depth-charts.json
  const weekPath = path.join(LOCAL_BASE, String(season), `week${week}`, "depth-charts.json");
  const buf = await fs.readFile(weekPath, "utf8").catch(() => null);
  if (buf) {
    const parsed = JSON.parse(buf);
    const charts = normalizeToCharts(parsed);
    if (charts) return { charts, source: `local:${weekPath}` };
  }

  // 2) current.json
  const currPath = path.join(LOCAL_BASE, "current.json");
  const buf2 = await fs.readFile(currPath, "utf8").catch(() => null);
  if (buf2) {
    const parsed = JSON.parse(buf2);
    const charts = normalizeToCharts(parsed);
    if (charts) return { charts, source: `local:${currPath}` };
  }

  return null;
}

exports.handler = async (event) => {
  const season = Number(event.queryStringParameters?.season || 2025);
  const week   = Number(event.queryStringParameters?.week   || 2);
  const sourcePref = (event.queryStringParameters?.source || "").toLowerCase(); // e.g. "local" for sanity checks

  const store = getBlobsStore("nfl-td");
  const currKey = `depth/season/${season}/current.json`;
  const wkKey   = `depth/season/${season}/week${week}.json`;

  try {
    // 🧪 If explicitly forcing local (sanity/debug), skip blobs entirely
    if (sourcePref === "local") {
      const local = await loadLocal(season, week);
      if (local?.charts) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, season, week, charts: local.charts, source: local.source })
        };
      }
      // fall through to normal path if local not found
    }

    // 1) blobs: current
    const currStr = await store.get(currKey);
    if (currStr) {
      const currObj = JSON.parse(currStr);
      const charts = normalizeToCharts(currObj);
      if (charts) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, season, week, charts, source: "blobs:current" })
        };
      }
    }

    // 2) blobs: weekN
    const wkStr = await store.get(wkKey);
    if (wkStr) {
      // wkStr may already be the final shape; normalize anyway
      const wkObj = JSON.parse(wkStr);
      const charts = normalizeToCharts(wkObj);
      if (charts) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, season, week, charts, source: "blobs:week" })
        };
      }
      // if it's already a stringified {ok,season,week,charts} just return it
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: wkStr
      };
    }

    // 3) local bundled (fallback)
    const local = await loadLocal(season, week);
    if (local?.charts) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, season, week, charts: local.charts, source: local.source })
      };
    }

    // nothing found
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "No depth charts found in blobs or local data",
        season,
        week,
        tried: { blobsCurrent: currKey, blobsWeek: wkKey, localBase: LOCAL_BASE }
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
