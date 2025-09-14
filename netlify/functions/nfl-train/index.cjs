// netlify/functions/nfl-train/index.cjs
/* eslint-disable no-console */
const { URL } = require('url');
const zlib = require('zlib');

const FASTR_BASE = 'https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games';
const MIN_YEAR = 2018;

const { openStore } = require('../_lib/blobs-helper.mjs');

function parseYears(event) {
  const qs = event.queryStringParameters || {};
  const paramYears = (qs.years || '').trim();
  const envYears = (process.env.TRAIN_YEARS || '').trim();

  let years = [];
  if (paramYears) years = years.concat(paramYears.split(',').map(s => parseInt(s, 10)));
  if (years.length === 0 && envYears) years = years.concat(envYears.split(',').map(s => parseInt(s, 10)));
  if (years.length === 0) {
    // default: last 3 completed seasons + current if given
    const now = new Date();
    const defaultYears = [now.getUTCFullYear()-3, now.getUTCFullYear()-2, now.getUTCFullYear()-1];
    years = defaultYears;
  }
  years = years
    .filter(y => Number.isFinite(y))
    .map(y => Math.max(y, MIN_YEAR)) // clamp to supported
    .filter((y, i, a) => a.indexOf(y) === i) // dedupe
    .sort((a,b)=>a-b);

  return years;
}

async function fetchSeason(year) {
  const url = `${FASTR_BASE}/${year}.csv.gz`;
  try {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      return { year, ok: false, status: resp.status, reason: `HTTP ${resp.status}` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const csv = zlib.gunzipSync(buf).toString('utf-8');
    return { year, ok: true, csv };
  } catch (err) {
    return { year, ok: false, status: 0, reason: err && (err.name || err.message) };
  }
}

function parseCSV(csv) {
  // very small CSV parser for columns we need
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',');
  const idx = (name) => header.indexOf(name);
  const gi = {
    season: idx('season'),
    week: idx('week'),
    home: idx('home_team'),
    away: idx('away_team'),
    homePts: idx('result'), // result = home_score - away_score
  };
  const rows = [];
  for (const line of lines) {
    const cols = line.split(',');
    if (gi.home === -1 || gi.away === -1 || gi.homePts === -1) continue;
    const result = parseFloat(cols[gi.homePts] || '0');
    const home = cols[gi.home];
    const away = cols[gi.away];
    if (!home || !away) continue;
    rows.push({ home, away, margin: result });
  }
  return rows;
}

function accumulateForm(seasonRows, agg = {}) {
  for (const g of seasonRows) {
    if (!agg[g.home]) agg[g.home] = { games: 0, margin: 0 };
    if (!agg[g.away]) agg[g.away] = { games: 0, margin: 0 };
    agg[g.home].games += 1;
    agg[g.home].margin += g.margin;
    agg[g.away].games += 1;
    agg[g.away].margin -= g.margin;
  }
  return agg;
}

function toTeamForm(agg) {
  const out = {};
  for (const [team, v] of Object.entries(agg)) {
    out[team] = {
      games: v.games,
      avg_margin: v.games ? v.margin / v.games : 0,
    };
  }
  return out;
}

exports.handler = async (event) => {
  const started = Date.now();
  const years = parseYears(event);
  const meta = { years, store: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || null };
  console.log('[TRAIN] start', meta);

  let agg = {};
  const seasonResults = [];
  for (const y of years) {
    const got = await fetchSeason(y);
    if (!got.ok) {
      console.warn(`[TRAIN] skip year ${y}: ${got.reason}`);
      seasonResults.push({ year: y, ok: false, reason: got.reason, status: got.status });
      continue;
    }
    const rows = parseCSV(got.csv);
    accumulateForm(rows, agg);
    seasonResults.push({ year: y, ok: true, games: rows.length });
  }

  const team_form = toTeamForm(agg);
  let wrote = null;
  let persisted = false;
  let persist_error = null;
  try {
    const store = await openStore();
    await store.set('team_form.json', JSON.stringify({ years, team_form, updated: new Date().toISOString() }));
    wrote = 'team_form.json';
    persisted = true;
  } catch (err) {
    persist_error = err && (err.name || err.message);
    console.warn('[TRAIN] persist failed:', persist_error);
  }

  const body = {
    ok: true,
    meta: { years, persisted, wrote, persist_error },
    seasonResults,
    summary: { teams: Object.keys(team_form).length },
    updated: new Date().toISOString(),
  };

  console.log('[TRAIN] done', body.meta);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
};
