'use strict';
const { getStore } = require('@netlify/blobs');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

async function writeDepthCharts(season=2025, week=1, charts={}) {
  const store = blobsStoreNFL();
  const key = `depth/${season}/week${week}/depth-charts.json`;
  await store.set(key, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });
  return key;
}

module.exports = { blobsStoreNFL, writeDepthCharts };
