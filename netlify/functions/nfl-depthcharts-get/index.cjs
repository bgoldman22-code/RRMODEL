// Ensure Netlify includes our depth chart JSONs
export const config = {
  includedFiles: ["netlify/functions/nfl-depthcharts-get/_data/**"]
};
// forces a fresh deploy/artifact
const BUNDLE_VERSION = "2025-09-10-2";
// netlify/functions/nfl-depthcharts-get/index.cjs
const path = require('path');
const fs = require('fs/promises');
const { getBlobsStore } = require('../_blobs.js');

const LOCAL_BASE = path.join(__dirname, '_data', 'nfl');

async function loadLocal(season, week) {
  const weekPath = path.join(LOCAL_BASE, String(season), `week${week}`, 'depth-charts.json');
  const buf = await fs.readFile(weekPath, 'utf8').catch(() => null);
  if (buf) return JSON.parse(buf);
  const currPath = path.join(LOCAL_BASE, 'current.json');
  const buf2 = await fs.readFile(currPath, 'utf8').catch(() => null);
  return buf2 ? JSON.parse(buf2) : null;
}

exports.handler = async (event) => {
  const season = Number(event.queryStringParameters?.season || 2025);
  const week   = Number(event.queryStringParameters?.week   || 1);

  const store = getBlobsStore('nfl-td');
  const key = `depth/season/${season}/current.json`;

  try {
    const str = await store.get(key);
    if (str) {
      const parsed = JSON.parse(str);
      if (parsed?.season === season && parsed?.charts) {
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, season, week, charts: parsed.charts, source: 'blobs:current' })
        };
      }
    }
    const wkKey = `depth/season/${season}/week${week}.json`;
    const wkStr = await store.get(wkKey);
    if (wkStr) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: wkStr
      };
    }
    const local = await loadLocal(season, week);
    if (local) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, season, week, charts: local.charts, source: 'local' })
      };
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'No depth charts found in blobs or local data',
        season,
        week,
        tried: {
          blobsCurrent: key,
          blobsWeek: wkKey,
          localPath: path.join(LOCAL_BASE, String(season), `week${week}`, 'depth-charts.json')
        }
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
