// netlify/functions/_shared/rosters-shared.cjs
const path = require("path");
const fs = require("fs");

function log(debug, ...args){ if (debug) console.log("[rosters]", ...args); }

function getStoreSafe(STORE, debug=false){
  try {
    const { getStore } = require("@netlify/blobs");
    try {
      const s = getStore(STORE);
      log(debug, "Blobs: managed", STORE);
      return s;
    } catch (e) {
      const siteID = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;
      if (siteID && token){
        const s = getStore({ name: STORE, siteID, token });
        log(debug, "Blobs: manual creds", siteID.slice(0,6)+"...");
        return s;
      }
      throw e;
    }
  } catch(e){
    log(debug, "Blobs: noop store", String(e));
    const mem = new Map();
    return {
      async get(k){ return mem.has(k) ? new Response(mem.get(k)) : null; },
      async set(k,v){ mem.set(k, typeof v==="string" ? v : JSON.stringify(v)); }
    };
  }
}

function readRepoJson(rel){
  try {
    const p = path.join(process.cwd(), "data", "nfl-td", rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,"utf-8"));
  } catch {}
  return null;
}

function normTeam(code){
  if(!code) return null;
  const m = { "WAS":"WSH","WSH":"WSH","OAK":"LV","LV":"LV","STL":"LAR","LA":"LAR","LAR":"LAR","SD":"LAC","LAC":"LAC" };
  return m[code] || code;
}
function emptyChart(){ return { QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null }; }
function applyOverrides(charts, overrides, debug=false){
  if(!overrides) return charts;
  for(const [team, roles] of Object.entries(overrides)){
    charts[team] = charts[team] || emptyChart();
    for(const [role,name] of Object.entries(roles)){
      charts[team][role] = name;
    }
  }
  log(debug,"overrides applied for", Object.keys(overrides).length, "teams");
  return charts;
}

// Native fetch (Node 18)
async function fetchJson(url, debug=false, headers={}){
  const res = await fetch(url, { headers: {
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept":"application/json, text/plain, */*",
    "Origin":"https://www.espn.com",
    "Referer":"https://www.espn.com/",
    ...headers
  }});
  if(!res.ok) throw new Error("http "+res.status);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch(e){ throw new Error("json "+(txt?.slice(0,60)||"")); }
}

// Primary ESPN: team list
async function espnTeams(debug=false){
  const idx = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", debug);
  const teams = idx?.sports?.[0]?.leagues?.[0]?.teams || [];
  return teams.map(t=>({ id: t?.team?.id, abbr: normTeam(t?.team?.abbreviation) })).filter(x=>x.id&&x.abbr);
}

// ESPN depth chart per team (web api)
async function espnDepthForTeam(id, debug=false){
  const j = await fetchJson(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart`, debug);
  const items = Array.isArray(j?.items) ? j.items : [];
  const slots = {};
  for(const g of items){
    const pos = String(g?.position?.abbreviation || "").toUpperCase();
    if(!pos) continue;
    const entries = Array.isArray(g?.items) ? g.items : [];
    const names = [];
    for(const e of entries){
      const a = e?.athlete || e?.player || {};
      const name = a?.fullName || a?.displayName || a?.name;
      if(name) names.push(name);
    }
    if(names.length) slots[pos]=names;
  }
  return {
    QB1: (slots.QB||[])[0]||null,
    RB1: (slots.RB||[])[0]||null,
    RB2: (slots.RB||[])[1]||null,
    WR1: (slots.WR||[])[0]||null,
    WR2: (slots.WR||[])[1]||null,
    WR3: (slots.WR||[])[2]||null,
    TE1: (slots.TE||[])[0]||null,
    TE2: (slots.TE||[])[1]||null,
  };
}

async function fetchESPN(debug=false){
  try{
    const teams = await espnTeams(debug);
    const charts = {};
    for(const t of teams){
      try{
        const chart = await espnDepthForTeam(t.id, debug);
        charts[t.abbr]=chart;
      }catch(e){
        log(debug, "team fail", t.abbr, t.id, String(e));
      }
    }
    return Object.keys(charts).length ? charts : null;
  }catch(e){
    log(debug, "espn index fail", String(e));
    return null;
  }
}

async function getDepthCharts(PROVIDER="auto", debug=false){
  if(PROVIDER==="espn" || PROVIDER==="auto"){
    const espn = await fetchESPN(debug);
    if(espn) return espn;
  }
  // future: add MSF/nflverse here
  const local = readRepoJson("depth-charts.json");
  return local;
}

async function runUpdate({ STORE="nfl-td", PROVIDER="auto", debug=false }={}){
  const store = getStoreSafe(STORE, debug);
  const charts = await getDepthCharts(PROVIDER, debug);
  if(!charts){
    return { ok:false, error:"no provider data" };
  }
  const overrides = readRepoJson("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides, debug);
  await store.set("depth-charts.json", JSON.stringify(finalCharts, null, 2), { contentType:"application/json" });
  await store.set("meta-rosters.json", JSON.stringify({ updated_at: new Date().toISOString(), provider: PROVIDER }, null, 2), { contentType:"application/json" });
  return { ok:true, provider: PROVIDER, teams: Object.keys(finalCharts).length };
}

module.exports = { runUpdate };
