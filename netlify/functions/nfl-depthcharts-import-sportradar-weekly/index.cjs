'use strict';
// Sportradar Weekly Depth Charts importer (shape fix for team.offense)
// GET /.netlify/functions/nfl-depthcharts-import-sportradar-weekly?season=2025&week=1&stype=REG[&debug=1]
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
  const full = team.market && team.name ? `${team.market} ${team.name}`
               : (team.display_name || team.name || team.alias || team.abbr);
  if (TEAM_ABBR_BY_NAME[full]) return TEAM_ABBR_BY_NAME[full];
  for (const [k,v] of Object.entries(TEAM_ABBR_BY_NAME)) {
    const a = String(full||'').toLowerCase();
    if (a === k.toLowerCase() || a.endsWith(k.split(' ').slice(1).join(' ').toLowerCase())) return v;
  }
  return team.alias || team.abbr || null;
}

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
  const playerNode = node.player || node; // handle nested { player: {...}, depth }
  const name = playerNameFromNode(playerNode);
  if (!name) return;
  const role = `${posKey}${depth}`;
  group.push({ name, role, ...defaultShares(posKey, depth) });
}

function collectPositions(off) {
  // Try lots of shapes: positions/position, groups, entries, etc.
  if (!off) return [];
  if (Array.isArray(off.positions)) return off.positions;
  if (Array.isArray(off.position)) return off.position;
  if (Array.isArray(off.groups)) return off.groups;          // some feeds use groups -> players
  if (Array.isArray(off.entries)) return off.entries;        // entries of position groups
  if (Array.isArray(off)) return off;
  // Object map form
  const out = [];
  if (typeof off === 'object') {
    for (const [k,v] of Object.entries(off)) {
      if (Array.isArray(v)) out.push({ name:k, players:v });
      else if (v && typeof v === 'object' && Array.isArray(v.players)) out.push({ name:k, players:v.players });
    }
  }
  return out;
}

function normalizeTeamOffense(team, wantDebug=false){
  const out = { RB:[], WR:[], TE:[], QB:[] };
  // New: use team.offense directly (your debug dump shows offense/defense/special_teams on team root)
  const offense = team.offense || team.depth_chart && team.depth_chart.offense || null;
  const positions = collectPositions(offense);
  const debug = wantDebug ? { offenseKeys: offense ? Object.keys(offense) : null, positionsCount: positions.length } : null;

  for (const p of positions) {
    const posName = p.name || p.position || p.abbreviation || p.label;
    const bucket = bucketForPositionName(posName);
    if (!bucket) continue;
    const players = p.players || p.player || p.entries || p.depth || [];
    const arr = Array.isArray(players) ? players : [];
    // normalize inner player arrays
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
  return { unit: out, debug };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = String(qs.season || '2025');
    const week = String(qs.week || '1');
    const stype = String(qs.stype || 'REG').toUpperCase();
    const wantDebug = !!qs.debug;
    const apiKey = process.env.SPORTRADAR_API_KEY;
    if (!apiKey) return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Missing SPORTRADAR_API_KEY' }) };
    const access = process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
    const lang = process.env.SPORTRADAR_LANG || 'en';

    const url = `https://api.sportradar.com/nfl/official/${access}/v7/${lang}/seasons/${season}/${stype}/${String(week).padStart(1,'0')}/depth_charts.json?api_key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok) return { statusCode: r.status, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:`HTTP ${r.status}`, url, txt: txt.slice(0, 1200) }) };
    let data;
    try { data = JSON.parse(txt); } catch (e) {
      return { statusCode: 502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'JSON parse error', url, sample: txt.slice(0, 800) }) };
    }

    const teamNodes = Array.isArray(data.teams) ? data.teams : (data.league && Array.isArray(data.league.teams) ? data.league.teams : []);
    const charts = {};
    const dbg = wantDebug ? { url, teams: teamNodes.length, samples: [] } : null;

    for (const t of teamNodes) {
      const abbr = (t.alias || t.abbr || (t.market && t.name && (TEAM_ABBR_BY_NAME[`${t.market} ${t.name}`]||null)) || null);
      const { unit, debug } = normalizeTeamOffense(t, wantDebug);
      charts[abbr || 'UNK'] = unit;
      if (wantDebug) {
        dbg.samples.push({
          alias: abbr,
          teamKeys: Object.keys(t||{}),
          offenseKeys: debug.offenseKeys,
          positionsCount: debug.positionsCount,
          sampleUnitSizes: { QB: unit.QB.length, RB: unit.RB.length, WR: unit.WR.length, TE: unit.TE.length }
        });
      }
    }

    const nonEmpty = Object.values(charts).some(g => (g.QB.length+g.RB.length+g.WR.length+g.TE.length) > 0);
    if (!nonEmpty) {
      return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Still no players parsed from team.offense', url, debug: dbg }) };
    }

    const store = blobsStoreNFL();
    const blobKey = `depth/${season}/week${parseInt(week,10)}/depth-charts.json`;
    await store.set(blobKey, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    const sampleTeam = Object.keys(charts)[0];
    const body = { ok:true, source:'Sportradar', season, week: parseInt(week,10), saved: blobKey, teams: Object.keys(charts).length, sampleTeam, sample: charts[sampleTeam] };
    if (wantDebug) body.debug = dbg;
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
