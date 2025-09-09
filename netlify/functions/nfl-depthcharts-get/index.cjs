const fs = require('fs');
const path = require('path');
const { getNFLStore } = require('../_blobs.js');

function readJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return null; }
}

async function readFromBlobs(store, key) {
  try {
    const res = await store.get(key);
    if (!res) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (_) { return null; }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const season = parseInt(q.season || '2025', 10);
    const week = q.week ? parseInt(q.week, 10) : null;

    let store = null;
    try { store = getNFLStore(); } catch (e) { /* fall back to local */ }

    const weeklyKey = week ? `depth/${season}/week${week}/depth-charts.json` : null;
    const currentKey = `depth/current.json`;

    if (store && weeklyKey) {
      const weekly = await readFromBlobs(store, weeklyKey);
      if (weekly) {
        return {
          statusCode: 200,
          headers: {'content-type':'application/json'},
          body: JSON.stringify({ ok:true, source:'blobs:weekly', blobKey:weeklyKey, season, week, teams:Object.keys(weekly.charts||{}).length, charts:weekly.charts||weekly })
        };
      }
    }
    if (store) {
      const current = await readFromBlobs(store, currentKey);
      if (current) {
        return {
          statusCode: 200,
          headers: {'content-type':'application/json'},
          body: JSON.stringify({ ok:true, source:'blobs:current', blobKey:currentKey, season, week, teams:Object.keys(current.charts||{}).length, charts:current.charts||current })
        };
      }
    }

    // Local fallback
    if (week) {
      const localPath = path.join(__dirname, '_data', 'nfl', String(season), `week${week}`, 'depth-charts.json');
      const local = readJSON(localPath);
      if (local) {
        return {
          statusCode: 200,
          headers: {'content-type':'application/json'},
          body: JSON.stringify({ ok:true, source:'local', localPath, season, week, teams:Object.keys(local.charts||{}).length, charts:local.charts||local })
        };
      }
    }
    const localCurrent = path.join(__dirname, '_data', 'nfl', 'current.json');
    const currLocal = readJSON(localCurrent);
    if (currLocal) {
      return {
        statusCode: 200,
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ ok:true, source:'local:current', localPath:localCurrent, season, week, teams:Object.keys(currLocal.charts||{}).length, charts:currLocal.charts||currLocal })
      };
    }

    return { statusCode: 404, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'No depth charts found in blobs or local data', season, week, tried: { localPath: path.join(__dirname, '_data', 'nfl', String(season), `week${week||'?'}`, 'depth-charts.json') } }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.stack || err) }) };
  }
};