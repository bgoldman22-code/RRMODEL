// netlify/functions/nfl-td-predictions/index.mjs
// Fixed version using Netlify Blobs (like NFL Predictions and MLB HR)

import { buildPredictions } from '../nfl-td-model/index.cjs';
import fs from 'fs/promises';

// REMOVE this problematic line entirely:
// import localSchedule from '../../public/data/nfl-schedule-2025.json' assert { type: 'json' };

const STORE = process.env.BLOBS_STORE_NFL || 'nfl-td';

function parseIntOr(v, d){ const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

// Odds index loading is not supported in local JSON mode (return null)
async function getOddsIndex({ season, week }) {
  return null;
}

async function getScheduleFromFile(season, week) {
  try {
    const raw = await fs.readFile('public/data/nfl-schedule-2025.json', 'utf8');
    const data = JSON.parse(raw);
    if (data && data.weeks && data.weeks[week]) {
      return data.weeks[week].matchups || [];
    }
  } catch (e) {}
  return [];
}

function candidatesFromDepthCharts(dc){
  const out = [];
  for (const team of Object.keys(dc || {})){
    const t = dc[team];
    const abbr = team;
    const pushPlayer = (name, pos, extra={}) => out.push({ 
      name, pos, team_abbr: abbr, 
      usage: extra.usage || {}, 
      explosive_propensity: extra.explosive_propensity 
    });
    
    for (const p of (t.RB || [])){ pushPlayer(p, 'RB'); }
    for (const p of (t.WR || [])){ pushPlayer(p, 'WR'); }
    for (const p of (t.TE || [])){ pushPlayer(p, 'TE'); }
    
    // Optional: top QB for sneak/vulture modeling
    if ((t.QB || [])[0]) pushPlayer((t.QB||[])[0], 'QB', { explosive_propensity: 0.35 });
  }
  return out;
}

async function getGamesForWeek(season, week) {
  const games = await getScheduleFromFile(season, week);
  if (games.length > 0) return games;
  console.log(`No schedule found in public/data/nfl-schedule-2025.json for ${season} week ${week}`);
  return [];
}

export async function handler(event){
  const season = parseIntOr(event.queryStringParameters?.season, 2025);
  const week   = parseIntOr(event.queryStringParameters?.week, null);

  if (!week){
    return { statusCode: 400, body: JSON.stringify({ ok:false, error: "Missing ?week=" }) };
  }

  // Load player data from committed JSON
  let playerData = null;
  try {
    const raw = await fs.readFile('public/nfl-anytime-td-player-data.json', 'utf8');
    const data = JSON.parse(raw);
    playerData = data.players || {};
  } catch (e) {
    playerData = {};
  }

  // Load schedule from committed JSON
  const games = await getGamesForWeek(season, week);

  // Build candidates from player data
  const candidates = Object.values(playerData).map(p => ({
    name: p.name,
    pos: p.position,
    team_abbr: p.team,
    usage: {},
    explosive_propensity: 0
  }));

  const context = {
    season,
    week,
    history_recent: [],
    opp_rz_td_allowed_rate: null,
    opp_explosive_play_rate_allowed: null,
    rb_committee_rate: null,
    qb_sneak_rate: null,
    wind_mph: null,
    is_indoor: null,
    game_plays_proj: null
  };

  const oddsIndex = await getOddsIndex({ season, week });
  const pred = buildPredictions({ season, week, candidates, context, oddsIndex });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok:true, ...pred, source: 'nfl-td-predictions' })
  };
}
