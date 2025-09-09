// netlify/functions/nfl-depthcharts-get/index.cjs
// Fetch depth charts from Blobs 'nfl-td' store, fallback to local _data scaffold.
const path = require('path');
const fs = require('fs');
const { getBlobsStore } = require('../_blobs.js');

const STORE_NAME = 'nfl-td';

function parseIntOr(val, def) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : def;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const season = parseIntOr(params.season, 2025);
  const week   = parseIntOr(params.week, 1);

  const localDir = path.join(__dirname, '_data', 'nfl');
  const localCurrent = path.join(localDir, 'current.json');
  const localWeek = path.join(localDir, String(season), `week${week}`, 'depth-charts.json');

  const tried = { localPath: localWeek };
  let charts = null;
  let source = null;

  // Try Blobs (nfl-td) first
  try {
    const store = getBlobsStore(STORE_NAME);
    const key = `depth/current.json`; // current pointer (we don't version weeks here)
    const res = await store.get(key);
    if (res) {
      const txt = await res.text();
      charts = JSON.parse(txt);
      source = `blobs:${STORE_NAME}:${key}`;
    }
  } catch (e) {
    // Ignore here, we will try local fallback
  }

  // Fallback to local file if needed
  if (!charts) {
    const candidates = [localWeek, localCurrent];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          charts = JSON.parse(raw);
          source = `local:${p.replace(__dirname, '')}`;
          break;
        }
      } catch {}
    }
  }

  if (!charts) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: 'No depth charts found in blobs or local data', season, week, tried })
    };
  }

  const teams = Object.keys(charts || {}).length;
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, season, week, teams, charts, meta: { source } })
  };
};
