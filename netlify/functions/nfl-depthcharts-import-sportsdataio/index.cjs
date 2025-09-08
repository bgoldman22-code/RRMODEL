'use strict';
// Import NFL depth charts from SportsDataIO Discovery Lab and normalize to our model schema.
// Saves to Netlify Blobs store (BLOBS_STORE_NFL) at depth/{season}/week{week}/depth-charts.json
//
// Env vars:
//   SPORTSDATAIO_KEY   -> your SportsDataIO (Discovery Lab) API key
//
// Query params:
//   season=2025   (required; used only for key path)
//   week=2        (required; used only for key path)
//   url=<optional override>  (if Discovery Lab gives you a specific URL; otherwise we'll try a few defaults)
//
// Heuristics:
// - If endpoint exposes usage like GoalLineCarries, RedZoneTargets, DeepTargets, we convert to shares per team.
// - Otherwise we assign default shares by depth rank (RB1 0.60, RB2 0.30; WR1 0.22 RZ, WR2 0.18; TE1 0.18; QB1 rush_td_rate 0.05)
// - Teams are keyed by standard abbreviations (ARI, ATL, ...). We'll try to map based on provided team names/keys.
//
// This function is defensive: it accepts several common SportsDataIO shapes:
//  A) Array per team with DepthChart entries
//  B) Flat array of players with Team + Position + DepthOrder
//  C) Nested { Team: { Players: [...] } } shapes
//
const fetch = global.fetch;
const { writeDepthCharts } = require('../_lib/common.cjs');

const TEAM_ABBR = {
  "Arizona Cardinals": "ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF",
  "Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE",
  "Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
  "Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX","Kansas City Chiefs":"KC",
  "Los Angeles Chargers":"LAC","Los Angeles Rams":"LAR","Las Vegas Raiders":"LV","Miami Dolphins":"MIA",
  "Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
  "New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","Seattle Seahawks":"SEA",
  "San Francisco 49ers":"SF","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS"
};

const ALT_TEAM_KEYS = {
  "ARI":"ARI","ARZ":"ARI",
  "ATL":"ATL",
  "BAL":"BAL",
  "BUF":"BUF",
  "CAR":"CAR",
  "CHI":"CHI",
  "CIN":"CIN",
  "CLE":"CLE",
  "DAL":"DAL",
  "DEN":"DEN",
  "DET":"DET",
  "GB":"GB","GNB":"GB",
  "HOU":"HOU",
  "IND":"IND",
  "JAX":"JAX","JAC":"JAX",
  "KC":"KC","KAN":"KC","KCC":"KC",
  "LAC":"LAC","SD":"LAC","SDC":"LAC",
  "LAR":"LAR","LA":"LAR","STL":"LAR",
  "LV":"LV","OAK":"LV",
  "MIA":"MIA",
  "MIN":"MIN",
  "NE":"NE","NWE":"NE","NEP":"NE",
  "NO":"NO","NOR":"NO","NOS":"NO",
  "NYG":"NYG","NYG":"NYG",
  "NYJ":"NYJ",
  "PHI":"PHI","PHL":"PHI",
  "PIT":"PIT",
  "SEA":"SEA",
  "SF":"SF","SFO":"SF","SFF":"SF",
  "TB":"TB","TAM":"TB","TBB":"TB",
  "TEN":"TEN",
  "WAS":"WAS","WSH":"WAS","WFT":"WAS"
};

function toAbbr(teamObjOrName) {
  if (!teamObjOrName) return null;
  const s = typeof teamObjOrName === 'string'
    ? teamObjOrName
    : (teamObjOrName.Abbreviation || teamObjOrName.abbreviation || teamObjOrName.Key || teamObjOrName.Team || teamObjOrName.Name || teamObjOrName.name || teamObjOrName.Location || null);
  if (!s) {
    const nm = (typeof teamObjOrName === 'string') ? teamObjOrName : (teamObjOrName.FullName || teamObjOrName.fullName || teamObjOrName.Nickname || teamObjOrName.name);
    if (nm && TEAM_ABBR[nm]) return TEAM_ABBR[nm];
    return null;
  }
  const up = String(s).toUpperCase();
  if (ALT_TEAM_KEYS[up]) return ALT_TEAM_KEYS[up];
  // maybe it's a full name
  if (TEAM_ABBR[s]) return TEAM_ABBR[s];
  return up;
}

function posNorm(p) {
  const pos = (p || '').toUpperCase();
  if (pos.startsWith('RB')) return 'RB';
  if (pos.startsWith('WR')) return 'WR';
  if (pos.startsWith('TE')) return 'TE';
  if (pos.startsWith('QB')) return 'QB';
  return null;
}

function defaultShares(pos, depthOrder) {
  if (pos==='RB') return { goal_line_share: depthOrder===1 ? 0.60 : (depthOrder===2 ? 0.30 : 0.10) };
  if (pos==='WR') {
    return { red_zone_target_share: depthOrder===1 ? 0.22 : 0.18, deep_threat: depthOrder===1 ? 0.35 : 0.30 };
  }
  if (pos==='TE') return { red_zone_target_share: 0.18 };
  if (pos==='QB') return { rush_td_rate: 0.05 };
  return {};
}

function usageToShares(pos, usage) {
  // Normalize from potential SportsDataIO usage fields if available
  // e.g., GoalLineCarries, RedZoneTargets, DeepTargets (relative shares per position group)
  const out = {};
  if (!usage) return out;
  if (pos==='RB' && usage.GoalLineCarries != null && usage.TeamGoalLineCarries != null && usage.TeamGoalLineCarries > 0) {
    out.goal_line_share = Math.max(0, Math.min(1, usage.GoalLineCarries / usage.TeamGoalLineCarries));
  }
  if ((pos==='WR' || pos==='TE') && usage.RedZoneTargets != null && usage.TeamRedZoneTargets != null && usage.TeamRedZoneTargets > 0) {
    out.red_zone_target_share = Math.max(0, Math.min(1, usage.RedZoneTargets / usage.TeamRedZoneTargets));
  }
  if (pos==='WR' && usage.DeepTargets != null && usage.TeamDeepTargets != null && usage.TeamDeepTargets > 0) {
    out.deep_threat = Math.max(0, Math.min(1, usage.DeepTargets / usage.TeamDeepTargets));
  }
  if (pos==='QB' && usage.QBRushTDs != null && usage.TeamRushTDs != null && usage.TeamRushTDs > 0) {
    out.rush_td_rate = Math.max(0.01, Math.min(0.20, usage.QBRushTDs / (usage.TeamRushTDs+1e-9)));
  }
  return out;
}

function normalizeFromArray(items) {
  // items: array of players with fields Team, Position, DepthOrder, Name, Usage...
  const charts = {};
  for (const it of items) {
    const team = toAbbr(it.Team || it.TeamKey || (it.Team && it.Team.Name) || it.TeamID || it.team);
    const pos = posNorm(it.Position || it.position);
    if (!team || !pos) continue;
    const depthOrder = parseInt(it.DepthOrder || it.Depth || it.DepthChartOrder || it.DepthChart || 0, 10) || 0;
    const role = (depthOrder===1 ? pos+'1' : (depthOrder===2 ? pos+'2' : pos+'3'));
    const name = it.Name || it.Player || it.PlayerName || it.fullName || it.DisplayName || it.ShortName || it.FirstName && it.LastName ? `${it.FirstName} ${it.LastName}`.trim() : null;
    if (!name) continue;
    const usage = {
      GoalLineCarries: it.GoalLineCarries,
      TeamGoalLineCarries: it.TeamGoalLineCarries,
      RedZoneTargets: it.RedZoneTargets,
      TeamRedZoneTargets: it.TeamRedZoneTargets,
      DeepTargets: it.DeepTargets,
      TeamDeepTargets: it.TeamDeepTargets,
      QBRushTDs: it.QBRushTDs,
      TeamRushTDs: it.TeamRushTDs
    };
    const shares = Object.assign({}, defaultShares(pos, depthOrder), usageToShares(pos, usage));
    charts[team] = charts[team] || { RB:[], WR:[], TE:[], QB:[] };
    const entry = { name, role, ...shares };
    charts[team][pos].push(entry);
  }
  return charts;
}

function mergeCharts(a, b) {
  // shallow merge: prefer b entries; concat arrays uniquely by name+role
  const out = JSON.parse(JSON.stringify(a || {}));
  for (const [team, positions] of Object.entries(b || {})) {
    out[team] = out[team] || { RB:[], WR:[], TE:[], QB:[] };
    for (const pos of ['RB','WR','TE','QB']) {
      const arr = out[team][pos] || [];
      const add = (positions[pos] || []);
      const key = x => `${x.name}|${x.role}`;
      const seen = new Set(arr.map(x=>key(x)));
      for (const x of add) if (!seen.has(key(x))) arr.push(x);
      out[team][pos] = arr;
    }
  }
  return out;
}

async function fetchJSON(url, key) {
  const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);
    const key = process.env.SPORTSDATAIO_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error: 'Missing env SPORTSDATAIO_KEY' }) };

    // Allow overriding URL if Discovery Lab provides a specific one for your plan
    let url = qs.url;
    const tried = [];
    let charts = {};

    const candidates = [
      // Common SportsDataIO shapes (Discovery Lab routes can vary)
      // 1) v3 scores DepthCharts (full season snapshot)
      `https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts`,
      // 2) v3 projections or stats - position-specific (example; may vary per plan)
      `https://api.sportsdata.io/v3/nfl/projections/json/PlayerSeasonProjectionStats/2025`,
      // 3) Discovery Lab experimental path (user can pass ?url=...)
    ];

    const urls = url ? [url] : candidates;
    for (const u of urls) {
      tried.push(u);
      try {
        const data = await fetchJSON(u, key);
        // Normalize if it's an array of players
        if (Array.isArray(data)) {
          charts = mergeCharts(charts, normalizeFromArray(data));
          break;
        }
        // If it's a dict with Players or Teams arrays
        if (data && Array.isArray(data.Players)) {
          charts = mergeCharts(charts, normalizeFromArray(data.Players));
          break;
        }
        if (data && Array.isArray(data.Teams)) {
          for (const team of data.Teams) {
            if (Array.isArray(team.Players)) {
              charts = mergeCharts(charts, normalizeFromArray(team.Players.map(p => ({ ...p, Team: team.Team || team.Abbreviation || team.Name }))));
            }
          }
          break;
        }
      } catch (e) {
        // try next
      }
    }

    if (!Object.keys(charts).length) {
      return { statusCode: 502, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'No depth chart data matched known shapes', tried: tried.slice(0,5) }) };
    }

    const saved = await writeDepthCharts(season, week, charts);
    return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, saved, teams: Object.keys(charts).length }) };
  } catch (err) {
    return { statusCode: 500, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
