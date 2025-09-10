// netlify/functions/nfl-depthcharts-get.cjs
const path = require('path');
const fs = require('fs');
const { getBlobsStore } = require('./_blobs.cjs');

const STORE = 'nfl-td';
// canonical blob keys
function weekKey(season, week) {
  return `depth/season/${season}/week${week}.json`;
}
function currentKey(season) {
  return `depth/season/${season}/current.json`;
}

async function readFromBlobs(season, week) {
  const store = getBlobsStore(STORE);
  const key = week ? weekKey(season, week) : currentKey(season);
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { charts: json, source: `blobs:${week ? 'week'+week : 'current'}`, key };
  } catch (e) {
    return null;
  }
}

function readLocalFallback(season, week) {
  const here = path.dirname(__filename);
  // older local layout (for debugging only)
  const p = week
    ? path.join(here, '_data', 'nfl', String(season), `week${week}`, 'depth-charts.json')
    : path.join(here, '_data', 'nfl', 'current.json');
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { charts: data, source: `local:${week ? 'week'+week : 'current'}`, path: p };
    } catch {}
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const season = Number(q.season || 2025);
    const week = q.week ? String(q.week) : null;

    // 1) BLOBS FIRST (authoritative)
    const fromBlobs = await readFromBlobs(season, week);
    if (fromBlobs) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, season, week: week ? Number(week) : undefined, ...fromBlobs }),
      };
    }

    // 2) Local fallback
    const local = readLocalFallback(season, week);
    if (local) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, season, week: week ? Number(week) : undefined, ...local }),
      };
    }

    return { statusCode: 404, body: JSON.stringify({ ok:false, error:'No depth charts found' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};