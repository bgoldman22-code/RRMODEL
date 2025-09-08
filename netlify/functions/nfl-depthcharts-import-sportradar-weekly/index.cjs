'use strict';
// Sportradar Weekly Depth Charts importer (official/trial)
// GET /.netlify/functions/nfl-depthcharts-import-sportradar-weekly?season=2025&week=1&stype=REG
// Saves normalized RB/WR/TE/QB arrays per team to BLOBS_STORE_NFL: depth/{season}/week{week}/depth-charts.json
//
// Env required:
//   SPORTRADAR_API_KEY
// Optional env:
//   SPORTRADAR_ACCESS_LEVEL=trial  (or production)
//   SPORTRADAR_LANG=en
//   BLOBS_STORE_NFL (default 'nfl-td'), SITE_ID, NETLIFY_API_TOKEN (or BLOBS_TOKEN)
//
const fetch = global.fetch;
const { getStore } = require('@netlify/blobs');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

const TEAM_ABBR_BY_NAME = {
  "Arizona Cardinals":"ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF",
  "Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE",
  "Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
  "Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX","Kansas City Chiefs":"KC",
  "Las Vegas Raiders":"LV","Los Angeles Chargers":"LAC","Los Angeles Rams":"LAR","Miami Dolphins":"MIA",
  "Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
  "New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","San Francisco 49ers":"SF",
  "Seattle Seahawks":"SEA","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS"
};

function toAbbr(team) {
  if (!team) return null;
  const alias = team.alias || team.abbr || team.name || team.market && team.name ? `${team.market} ${team.name}` : team.display_name;
  let full = alias;
  if (team.market && team.name) full = `${team.market} ${team.name}`;
  if (TEAM_ABBR_BY_NAME[full]) return TEAM_ABBR_BY_NAME[full];
  // try looser match
  for (const [k,v] of Object.entries(TEAM_ABBR_BY_NAME)) {
    if (k.toLowerCase().includes(String(full||'').toLowerCase()) || String(full||'').toLowerCase().includes(k.toLowerCase())) return v;
  }
  return team.alias || team.abbr || null;
}

// Position routing for offense depth chart
// Sportradar uses names like: QB, RB, FB, HB, LWR, RWR, SW, TE, HTE, YTE, etc.
// We'll map to 4 buckets: QB, RB, WR, TE
function bucketForPositionName(name) {
  if (!name) return null;
  const n = String(name).toUpperCase();
  if (n.includes('QB')) return 'QB';
  if (n === 'RB' || n.includes('HB') || n.includes('FB') || n.includes('RB/FB')) return 'RB';
  if (n.includes('WR') || n.includes('SLOT') || n === 'LWR' || n === 'RWR' || n === 'SW') return 'WR';
  if (n.includes('TE')) return 'TE';
  return null;
}

function defaultShares(pos, depth){
  const d = Number(depth)||1;
  if (pos==='RB') return { goal_line_share: d===1?0.60 : (d===2?0.30 : 0.10) };
  if (pos==='WR') return { red_zone_target_share: d===1?0.22 : 0.18, deep_threat: d===1?0.35 : 0.30 };
  if (pos==='TE') return { red_zone_target_share: 0.18 };
  if (pos==='QB') return { rush_td_rate: 0.05 };
  return {};
}

function pushPlayer(group, playerObj, posKey, depth){
  const name = playerObj && (playerObj.name || playerObj.full_name || (playerObj.first_name && playerObj.last_name && `${playerObj.first_name} ${playerObj.last_name}`));
  if (!name) return;
  const role = `${posKey}${depth}`;
  group.push({ name, role, ...defaultShares(posKey, depth) });
}

function normalizeTeamOffense(team) {
  const out = { RB:[], WR:[], TE:[], QB:[] };
  // Depth chart might be at team.depth_chart.offense.positions (array)
  // or offense.position (array), or offense (object keyed by position).
  const dc = team.depth_chart || {};
  const off = dc.offense || dc;
  let positions = [];
  if (Array.isArray(off.positions)) positions = off.positions;
  else if (Array.isArray(off.position)) positions = off.position;
  else if (off && typeof off === 'object') {
    // object map form: { positions: [...]} or { "QB":[...], "RB":[...] }
    for (const [k,v] of Object.entries(off)) {
      if (Array.isArray(v)) positions.push({ name:k, players:v });
    }
  }
  for (const p of positions) {
    const posName = p.name || p.position || p.abbreviation;
    const bucket = bucketForPositionName(posName);
    if (!bucket) continue;
    const players = p.players || p.player || p.depth || [];
    // players can be array of {name, depth} or nested player objects { player: {name}, depth }
    const normPlayers = Array.isArray(players) ? players : [];
    // sort by depth ascending if available
    normPlayers.sort((a,b)=> (a.depth||99) - (b.depth||99));
    let seen = 0;
    for (const pl of normPlayers) {
      const playerNode = pl.player || pl;
      const depth = pl.depth || pl.order || pl.rank || (++seen);
      if (bucket === 'QB' && out.QB.length >= 3) continue;
      if (bucket === 'RB' && out.RB.length >= 3) continue;
      if (bucket === 'WR' && out.WR.length >= 3) continue;
      if (bucket === 'TE' && out.TE.length >= 3) continue;
      pushPlayer(out[bucket], playerNode, bucket, depth);
    }
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = String(qs.season || '2025');
    const week = String(qs.week || '1');
    const stype = String(qs.stype || 'REG').toUpperCase();
    const key = process.env.SPORTRADAR_API_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing SPORTRADAR_API_KEY' }) };
    const access = process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
    const lang = process.env.SPORTRADAR_LANG || 'en';

    const url = `https://api.sportradar.com/nfl/official/${access}/v7/${lang}/seasons/${season}/${stype}/${String(week).padStart(1,'0')}/depth_charts.json?api_key=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ ok:false, error:`HTTP ${r.status}`, url, txt:txt.slice(0,1500) }) };
    let data;
    try { data = JSON.parse(txt); } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ ok:false, error:'JSON parse error', url, sample: txt.slice(0, 800) }) };
    }
    const teams = Array.isArray(data.teams) ? data.teams : (data.league && Array.isArray(data.league.teams) ? data.league.teams : []);
    const charts = {};
    for (const t of teams) {
      const abbr = toAbbr(t);
      if (!abbr) continue;
      const unit = normalizeTeamOffense(t);
      charts[abbr] = unit;
    }
    const savedTeams = Object.keys(charts).length;
    if (!savedTeams) {
      return { statusCode: 502, body: JSON.stringify({ ok:false, error:'Parsed 0 teams from Sportradar', url, keys:Object.keys(data||{}).slice(0,12) }) };
    }

    const store = blobsStoreNFL();
    const blobKey = `depth/${season}/week${parseInt(week,10)}/depth-charts.json`;
    await store.set(blobKey, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, source:'Sportradar', season, week: parseInt(week,10), saved: blobKey, teams: savedTeams, sampleTeam: Object.keys(charts)[0], sample: charts[Object.keys(charts)[0]] }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
