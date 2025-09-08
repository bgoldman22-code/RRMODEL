'use strict';
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

const TEAM_NAME_BY_ABBR = {
  "ARI":"Arizona Cardinals","ATL":"Atlanta Falcons","BAL":"Baltimore Ravens","BUF":"Buffalo Bills",
  "CAR":"Carolina Panthers","CHI":"Chicago Bears","CIN":"Cincinnati Bengals","CLE":"Cleveland Browns",
  "DAL":"Dallas Cowboys","DEN":"Denver Broncos","DET":"Detroit Lions","GB":"Green Bay Packers",
  "HOU":"Houston Texans","IND":"Indianapolis Colts","JAX":"Jacksonville Jaguars","KC":"Kansas City Chiefs",
  "LAC":"Los Angeles Chargers","LAR":"Los Angeles Rams","LV":"Las Vegas Raiders","MIA":"Miami Dolphins",
  "MIN":"Minnesota Vikings","NE":"New England Patriots","NO":"New Orleans Saints","NYG":"New York Giants",
  "NYJ":"New York Jets","PHI":"Philadelphia Eagles","PIT":"Pittsburgh Steelers","SEA":"Seattle Seahawks",
  "SF":"San Francisco 49ers","TB":"Tampa Bay Buccaneers","TEN":"Tennessee Titans","WAS":"Washington Commanders"
};
const ABBR_BY_TEAM_NAME = Object.fromEntries(Object.entries(TEAM_NAME_BY_ABBR).map(([abbr,name])=>[name,abbr]));

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

async function readSchedule(season=2025) {
  const store = blobsStoreNFL();
  const key = `schedules/${season}/full.json`;
  const json = await store.get(key, { type:'json' });
  if (json && json.weeks) return json;
  // fallback to repo override
  const shared = path.resolve(__dirname, '..', 'data/nfl', String(season), 'schedule.full.json');
  if (fs.existsSync(shared)) return JSON.parse(fs.readFileSync(shared,'utf8'));
  throw new Error('Schedule not found');
}

async function readDepthCharts(season=2025, week=1) {
  // Try shared repo override first
  const shared = path.resolve(__dirname, '..', 'data/nfl', String(season), `week${week}`, 'depth-charts.json');
  if (fs.existsSync(shared)) return JSON.parse(fs.readFileSync(shared,'utf8'));
  // Try function-local stub (for local dev)
  const local = path.resolve(__dirname, '..', 'nfl-depthcharts-local', '_data', `${season}`, `week${week}`, 'depth-charts.json');
  if (fs.existsSync(local)) return JSON.parse(fs.readFileSync(local,'utf8'));
  // Return empty
  return {};
}

async function appendHistory(season, week, games) {
  const store = blobsStoreNFL();
  const key = `history/${season}/week${week}.json`;
  await store.set(key, JSON.stringify({ season, week, games }, null, 2), { contentType: 'application/json; charset=utf-8' });
  return key;
}

async function readHistory(season) {
  const store = blobsStoreNFL();
  // naive: try weeks 1..18; collect existing
  const out = [];
  for (let w=1; w<=18; w++) {
    const key = `history/${season}/week${w}.json`;
    try {
      const j = await store.get(key, { type: 'json' });
      if (j && j.games) out.push(j);
    } catch (_) {}
  }
  return out;
}

module.exports = { TEAM_NAME_BY_ABBR, ABBR_BY_TEAM_NAME, readSchedule, readDepthCharts, appendHistory, readHistory };
