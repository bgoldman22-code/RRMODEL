'use strict';
// Sportradar Weekly Depth Charts importer (debug-enhanced)
// GET /.netlify/functions/nfl-depthcharts-import-sportradar-weekly?season=2025&week=1&stype=REG[&debug=1]
// Saves normalized RB/WR/TE/QB arrays per team to BLOBS_STORE_NFL: depth/{season}/week{week}/depth-charts.json
//
// Env:
//   SPORTRADAR_API_KEY (required)
//   SPORTRADAR_ACCESS_LEVEL=trial|production (default trial)
//   SPORTRADAR_LANG=en (default)
//   BLOBS_STORE_NFL (default nfl-td), SITE_ID, NETLIFY_API_TOKEN or BLOBS_TOKEN
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
  // Try to build "Market Name" first
  const full = team.market && team.name ? `${team.market} ${team.name}`
               : (team.display_name || team.name || team.alias || team.abbr);
  if (TEAM_ABBR_BY_NAME[full]) return TEAM_ABBR_BY_NAME[full];
  // Try loose
  for (const [k,v] of Object.entries(TEAM_ABBR_BY_NAME)) {
    const a = String(full||'').toLowerCase();
    if (a === k.toLowerCase() || a.endsWith(k.split(' ').slice(1).join(' ').toLowerCase())) return v;
  }
  return team.alias || team.abbr || null;
}

// Map Sportradar offensive position names to buckets
function bucketForPositionName(name) {
  if (!name) return null;
  const n = String(name).toUpperCase();
  if (/QB/.test(n)) return 'QB';
  if (n === 'RB' || /HB/.test(n) || /FB/.test(n) || /RB\/FB/.test(n)) return 'RB';
  if (/WR/.test(n) || n === 'LWR' || n === 'RWR' || n === 'SW' || /SLOT/.test(n)) return 'WR';
  if (/TE/.test(n)) return 'TE';
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

function playerNameFromNode(node){
  if (!node) return null;
  if (node.name) return node.name;
  if (node.full_name) return node.full_name;
  if (node.first_name && node.last_name) return `${node.first_name} ${node.last_name}`;
  if (node.preferred_name && node.last_name) return `${node.preferred_name} ${node.last_name}`;
  return null;
}

function pushPlayer(group, node, posKey, depth){
  const playerNode = node.player || node; // handle nested { player: {...}, depth: n }
  const name = playerNameFromNode(playerNode);
  if (!name) return;
  const role = `${posKey}${depth}`;
  group.push({ name, role, ...defaultShares(posKey, depth) });
}

// Collect positions array from multiple possible shapes.
function collectPositions(off) {
  if (!off) return [];
  if (Array.isArray(off.positions)) return off.positions;
  if (Array.isArray(off.position)) return off.position;
  if (Array.isArray(off)) return off;
  // Object map: { "QB":[...], "RB":[...] }
  const out = [];
  if (typeof off === 'object') {
    for (const [k,v] of Object.entries(off)) {
      if (Array.isArray(v)) out.push({ name:k, players:v });
    }
  }
  return out;
}

function normalizeTeamOffense(team, debugObj){
  const out = { RB:[], WR:[], TE:[], QB:[] };

  // Possible paths for offense:
  // team.depth_chart.offense
  // team.offense.depth_chart
  // team.depth_chart (mixed with "offense"/"defense" arrays)
  const dc = team.depth_chart || {};
  const offenseCandidates = [];
  if (dc.offense) offenseCandidates.push(dc.offense);
  if (dc.offence) offenseCandidates.push(dc.offence); // just in case British spelling
  if (dc.positions) offenseCandidates.push({ positions: dc.positions }); // some dumps list positions directly
  if (team.offense && team.offense.depth_chart) offenseCandidates.push(team.offense.depth_chart);

  let used = null;
  for (const cand of offenseCandidates) {
    const positions = collectPositions(cand);
    if (!positions || positions.length === 0) continue;

    used = cand;
    // Traverse each position, read its 'players' array (or 'player', 'entries')
    for (const p of positions) {
      const posName = p.name || p.position || p.abbreviation;
      const bucket = bucketForPositionName(posName);
      if (!bucket) continue;
      const players = p.players || p.player || p.entries || p.depth || [];
      const arr = Array.isArray(players) ? players : [];
      arr.sort((a,b)=> (a.depth||99) - (b.depth||99));
      let seen = 0;
      for (const pl of arr) {
        const depth = pl.depth || pl.order || pl.rank || (++seen);
        if (bucket === 'QB' && out.QB.length >= 3) continue;
        if (bucket === 'RB' && out.RB.length >= 3) continue;
        if (bucket === 'WR' && out.WR.length >= 3) continue;
        if (bucket === 'TE' && out.TE.length >= 3) continue;
        pushPlayer(out[bucket], pl, bucket, depth);
      }
    }
    break; // stop at first usable offense block
  }

  if (debugObj) {
    debugObj.paths = Object.keys(dc);
    debugObj.usedOffenseShape = used ? Object.keys(used) : null;
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = String(qs.season || '2025');
    const week = String(qs.week || '1');
    const stype = String(qs.stype || 'REG').toUpperCase();
    const wantDebug = !!qs.debug;
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

    const teamNodes = Array.isArray(data.teams) ? data.teams
                     : (data.league && Array.isArray(data.league.teams) ? data.league.teams : []);

    const charts = {};
    const dbg = wantDebug ? { url, teams: teamNodes.length, samples: [] } : null;

    for (const t of teamNodes) {
      const abbr = toAbbr(t);
      const td = wantDebug ? { alias:abbr, keys:Object.keys(t||{}) } : null;
      const unit = normalizeTeamOffense(t, td);
      if (wantDebug && td) {
        td.posExample = (t.depth_chart && t.depth_chart.offense) ? Object.keys(t.depth_chart.offense) : Object.keys(t.depth_chart||{});
        // capture first 1-2 raw positions for inspection
        try{
          const off = t.depth_chart && (t.depth_chart.offense || t.depth_chart.positions || t.depth_chart);
          const samplePos = Array.isArray(off?.positions) ? off.positions.slice(0,2)
                           : Array.isArray(off?.position) ? off.position.slice(0,2)
                           : null;
          td.samplePositions = samplePos;
        }catch(_){}
        dbg.samples.push(td);
      }
      charts[abbr] = unit;
    }

    const savedTeams = Object.keys(charts).length;
    // If all empty, return debug instead of writing
    const nonEmpty = Object.values(charts).some(g => (g.QB.length+g.RB.length+g.WR.length+g.TE.length) > 0);
    if (!nonEmpty) {
      const resp = { ok:false, error:'Parsed 0 offensive players per team', url };
      if (dbg) resp.debug = dbg;
      return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(resp) };
    }

    const store = blobsStoreNFL();
    const blobKey = `depth/${season}/week${parseInt(week,10)}/depth-charts.json`;
    await store.set(blobKey, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    const sampleTeam = Object.keys(charts)[0];
    const body = { ok:true, source:'Sportradar', season, week: parseInt(week,10), saved: blobKey, teams: savedTeams, sampleTeam, sample: charts[sampleTeam] };
    if (dbg) body.debug = dbg;
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
