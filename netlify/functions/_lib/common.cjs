'use strict';
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

// ---------- Schedule ----------
async function readSchedule(season = 2025) {
  // 1) Try NFL blobs
  try {
    const store = blobsStoreNFL();
    const key = `schedules/${season}/full.json`; 
    const json = await store.get(key, { type: 'json' });
    if (json && json.weeks) return json;
  } catch (_) {}
  // 2) Repo fallback
  const shared = path.resolve(__dirname, '..', 'data/nfl', String(season), 'schedule.full.json');
  if (fs.existsSync(shared)) return JSON.parse(fs.readFileSync(shared, 'utf8'));
  throw new Error('Schedule not found');
}

// ---------- Depth Charts ----------
async function readDepthCharts(season = 2025, week = 1) {
  // 1) Try blobs
  try {
    const store = blobsStoreNFL();
    const key = `depth/${season}/week${week}/depth-charts.json`;
    const json = await store.get(key, { type: 'json' });
    if (json && typeof json === 'object') return json;
  } catch (_) {}
  // 2) Repo override
  const shared = path.resolve(__dirname, '..', 'data/nfl', String(season), `week${week}`, 'depth-charts.json');
  if (fs.existsSync(shared)) return JSON.parse(fs.readFileSync(shared, 'utf8'));
  // 3) Function-local dev stub
  const local = path.resolve(__dirname, '..', 'nfl-depthcharts-local', '_data', `${season}`, `week${week}`, 'depth-charts.json');
  if (fs.existsSync(local)) return JSON.parse(fs.readFileSync(local, 'utf8'));
  return {};
}

async function writeDepthCharts(season = 2025, week = 1, charts = {}) {
  const store = blobsStoreNFL();
  const key = `depth/${season}/week${week}/depth-charts.json`;
  await store.set(key, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });
  return key;
}

// ---------- History ----------
async function appendHistory(season, week, games) {
  const store = blobsStoreNFL();
  const key = `history/${season}/week${week}.json`;
  await store.set(key, JSON.stringify({ season, week, games }, null, 2), { contentType: 'application/json; charset=utf-8' });
  return key;
}

async function readHistory(season) {
  const store = blobsStoreNFL();
  const out = [];
  for (let w = 1; w <= 18; w++) {
    const key = `history/${season}/week${w}.json`;
    try {
      const j = await store.get(key, { type: 'json' });
      if (j && j.games) out.push(j);
    } catch (_) {}
  }
  return out;
}

module.exports = {
  blobsStoreNFL,
  readSchedule,
  readDepthCharts,
  writeDepthCharts,
  appendHistory,
  readHistory
};
