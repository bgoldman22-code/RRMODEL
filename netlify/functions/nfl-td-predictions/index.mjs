// netlify/functions/nfl-td-predictions/index.mjs
import { getStore } from '@netlify/blobs';
import { buildPredictions } from '../nfl-td-model/index.cjs';
import { nflBlobsGetJSON as nflGetJSON, nflBlobsPutJSON as nflSetJSON } from '../_lib/blobs-nfl.js';
import localSchedule from '../../public/data/nfl-schedule-2025.json' assert { type: 'json' };

const STORE = process.env.BLOBS_STORE_NFL || 'nfl-td';

function parseIntOr(v, d){ const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

async function getOddsIndex({ season, week }){
  // Be conservative with API usage:
  // 1) First try Blobs cache: odds/anytime_td/2025/week-3.json
  const cacheKey = `odds/anytime_td/${season}/week-${week}.json`;
  const cached = await nflGetJSON(cacheKey, null);
  if (cached && cached.index) return cached.index;

  // 2) Fallback: no odds for now (odds-agnostic mode) to preserve credits.
  return null;
}

function candidatesFromDepthCharts(dc){
  const out = [];
  for (const team of Object.keys(dc || {})){
    const t = dc[team];
    const abbr = team;
    const pushPlayer = (name, pos, extra={}) => out.push({ name, pos, team_abbr: abbr, usage: extra.usage || {}, explosive_propensity: extra.explosive_propensity });
    for (const p of (t.RB || [])){ pushPlayer(p, 'RB'); }
    for (const p of (t.WR || [])){ pushPlayer(p, 'WR'); }
    for (const p of (t.TE || [])){ pushPlayer(p, 'TE'); }
    // Optional: top QB for sneak/vulture modeling
    if ((t.QB || [])[0]) pushPlayer((t.QB||[])[0], 'QB', { explosive_propensity: 0.35 });
  }
  return out;
}

function localGamesForWeek(week){
  return (localSchedule || []).filter(g => g.week === week);
}

export async function handler(event){
  const season = parseIntOr(event.queryStringParameters?.season, 2025);
  const week   = parseIntOr(event.queryStringParameters?.week, null);

  if (!week){
    return { statusCode: 400, body: JSON.stringify({ ok:false, error: "Missing ?week=" }) };
  }

  // Load depth charts + recent history if present in blobs (written by your ETL)
  const depthCharts = await nflGetJSON(`history/${season}/week${week}/depth-charts.json`, null)
                    || await nflGetJSON(`_data/nfl/${season}/week${week}/depth-charts.json`, null);
  const historyRecent = await nflGetJSON(`history/${season}/recent-weeks.json`, null)
                      || await nflGetJSON(`_data/history/${season}/weekly-last3.json`, null);

  const context = {
    season,
    week,
    history_recent: historyRecent || [],
    // Room for live feature hooks (filled by ETL):
    opp_rz_td_allowed_rate: null,
    opp_explosive_play_rate_allowed: null,
    rb_committee_rate: null,
    qb_sneak_rate: null,
    wind_mph: null,
    is_indoor: null,
    game_plays_proj: null
  };

  const candidates = candidatesFromDepthCharts(depthCharts || {});
  const oddsIndex = await getOddsIndex({ season, week });

  const pred = buildPredictions({ season, week, candidates, context, oddsIndex });

  // Write to blobs for front-end consumption & auditing
  const outKey = `predictions/${season}/week-${week}.json`;
  await nflSetJSON(outKey, pred);

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok:true, ...pred, source: 'nfl-td-predictions' })
  };
}
