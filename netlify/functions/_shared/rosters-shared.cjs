// Shared handler logic imported by multiple scheduled wrappers.
const { getStore } = require("@netlify/blobs");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require("path");
const fs = require("fs");

const STORE = process.env.NFL_TD_BLOBS || "nfl-td";
const PROVIDER = process.env.NFL_ROSTERS_SOURCE || "auto"; // 'auto' | 'espn' | 'fantasypros'
const OVERRIDES_FILE = process.env.NFL_ROSTER_OVERRIDES || "data/nfl-td/roster-overrides.json";

async function readRepoJson(relPath) {
  try {
    const p = path.join(process.cwd(), relPath);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {}
  return null;
}
async function writeBlobJson(store, key, obj) {
  await store.set(key, JSON.stringify(obj, null, 2), { contentType: "application/json" });
}

const TEAM_ALIASES = { WSH:"WSH", WAS:"WSH", LV:"LV", OAK:"LV", LAR:"LAR", LA:"LAR", STL:"LAR", LAC:"LAC", SD:"LAC" };
function normTeam(code){ return TEAM_ALIASES[code] || code; }
function makeEmptyChart(){ return { QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null }; }
function applyOverrides(depthCharts, overrides){
  if (!overrides) return depthCharts;
  for (const [team, roles] of Object.entries(overrides)) {
    depthCharts[team] = depthCharts[team] || makeEmptyChart();
    for (const [role, name] of Object.entries(roles)) depthCharts[team][role] = name;
  }
  return depthCharts;
}

// ESPN provider (best-effort parsing)
async function fetchESPN(){
  try{
    const teamsRes = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams");
    if (!teamsRes.ok) throw new Error("espn teams http");
    const teamsJson = await teamsRes.json();
    const items = teamsJson?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for (const t of items){
      const team = t.team || {};
      const abbr = normTeam(team.abbreviation);
      try{
        const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}?enable=roster,depthchart`;
        const r = await fetch(rosterUrl);
        if (!r.ok) continue;
        const j = await r.json();
        const chart = makeEmptyChart();
        const byPos = {};
        for (const group of (j?.athletes || [])){
          const pos = group?.position?.abbreviation || group?.position?.displayName;
          const ath = group?.items || [];
          byPos[pos] = ath.map(a => a?.fullName || a?.displayName).filter(Boolean);
        }
        const qbs = byPos["QB"] || byPos["Quarterback"] || [];
        const rbs = byPos["RB"] || byPos["Running Back"] || [];
        const wrs = byPos["WR"] || byPos["Wide Receiver"] || [];
        const tes = byPos["TE"] || byPos["Tight End"] || [];
        chart.QB1 = qbs[0] || null;
        chart.RB1 = rbs[0] || null; chart.RB2 = rbs[1] || null;
        chart.WR1 = wrs[0] || null; chart.WR2 = wrs[1] || null; chart.WR3 = wrs[2] || null;
        chart.TE1 = tes[0] || null; chart.TE2 = tes[1] || null;
        charts[abbr] = chart;
      } catch(e){}
    }
    return Object.keys(charts).length ? charts : null;
  }catch(e){ return null; }
}

async function fetchFantasyPros(){
  const url = process.env.NFL_ROSTERS_FP_URL;
  if (!url) return null;
  try{
    const r = await fetch(url, { headers: { "accept":"application/json" } });
    if (!r.ok) throw new Error("fp http");
    const j = await r.json();
    return j && typeof j === "object" ? j : null;
  }catch(e){ return null; }
}

async function getDepthCharts(){
  if (PROVIDER === "fantasypros"){
    const fp = await fetchFantasyPros(); if (fp) return fp;
    const espn = await fetchESPN(); if (espn) return espn;
  } else if (PROVIDER === "espn"){
    const espn = await fetchESPN(); if (espn) return espn;
    const fp = await fetchFantasyPros(); if (fp) return fp;
  } else {
    const espn = await fetchESPN(); if (espn) return espn;
    const fp = await fetchFantasyPros(); if (fp) return fp;
  }
  // fallback to repo
  const fallback = await readRepoJson("data/nfl-td/depth-charts.json");
  return fallback;
}

async function runUpdate(){
  const store = getStore(STORE);
  const charts = await getDepthCharts();
  if (!charts) return { ok:false, error:"no provider data" };
  const overrides = await readRepoJson(OVERRIDES_FILE);
  const finalCharts = applyOverrides(charts, overrides);
  await writeBlobJson(store, "depth-charts.json", finalCharts);
  await writeBlobJson(store, "meta-rosters.json", { updated_at: new Date().toISOString(), provider: PROVIDER });
  return { ok:true, teams:Object.keys(finalCharts).length, provider:PROVIDER };
}

module.exports = { runUpdate };
