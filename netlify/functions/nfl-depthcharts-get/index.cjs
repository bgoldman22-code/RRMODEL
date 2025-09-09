const fs = require('fs');
const path = require('path');
const { NetlifyBlobs } = require('@netlify/blobs');

function readJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return null; }
}

async function readFromBlobs(storeName, key) {
  try {
    const client = new NetlifyBlobs();
    const store = client.getStore(storeName);
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

    const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
    const weeklyKey = week ? `depth/${season}/week${week}/depth-charts.json` : null;
    const currentKey = `depth/current.json`;

    // 1) Try weekly snapshot if week provided
    if (store && weeklyKey) {
      const weekly = await readFromBlobs(store, weeklyKey);
      if (weekly) {
        return {
          statusCode: 200,
          headers: {'content-type':'application/json'},
          body: JSON.stringify({ ok:true, source:'blobs:weekly', store, blobKey:weeklyKey, season, week, teams:Object.keys(weekly.charts||{}).length, charts:weekly.charts||weekly })
        };
      }
    }
    // 2) Try current
    if (store) {
      const current = await readFromBlobs(store, currentKey);
      if (current) {
        return {
          statusCode: 200,
          headers: {'content-type':'application/json'},
          body: JSON.stringify({ ok:true, source:'blobs:current', store, blobKey:currentKey, season, week, teams:Object.keys(current.charts||{}).length, charts:current.charts||current })
        };
      }
    }

    // 3) Local fallback: weekly file baked into bundle via included_files
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

    // 4) Local fallback: current
    const localCurrent = path.join(__dirname, '_data', 'nfl', 'current.json');
    const currLocal = readJSON(localCurrent);
    if (currLocal) {
      return {
        statusCode: 200,
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ ok:true, source:'local:current', localPath:localCurrent, season, week, teams:Object.keys(currLocal.charts||{}).length, charts:currLocal.charts||currLocal })
      };
    }

    return { statusCode: 404, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'No depth charts found in blobs or local data', season, week, tried: { store, localPath: path.join(__dirname, '_data', 'nfl', String(season), `week${week||'?'}`, 'depth-charts.json') } }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.stack || err) }) };
  }
};