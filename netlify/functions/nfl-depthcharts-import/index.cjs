'use strict';
// Unified importer for depth charts via either Sportradar (trial) or RapidAPI Rolling Insights feed.
// Saves normalized charts to BLOBS_STORE_NFL at depth/{season}/week{week}/depth-charts.json
//
// Env vars:
//   SPORTRADAR_API_KEY       -> your Sportradar key
//   SPORTRADAR_ACCESS_LEVEL  -> 'trial' (default) or 'production'
//   SPORTRADAR_LANG          -> 'en' (default)
//   RAPIDAPI_KEY             -> your RapidAPI key
//   RAPIDAPI_HOST            -> default 'football-datafeeds-by-rolling-insights1.p.rapidapi.com'
//
// Query params:
//   source=sportradar|rapidapi   (required)
//   season=2025
//   week=2
//   team_id=<RapidAPI team id>   (optional; if omitted importer will try all teams from 1..32)
//   url=...                      (optional full override)
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

const ALT_TEAM = {
  "ARI":"ARI","ATL":"ATL","BAL":"BAL","BUF":"BUF","CAR":"CAR","CHI":"CHI","CIN":"CIN","CLE":"CLE",
  "DAL":"DAL","DEN":"DEN","DET":"DET","GB":"GB","GNB":"GB","HOU":"HOU","IND":"IND","JAX":"JAX","JAC":"JAX",
  "KC":"KC","KCC":"KC","KAN":"KC","LAC":"LAC","SD":"LAC","SDC":"LAC","LAR":"LAR","LA":"LAR","STL":"LAR",
  "LV":"LV","OAK":"LV","MIA":"MIA","MIN":"MIN","NE":"NE","NWE":"NE","NEP":"NE","NO":"NO","NOR":"NO","NYG":"NYG",
  "NYJ":"NYJ","PHI":"PHI","PHL":"PHI","PIT":"PIT","SEA":"SEA","SF":"SF","SFO":"SF","TB":"TB","TAM":"TB","TEN":"TEN","WAS":"WAS","WSH":"WAS","WFT":"WAS"
};

function toAbbr(nameOrObj) {
  if (!nameOrObj) return null;
  if (typeof nameOrObj === 'string') {
    const n = nameOrObj;
    if (TEAM_ABBR[n]) return TEAM_ABBR[n];
    const up = n.toUpperCase();
    if (ALT_TEAM[up]) return ALT_TEAM[up];
    return up;
  }
  const ab = nameOrObj.abbreviation || nameOrObj.abbr || nameOrObj.key || nameOrObj.team || nameOrObj.Team || nameOrObj.TeamKey;
  if (ab) {
    const up = String(ab).toUpperCase();
    if (ALT_TEAM[up]) return ALT_TEAM[up];
    if (TEAM_ABBR[ab]) return TEAM_ABBR[ab];
    return up;
  }
  const nm = nameOrObj.name || nameOrObj.full_name || nameOrObj.FullName || nameOrObj.display_name || nameOrObj.Nickname;
  if (nm && TEAM_ABBR[nm]) return TEAM_ABBR[nm];
  return null;
}

function posNorm(p) {
  const pos = (p || '').toUpperCase();
  if (pos.startsWith('RB')) return 'RB';
  if (pos.startsWith('WR')) return 'WR';
  if (pos.startsWith('TE')) return 'TE';
  if (pos.startsWith('QB')) return 'QB';
  return null;
}

function defaultShares(pos, depth) {
  const d = Number(depth)||0;
  if (pos==='RB') return { goal_line_share: d===1?0.60:(d===2?0.30:0.10) };
  if (pos==='WR') return { red_zone_target_share: d===1?0.22:0.18, deep_threat: d===1?0.35:0.30 };
  if (pos==='TE') return { red_zone_target_share: 0.18 };
  if (pos==='QB') return { rush_td_rate: 0.05 };
  return {};
}

function normalizeUnit(arr) {
  // arr: [{name, position, depth, usage?}] => grouped by pos
  const out = { RB:[], WR:[], TE:[], QB:[] };
  for (const p of arr) {
    const pos = posNorm(p.position);
    if (!pos || !p.name) continue;
    const shares = Object.assign({}, defaultShares(pos, p.depth||1), p.usage||{});
    const role = (p.depth===1?`${pos}1`:(p.depth===2?`${pos}2`:`${pos}3`));
    out[pos].push({ name: p.name, role, ...shares });
  }
  return out;
}

// --------- Sportradar ---------
async function fetchSportradar(qs) {
  const key = process.env.SPORTRADAR_API_KEY;
  if (!key) throw new Error('Missing env SPORTRADAR_API_KEY');
  const season = parseInt(qs.season||'2025',10);
  const week = parseInt(qs.week||'1',10);
  const stype = (qs.season_type || 'REG').toUpperCase();
  const access = qs.access_level || process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
  const lang = qs.lang || process.env.SPORTRADAR_LANG || 'en';
  const url = qs.url || `https://api.sportradar.com/nfl/official/${access}/v7/${lang}/seasons/${season}/${stype}/${week}/depth_charts.json?api_key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const data = await r.json();
  // Expected shape: { week: ..., teams: [ { id, name, market, alias, depth_chart: { offense: { positions: [ { name: 'RB', players: [...]}, ... ]}}} ] }
  const charts = {};
  const teams = data.teams || [];
  for (const t of teams) {
    const abbr = t.alias || toAbbr(t.name || t.market && `${t.market} ${t.name}`);
    if (!abbr) continue;
    const offense = t.depth_chart?.offense;
    const positions = offense?.positions || [];
    const unit = [];
    for (const pos of positions) {
      const pname = pos.name || pos.position;
      const players = pos.players || [];
      let depth = 0;
      for (const pl of players) {
        depth += 1;
        const name = pl.name || (pl.first_name && pl.last_name ? `${pl.first_name} ${pl.last_name}` : pl.full_name);
        unit.push({ name, position: pname, depth });
      }
    }
    charts[abbr] = normalizeUnit(unit);
  }
  return charts;
}

// --------- RapidAPI Rolling Insights ---------
async function fetchRapidAPI(qs) {
  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.RAPIDAPI_HOST || 'football-datafeeds-by-rolling-insights1.p.rapidapi.com';
  if (!key) throw new Error('Missing env RAPIDAPI_KEY');
  const base = `https://${host}`;
  // If team_id not provided, try 1..40 and keep ones that return payloads
  const teamIds = qs.team_id ? [qs.team_id] : Array.from({length:40}, (_,i)=>String(i+1));
  const headers = { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'RS-DATA-TYPE': 'DEPTH-CHARTS' };
  const charts = {};
  for (const id of teamIds) {
    const url = `${base}/depth-charts/NFL?team_id=${encodeURIComponent(id)}`;
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const data = await r.json();
      // Guess shape: { team: { name, abbr? }, offense: { RB:[{name,depth?...}], WR:[...], TE:[...], QB:[...] } }
      // Or sometimes a flat list with 'position_group' and 'depth'
      const teamName = data.team?.name || data.team_name || data.team || data.Team || null;
      const abbr = data.team?.abbr || data.team?.code || toAbbr(teamName);
      if (!abbr) continue;
      if (data.offense) {
        const unit = [];
        for (const key of ['RB','WR','TE','QB']) {
          const list = data.offense[key] || [];
          let d=0;
          for (const p of list) {
            d += 1;
            const nm = p.name || p.player || p.full_name || (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null);
            if (!nm) continue;
            unit.push({ name: nm, position: key, depth: p.depth || d });
          }
        }
        charts[abbr] = normalizeUnit(unit);
        continue;
      }
      if (Array.isArray(data.players)) {
        const unit = data.players.map(p => ({
          name: p.name || p.player || (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null),
          position: p.position_group || p.position || p.pos,
          depth: p.depth || p.depth_chart || p.rank || 1
        }));
        charts[abbr] = normalizeUnit(unit);
      }
    } catch (_) {}
  }
  return charts;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);
    const source = (qs.source || '').toLowerCase();
    if (!source) return { statusCode: 400, body: 'source=sportradar|rapidapi is required' };

    let charts = {};
    if (source === 'sportradar') charts = await fetchSportradar(qs);
    else if (source === 'rapidapi') charts = await fetchRapidAPI(qs);
    else return { statusCode: 400, body: 'Unsupported source' };

    if (!Object.keys(charts).length) {
      return { statusCode: 502, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'No charts parsed from source', source }) };
    }

    const saved = await writeDepthCharts(season, week, charts);
    return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week, source, saved, teams: Object.keys(charts).length }) };
  } catch (err) {
    return { statusCode: 500, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
