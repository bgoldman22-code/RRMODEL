// netlify/functions/_shared/rosters-shared.cjs
const path = require("path");
const fs = require("fs");

function log(debug, ...args){ if (debug) console.log("[rosters]", ...args); }

function getStoreSafe(STORE, debug=false){
  try{
    const { getStore } = require("@netlify/blobs");
    try{
      const store = getStore(STORE);
      log(debug,"Blobs: managed store",STORE);
      return store;
    }catch(e){
      const siteID = process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_AUTH_TOKEN;
      if(siteID && token){
        const store = getStore({ name: STORE, siteID, token });
        log(debug,"Blobs: manual creds", {STORE, siteID: siteID.slice(0,6)+"..."});
        return store;
      }
      throw e;
    }
  }catch(e){
    log(debug,"Blobs unavailable, using noop store", String(e));
    const mem = new Map();
    return {
      async get(key){ return mem.has(key) ? new Response(mem.get(key)) : null; },
      async set(key, val){ mem.set(key, typeof val==="string" ? val : JSON.stringify(val)); }
    };
  }
}

function normTeam(code){
  if(!code) return null;
  const m = { "WAS":"WSH","WSH":"WSH","OAK":"LV","LV":"LV","STL":"LAR","LA":"LAR","LAR":"LAR","SD":"LAC","LAC":"LAC" };
  return m[code]||code;
}

function makeEmptyChart(){ return { QB1:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE1:null,TE2:null }; }

function applyOverrides(charts, overrides, debug=false){
  if(!overrides) return charts;
  for(const [team, roles] of Object.entries(overrides)){
    charts[team] = charts[team] || makeEmptyChart();
    for(const [role, name] of Object.entries(roles)){
      charts[team][role] = name;
    }
  }
  log(debug,"Applied overrides for", Object.keys(overrides||{}).length, "teams");
  return charts;
}

function readRepoJson(rel){
  try{
    const p = path.join(process.cwd(),"data","nfl-td",rel);
    if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,"utf-8"));
  }catch{}
  return null;
}

// ---- Providers ----
async function fetchJson(url, debug=false, headers={}){
  // Use native fetch (Node 18+ in Netlify Functions)
  const res = await fetch(url,{ headers: { "user-agent":"Mozilla/5.0","accept":"application/json", ...headers } });
  if(!res.ok) throw new Error(`http ${res.status}`);
  return await res.json();
}

async function fetchESPN(debug=false){
  try{
    const idx = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams", debug);
    const items = idx?.sports?.[0]?.leagues?.[0]?.teams || [];
    const charts = {};
    for(const t of items){
      const team = t.team||{};
      const id = team.id;
      const abbr = normTeam(team.abbreviation);
      if(!id || !abbr) continue;
      try{
        const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/${id}/depthchart`;
        const j = await fetchJson(url, debug);
        const chart = makeEmptyChart();
        const groups = j?.items || j?.positions || j?.athletes || [];
        const slots = {};
        for(const g of (Array.isArray(groups)?groups:[])){
          const pos = (g?.position?.abbreviation || g?.position || g?.abbreviation || "").toUpperCase();
          const entries = g?.items || g?.athletes || g?.entries || g?.depths || [];
          const names = [];
          for(const e of entries){
            const a = e?.athlete || e?.player || e;
            const name = a?.fullName || a?.displayName || a?.name;
            if(name) names.push(name);
          }
          if(pos) slots[pos]=names;
        }
        const qbs = slots.QB||[], rbs = slots.RB||[], wrs = slots.WR||[], tes = slots.TE||[];
        chart.QB1 = qbs[0]||null;
        chart.RB1 = rbs[0]||null; chart.RB2 = rbs[1]||null;
        chart.WR1 = wrs[0]||null; chart.WR2 = wrs[1]||null; chart.WR3 = wrs[2]||null;
        chart.TE1 = tes[0]||null; chart.TE2 = tes[1]||null;
        charts[abbr]=chart;
      }catch(e){
        log(debug,`ESPN depth failed for ${abbr} (${id}):`, String(e));
      }
    }
    return Object.keys(charts).length?charts:null;
  }catch(e){
    return null;
  }
}

async function fetchFantasyProsFromUrl(debug=false){
  const url = process.env.NFL_ROSTERS_FP_URL;
  if(!url) return null;
  try{
    const j = await fetchJson(url, debug);
    return j && typeof j === "object" ? j : null;
  }catch(e){ return null; }
}

async function getDepthCharts(PROVIDER="espn", debug=false){
  if(PROVIDER==="espn"){
    const espn = await fetchESPN(debug);
    if(espn) return espn;
    const fp = await fetchFantasyProsFromUrl(debug);
    if(fp) return fp;
  }else if(PROVIDER==="fantasypros"){
    const fp = await fetchFantasyProsFromUrl(debug);
    if(fp) return fp;
    const espn = await fetchESPN(debug);
    if(espn) return espn;
  }else{ // auto
    const espn = await fetchESPN(debug);
    if(espn) return espn;
    const fp = await fetchFantasyProsFromUrl(debug);
    if(fp) return fp;
  }
  return readRepoJson("depth-charts.json");
}

async function runUpdate({ STORE="nfl-td", PROVIDER="espn", debug=false }={}){
  const store = getStoreSafe(STORE, debug);
  const charts = await getDepthCharts(PROVIDER, debug);
  if(!charts) return { ok:false, error:"no provider data" };
  const overrides = readRepoJson("roster-overrides.json");
  const finalCharts = applyOverrides(charts, overrides, debug);
  await store.set("depth-charts.json", JSON.stringify(finalCharts,null,2), { contentType:"application/json" });
  await store.set("meta-rosters.json", JSON.stringify({ updated_at: new Date().toISOString(), provider: PROVIDER },null,2), { contentType:"application/json" });
  return { ok:true, provider: PROVIDER, teams: Object.keys(finalCharts).length };
}

module.exports = { runUpdate };
