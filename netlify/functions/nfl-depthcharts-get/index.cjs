// netlify/functions/nfl-depthcharts-get/index.cjs
const fs = require('fs');
const path = require('path');
const { getBlobsStore } = require('../_blobs.js');

function parseIntOr(n, d) { const x = parseInt(n, 10); return Number.isFinite(x) ? x : d; }

async function readFromBlobs(season, week) {
  const store = getBlobsStore('nfl-td');
  const keysToTry = [];

  if (season && week) {
    keysToTry.push(`depth/${season}/week${week}/depth-charts.json`);
  }
  keysToTry.push(`depth/current.json`);

  for (const key of keysToTry) {
    const res = await store.get(key);
    if (res) return { source: `blobs:${key}`, json: await res.json() };
  }
  return null;
}

function readLocalFallback(season, week, __dirnameHere) {
  const weekPath = path.join(__dirnameHere, '_data', 'nfl', String(season), `week${week}`, 'depth-charts.json');
  if (fs.existsSync(weekPath)) {
    return { source: `local:${weekPath}`, json: JSON.parse(fs.readFileSync(weekPath, 'utf8')) };
  }
  const currentPath = path.join(__dirnameHere, '_data', 'nfl', 'current.json');
  if (fs.existsSync(currentPath)) {
    return { source: `local:${currentPath}`, json: JSON.parse(fs.readFileSync(currentPath, 'utf8')) };
  }
  return null;
}

exports.handler = async (event) => {
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const season = parseIntOr(qs.get('season'), 2025);
  const week   = parseIntOr(qs.get('week'), 1);

  try {
    const blobsRead = await readFromBlobs(season, week);
    if (blobsRead) {
      const charts = blobsRead.json.charts || blobsRead.json;
      return { statusCode:200, body: JSON.stringify({ ok:true, season, week, source: blobsRead.source, teams: Object.keys(charts).length, charts }) };
    }

    const localRead = readLocalFallback(season, week, __dirname);
    if (localRead) {
      const charts = localRead.json.charts || localRead.json;
      return { statusCode:200, body: JSON.stringify({ ok:true, season, week, source: localRead.source, teams: Object.keys(charts).length, charts }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok:false,
        error:'No depth charts found in blobs or local data',
        season, week,
        tried: {
          localPath: path.join(__dirname, '_data', 'nfl', String(season), `week${week}`, 'depth-charts.json')
        }
      })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
