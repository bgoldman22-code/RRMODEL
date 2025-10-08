// File: netlify/functions/nfl-depthcharts-get/index.cjs

exports.config = {
  includedFiles: ["netlify/functions/nfl-depthcharts-get/_data/**"]
};

const BUNDLE_VERSION = "2025-09-11-3"; // bump every deploy

const path = require("path");
const fs = require("fs/promises");
const LOCAL_BASE = path.join(__dirname, "_data", "nfl");

const toCharts = (obj) => {
  if (!obj || typeof obj !== "object") return null;
  return obj.charts && typeof obj.charts === "object" ? obj.charts : obj;
};

async function readJson(p) {
  const s = await fs.readFile(p, "utf8").catch(() => null);
  return s ? JSON.parse(s) : null;
}

async function loadLocal(season, week) {
  const weekPath = path.join(LOCAL_BASE, String(season), `week${week}`, "depth-charts.json");
  const w = await readJson(weekPath);
  if (w) return { charts: toCharts(w), source: `local:${path.relative(process.cwd(), weekPath)}` };

  const currPath = path.join(LOCAL_BASE, "current.json");
  const c = await readJson(currPath);
  if (c) return { charts: toCharts(c), source: `local:${path.relative(process.cwd(), currPath)}` };

  return null;
}

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || 2025);
    const week   = Number(event.queryStringParameters?.week   || 2);
    const pref   = String(event.queryStringParameters?.source || "").toLowerCase();

    // 1) Forced local
    if (pref === "local") {
      const local = await loadLocal(season, week);
      if (local?.charts) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
          body: JSON.stringify({ ok: true, season, week, charts: local.charts, source: local.source, BUNDLE_VERSION })
        };
      }
    }

    // 2) Try blobs (lazy require)
    let charts = null, src = null;
    try {
      const { getBlobsStore } = require("../_blobs.cjs");
      const store = getBlobsStore("nfl-td"); // ✅ ensure this matches the seeder
      const currKey = `depth/season/${season}/current.json`;
      const wkKey   = `depth/season/${season}/week${week}.json`;

      const curr = await store.get(currKey);
      if (curr) {
        const c = toCharts(JSON.parse(curr));
        if (c) charts = c, src = "blobs:current";
      }
      if (!charts) {
        const wk = await store.get(wkKey);
        if (wk) {
          const c = toCharts(JSON.parse(wk));
          if (c) charts = c, src = "blobs:week";
        }
      }
    } catch (e) {
      console.error("Blobs unavailable:", e?.message || e);
    }

    // 3) Fallback local
    if (!charts) {
      const local = await loadLocal(season, week);
      if (local?.charts) charts = local.charts, src = local.source;
    }

    if (charts) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ ok: true, season, week, charts, source: src, BUNDLE_VERSION })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: false, error: "No depth charts found (blobs+local)", season, week, BUNDLE_VERSION })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};
