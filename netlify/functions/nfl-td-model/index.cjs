'use strict';
// v1 Anytime TD model with feature hooks and EV calc
const { readSchedule, readDepthCharts, readHistory } = require('../_lib/common.cjs');

function sigmoid(x){ return 1/(1+Math.exp(-x)); }

function baseTeamTdRate(history, abbr){
  // Simple: average team total TDs per game from history (if available)
  const games = [];
  for (const wk of history) {
    for (const g of wk.games) {
      if (g.away && g.home && g.result) {
        if (g.away.includes(abbr) || g.home.includes(abbr)) {
          games.push(g);
        }
      }
    }
  }
  if (!games.length) return 2.3; // league-ish baseline per team
  // We don't have per-team points->TD conversion; approximate: 7 pts per TD
  let pts=0, cnt=0;
  for (const g of games) {
    if (g.away && g.result && g.away.includes(abbr)) { pts += (g.result.away||0); cnt++; }
    if (g.home && g.result && g.home.includes(abbr)) { pts += (g.result.home||0); cnt++; }
  }
  if (!cnt) return 2.3;
  const ppg = pts / cnt;
  return Math.max(0.8, Math.min(4.5, ppg / 7.0));
}

function playerShareFeature(pos, pdata) {
  if (!pdata) return 0.0;
  if (pos==='RB') return pdata.goal_line_share ?? 0.35;
  if (pos==='TE') return pdata.red_zone_target_share ?? 0.15;
  if (pos==='WR') return (pdata.red_zone_target_share ?? pdata.deep_threat ?? 0.18) * 0.8;
  if (pos==='QB') return pdata.rush_td_rate ?? 0.05;
  return 0.1;
}

function estimateGameFeatures(game){
  // Placeholders; can be extended with weather/defense later
  return { pace: 1.0, red_zone_factor: 1.0, opponent_def_td_factor: 1.0 };
}

function tdProbability(teamTdRate, share, gameFx) {
  // Poisson-ish: P(player scores >=1) ≈ 1 - exp(- λ_player )
  const lambdaTeam = Math.max(0.3, teamTdRate) * (gameFx.red_zone_factor||1.0) * (gameFx.opponent_def_td_factor||1.0);
  const lambdaPlayer = lambdaTeam * Math.max(0, Math.min(1, share));
  return 1 - Math.exp(-lambdaPlayer);
}

function americanFairOdds(p) {
  if (p<=0) return null;
  if (p>=1) return -100;
  return p >= 0.5 ? Math.round(-100 * p / (1-p)) : Math.round(100 * (1-p) / p);
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);

    const schedule = await readSchedule(season);
    const depth = await readDepthCharts(season, week);
    const history = await readHistory(season);

    const games = schedule.weeks[String(week)] || [];
    const out = [];

    for (const g of games) {
      const gameFx = estimateGameFeatures(g);
      // Build depth entries
      const teams = [{abbr: g.away, dir:'away'}, {abbr: g.home, dir:'home'}];
      for (const t of teams) {
        const charts = depth[t.abbr] || {};
        const positions = ['RB','WR','TE','QB'];
        for (const pos of positions) {
          const plist = charts[pos] || [];
          for (const p of plist) {
            const share = playerShareFeature(pos, p);
            // Quick team TD baseline from history
            const teamRate = baseTeamTdRate(history, t.abbr);
            const prob = tdProbability(teamRate, share, gameFx);
            out.push({
              team: t.abbr, pos, player: p.name, role: p.role || null,
              td_prob: Number(prob.toFixed(3)),
              fair_odds: americanFairOdds(prob),
              notes: "v1: shares+history; add weather/defense next"
            });
          }
        }
      }
    }

    // If user passes odds JSON (team/player -> offered odds), compute EV
    let ev = null;
    if (qs.odds) {
      try {
        const offered = JSON.parse(qs.odds);
        ev = out.map(r => {
          const key = `${r.team}:${r.player}`;
          const line = offered[key];
          if (!line) return null;
          const p = r.td_prob;
          const fair = r.fair_odds;
          // convert offered American to implied p
          const implied = (line>0) ? (100/(line+100)) : ((-line)/(-line+100));
          const ev_pct = (p - implied) * 100;
          return { key, offered: line, fair, p, implied: Number(implied.toFixed(3)), ev_pct: Number(ev_pct.toFixed(1)) };
        }).filter(Boolean);
      } catch (_) {}
    }

    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, count: out.length, candidates: out, ev }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
