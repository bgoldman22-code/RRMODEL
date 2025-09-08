'use strict';
// Import depth charts from Footballguys public page (best-effort HTML parser, no API key).
// GET /.netlify/functions/nfl-depthcharts-import-footballguys?season=2025&week=2
//
// Writes: depth/{season}/week{week}/depth-charts.json to your BLOBS_STORE_NFL.
//
// Notes:
// - This parser is resilient to simple layout/text changes by scanning for well-known team names
//   and grabbing "QB:", "RB:", "WR:", "TE:" lines with comma-separated players.
// - It's a stopgap until dynamic usage depth charts are populated.
//
const { getStore } = require('@netlify/blobs');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

const TEAMS = [
  ["ARI","Arizona Cardinals"],
  ["ATL","Atlanta Falcons"],
  ["BAL","Baltimore Ravens"],
  ["BUF","Buffalo Bills"],
  ["CAR","Carolina Panthers"],
  ["CHI","Chicago Bears"],
  ["CIN","Cincinnati Bengals"],
  ["CLE","Cleveland Browns"],
  ["DAL","Dallas Cowboys"],
  ["DEN","Denver Broncos"],
  ["DET","Detroit Lions"],
  ["GB","Green Bay Packers"],
  ["HOU","Houston Texans"],
  ["IND","Indianapolis Colts"],
  ["JAX","Jacksonville Jaguars"],
  ["KC","Kansas City Chiefs"],
  ["LV","Las Vegas Raiders"],
  ["LAC","Los Angeles Chargers"],
  ["LAR","Los Angeles Rams"],
  ["MIA","Miami Dolphins"],
  ["MIN","Minnesota Vikings"],
  ["NE","New England Patriots"],
  ["NO","New Orleans Saints"],
  ["NYG","New York Giants"],
  ["NYJ","New York Jets"],
  ["PHI","Philadelphia Eagles"],
  ["PIT","Pittsburgh Steelers"],
  ["SEA","Seattle Seahawks"],
  ["SF","San Francisco 49ers"],
  ["TB","Tampa Bay Buccaneers"],
  ["TEN","Tennessee Titans"],
  ["WAS","Washington Commanders"]
];

const POS_KEYS = ["QB","RB","WR","TE"];

function pickTop(list, n=3){
  return (list||[]).slice(0,n);
}

function mkRoleObjs(pos, names){
  const top = pickTop(names, 3);
  return top.map((name, idx) => {
    const role = `${pos}${idx+1}`;
    const base = { name: name.trim(), role };
    if (pos==='RB') base.goal_line_share = idx===0 ? 0.60 : (idx===1 ? 0.30 : 0.10);
    if (pos==='WR') { base.red_zone_target_share = idx===0 ? 0.22 : 0.18; base.deep_threat = idx===0 ? 0.35 : 0.30; }
    if (pos==='TE') base.red_zone_target_share = idx===0 ? 0.18 : 0.14;
    if (pos==='QB') base.rush_td_rate = idx===0 ? 0.04 : 0.02;
    return base;
  });
}

function extractTeamBlock(html, teamName){
  // Heuristic: find team header then capture following ~800 chars for position lines.
  const i = html.indexOf(teamName);
  if (i < 0) return "";
  return html.slice(i, i+1200);
}

function extractPosList(block, pos){
  // Try formats like "QB: A, B, C" allowing tags
  const re = new RegExp(`${pos}\\s*:\\s*([^<\\n\\r]+)`, 'i');
  const m = block.match(re);
  if (!m) return [];
  const list = m[1].split(',').map(s=>s.trim()).filter(Boolean);
  return list;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = String(qs.season || '2025');
    const week = parseInt(String(qs.week || '1'), 10);

    const url = 'https://www.footballguys.com/depth-charts';
    const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0 (compatible; NetlifyFn/1.0)' } });
    if (!r.ok) return { statusCode: r.status, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:`HTTP ${r.status}`, url }) };
    const html = await r.text();

    const charts = {};
    const debug = [];
    for (const [abbr, name] of TEAMS) {
      const block = extractTeamBlock(html, name);
      const teamObj = { QB:[], RB:[], WR:[], TE:[] };
      let found = 0;
      for (const pos of POS_KEYS) {
        const names = extractPosList(block, pos);
        if (names.length) { teamObj[pos] = mkRoleObjs(pos, names); found += 1; }
      }
      charts[abbr] = teamObj;
      debug.push({ team: abbr, found, sample: Object.fromEntries(POS_KEYS.map(p=>[p, teamObj[p].map(x=>x.name).slice(0,2)]) ) });
    }

    const haveAny = Object.values(charts).some(x => (x.QB.length+x.RB.length+x.WR.length+x.TE.length) > 0);
    if (!haveAny) {
      return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Parser found 0 teams. Site layout may have changed.', url }) };
    }

    const store = blobsStoreNFL();
    const blobKey = `depth/${season}/week${week}/depth-charts.json`;
    await store.set(blobKey, JSON.stringify(charts, null, 2), { contentType:'application/json; charset=utf-8' });

    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, source:'footballguys', url, season, week, saved: blobKey, sample: debug.slice(0,4) }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
