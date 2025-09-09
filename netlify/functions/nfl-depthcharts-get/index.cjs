
const fs = require('fs');
const path = require('path');
const { NetlifyBlobs } = require('@netlify/blobs');

// Helper: read JSON safely
function readJSON(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    return null;
  }
}

async function readFromBlobs(storeName, key) {
  try {
    const client = new NetlifyBlobs({ siteID: process.env.SITE_ID || undefined });
    const store = client.getStore(storeName);
    const res = await store.get(key);
    if (!res) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const season = parseInt(q.season || '2025', 10);
    const week = parseInt(q.week || '1', 10);

    // 1) Try blobs (BLOBS_STORE_NFL or BLOBS_STORE)
    const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
    let data = null;
    if (store) {
      const blobKey = `depth/${season}/week${week}/depth-charts.json`;
      data = await readFromBlobs(store, blobKey);
      if (data) {
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok:true, source:'blobs', store, blobKey, season, week, teams: Object.keys(data.charts||{}).length, charts: data.charts || data })
        };
      }
    }

    // 2) Fallback to local file baked with the repo
    // Prior functions used: /var/task/netlify/functions/_data/nfl/{season}/week{week}/depth-charts.json
    const localPath = path.join(__dirname, '..', '_data', 'nfl', String(season), `week${week}`, 'depth-charts.json');
    const local = readJSON(localPath);
    if (local) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok:true, source:'local', season, week, teams: Object.keys(local.charts||{}).length, charts: local.charts || local })
      };
    }

    return {
      statusCode: 404,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:false, error:'No depth charts found in blobs or local data', season, week, tried: {store, localPath}})
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:false, error: String(err && err.stack || err) })
    };
  }
};
